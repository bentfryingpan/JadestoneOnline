import { BUNGIE_API_KEY } from '$env/static/private';
import { error } from '@sveltejs/kit';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
import { calcEgo } from '$lib/server/ego.js';
import { getItemDef, getActivityDef, getAllMedals } from '$lib/server/manifest.js';
import { calculateEgoScore, extractMedals, detectRole } from '$lib/ego.js';

const PGCR_TTL = 86_400_000; // 24 h — PGCRs are immutable historical records

const BUNGIE_ROOT = 'https://www.bungie.net';
const PGCR_ROOT   = 'https://stats.bungie.net';

async function bungieGet(url, root = BUNGIE_ROOT) {
    const res = await fetch(root + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
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
    // Use extractMedals() from ego.js (shared reverse-lookup table)
    const extVals = entry.extended?.values ?? {};
    const medals = extractMedals(extVals);
    // Also keep raw key mapping for icon lookup from HistoricalStatsDefinition
    const rawMedals = {};
    for (const [rawKey, valObj] of Object.entries(extVals)) {
        const count = valObj?.basic?.value ?? 0;
        if (count <= 0) continue;
        const normKey  = rawKey.toLowerCase().replace(/[_\s]/g, '');
        const canonical = MEDAL_KEY_MAP[normKey];
        if (canonical && !rawMedals[canonical]) rawMedals[canonical] = rawKey;
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

export async function load({ params, setHeaders }) {
    const { instanceId } = params;

    // PGCRs never change — tell Vercel CDN to serve from cache for up to 1 hour,
    // with a 24-hour stale-while-revalidate window.
    setHeaders({ 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' });

    // ── Fetch PGCR (in-process cache: 24 h) ──────────────────────────────────
    // PGCRs are immutable historical records; cache aggressively.
    const pgcrKey    = `pgcr:${instanceId}`;
    let   pgcrCached = cacheGet(pgcrKey);
    let   pgcrData;

    if (pgcrCached) {
        pgcrData = pgcrCached;
    } else {
        pgcrData = await bungieGet(
            `/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`,
            PGCR_ROOT
        );
        if (pgcrData.ErrorCode === 1 && pgcrData.Response) {
            cacheSet(pgcrKey, pgcrData, PGCR_TTL);
        }
    }

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

    // ── Compute EGO scores using the real algorithm from ego.js ──────────────
    for (const p of rawPlayers) {
        if (!p.completed) { p.ego = null; continue; }
        const mobKills = Math.max(0, (p.stats.kills ?? 0) - (p.stats.invasionKills ?? 0));
        p.ego = calculateEgoScore({
            mobKills,
            invasionKills:  p.stats.invasionKills  ?? 0,
            motesDenied:    p.stats.motesDenied    ?? 0,
            motesDeposited: p.stats.motesDeposited ?? 0,
            motesPickedUp:  p.stats.motesPickedUp  ?? (p.stats.motesDeposited ?? 0),
            primevalDamage: p.stats.primevalDamage ?? 0,
            deaths:         p.stats.deaths         ?? 0,
            assists:        p.stats.assists        ?? 0,
            medals:         p.medals               ?? {},
            fireteam_size:  p.stats.fireteamSize   ?? 1,
        });
    }

    // ── Group into teams ──────────────────────────────────────────────────────
    const teamGroups = {};
    for (let i = 0; i < entries.length; i++) {
        const teamVal = entries[i]?.values?.team?.basic?.value ?? 0;
        if (!teamGroups[teamVal]) teamGroups[teamVal] = [];
        teamGroups[teamVal].push(rawPlayers[i]);
    }

    function teamWon(players) { return players.some(p => p.standing === 0); }

    // ── Role detection using Python algorithm (carry/carried logic) ───────────
    function detectRoles(players) {
        const completed = players.filter(p => p.ego);
        if (completed.length < 2) return;
        const allScores = completed.map(p => p.ego.finalScore);
        for (const p of completed) {
            const { isCarry, isCarried } = detectRole(p.ego.finalScore, allScores);
            p.role = isCarry ? 'carry' : isCarried ? 'carried' : 'solid';
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
