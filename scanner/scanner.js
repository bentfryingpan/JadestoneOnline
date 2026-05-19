#!/usr/bin/env node
/**
 * Jadestone PGCR Scanner — Railway deployment
 *
 * Sequentially scans Bungie PGCR instance IDs, identifies Gambit matches (mode 63),
 * and writes all 8 players + match data to Supabase in real-time.
 *
 * Env vars required:
 *   BUNGIE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// ── Environment ───────────────────────────────────────────────────────────────

const BUNGIE_API_KEY      = process.env.BUNGIE_API_KEY;
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!BUNGIE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars: BUNGIE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const PGCR_ROOT          = 'https://stats.bungie.net';
const BUNGIE_ROOT        = 'https://www.bungie.net';
const GAMBIT_MODE        = 63;
const PARALLEL           = 6;        // IDs scanned simultaneously
const CATCHUP_SLEEP_MS   = 15_000;   // sleep 15s when we've caught up to live
const MISS_THRESHOLD     = 500;      // consecutive misses before sleeping
const JPR_RECOMPUTE_MS   = 10 * 60 * 1000; // recompute JPR every 10 minutes
const SLOT_BUCKETS       = { 1491708835: 'Kinetic', 2465295065: 'Energy', 95395402: 'Power' };

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
});

// ── EGO Algorithm (inlined from src/lib/ego.js) ───────────────────────────────

const ALGO_CONFIG = {
  dr_rate: 0.05,
  medal_dr_rate: 0.15,
  base_values: {
    mobKills: 0.19, assists: 0.08, motesDenied: 0.99, invasionKills: 1.9,
    motesDeposited: 0.58, primevalDamage: 0.00041, deaths: -5.0, wastedMotes: -0.25,
  },
  medal_values: {
    notOnMyWatch: 5.34, armyOfOne: 2.02, locksmith: 2.94, blockbuster: 3.96,
    rapidPayback: 4.14, massacre: 2.48, motesHaveBeen: 2.94, halfBanked: 2.48,
    firstToBlock: 2.12, payback: 1.66, overkillmonger: 1.29, killmonger: 0.83,
    thrillmonger: 0.46, fastFill: 1.29, killAfterInvasion: 0.83, bigGameHunter: 0.64,
    lastGuardianStanding: 0.46, noEscape: 0.46,
  },
  pem_config: {
    mote_efficiency_bonus_step: 5, mote_efficiency_bonus_val: 0.02,
    mote_efficiency_penalty_scale: 0.3, mote_efficiency_penalty_power: 0.85,
    inv_yield_benchmarks: { 1: 6.0, 2: 8.0, 3: 10.0, 4: 12.0 },
    inv_yield_bonus_step: 4, inv_yield_bonus_val: 0.01,
    primeval_dmg_benchmarks: { 1: 80000, 2: 60000, 3: 50000, 4: 40000 },
    primeval_bonus_val: 0.01, pem_floor: 0.9, pem_cap: 1.1,
  },
};

const _MEDAL_REVERSE = (() => {
  const aliases = {
    notOnMyWatch:         ['medalgambitsaviour','medalsaviour','medalgambitnotonmywatch','medalspvecompmedaldenied','medaldenied','medalspvecompmedalinvasionshutdown'],
    armyOfOne:            ['medalspvecompmedalinvaderkillfour','medalinvaderkillfour'],
    locksmith:            ['medalspvecompmedallocksmith'],
    blockbuster:          ['medalspvecompmedalblockparty','medalblockparty','medalspvecompmedalblockbuster'],
    rapidPayback:         ['medalspvecompmedalrapidpayback','medalrapidpayback'],
    massacre:             ['medalspvecompmedalmassacre'],
    motesHaveBeen:        ['medalgambitmotesdrained','medalmotesdrained','medalspvecompmedaltagsdenied15'],
    halfBanked:           ['medalspvecompmedalhalfbanked'],
    firstToBlock:         ['medalspvecompmedalfirsttoblock'],
    payback:              ['medalgambitpayback','medalpayback','medalspvecompmedalrevenge'],
    overkillmonger:       ['medalgambitoverkillmonger','medaloverkillmonger','medalspvecompmedaloverkillmonger'],
    killmonger:           ['medalgambitkillmonger','medalkillmonger','medalspvecompmedalkillmonger'],
    thrillmonger:         ['medalgambitthrillmonger','medalthrillmonger','medalspvecompmedalthrillmonger'],
    fastFill:             ['medalspvecompmedalfastfill'],
    killAfterInvasion:    ['medalspvecompmedalkillafterinvasion'],
    bigGameHunter:        ['medalgambithunter','medalhunter','medalspvecompmedalbiggamehunter'],
    lastGuardianStanding: ['medalgambitlastmanstanding','medallastmanstanding'],
    noEscape:             ['medalspvecompmedalbankkill','medalspvecompmedalnoescape'],
  };
  const rev = {};
  for (const [canon, list] of Object.entries(aliases)) {
    for (const a of list) rev[a.toLowerCase().replace(/_/g, '')] = canon;
    const fk = canon[0].toUpperCase() + canon.slice(1);
    for (const v of [`medalgambit${fk}`, `medal${fk}`, `medalspvecompmedal${canon}`])
      rev[v.toLowerCase().replace(/_/g, '')] = canon;
  }
  return rev;
})();

function extractMedals(extValues = {}) {
  const medals = {};
  for (const [k, v] of Object.entries(extValues)) {
    const canon = _MEDAL_REVERSE[k.toLowerCase().replace(/_/g, '')];
    if (canon) {
      const count = typeof v === 'object' ? (v?.basic?.value ?? 0) : Number(v) || 0;
      if (count > 0) medals[canon] = (medals[canon] ?? 0) + count;
    }
  }
  return medals;
}

function calcDR(cnt, val, rate) {
  let total = 0, current = val;
  for (let i = 0; i < Math.floor(cnt); i++) { total += current; current *= 1 - rate; }
  return total;
}

function calculateEgoScore(stats) {
  const v    = ALGO_CONFIG.base_values;
  const dr   = ALGO_CONFIG.dr_rate;
  const m_dr = ALGO_CONFIG.medal_dr_rate;
  const conf = ALGO_CONFIG.pem_config;
  const fts  = stats.fireteam_size ?? 1;

  let pve = 0, pvp = 0, obj = 0, med = 0;

  pve += calcDR(stats.mobKills ?? 0, v.mobKills, dr);
  const dmg    = stats.primevalDamage ?? 0;
  const chunks = Math.floor(dmg / 10000);
  pve += calcDR(chunks, 10000 * v.primevalDamage, dr) +
         (dmg % 10000) * (v.primevalDamage * Math.pow(1 - dr, chunks));
  pvp += calcDR(stats.invasionKills ?? 0, v.invasionKills, dr);
  pvp += calcDR(stats.motesDenied ?? 0, v.motesDenied, dr);
  obj += calcDR(stats.motesDeposited ?? 0, v.motesDeposited, dr);
  const ast = calcDR(stats.assists ?? 0, v.assists, dr);
  pve += ast / 2; pvp += ast / 2;

  const pen      = (stats.deaths ?? 0) * v.deaths;
  const wasted   = Math.max(0, (stats.motesPickedUp ?? 0) - (stats.motesDeposited ?? 0));
  const wastePen = wasted > 0 ? wasted * v.wastedMotes : 0;

  for (const [mName, count] of Object.entries(stats.medals ?? {})) {
    const mVal = ALGO_CONFIG.medal_values[mName];
    if (mVal && count > 0) med += calcDR(count, mVal, m_dr);
  }

  const BUCKET_FLOOR = 18, FLOOR_GAIN = 0.35;
  const buckets    = [pve, pvp, obj, med];
  const floorBoost = buckets.reduce((s, b) => s + Math.max(0, BUCKET_FLOOR - b) * FLOOR_GAIN, 0);
  const teamMult   = { 1: 1.0, 2: 1.1, 3: 1.2, 4: 1.3 }[fts] ?? 1.0;
  let base = (pve + pvp + obj + med + pen + wastePen + floorBoost) * teamMult;
  if (base > 100)      base = 95.2 + (base - 100) * 0.05;
  else if (base > 92)  base = 92   + (base - 92)  * 0.4;

  const bSorted = [...buckets].sort((a, b) => b - a);
  if (bSorted[1] > BUCKET_FLOOR * 1.2 && bSorted[2] < BUCKET_FLOOR * 0.9) base *= 1.03;

  // PEM
  let pem   = 1.0;
  const pk  = Math.max(stats.motesPickedUp ?? 0, stats.motesDeposited ?? 0);
  const eff = pk > 0 ? ((stats.motesDeposited ?? 0) / pk) * 100 : 100.0;
  const dbMote = { 1: 77.5, 2: 81.5, 3: 86.0, 4: 90.0 }[fts] ?? 77.5;
  if (eff > dbMote)
    pem += Math.floor((eff - dbMote) / conf.mote_efficiency_bonus_step) * conf.mote_efficiency_bonus_val;
  else if (eff < dbMote) {
    const deficitFrac = (dbMote - eff) / 100.0;
    pem *= 1.0 - Math.pow(deficitFrac, conf.mote_efficiency_penalty_power) * conf.mote_efficiency_penalty_scale;
  }

  const invYield = (stats.invasionKills ?? 0) * 4.0 + (stats.motesDenied ?? 0) * 2.0;
  const dbInv    = conf.inv_yield_benchmarks[fts] ?? 6.0;
  if (invYield > dbInv)
    pem += Math.floor((invYield - dbInv) / conf.inv_yield_bonus_step) * conf.inv_yield_bonus_val;
  if (dmg > 0 && dmg >= (conf.primeval_dmg_benchmarks[fts] ?? 60000)) pem += conf.primeval_bonus_val;
  pem = Math.max(conf.pem_floor, Math.min(pem, conf.pem_cap));

  const finalScore = base * pem;
  const simpleKd   = ((stats.mobKills ?? 0) + (stats.invasionKills ?? 0)) / Math.max(1, stats.deaths ?? 0);

  return {
    basePps:    Math.round(base * 10) / 10,
    pem:        Math.round(pem * 100) / 100,
    finalScore: Math.round(finalScore * 10) / 10,
    moteEff:    Math.round(eff * 10) / 10,
    simpleKd:   Math.round(simpleKd * 100) / 100,
    components: {
      PvE:     Math.round(pve * 10) / 10,
      PvP:     Math.round(pvp * 10) / 10,
      Banking: Math.round(obj * 10) / 10,
      Medals:  Math.round(med * 10) / 10,
    },
  };
}

// ── JPR (inlined from src/lib/server/jpr.js) ─────────────────────────────────

const SEGMENT_CONFIG = {
  solo:  { minFt: 1, maxFt: 1, expectedWR: 0.50, globalAvg: 72 },
  duo:   { minFt: 2, maxFt: 2, expectedWR: 0.55, globalAvg: 76 },
  trio:  { minFt: 3, maxFt: 3, expectedWR: 0.62, globalAvg: 80 },
  stack: { minFt: 4, maxFt: 4, expectedWR: 0.66, globalAvg: 86 },
};
const MIN_GAMES    = 5;
const PRIOR_WEIGHT = 15;
const EMA_ALPHA    = 0.15;
const EMA_WINDOW   = 20;
const FORM_MIN     = 0.90;
const FORM_MAX     = 1.10;
const IMPACT_MIN   = 0.50;
const IMPACT_MAX   = 2.00;

function calcJPR(matches) {
  const result = {};
  for (const [seg, cfg] of Object.entries(SEGMENT_CONFIG)) {
    const segMatches = matches
      .filter(m => m.ego_score != null && m.fireteam_size >= cfg.minFt && m.fireteam_size <= cfg.maxFt)
      .sort((a, b) => new Date(a.period) - new Date(b.period));

    if (segMatches.length < MIN_GAMES) { result[seg] = null; continue; }

    const scores = segMatches.map(m => m.ego_score);
    const wins   = segMatches.filter(m => m.outcome === 'Win').length;
    const n      = segMatches.length;

    const sorted = [...scores].sort((a, b) => a - b);
    const trimN  = Math.max(1, Math.floor(n * 0.1));
    const trimmed = sorted.slice(trimN, n - trimN);
    const trimmedMean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

    const topN = Math.max(1, Math.floor(n * 0.1));
    const topAvg = sorted.slice(-topN).reduce((a, b) => a + b, 0) / topN;
    const peakFactor = trimmedMean > 0 ? (topAvg / trimmedMean - 1) * 0.1 : 0;

    const priorWeight = Math.max(0, PRIOR_WEIGHT - n);
    const blended = priorWeight > 0
      ? (trimmedMean * n + cfg.globalAvg * priorWeight) / PRIOR_WEIGHT
      : trimmedMean;
    const output = blended * (1 + peakFactor);

    const impact = Math.max(IMPACT_MIN, Math.min(IMPACT_MAX, (wins / n) / cfg.expectedWR));

    const recent = scores.slice(-EMA_WINDOW);
    let ema = recent[0];
    for (let i = 1; i < recent.length; i++) ema = EMA_ALPHA * recent[i] + (1 - EMA_ALPHA) * ema;
    const form = Math.max(FORM_MIN, Math.min(FORM_MAX, trimmedMean > 0 ? ema / trimmedMean : 1));

    result[seg] = {
      jpr:          Math.round(output * impact * form * 10) / 10,
      output:       Math.round(output * 10) / 10,
      impact:       Math.round(impact * 1000) / 1000,
      form:         Math.round(form * 1000) / 1000,
      games_played: n,
    };
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sv(entry, key) {
  return entry?.extended?.values?.[key]?.basic?.value
      ?? entry?.values?.[key]?.basic?.value
      ?? 0;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPgcr(id) {
  try {
    const res  = await fetch(`${PGCR_ROOT}/Platform/Destiny2/Stats/PostGameCarnageReport/${id}/`,
      { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    const text = await res.text();
    return JSON.parse(text.replace(/:\s*(\d{15,})/g, ': "$1"'));
  } catch { return null; }
}

// ── Scanner state ─────────────────────────────────────────────────────────────

async function getStartingId() {
  // Check saved scanner state first
  const { data: state } = await supabase
    .from('meta_cache')
    .select('data')
    .eq('key', 'scanner_state')
    .single();

  if (state?.data?.last_instance_id) {
    console.log(`Resuming from saved ID: ${state.data.last_instance_id}`);
    return BigInt(state.data.last_instance_id);
  }

  // Fall back to most recent match in DB
  const { data: lastMatch } = await supabase
    .from('matches')
    .select('id, period')
    .order('period', { ascending: false })
    .limit(1)
    .single();

  if (lastMatch?.id) {
    console.log(`Starting from latest DB match: ${lastMatch.id}`);
    return BigInt(lastMatch.id);
  }

  // Bootstrap from a known recent Gambit activity
  console.log('No prior state — bootstrapping from Bungie API...');
  try {
    const res  = await fetch(
      `${BUNGIE_ROOT}/Platform/Destiny2/2/Account/4611686018437770947/Character/2305843009267807239/Stats/Activities/?mode=63&count=1&page=0`,
      { headers: { 'X-API-Key': BUNGIE_API_KEY } }
    );
    const text = await res.text();
    const data = JSON.parse(text.replace(/:\s*(\d{15,})/g, ': "$1"'));
    const id   = data.Response?.activities?.[0]?.activityDetails?.instanceId;
    if (id) {
      console.log(`Bootstrap instance ID: ${id}`);
      return BigInt(id);
    }
  } catch {}

  // Absolute fallback — start from a known recent ID
  const fallback = 17800000000n;
  console.log(`Using fallback starting ID: ${fallback}`);
  return fallback;
}

async function saveState(lastId) {
  await supabase.from('meta_cache').upsert(
    { key: 'scanner_state', data: { last_instance_id: String(lastId), updated_at: new Date().toISOString() }, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

// ── PGCR processing ───────────────────────────────────────────────────────────

async function processPgcr(pgcr, instanceId, period) {
  const entries = pgcr.entries ?? [];
  if (!entries.length) return;

  // Build fireteam size map
  const ftGroups = {};
  for (const e of entries) {
    const ftId = e.values?.fireteamId?.basic?.value ?? 0;
    if (ftId > 0) ftGroups[ftId] = (ftGroups[ftId] ?? 0) + 1;
  }

  // Build team map
  const teamMap = {};
  let tIdx = 0;
  for (const e of entries) {
    const tv = e.values?.team?.basic?.value ?? 0;
    if (!(tv in teamMap)) teamMap[tv] = tIdx++ === 0 ? 'Alpha' : 'Bravo';
  }

  // Get map name
  let mapName = 'Gambit';
  try {
    const actDef = await fetch(
      `${BUNGIE_ROOT}/Platform/Destiny2/Manifest/DestinyActivityDefinition/${pgcr.activityDetails?.referenceId}/`,
      { headers: { 'X-API-Key': BUNGIE_API_KEY } }
    );
    const defText = await actDef.text();
    const defData = JSON.parse(defText);
    mapName = (defData.Response?.displayProperties?.name ?? 'Gambit')
      .replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';
  } catch {}

  const matchRows    = [];
  const playerRows   = [];
  const rosterEntries = [];

  for (const e of entries) {
    const pInfo = e.player?.destinyUserInfo ?? {};
    const pId   = String(pInfo.membershipId ?? '');
    if (!pId || pId === '0') continue;

    const pName = pInfo.bungieGlobalDisplayName ?? pInfo.displayName ?? 'Unknown';
    const pCode = pInfo.bungieGlobalDisplayNameCode
      ? String(pInfo.bungieGlobalDisplayNameCode).padStart(4, '0') : null;
    const pMt   = pInfo.membershipType ?? 3;

    const ftSize    = ftGroups[e.values?.fireteamId?.basic?.value ?? 0] ?? 1;
    const team      = teamMap[e.values?.team?.basic?.value ?? 0] ?? 'Alpha';
    const completed = e.values?.completed?.basic?.value === 1;
    const outcome   = e.values?.standing?.basic?.value === 0 ? 'Win' : 'Loss';

    const totalKills = sv(e, 'kills');
    const invKills   = sv(e, 'invasionKills') || sv(e, 'invaderKills');
    const mDep       = sv(e, 'motesDeposited') || sv(e, 'motesBanked');
    const mLost      = sv(e, 'motesLost');

    const stats = {
      assists:            sv(e, 'assists'),
      deaths:             sv(e, 'deaths'),
      kills:              totalKills,
      mobKills:           Math.max(0, totalKills - invKills),
      precisionKills:     sv(e, 'precisionKills'),
      invasionKills:      invKills,
      invasionDeaths:     sv(e, 'invasionDeaths') || sv(e, 'invaderDeaths'),
      invasions:          sv(e, 'invasions'),
      invasionsDefeated:  sv(e, 'invasionsDefeated'),
      motesDeposited:     mDep,
      motesDenied:        sv(e, 'motesDenied'),
      motesLost:          mLost,
      motesPickedUp:      sv(e, 'motesPickedUp') || mDep + mLost,
      superKills:         sv(e, 'weaponKillsSuper'),
      grenadeKills:       sv(e, 'weaponKillsGrenade'),
      meleeKills:         sv(e, 'weaponKillsMelee'),
      primevalDamage:     sv(e, 'primevalDamage'),
      primevalHealing:    sv(e, 'primevalHealing'),
      smallBlockersSent:  sv(e, 'smallBlockersSent'),
      mediumBlockersSent: sv(e, 'mediumBlockersSent'),
      largeBlockersSent:  sv(e, 'largeBlockersSent'),
      fireteam_size:      ftSize,
    };

    const medals = extractMedals(e.extended?.values ?? {});
    const ego    = completed
      ? calculateEgoScore({ ...stats, medals, fireteam_size: ftSize })
      : null;

    rosterEntries.push({
      id: pId, name: pName, code: pCode, membershipType: pMt,
      team, fireteam_size: ftSize, score: ego?.finalScore ?? 0,
      stats, medals,
    });

    if (!completed || !ego) continue;

    // Match row for this player
    matchRows.push({
      id:            instanceId,
      player_id:     pId,
      map_name:      mapName,
      outcome,
      ego_score:     ego.finalScore,
      ego_base:      ego.basePps,
      ego_pem:       ego.pem,
      kd:            stats.deaths > 0 ? +(stats.kills / stats.deaths).toFixed(2) : stats.kills,
      mote_eff:      ego.moteEff,
      fireteam_size: ftSize,
      is_hard_carry: false,
      is_carried:    false,
      stats_json:    { ...stats, top_weapons: [], medals, ego_breakdown: ego.components, roster: rosterEntries },
      period,
      created_at:    new Date().toISOString(),
    });

    playerRows.push({
      id:              pId,
      bungie_name:     pName,
      bungie_code:     pCode,
      membership_type: pMt,
      updated_at:      new Date().toISOString(),
    });
  }

  if (!matchRows.length) return;

  // Fix up roster reference in stats_json now that it's complete
  const roster = rosterEntries;
  for (const row of matchRows) row.stats_json.roster = roster;

  // Write to DB
  await supabase.from('matches').upsert(matchRows, { onConflict: 'id,player_id' });
  await supabase.from('players').upsert(playerRows, { onConflict: 'id', ignoreDuplicates: true });

  return matchRows.length;
}

// ── JPR batch recompute ───────────────────────────────────────────────────────
// Runs every JPR_RECOMPUTE_MS in the background.
// Recomputes JPR for all players who got new matches since the last run.

const jprQueue = new Set();

async function runJprRecompute() {
  if (jprQueue.size === 0) return;
  const batch = [...jprQueue].slice(0, 200);
  batch.forEach(id => jprQueue.delete(id));

  for (const playerId of batch) {
    try {
      const { data: allMatches } = await supabase
        .from('matches')
        .select('ego_score, outcome, fireteam_size, period')
        .eq('player_id', playerId)
        .not('ego_score', 'is', null)
        .order('period', { ascending: false })
        .limit(500);

      if (!allMatches?.length) continue;

      const jprResult = calcJPR(allMatches);
      const rows = Object.entries(jprResult)
        .filter(([, v]) => v != null)
        .map(([seg, v]) => ({
          player_id:    playerId,
          segment:      seg,
          jpr:          v.jpr,
          output:       v.output,
          impact:       v.impact,
          form:         v.form,
          games_played: v.games_played,
          updated_at:   new Date().toISOString(),
        }));

      if (rows.length) {
        await supabase.from('player_jpr').upsert(rows, { onConflict: 'player_id,segment' });
      }

      // Also update NGR in players table
      const egoScores = allMatches.map(m => m.ego_score).filter(Boolean);
      if (egoScores.length) {
        const ngr = Math.round((egoScores.reduce((a, b) => a + b, 0) / egoScores.length) * 10) / 10;
        await supabase.from('players').update({
          ngr, ego_score_avg: ngr, games_played: egoScores.length, updated_at: new Date().toISOString()
        }).eq('id', playerId);
      }
    } catch {}
    await sleep(50);
  }
}

// ── Main scan loop ────────────────────────────────────────────────────────────

async function main() {
  console.log('Jadestone PGCR Scanner starting...');

  let currentId      = await getStartingId();
  let consecutiveMisses = 0;
  let scanned        = 0;
  let gambits        = 0;
  let lastSave       = Date.now();
  let lastJprRun     = Date.now();
  const startTime    = Date.now();

  console.log(`Starting scan from ID ${currentId}`);

  // Start JPR recompute loop
  setInterval(async () => {
    await runJprRecompute().catch(() => {});
    lastJprRun = Date.now();
  }, JPR_RECOMPUTE_MS);

  while (true) {
    // Fetch PARALLEL IDs simultaneously
    const ids = [];
    for (let j = 0; j < PARALLEL; j++) ids.push(currentId + BigInt(j + 1));
    currentId += BigInt(PARALLEL);
    scanned   += PARALLEL;

    const results = await Promise.all(ids.map(id => fetchPgcr(String(id))));

    for (let j = 0; j < results.length; j++) {
      const pgcrData = results[j];
      const scanId   = ids[j];

      if (!pgcrData || pgcrData.ErrorCode !== 1) {
        consecutiveMisses++;
        continue;
      }

      consecutiveMisses = 0;
      const mode = pgcrData.Response?.activityDetails?.mode;
      if (mode !== GAMBIT_MODE) continue;

      // Found a Gambit match
      gambits++;
      const period  = pgcrData.Response?.period;
      const matchId = String(scanId);

      try {
        const written = await processPgcr(pgcrData.Response, matchId, period);
        if (written) {
          for (const e of pgcrData.Response.entries ?? []) {
            const pId = String(e.player?.destinyUserInfo?.membershipId ?? '');
            if (pId && pId !== '0') jprQueue.add(pId);
          }
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`[${elapsed}s] Gambit #${gambits} ID=${matchId} period=${period?.slice(0, 10)} wrote ${written} player rows`);
        }
      } catch (err) {
        console.error(`Error processing ${matchId}:`, err.message);
      }
    }

    // Caught up to live — save and sleep
    if (consecutiveMisses >= MISS_THRESHOLD) {
      await saveState(currentId).catch(() => {});
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[${elapsed}s] Live. Scanned ${scanned} IDs, found ${gambits} Gambit matches. Sleeping ${CATCHUP_SLEEP_MS / 1000}s...`);
      await sleep(CATCHUP_SLEEP_MS);
      consecutiveMisses = 0;
    }

    // Save state every 30 seconds
    if (Date.now() - lastSave > 30_000) {
      await saveState(currentId).catch(() => {});
      lastSave = Date.now();
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
