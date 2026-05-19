#!/usr/bin/env node
/**
 * Jadestone Activity Scanner — Railway deployment
 *
 * Crawls the player graph via Gambit activity history (mode=63).
 * Every match found writes full data for all 8 players automatically —
 * no profile-page enrichment needed.
 *
 * Loop:
 *   1. Pull a batch of players from player_queue
 *   2. Fetch their Gambit activity history (mode=63 only — zero wasted calls)
 *   3. For each new match, fetch the PGCR and process all 8 players
 *   4. Write matches, update NGR, queue all newly discovered players
 *   5. Recompute JPR for everyone who got new matches
 *   6. Every 10 min: rebuild weapon meta for top-50 JPR players
 *   7. Repeat immediately
 */

import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// ── Environment ───────────────────────────────────────────────────────────────

const BUNGIE_API_KEY       = process.env.BUNGIE_API_KEY;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!BUNGIE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars: BUNGIE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const BUNGIE_ROOT     = 'https://www.bungie.net';
const PGCR_ROOT       = 'https://stats.bungie.net';
const BATCH_SIZE      = 20;   // players per cycle
const HISTORY_COUNT   = 50;   // recent matches to check per character
const MAX_NEW_PGCRS   = 25;   // max new PGCRs to enrich per player per cycle
const PGCR_PARALLEL   = 8;    // parallel PGCR fetches
const META_INTERVAL   = 10 * 60 * 1000; // recompute weapon meta every 10 min
const SLOT_BUCKETS    = { 1491708835: 'Kinetic', 2465295065: 'Energy', 95395402: 'Power' };

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
});

// ── EGO Algorithm ─────────────────────────────────────────────────────────────

const ALGO_CONFIG = {
  dr_rate: 0.05, medal_dr_rate: 0.15,
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
    notOnMyWatch: ['medalgambitsaviour','medalsaviour','medalgambitnotonmywatch','medalspvecompmedaldenied','medaldenied','medalspvecompmedalinvasionshutdown'],
    armyOfOne: ['medalspvecompmedalinvaderkillfour','medalinvaderkillfour'],
    locksmith: ['medalspvecompmedallocksmith'],
    blockbuster: ['medalspvecompmedalblockparty','medalblockparty','medalspvecompmedalblockbuster'],
    rapidPayback: ['medalspvecompmedalrapidpayback','medalrapidpayback'],
    massacre: ['medalspvecompmedalmassacre'],
    motesHaveBeen: ['medalgambitmotesdrained','medalmotesdrained','medalspvecompmedaltagsdenied15'],
    halfBanked: ['medalspvecompmedalhalfbanked'],
    firstToBlock: ['medalspvecompmedalfirsttoblock'],
    payback: ['medalgambitpayback','medalpayback','medalspvecompmedalrevenge'],
    overkillmonger: ['medalgambitoverkillmonger','medaloverkillmonger','medalspvecompmedaloverkillmonger'],
    killmonger: ['medalgambitkillmonger','medalkillmonger','medalspvecompmedalkillmonger'],
    thrillmonger: ['medalgambitthrillmonger','medalthrillmonger','medalspvecompmedalthrillmonger'],
    fastFill: ['medalspvecompmedalfastfill'],
    killAfterInvasion: ['medalspvecompmedalkillafterinvasion'],
    bigGameHunter: ['medalgambithunter','medalhunter','medalspvecompmedalbiggamehunter'],
    lastGuardianStanding: ['medalgambitlastmanstanding','medallastmanstanding'],
    noEscape: ['medalspvecompmedalbankkill','medalspvecompmedalnoescape'],
  };
  const rev = {};
  for (const [canon, list] of Object.entries(aliases)) {
    for (const a of list) rev[a.toLowerCase().replace(/_/g,'')] = canon;
    const fk = canon[0].toUpperCase() + canon.slice(1);
    for (const v of [`medalgambit${fk}`,`medal${fk}`,`medalspvecompmedal${canon}`])
      rev[v.toLowerCase().replace(/_/g,'')] = canon;
  }
  return rev;
})();

