import { BUNGIE_API_KEY } from '$env/static/private';
import { error } from '@sveltejs/kit';
import { getItemDef, getActivityDef, getAllMedals } from '$lib/server/manifest.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const PGCR_ROOT   = 'https://stats.bungie.net';

async function bungieGet(url, root = BUNGIE_ROOT) {
    const res = await fetch(root + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

// ── EGO Scoring Engine (ported from Jadestone desktop app config.py / scoring.py) ─
const ALGO_CONFIG = {
    dr_rate: 0.05, medal_dr_rate: 0.15,
    base_values: {
        mobKills: 0.19, assists: 0.08, motesDenied: 0.99, invasionKills: 1.90,
        motesDeposited: 0.58, primevalDamage: 0.00041, deaths: -5.0, wastedMotes: -0.25
    },
    medal_values: {
        notOnMyWatch: 5.34, armyOfOne: 2.02, locksmith: 2.94, blockbuster: 3.96,
        rapidPayback: 4.14, massacre: 2.48, motesHaveBeen: 2.94, halfBanked: 2.48,
        firstToBlock: 2.12, payback: 1.66, overkillmonger: 1.29, killmonger: 0.83,
        thrillmonger: 0.46, fastFill: 1.29, killAfterInvasion: 0.83, bigGameHunter: 0.64,
        lastGuardianStanding: 0.46, noEscape: 0.46
    }
};

function calcDR(cnt, val, rate) {
    let total = 0, cur = val;
    for (let i = 0; i < Math.floor(cnt); i++) { total += cur; cur *= (1 - rate); }
    return total;
}

function calcEgo(stats) {
    const v = ALGO_CONFIG.base_values, dr = ALGO_CONFIG.dr_rate, mdr = ALGO_CONFIG.medal_dr_rate;
    let pve = 0, pvp = 0, obj = 0, med = 0;
    const fts = stats.fireteamSize ?? 1;

    // PvE: mob kills (total kills minus invasion kills) + primeval damage
    const mobK = Math.max(0, (stats.kills ?? 0) - (stats.invasionKills ?? 0));
    pve += calcDR(mobK, v.mobKills, dr);
    const dmg = stats.primevalDamage ?? 0;
    const chunks = Math.floor(dmg / 10000);
    pve += calcDR(chunks, 10000 * v.primevalDamage, dr)
         + ((dmg % 10000) * (v.primevalDamage * Math.pow(1 - dr, chunks)));

    // PvP: invasion kills + motes denied
    pvp += calcDR(stats.invasionKills ?? 0, v.invasionKills, dr);
    pvp += calcDR(stats.motesDenied   ?? 0, v.motesDenied,  dr);

    // Banking: motes deposited
    obj += calcDR(stats.motesDeposited ?? 0, v.motesDeposited, dr);

    // Assists split between PvE and PvP
    const ast = calcDR(stats.assists ?? 0, v.assists, dr);
    pve += ast / 2; pvp += ast / 2;

    // Penalties
    let pen = (stats.deaths ?? 0) * v.deaths;
    const wasted = Math.max(0, (stats.motesPickedUp ?? 0) - (stats.motesDeposited ?? 0));
    if (wasted > 0) pen += wasted * v.wastedMotes;

    // Medals
    for (const [medal, count] of Object.entries(stats.medals ?? {})) {
        const mv = ALGO_CONFIG.medal_values[medal];
        if (count > 0 && mv != null) med += calcDR(count, mv, mdr);
    }

    // Stack multiplier from config
    const stackMult = { 1: 1.0, 2: 1.1, 3: 1.2, 4: 1.3 }[fts] ?? 1.0;
    let base = (pve + pvp + obj + med + pen) * stackMult;
    // Soft cap
    if (base > 120) base = 100 + (20 * 0.5) + ((base - 120) * 0.25);
    else if (base > 100) base = 100 + ((base - 100) * 0.5);

    // PEM (Performance Efficiency Multiplier) — exact logic from desktop app
    let pem = 1.0;
    const pk = Math.max(stats.motesPickedUp ?? 0, stats.motesDeposited ?? 0);
    const moteEff = pk > 0 ? ((stats.motesDeposited ?? 0) / pk * 100) : 100.0;
    const dbMote  = { 1: 77.5, 2: 81.5, 3: 86.0, 4: 90.0 }[fts] ?? 77.5;
    const dbKd    = { 1: 25,   2: 28,   3: 31,   4: 35   }[fts] ?? 25;
    if (moteEff > dbMote) pem += Math.floor((moteEff - dbMote) / 5) * 0.02;
    else if (moteEff < dbMote) pem *= (1.0 - ((dbMote - moteEff) * 0.004));
    const simpleKd = ((stats.kills ?? 0) + (stats.invasionKills ?? 0)) / Math.max(1, stats.deaths ?? 0);
    if (simpleKd > dbKd) pem += Math.floor((simpleKd - dbKd) / 8) * 0.01;

    return {
        basePps: +base.toFixed(1),
        pem: +pem.toFixed(3),
        finalScore: +(base * pem).toFixed(1),
        moteEff: +moteEff.toFixed(1),
        simpleKd: +simpleKd.toFixed(2),
        components: {
            PvE:     +pve.toFixed(1),
            PvP:     +pvp.toFixed(1),
            Banking: +obj.toFixed(1),
            Medals:  +med.toFixed(1),
        },
        dynamicMoteBenchmark: dbMote,
        dynamicKdBenchmark:   dbKd,
        fireteamSize: fts,
    };
}

// ── Medal key mapping — from desktop app MEDAL_PRIMARY_KEYS + MEDAL_ALIASES ───
// PGCR extended.values keys (lowercase, stripped underscores) → EGO canonical name
// Normalise: ext_key.toLowerCase().replace(/_/g, '')
const MEDAL_KEY_MAP = {
    // notOnMyWatch
    medalgambitsaviour:                 'notOnMyWatch',
    medalgambitnotonmywatch:            'notOnMyWatch',
    medalspvecompmedaldenied:           'notOnMyWatch',
    medalspvecompmedalinvasionshutdown: 'notOnMyWatch',
    medalsdenied:                       'notOnMyWatch',
    medaldenied:                        'notOnMyWatch',
    medalsspvecompmedalinvasionshutdown:'notOnMyWatch',
    medalspvecompmedaldeniedd:          'notOnMyWatch',
    // armyOfOne
    medalgambitinvaderkillfour:         'armyOfOne',
    medalspvecompmedalinvaderkillfour:  'armyOfOne',
    medalsinvaderkillfour:              'armyOfOne',
    medalinvaderkillfour:               'armyOfOne',
    medalspvecompmedalarmyofone:        'armyOfOne',
    medalsarrmyofone:                   'armyOfOne',
    // locksmith
    medalspvecompmedallocksmith:        'locksmith',
    medalslocksmith:                    'locksmith',
    medallocksmith:                     'locksmith',
    // blockbuster
    medalspvecompmedalblockbuster:      'blockbuster',
    medalspvecompmedalblockparty:       'blockbuster',
    medalsblockparty:                   'blockbuster',
    medalblockparty:                    'blockbuster',
    medalsblockbuster:                  'blockbuster',
    // rapidPayback
    medalspvecompmedalrapidpayback:     'rapidPayback',
    medalsrapidpayback:                 'rapidPayback',
    medalrapidpayback:                  'rapidPayback',
    // massacre
    medalspvecompmedalmassacre:         'massacre',
    medalsmassacre:                     'massacre',
    medalmassacre:                      'massacre',
    // motesHaveBeen
    medalgambitmotesdrained:            'motesHaveBeen',
    medalmotesdrained:                  'motesHaveBeen',
    medalsmotesdrained:                 'motesHaveBeen',
    medalspvecompmedaltagsdenied15:     'motesHaveBeen',
    medalstagsdanied15:                 'motesHaveBeen',
    // halfBanked
    medalspvecompmedalhalfbanked:       'halfBanked',
    medalshalfbanked:                   'halfBanked',
    medalhalfbanked:                    'halfBanked',
    // firstToBlock
    medalspvecompmedalfirsttoblock:     'firstToBlock',
    medalsfirsttoblock:                 'firstToBlock',
    medalfirsttoblock:                  'firstToBlock',
    // payback
    medalgambitpayback:                 'payback',
    medalpayback:                       'payback',
    medalspayback:                      'payback',
    medalspvecompmedalrevenge:          'payback',
    medalsrevenge:                      'payback',
    // overkillmonger
    medalgambitoverkillmonger:          'overkillmonger',
    medaloverkillmonger:                'overkillmonger',
    medalsoverkillmonger:               'overkillmonger',
    medalspvecompmedaloverkillmonger:   'overkillmonger',
    // killmonger
    medalgambitkillmonger:              'killmonger',
    medalkillmonger:                    'killmonger',
    medalskillmonger:                   'killmonger',
    medalspvecompmedalkillmonger:       'killmonger',
    // thrillmonger
    medalgambitthrillmonger:            'thrillmonger',
    medalthrillmonger:                  'thrillmonger',
    medalsthrillmonger:                 'thrillmonger',
    medalspvecompmedalthrillmonger:     'thrillmonger',
    // fastFill
    medalspvecompmedalfastfill:         'fastFill',
    medalsfastfill:                     'fastFill',
    medalfastfill:                      'fastFill',
    // killAfterInvasion
    medalspvecompmedalkillafterinvasion:'killAfterInvasion',
    medalskillafterinvasion:            'killAfterInvasion',
    medalkillafterinvasion:             'killAfterInvasion',
    medalspvecompmedalkillafterinvasion2:'killAfterInvasion',
    // bigGameHunter
    medalgambithunter:                  'bigGameHunter',
    medalhunter:                        'bigGameHunter',
    medalshunter:                       'bigGameHunter',
    medalspvecompmedalbiggamehunter:    'bigGameHunter',
    medalsbiggamehunter:                'bigGameHunter',
    // lastGuardianStanding
    medalgambitlastmanstanding:         'lastGuardianStanding',
    medallastmanstanding:               'lastGuardianStanding',
    medalslastmanstanding:              'lastGuardianStanding',
    // noEscape
    medalspvecompmedalbankkill:         'noEscape',
    medalspvecompmedalnoescape:         'noEscape',
    medalsbankkill:                     'noEscape',
    medalnoescape:                      'noEscape',
};

// Human-readable labels (from desktop app + manifest DestinyHistoricalStatsDefinition)
const MEDAL_LABELS = {
    notOnMyWatch:        'Not On My Watch',
    armyOfOne:           'Army of One',
    locksmith:           'Locksmith',
    blockbuster:         'Blockbuster',
    rapidPayback:        'Rapid Payback',
    massacre:            'Massacre',
    motesHaveBeen:       'Motes Drained',
    halfBanked:          'Half Banked',
    firstToBlock:        'First to Block',
    payback:             'Payback',
    overkillmonger:      'Overkillmonger',
    killmonger:          'Killmonger',
    fastFill:            'Fast Fill',
    killAfterInvasion:   'Kill After Invasion',
    thrillmonger:        'Thrillmonger',
    bigGameHunter:       'Big Game Hunter',
    lastGuardianStanding:'Last Guardian Standing',
    noEscape:            'No Escape',
};

// Gambit extended stat keys (extended.values first, then values fallback)
const GAMBIT_STAT_KEYS = [
    'kills', 'deaths', 'assists',
    'motesPickedUp', 'motesDenied', 'motesDeposited', 'motesLost',
    'invasions', 'invasionKills', 'invasionsDefeated',
    'primevalDamage', 'primevalHealing',
    'superKills', 'grenadeKills', 'meleeKills',
    'smallBlooms', 'largeBlooms',
];

function sv(entry, key) {
    return entry?.extended?.values?.[key]?.basic?.value
        ?? entry?.values?.[key]?.basic?.value
        ?? null;
}

function buildPlayer(entry) {
    const player      = entry.player ?? {};
    const destinyInfo = player.destinyUserInfo ?? {};
    const bungieInfo  = player.bungieNetUserInfo ?? {};

    const hasGlobalName = !!(destinyInfo.bungieGlobalDisplayName &&
                             destinyInfo.bungieGlobalDisplayNameCode != null);
    const name = hasGlobalName
        ? destinyInfo.bungieGlobalDisplayName
        : (bungieInfo.displayName || destinyInfo.displayName || 'Unknown Guardian');
    const code = hasGlobalName
        ? String(destinyInfo.bungieGlobalDisplayNameCode).padStart(4, '0')
        : null;
    const icon = (destinyInfo.iconPath || bungieInfo.iconPath)
        ? BUNGIE_ROOT + (destinyInfo.iconPath || bungieInfo.iconPath)
        : null;

    const classType = player.classType ?? -1;
    const classMap  = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

    const k  = entry.values?.kills?.basic?.value  ?? 0;
    const d  = entry.values?.deaths?.basic?.value ?? 0;
    const a  = entry.values?.assists?.basic?.value ?? 0;
    const kd = d > 0 ? (k / d).toFixed(2) : String(k);

    const standing   = entry.values?.standing?.basic?.value  ?? -1;
    const score      = entry.values?.score?.basic?.value     ?? 0;
    const completed  = entry.values?.completed?.basic?.value === 1;
    const fireteamId = entry.values?.fireteamId?.basic?.value ?? 0;

    // Collect all Gambit stats from both extended.values and values
    const stats = { kills: k, deaths: d, assists: a };
    for (const key of GAMBIT_STAT_KEYS) {
        const val = sv(entry, key);
        if (val !== null && val !== undefined) stats[key] = val;
    }

    // Also try alternate key names Bungie has used across API versions
    if (!stats.invasionKills && sv(entry, 'invaderKills') !== null) {
        stats.invasionKills = sv(entry, 'invaderKills') ?? 0;
    }
    if (!stats.motesDeposited && sv(entry, 'motesBanked') !== null) {
        stats.motesDeposited = sv(entry, 'motesBanked') ?? 0;
    }

    // ── Extract medals from PGCR extended.values ──────────────────────────────
    // Bungie medal keys use various prefixes and mixed casing with underscores.
    // Normalise: lowercase + strip underscores, then match against our map.
    const medals = {};
    const rawMedals = {}; // store raw keys for icon lookup
    const extVals = entry.extended?.values ?? {};
    for (const [rawKey, valObj] of Object.entries(extVals)) {
        const count = valObj?.basic?.value ?? 0;
        if (count <= 0) continue;
        // Normalise: lowercase, strip underscores AND spaces
        const normKey = rawKey.toLowerCase().replace(/[_\s]/g, '');
        const canonical = MEDAL_KEY_MAP[normKey];
        if (canonical) {
            medals[canonical] = (medals[canonical] ?? 0) + count;
            if (!rawMedals[canonical]) rawMedals[canonical] = rawKey; // for icon lookup
        }
    }

    // ── Extract weapons from extended.weapons ─────────────────────────────────
    const rawWeapons = (entry.extended?.weapons ?? [])
        .map(w => ({
            hash:      w.referenceId,
            kills:     w.values?.uniqueWeaponKills?.basic?.value          ?? 0,
            precision: w.values?.uniqueWeaponPrecisionKills?.basic?.value ?? 0,
        }))
        .filter(w => w.kills > 0)
        .sort((a, b) => b.kills - a.kills);

    return {
        name, code, icon,
        membershipId:   destinyInfo.membershipId   ?? null,
        membershipType: destinyInfo.membershipType ?? null,
        classType,
        className: classMap[classType] ?? 'Unknown',
        k, d, a, kd, score, standing, completed, fireteamId,
        stats, medals, rawMedals,
        weapons: rawWeapons,
    };
}

export async function load({ params }) {
    const { instanceId } = params;

    // ── Fetch PGCR from stats.bungie.net ─────────────────────────────────────
    const pgcrData = await bungieGet(
        `/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`,
        PGCR_ROOT
    );
    if (pgcrData.ErrorCode !== 1 || !pgcrData.Response) {
        throw error(404, 'Match not found');
    }

    const pgcr    = pgcrData.Response;
    const entries = pgcr.entries ?? [];
    const activity = pgcr.activityDetails ?? {};

    // ── Build player objects from all PGCR entries ────────────────────────────
    const rawPlayers = entries.map(e => buildPlayer(e));

    // ── Use manifest service (bulk table) for activity + weapon defs ──────────
    // The manifest service downloads the full table once and caches for 24h.
    // This is orders of magnitude faster than individual /Manifest/{hash}/ calls.
    const uniqueWeapHashes = [
        ...new Set(rawPlayers.flatMap(p => p.weapons.slice(0, 5).map(w => w.hash)))
    ];

    const [activityDef, ...weapDefs] = await Promise.all([
        activity.referenceId ? getActivityDef(activity.referenceId) : Promise.resolve(null),
        ...uniqueWeapHashes.map(h => getItemDef(h)),
    ]);

    const weapDefMap = new Map(uniqueWeapHashes.map((h, i) => [h, weapDefs[i]]));

    // ── Enrich weapon data with name + icon from manifest ─────────────────────
    for (const p of rawPlayers) {
        p.weapons = p.weapons.slice(0, 5).map(w => {
            const def = weapDefMap.get(w.hash);
            return {
                ...w,
                name: def?.displayProperties?.name ?? `Item ${w.hash}`,
                icon: def?.displayProperties?.icon
                    ? BUNGIE_ROOT + def.displayProperties.icon : null,
                tier: def?.inventory?.tierType ?? 3,
            };
        });
    }

    // ── Detect fireteam sizes: group by fireteamId ───────────────────────────
    const ftGroups = {};
    for (const p of rawPlayers) {
        if (p.fireteamId > 0) ftGroups[p.fireteamId] = (ftGroups[p.fireteamId] ?? 0) + 1;
    }
    for (const p of rawPlayers) {
        p.stats.fireteamSize = ftGroups[p.fireteamId] ?? 1;
    }

    // ── Compute EGO scores ────────────────────────────────────────────────────
    for (const p of rawPlayers) {
        if (!p.completed) { p.ego = null; continue; }
        p.ego = calcEgo(p.stats);
    }

    // ── Group into teams ──────────────────────────────────────────────────────
    const teamGroups = {};
    for (let i = 0; i < entries.length; i++) {
        const teamVal = entries[i]?.values?.team?.basic?.value ?? 0;
        if (!teamGroups[teamVal]) teamGroups[teamVal] = [];
        teamGroups[teamVal].push(rawPlayers[i]);
    }

    function teamWon(players) { return players.some(p => p.standing === 0); }

    // ── Role detection within each team ──────────────────────────────────────
    function detectRoles(players) {
        const completed = players.filter(p => p.ego);
        if (completed.length < 2) return;
        const scores = completed.map(p => p.ego.finalScore);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const max = Math.max(...scores);
        for (const p of completed) {
            const s = p.ego.finalScore;
            p.role = s === max && s > avg * 1.4 ? 'carry'
                   : s < avg * 0.55             ? 'carried'
                                                 : 'solid';
        }
    }

    const teamKeys = Object.keys(teamGroups).sort((a, b) => Number(a) - Number(b));
    const teamA = teamGroups[teamKeys[0]] ?? [];
    const teamB = teamGroups[teamKeys[1]] ?? [];
    detectRoles(teamA);
    detectRoles(teamB);

    // ── Medal display: look up icon from DestinyHistoricalStatsDefinition ────
    // Use getAllMedals() which fetches the full historical stats table once.
    let allMedalsTable = {};
    try { allMedalsTable = await getAllMedals(); } catch { /* non-fatal */ }

    for (const p of [...teamA, ...teamB]) {
        p.medalList = Object.entries(p.medals)
            .filter(([, c]) => c > 0)
            .map(([key, count]) => {
                const label = MEDAL_LABELS[key] ?? key;
                // Find icon from HistoricalStatsDefinition using rawMedals key
                const rawKey = p.rawMedals[key];
                const historicalDef = rawKey ? allMedalsTable[rawKey] : null;
                const icon = historicalDef?.iconImage
                    ? BUNGIE_ROOT + historicalDef.iconImage : null;
                return { key, label, count, icon };
            })
            .sort((a, b) => b.count - a.count);
        // Clean up rawMedals (not needed on client)
        delete p.rawMedals;
    }

    // ── Build map info ────────────────────────────────────────────────────────
    const period    = pgcr.period ?? '';
    const duration  = entries[0]?.values?.activityDurationSeconds?.basic?.value ?? 0;
    // Strip "Gambit: " / "Gambit - " prefixes, fall back to "Gambit"
    let mapName = activityDef?.displayProperties?.name ?? 'Gambit';
    mapName = mapName.replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';
    const mapIcon   = activityDef?.displayProperties?.icon
                        ? BUNGIE_ROOT + activityDef.displayProperties.icon : null;
    const pgcrImage = activityDef?.pgcrImage
                        ? BUNGIE_ROOT + activityDef.pgcrImage : null;

    return {
        instanceId, period, duration,
        mapName, mapIcon, pgcrImage,
        teamA, teamB,
        teamAWon: teamWon(teamA),
        teamBWon: teamWon(teamB),
    };
}
