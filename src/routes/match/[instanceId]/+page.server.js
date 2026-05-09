import { BUNGIE_API_KEY } from '$env/static/private';
import { error } from '@sveltejs/kit';

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

// Gambit-specific extended stat keys from the PGCR
const GAMBIT_STATS = [
    { key: 'kills',                  label: 'Kills',           short: 'K'   },
    { key: 'deaths',                 label: 'Deaths',          short: 'D'   },
    { key: 'assists',                label: 'Assists',         short: 'A'   },
    { key: 'motesPickedUp',          label: 'Motes Picked',   short: 'MO'  },
    { key: 'motesDenied',            label: 'Motes Denied',   short: 'MD'  },
    { key: 'motesDeposited',         label: 'Motes Banked',   short: 'MB'  },
    { key: 'motesLost',              label: 'Motes Lost',      short: 'ML'  },
    { key: 'invasions',              label: 'Invasions',       short: 'INV' },
    { key: 'invasionKills',          label: 'Inv. Kills',      short: 'IK'  },
    { key: 'invasionsDefeated',      label: 'Invaders Killed', short: 'IKD' },
    { key: 'primevalDamage',         label: 'Primeval DMG',    short: 'PVD' },
    { key: 'primevalHealing',        label: 'Primeval Heal',   short: 'PVH' },
    { key: 'smallBlooms',            label: 'Small Blooms',    short: 'SB'  },
    { key: 'largeBlooms',            label: 'Large Blooms',    short: 'LB'  },
    { key: 'rechargeableAbilityKills', label: 'Ability Kills', short: 'AK' },
    { key: 'superKills',             label: 'Super Kills',     short: 'SK'  },
    { key: 'grenadeKills',           label: 'Grenade Kills',   short: 'GK'  },
    { key: 'meleeKills',             label: 'Melee Kills',     short: 'MK'  },
];

function sv(entry, key) {
    return entry?.extended?.values?.[key]?.basic?.value
        ?? entry?.values?.[key]?.basic?.value
        ?? null;
}

function sdv(entry, key) {
    return entry?.extended?.values?.[key]?.basic?.displayValue
        ?? entry?.values?.[key]?.basic?.displayValue
        ?? null;
}

function buildPlayer(entry) {
    const player     = entry.player ?? {};
    const destinyInfo= player.destinyUserInfo ?? {};
    const bungieInfo = player.bungieNetUserInfo ?? {};

    const name  = destinyInfo.bungieGlobalDisplayName  || bungieInfo.displayName || 'Unknown';
    const code  = String(destinyInfo.bungieGlobalDisplayNameCode ?? '').padStart(4, '0');
    const icon  = destinyInfo.iconPath ? BUNGIE_ROOT + destinyInfo.iconPath : null;
    const emblem= entry.player?.emblemHash ?? null;

    const classType = player.classType ?? -1;
    const classMap  = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' };

    const k  = sv(entry, 'kills')  ?? 0;
    const d  = sv(entry, 'deaths') ?? 0;
    const a  = sv(entry, 'assists') ?? 0;
    const kd = d > 0 ? (k / d).toFixed(2) : String(k);

    const standing = entry.values?.standing?.basic?.value ?? -1; // 0 = win, 1 = loss
    const score    = entry.values?.score?.basic?.value    ?? 0;
    const completed= entry.values?.completed?.basic?.value === 1;

    const stats = {};
    for (const { key } of GAMBIT_STATS) {
        const val = sv(entry, key);
        if (val !== null) stats[key] = val;
    }
    // Fallbacks for top-level values
    if (stats.kills   === undefined) stats.kills   = k;
    if (stats.deaths  === undefined) stats.deaths  = d;
    if (stats.assists === undefined) stats.assists  = a;

    return {
        name, code, icon, emblem,
        membershipId: destinyInfo.membershipId ?? null,
        membershipType: destinyInfo.membershipType ?? null,
        classType,
        className: classMap[classType] ?? 'Unknown',
        k, d, a, kd, score,
        standing,
        completed,
        stats,
    };
}

export async function load({ params }) {
    const { instanceId } = params;

    const pgcrData = await bungieGet(`/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`);

    if (pgcrData.ErrorCode !== 1 || !pgcrData.Response) {
        throw error(404, 'Match not found');
    }

    const pgcr     = pgcrData.Response;
    const entries  = pgcr.entries ?? [];
    const activity = pgcr.activityDetails ?? {};

    // Resolve activity definition for map/mode info
    let activityDef = null;
    if (activity.referenceId) {
        const defData = await bungieGet(
            `/Platform/Destiny2/Manifest/DestinyActivityDefinition/${activity.referenceId}/`
        );
        activityDef = defData.Response ?? null;
    }

    const period   = pgcr.period;
    const duration = entries[0]?.values?.activityDurationSeconds?.basic?.value ?? 0;

    // Group entries by team — Gambit is always 2 teams (0 and 1) of 4
    const teams = { 0: [], 1: [] };
    for (const entry of entries) {
        const team = entry.values?.team?.basic?.value ?? 0;
        const tid  = team > 1 ? 0 : team; // guard against odd values
        teams[tid].push(buildPlayer(entry));
    }

    // Determine team win/loss — any player on a team with standing 0 won
    function teamWon(players) {
        return players.some(p => p.standing === 0);
    }

    const teamA = teams[0] ?? [];
    const teamB = teams[1] ?? [];

    // Map/mode info
    const mapName    = activityDef?.displayProperties?.name    ?? 'Unknown Map';
    const mapIcon    = activityDef?.displayProperties?.icon
                         ? BUNGIE_ROOT + activityDef.displayProperties.icon
                         : null;
    const pgcrImage  = activityDef?.pgcrImage
                         ? BUNGIE_ROOT + activityDef.pgcrImage
                         : null;

    return {
        instanceId,
        period,
        duration,
        mapName,
        mapIcon,
        pgcrImage,
        teamA,
        teamB,
        teamAWon: teamWon(teamA),
        teamBWon: teamWon(teamB),
        statMeta: GAMBIT_STATS,
    };
}