function extractMedals(extValues = {}) {
  const medals = {};
  for (const [k, v] of Object.entries(extValues)) {
    const canon = _MEDAL_REVERSE[k.toLowerCase().replace(/_/g,'')];
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
  const v = ALGO_CONFIG.base_values, dr = ALGO_CONFIG.dr_rate;
  const m_dr = ALGO_CONFIG.medal_dr_rate, conf = ALGO_CONFIG.pem_config;
  const fts = stats.fireteam_size ?? 1;
  let pve = 0, pvp = 0, obj = 0, med = 0;
  pve += calcDR(stats.mobKills ?? 0, v.mobKills, dr);
  const dmg = stats.primevalDamage ?? 0, chunks = Math.floor(dmg / 10000);
  pve += calcDR(chunks, 10000 * v.primevalDamage, dr) + (dmg % 10000) * (v.primevalDamage * Math.pow(1-dr, chunks));
  pvp += calcDR(stats.invasionKills ?? 0, v.invasionKills, dr);
  pvp += calcDR(stats.motesDenied ?? 0, v.motesDenied, dr);
  obj += calcDR(stats.motesDeposited ?? 0, v.motesDeposited, dr);
  const ast = calcDR(stats.assists ?? 0, v.assists, dr);
  pve += ast/2; pvp += ast/2;
  const pen = (stats.deaths ?? 0) * v.deaths;
  const wasted = Math.max(0, (stats.motesPickedUp ?? 0) - (stats.motesDeposited ?? 0));
  const wastePen = wasted > 0 ? wasted * v.wastedMotes : 0;
  for (const [mName, count] of Object.entries(stats.medals ?? {})) {
    const mVal = ALGO_CONFIG.medal_values[mName];
    if (mVal && count > 0) med += calcDR(count, mVal, m_dr);
  }
  const BUCKET_FLOOR = 18, FLOOR_GAIN = 0.35;
  const buckets = [pve, pvp, obj, med];
  const floorBoost = buckets.reduce((s,b) => s + Math.max(0, BUCKET_FLOOR - b) * FLOOR_GAIN, 0);
  const teamMult = {1:1.0,2:1.1,3:1.2,4:1.3}[fts] ?? 1.0;
  let base = (pve + pvp + obj + med + pen + wastePen + floorBoost) * teamMult;
  if (base > 100) base = 95.2 + (base - 100) * 0.05;
  else if (base > 92) base = 92 + (base - 92) * 0.4;
  const bSorted = [...buckets].sort((a,b) => b-a);
  if (bSorted[1] > BUCKET_FLOOR*1.2 && bSorted[2] < BUCKET_FLOOR*0.9) base *= 1.03;
  let pem = 1.0;
  const pk = Math.max(stats.motesPickedUp ?? 0, stats.motesDeposited ?? 0);
  const eff = pk > 0 ? ((stats.motesDeposited ?? 0) / pk) * 100 : 100.0;
  const dbMote = {1:77.5,2:81.5,3:86.0,4:90.0}[fts] ?? 77.5;
  if (eff > dbMote) pem += Math.floor((eff-dbMote)/conf.mote_efficiency_bonus_step)*conf.mote_efficiency_bonus_val;
  else if (eff < dbMote) { const d = (dbMote-eff)/100; pem *= 1-Math.pow(d,conf.mote_efficiency_penalty_power)*conf.mote_efficiency_penalty_scale; }
  const invYield = (stats.invasionKills??0)*4 + (stats.motesDenied??0)*2;
  const dbInv = conf.inv_yield_benchmarks[fts] ?? 6;
  if (invYield > dbInv) pem += Math.floor((invYield-dbInv)/conf.inv_yield_bonus_step)*conf.inv_yield_bonus_val;
  if (dmg > 0 && dmg >= (conf.primeval_dmg_benchmarks[fts]??60000)) pem += conf.primeval_bonus_val;
  pem = Math.max(conf.pem_floor, Math.min(pem, conf.pem_cap));
  const finalScore = base * pem;
  const simpleKd = ((stats.mobKills??0)+(stats.invasionKills??0)) / Math.max(1, stats.deaths??0);
  return {
    basePps: Math.round(base*10)/10, pem: Math.round(pem*100)/100,
    finalScore: Math.round(finalScore*10)/10, moteEff: Math.round(eff*10)/10,
    simpleKd: Math.round(simpleKd*100)/100,
    components: { PvE: Math.round(pve*10)/10, PvP: Math.round(pvp*10)/10, Banking: Math.round(obj*10)/10, Medals: Math.round(med*10)/10 },
  };
}

// ── JPR ───────────────────────────────────────────────────────────────────────

const SEGMENT_CONFIG = {
  solo:  { minFt:1, maxFt:1, expectedWR:0.50, globalAvg:72 },
  duo:   { minFt:2, maxFt:2, expectedWR:0.55, globalAvg:76 },
  trio:  { minFt:3, maxFt:3, expectedWR:0.62, globalAvg:80 },
  stack: { minFt:4, maxFt:4, expectedWR:0.66, globalAvg:86 },
};

function calcJPR(matches) {
  const result = {};
  for (const [seg, cfg] of Object.entries(SEGMENT_CONFIG)) {
    const sm = matches.filter(m => m.ego_score != null && m.fireteam_size >= cfg.minFt && m.fireteam_size <= cfg.maxFt)
      .sort((a,b) => new Date(a.period) - new Date(b.period));
    if (sm.length < 20) { result[seg] = null; continue; }
    const scores = sm.map(m => m.ego_score), wins = sm.filter(m => m.outcome==='Win').length, n = sm.length;
    const sorted = [...scores].sort((a,b) => a-b), trimN = Math.max(1,Math.floor(n*0.1));
    const trimmed = sorted.slice(trimN, n-trimN);
    const trimmedMean = trimmed.reduce((a,b)=>a+b,0)/trimmed.length;
    const topAvg = sorted.slice(-Math.max(1,Math.floor(n*0.1))).reduce((a,b)=>a+b,0)/Math.max(1,Math.floor(n*0.1));
    const peakFactor = trimmedMean > 0 ? (topAvg/trimmedMean-1)*0.1 : 0;
    const priorWeight = Math.max(0, 30-n);
    const blended = priorWeight > 0 ? (trimmedMean*n+cfg.globalAvg*priorWeight)/30 : trimmedMean;
    const output = blended*(1+peakFactor);
    // Bayesian-smooth win rate toward expected WR so small samples don't inflate impact
    const impactPrior = 20;
    const smoothedWR = (wins + cfg.expectedWR * impactPrior) / (n + impactPrior);
    const impact = Math.max(0.5, Math.min(2, smoothedWR / cfg.expectedWR));
    const recent = scores.slice(-20); let ema = recent[0];
    for (let i=1;i<recent.length;i++) ema = 0.15*recent[i]+0.85*ema;
    const form = Math.max(0.9, Math.min(1.1, trimmedMean>0?ema/trimmedMean:1));
    result[seg] = { jpr:Math.round(output*impact*form*10)/10, output:Math.round(output*10)/10, impact:Math.round(impact*1000)/1000, form:Math.round(form*1000)/1000, games_played:n };
  }
  return result;
}

// ── Bungie API helpers ────────────────────────────────────────────────────────

function sv(entry, key) {
  return entry?.extended?.values?.[key]?.basic?.value ?? entry?.values?.[key]?.basic?.value ?? 0;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function bungieGet(url) {
  try {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    const text = await res.text();
    return JSON.parse(text.replace(/:\s*(\d{15,})/g, ': "$1"'));
  } catch { return null; }
}

async function fetchPgcr(id) {
  try {
    const res = await fetch(`${PGCR_ROOT}/Platform/Destiny2/Stats/PostGameCarnageReport/${id}/`,
      { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    const text = await res.text();
    return JSON.parse(text.replace(/:\s*(\d{15,})/g, ': "$1"'));
  } catch { return null; }
}

// ── Map name cache ────────────────────────────────────────────────────────────

const mapNameCache = {};
async function getMapName(referenceId) {
  if (!referenceId) return 'Gambit';
  if (mapNameCache[referenceId]) return mapNameCache[referenceId];
  try {
    const res = await fetch(`${BUNGIE_ROOT}/Platform/Destiny2/Manifest/DestinyActivityDefinition/${referenceId}/`,
      { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    const data = await res.json();
    const name = (data.Response?.displayProperties?.name ?? 'Gambit').replace(/^Gambit[:\-]\s*/i,'').trim() || 'Gambit';
    mapNameCache[referenceId] = name;
    return name;
  } catch { return 'Gambit'; }
}

// Weapon def cache
const weaponDefCache = {};
async function getWeaponDef(hash) {
  if (!hash) return null;
  if (weaponDefCache[hash] !== undefined) return weaponDefCache[hash];
  try {
    const res = await fetch(`${BUNGIE_ROOT}/Platform/Destiny2/Manifest/DestinyInventoryItemDefinition/${hash}/`,
      { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    const data = await res.json();
    const def = data.Response ?? null;
    weaponDefCache[hash] = def;
    return def;
  } catch { weaponDefCache[hash] = null; return null; }
}

// ── PGCR processing ───────────────────────────────────────────────────────────

async function processPgcr(pgcr, instanceId, period) {
  const entries = pgcr.entries ?? [];
  if (!entries.length) return { matchRows: [], playerRows: [], newPlayers: [] };

  const ftGroups = {};
  for (const e of entries) {
    const ftId = e.values?.fireteamId?.basic?.value ?? 0;
    if (ftId > 0) ftGroups[ftId] = (ftGroups[ftId] ?? 0) + 1;
  }
  const teamMap = {}; let tIdx = 0;
  for (const e of entries) {
    const tv = e.values?.team?.basic?.value ?? 0;
    if (!(tv in teamMap)) teamMap[tv] = tIdx++ === 0 ? 'Alpha' : 'Bravo';
  }

  const mapName = await getMapName(pgcr.activityDetails?.referenceId);
  const roster = [], matchRows = [], playerRows = [], newPlayers = [];

  for (const e of entries) {
    const pInfo = e.player?.destinyUserInfo ?? {};
    const pId   = String(pInfo.membershipId ?? '');
    if (!pId || pId === '0') continue;
    const pName = pInfo.bungieGlobalDisplayName ?? pInfo.displayName ?? 'Unknown';
    const pCode = pInfo.bungieGlobalDisplayNameCode ? String(pInfo.bungieGlobalDisplayNameCode).padStart(4,'0') : null;
    const pMt   = pInfo.membershipType ?? 3;
    const ftSize = ftGroups[e.values?.fireteamId?.basic?.value ?? 0] ?? 1;
    const team   = teamMap[e.values?.team?.basic?.value ?? 0] ?? 'Alpha';
    const completed = e.values?.completed?.basic?.value === 1;
    const outcome   = e.values?.standing?.basic?.value === 0 ? 'Win' : 'Loss';

    const totalKills = sv(e,'kills'), invKills = sv(e,'invasionKills')||sv(e,'invaderKills');
    const mDep = sv(e,'motesDeposited')||sv(e,'motesBanked'), mLost = sv(e,'motesLost');

    const stats = {
      assists: sv(e,'assists'), deaths: sv(e,'deaths'), kills: totalKills,
      mobKills: Math.max(0, totalKills - invKills), precisionKills: sv(e,'precisionKills'),
      invasionKills: invKills, invasionDeaths: sv(e,'invasionDeaths')||sv(e,'invaderDeaths'),
      invasions: sv(e,'invasions'), invasionsDefeated: sv(e,'invasionsDefeated'),
      motesDeposited: mDep, motesDenied: sv(e,'motesDenied'), motesLost: mLost,
      motesPickedUp: sv(e,'motesPickedUp') || mDep + mLost,
      superKills: sv(e,'weaponKillsSuper'), grenadeKills: sv(e,'weaponKillsGrenade'),
      meleeKills: sv(e,'weaponKillsMelee'), primevalDamage: sv(e,'primevalDamage'),
      primevalHealing: sv(e,'primevalHealing'), smallBlockersSent: sv(e,'smallBlockersSent'),
      mediumBlockersSent: sv(e,'mediumBlockersSent'), largeBlockersSent: sv(e,'largeBlockersSent'),
      fireteam_size: ftSize,
    };

    const medals = extractMedals(e.extended?.values ?? {});
    const ego    = completed ? calculateEgoScore({ ...stats, medals, fireteam_size: ftSize }) : null;

    // Weapons
    const weapons = [];
    for (const w of e.extended?.weapons ?? []) {
      const def = await getWeaponDef(w.referenceId);
      if (def) weapons.push({
        name: def.displayProperties.name, hash: w.referenceId,
        slot: SLOT_BUCKETS[def.inventory?.bucketTypeHash] ?? 'Unknown',
        kills: sv(w,'uniqueWeaponKills'), precision: sv(w,'uniqueWeaponPrecisionKills'),
        icon: BUNGIE_ROOT + def.displayProperties.icon,
      });
    }

    roster.push({ id: pId, name: pName, code: pCode, membershipType: pMt, team, fireteam_size: ftSize, score: ego?.finalScore ?? 0, stats, medals });
    newPlayers.push({ player_id: pId, membership_type: pMt, bungie_name: pName, bungie_code: pCode, priority: 1, added_at: new Date().toISOString() });

    if (!completed || !ego) continue;

    matchRows.push({
      id: instanceId, player_id: pId, map_name: mapName, outcome,
      ego_score: ego.finalScore, ego_base: ego.basePps, ego_pem: ego.pem,
      kd: stats.deaths > 0 ? +(stats.kills/stats.deaths).toFixed(2) : stats.kills,
      mote_eff: ego.moteEff, fireteam_size: ftSize,
      is_hard_carry: false, is_carried: false,
      stats_json: { ...stats, top_weapons: weapons, medals, ego_breakdown: ego.components, roster: [] },
      period, created_at: new Date().toISOString(),
    });

    playerRows.push({
      id: pId, bungie_name: pName, bungie_code: pCode, membership_type: pMt,
      updated_at: new Date().toISOString(),
    });
  }

  // Attach complete roster to each match row
  for (const row of matchRows) row.stats_json.roster = roster;

  return { matchRows, playerRows, newPlayers };
}

// ── JPR save ──────────────────────────────────────────────────────────────────

async function saveJPR(playerId, jprResult) {
  const rows = Object.entries(jprResult)
    .filter(([,v]) => v != null)
    .map(([seg,v]) => ({ player_id: playerId, segment: seg, jpr: v.jpr, output: v.output, impact: v.impact, form: v.form, games_played: v.games_played, updated_at: new Date().toISOString() }));
  if (!rows.length) return;
  await supabase.from('player_jpr').upsert(rows, { onConflict: 'player_id,segment' });
}

// ── Weapon meta for top 50 ────────────────────────────────────────────────────

async function updateWeaponMeta() {
  try {
    // Get top 50 players by avg JPR across segments
    const { data: topJpr } = await supabase
      .from('player_jpr')
      .select('player_id, jpr')
      .order('jpr', { ascending: false })
      .limit(200);

    if (!topJpr?.length) return;

    // Deduplicate to top 50 unique players
    const seen = new Set(), top50 = [];
    for (const r of topJpr) {
      if (!seen.has(r.player_id)) { seen.add(r.player_id); top50.push(r.player_id); }
      if (top50.length >= 50) break;
    }

    // Pull their last 100 matches each
    const { data: matches } = await supabase
      .from('matches')
      .select('stats_json, outcome, ego_score, map_name, period')
      .in('player_id', top50)
      .not('stats_json', 'is', null)
      .order('period', { ascending: false })
      .limit(5000);

    if (!matches?.length) return;

    // Aggregate weapons
    const weaponMap = {};
    for (const m of matches) {
      const weapons = m.stats_json?.top_weapons ?? [];
      const isWin = m.outcome === 'Win';
      for (const w of weapons) {
        if (!w?.name) continue;
        const key = w.hash ?? w.name;
        if (!weaponMap[key]) weaponMap[key] = { name: w.name, hash: w.hash, slot: w.slot, icon: w.icon, picks: 0, wins: 0, totalKills: 0, totalEgo: 0, egoCount: 0 };
        weaponMap[key].picks++;
        if (isWin) weaponMap[key].wins++;
        weaponMap[key].totalKills += w.kills ?? 0;
        if (m.ego_score != null) { weaponMap[key].totalEgo += m.ego_score; weaponMap[key].egoCount++; }
      }
    }

    const total = matches.length;
    const weapons = Object.values(weaponMap)
      .filter(w => w.picks >= 5)
      .map(w => ({ ...w, pickRate: +(w.picks/total*100).toFixed(2), winRate: +(w.wins/w.picks*100).toFixed(1), avgKills: +(w.totalKills/w.picks).toFixed(1), avgEgo: w.egoCount > 0 ? +(w.totalEgo/w.egoCount).toFixed(1) : null }))
      .sort((a,b) => b.picks - a.picks)
      .slice(0, 100);

    const now = new Date().toISOString();
    await supabase.from('meta_cache').upsert(
      { key: 'weapons_top50', data: { weapons, updatedAt: now, matchCount: total, playerCount: top50.length }, updated_at: now },
      { onConflict: 'key' }
    );

    console.log(`[meta] Updated weapon meta: ${weapons.length} weapons from ${total} matches (top ${top50.length} players)`);
  } catch (err) {
    console.error('[meta] Error:', err.message);
  }
}

// ── Per-player crawl ──────────────────────────────────────────────────────────

async function crawlPlayer(queueRow) {
  const { player_id, membership_type, bungie_name, last_match_period } = queueRow;

  try {
    // 1. Get character IDs
    const profile = await bungieGet(`/Platform/Destiny2/${membership_type}/Profile/${player_id}/?components=100`);
    if (profile?.ErrorCode !== 1) return { player_id, newMatches: 0, newPlayers: 0, error: `ErrorCode ${profile?.ErrorCode}` };

    const charIds = profile.Response?.profile?.data?.characterIds ?? [];
    if (!charIds.length) return { player_id, newMatches: 0, newPlayers: 0, error: 'no characters' };

    // 2. Fetch Gambit activity history (mode=63) for each character
    const allActivities = [], seen = new Set();
    for (const charId of charIds) {
      const data = await bungieGet(`/Platform/Destiny2/${membership_type}/Account/${player_id}/Character/${charId}/Stats/Activities/?mode=63&count=${HISTORY_COUNT}&page=0`);
      if (data?.ErrorCode !== 1) continue;
      for (const act of data.Response?.activities ?? []) {
        const id = act.activityDetails?.instanceId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (last_match_period && act.period && new Date(act.period) <= new Date(last_match_period)) continue;
        allActivities.push(act);
      }
    }

    if (!allActivities.length) return { player_id, newMatches: 0, newPlayers: 0, error: null };

    // Sort newest first, cap
    allActivities.sort((a,b) => new Date(b.period) - new Date(a.period));
    const toProcess = allActivities.slice(0, MAX_NEW_PGCRS);

    // 3. Fetch PGCRs in parallel batches
    const allMatchRows = [], allPlayerRows = [], allNewPlayers = [];

    for (let i = 0; i < toProcess.length; i += PGCR_PARALLEL) {
      const batch = toProcess.slice(i, i + PGCR_PARALLEL);
      const results = await Promise.all(batch.map(async (act) => {
        const pgcrRes = await fetchPgcr(act.activityDetails.instanceId);
        if (pgcrRes?.ErrorCode !== 1) return null;
        return { pgcr: pgcrRes.Response, instanceId: act.activityDetails.instanceId, period: act.period };
      }));

      for (const r of results.filter(Boolean)) {
        const { matchRows, playerRows, newPlayers } = await processPgcr(r.pgcr, r.instanceId, r.period);
        allMatchRows.push(...matchRows);
        allPlayerRows.push(...playerRows);
        allNewPlayers.push(...newPlayers);
      }
    }

    if (!allMatchRows.length) return { player_id, newMatches: 0, newPlayers: 0, error: null };

    // 4. Write matches
    await supabase.from('matches').upsert(allMatchRows, { onConflict: 'id,player_id' });

    // 5. Write/update players
    const uniquePlayers = [...new Map(allPlayerRows.map(p => [p.id, p])).values()];
    await supabase.from('players').upsert(uniquePlayers, { onConflict: 'id', ignoreDuplicates: true });

    // 6. Queue newly discovered players
    const uniqueQueue = [...new Map(allNewPlayers.filter(p => p.player_id !== player_id).map(p => [p.player_id, p])).values()];
    if (uniqueQueue.length) {
      await supabase.from('player_queue').upsert(uniqueQueue, { onConflict: 'player_id', ignoreDuplicates: true });
    }

    // 7. Update NGR for this player
    const { data: playerRow } = await supabase.from('players').select('ngr,games_played').eq('id', String(player_id)).single();
    let ngr = playerRow?.ngr ?? 0, games = playerRow?.games_played ?? 0;
    for (const m of allMatchRows.filter(r => r.player_id === String(player_id))) {
      games++; ngr = (ngr * (games-1) + m.ego_score) / games;
    }
    await supabase.from('players').upsert({
      id: String(player_id), bungie_name, ngr: Math.round(ngr*10)/10,
      ego_score_avg: Math.round(ngr*10)/10, games_played: games,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    // 8. Recompute JPR from last 500 matches
    const { data: allMatches } = await supabase
      .from('matches').select('ego_score,outcome,fireteam_size,period')
      .eq('player_id', String(player_id)).not('ego_score','is',null)
      .order('period',{ascending:false}).limit(500);
    if (allMatches?.length) await saveJPR(String(player_id), calcJPR(allMatches));

    return { player_id, bungie_name, newMatches: allMatchRows.filter(r => r.player_id === String(player_id)).length, newPlayers: uniqueQueue.length, error: null };

  } catch (err) {
    return { player_id, newMatches: 0, newPlayers: 0, error: err.message };
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('Jadestone Activity Scanner starting...');

  let totalMatches = 0, totalPlayers = 0, cycles = 0;
  let lastMeta = 0;
  const startTime = Date.now();

  // Seed queue from existing players on first run
  const { count } = await supabase.from('player_queue').select('*', { count: 'exact', head: true });
  if (!count) {
    console.log('Empty queue — seeding from players table...');
    const { data: existing } = await supabase.from('players').select('id,membership_type,bungie_name,bungie_code').limit(10000);
    if (existing?.length) {
      const rows = existing.map(p => ({ player_id: p.id, membership_type: p.membership_type ?? 3, bungie_name: p.bungie_name, bungie_code: p.bungie_code, priority: 2, added_at: new Date().toISOString() }));
      await supabase.from('player_queue').upsert(rows, { onConflict: 'player_id', ignoreDuplicates: true });
      console.log(`Seeded ${rows.length} players`);
    }
  }

  while (true) {
    cycles++;

    // Pull next batch
    const { data: batch } = await supabase
      .from('player_queue')
      .select('player_id,membership_type,bungie_name,bungie_code,last_match_period,priority')
      .order('priority', { ascending: false })
      .order('last_checked', { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    if (!batch?.length) {
      console.log('Queue empty — sleeping 30s...');
      await sleep(30_000);
      continue;
    }

    // Mark as being processed
    await supabase.from('player_queue')
      .update({ last_checked: new Date().toISOString() })
      .in('player_id', batch.map(r => r.player_id));

    // Crawl all players in batch concurrently (groups of 5 to stay within rate limits)
    const GROUP = 5;
    for (let i = 0; i < batch.length; i += GROUP) {
      const group = batch.slice(i, i + GROUP);
      const results = await Promise.all(group.map(row => crawlPlayer(row)));

      for (const r of results) {
        if (r.newMatches > 0) {
          totalMatches += r.newMatches;
          totalPlayers += r.newPlayers;
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`[${elapsed}s] ${r.bungie_name ?? r.player_id}: +${r.newMatches} matches, +${r.newPlayers} new players (total: ${totalMatches} matches, ${totalPlayers} players)`);
        }
        // Update last_match_period
        if (r.newMatches > 0) {
          await supabase.from('player_queue')
            .update({ last_match_period: new Date().toISOString() })
            .eq('player_id', r.player_id);
        }
      }
    }

    // Weapon meta every 10 min
    if (Date.now() - lastMeta > META_INTERVAL) {
      await updateWeaponMeta();
      lastMeta = Date.now();
    }

    // Brief pause between cycles to avoid hammering Bungie
    await sleep(500);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
