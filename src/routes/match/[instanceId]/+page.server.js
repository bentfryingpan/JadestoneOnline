import { BUNGIE_API_KEY } from '$env/static/private';
import { error } from '@sveltejs/kit';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
import { getItemDef, getActivityDef, getAllMedals } from '$lib/server/manifest.js';
import { calcEgo } from '$lib/server/ego.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const PGCR_ROOT   = 'https://stats.bungie.net';
const PGCR_TTL    = 300_000;

async function fetchPgcr(id) {
    const key = `pgcr:${id}`;
    const cached = cacheGet(key);
    if (cached) return cached;
    try {
        const res = await fetch(`${PGCR_ROOT}/Platform/Destiny2/Stats/PostGameCarnageReport/${id}/`, {
            headers: { 'X-API-Key': BUNGIE_API_KEY }
        });
        const text = await res.text();
        const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
        const data = JSON.parse(fixed);
        if (data.ErrorCode === 1) {
            cacheSet(key, data, PGCR_TTL);
            return data;
        }
    } catch { }
    return null;
}

function sv(entry, key) {
    return entry?.extended?.values?.[key]?.basic?.value
        ?? entry?.values?.[key]?.basic?.value
        ?? 0;
}

export async function load({ params }) {
    const { instanceId } = params;
    const pgcrData = await fetchPgcr(instanceId);
    if (!pgcrData?.Response) throw error(404, 'Post-game report not found');

    const pgcr = pgcrData.Response;
    const refId = pgcr.activityDetails?.referenceId;
    const actDef = await getActivityDef(refId);
    const mapName = (actDef?.displayProperties?.name ?? 'Gambit').replace(/^Gambit[:\-]\s*/i, '').trim();

    const medalDefs = await getAllMedals();

    const teams = { Alpha: [], Bravo: [] };
    const teamValues = [...new Set(pgcr.entries.map(e => e.values?.team?.basic?.value ?? 0))];
    const teamMap = { [teamValues[0]]: 'Alpha', [teamValues[1]]: 'Bravo' };

    for (const e of pgcr.entries) {
        const pInfo = e.player?.destinyUserInfo ?? {};
        const team = teamMap[e.values?.team?.basic?.value ?? 0] || 'Alpha';

        const stats = {
            assists: sv(e, 'assists'),
            deaths: sv(e, 'deaths'),
            kills: sv(e, 'kills'),
            opponentsDefeated: sv(e, 'opponentsDefeated'),
            efficiency: sv(e, 'efficiency'),
            killsDeathsRatio: sv(e, 'killsDeathsRatio'),
            killsDeathsAssists: sv(e, 'killsDeathsAssists'),
            score: sv(e, 'score'),
            precisionKills: sv(e, 'precisionKills'),
            weaponKillsGrenade: sv(e, 'weaponKillsGrenade'),
            weaponKillsMelee: sv(e, 'weaponKillsMelee'),
            weaponKillsSuper: sv(e, 'weaponKillsSuper'),
            weaponKillsAbility: sv(e, 'weaponKillsAbility'),
            invasions: sv(e, 'invasions'),
            invasionKills: sv(e, 'invasionKills') || sv(e, 'invaderKills'),
            invasionDeaths: sv(e, 'invasionDeaths'),
            invaderKills: sv(e, 'invaderKills'),
            invaderDeaths: sv(e, 'invaderDeaths'),
            primevalKills: sv(e, 'primevalKills'),
            blockerKills: sv(e, 'blockerKills'),
            mobKills: sv(e, 'mobKills'),
            highValueKills: sv(e, 'highValueKills'),
            motesPickedUp: sv(e, 'motesPickedUp'),
            motesDeposited: sv(e, 'motesDeposited') || sv(e, 'motesBanked'),
            motesDenied: sv(e, 'motesDenied'),
            motesLost: sv(e, 'motesLost'),
            bankOverage: sv(e, 'bankOverage'),
            smallBlockersSent: sv(e, 'smallBlockersSent'),
            mediumBlockersSent: sv(e, 'mediumBlockersSent'),
            largeBlockersSent: sv(e, 'largeBlockersSent'),
            primevalDamage: sv(e, 'primevalDamage'),
            primevalHealing: sv(e, 'primevalHealing'),
        };

        const ego = e.values?.completed?.basic?.value === 1 ? calcEgo(stats) : { finalScore: 0 };
        
        // Robust Medal Resolution
        const medalList = [];
        for (const [key, val] of Object.entries(e.extended?.values ?? {})) {
            // Check for stats starting with 'medal'
            if (key.toLowerCase().startsWith('medal')) {
                const count = typeof val === 'object' ? val.basic?.value : val;
                if (count > 0) {
                    const def = medalDefs[key];
                    medalList.push({
                        key, count,
                        label: def?.statName || key.replace('medal', ''),
                        icon: def?.iconImage ? BUNGIE_ROOT + def.iconImage : null
                    });
                }
            }
        }

        const weapons = [];
        for (const w of e.extended?.weapons ?? []) {
            const def = await getItemDef(w.referenceId);
            if (def) {
                weapons.push({
                    name: def.displayProperties.name,
                    hash: w.referenceId,
                    kills: sv(w, 'uniqueWeaponKills'),
                    icon: BUNGIE_ROOT + def.displayProperties.icon
                });
            }
        }

        teams[team].push({
            name: pInfo.bungieGlobalDisplayName || pInfo.displayName,
            code: pInfo.bungieGlobalDisplayNameCode,
            membershipId: String(pInfo.membershipId),
            className: { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }[e.player?.classType] ?? 'Guardian',
            icon: BUNGIE_ROOT + e.player?.destinyUserInfo?.iconPath,
            k: stats.kills, d: stats.deaths, a: stats.assists,
            kd: stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills,
            score: ego.finalScore,
            stats,
            medalList,
            weapons
        });
    }

    return {
        instanceId,
        period: pgcr.period,
        duration: sv(pgcr.entries[0], 'activityDurationSeconds'),
        mapName,
        pgcrImage: actDef?.pgcrImage ? BUNGIE_ROOT + actDef.pgcrImage : null,
        teamA: teams.Alpha,
        teamB: teams.Bravo,
        teamAWon: pgcr.entries.some(e => teamMap[e.values?.team?.basic?.value] === 'Alpha' && e.values?.standing?.basic?.value === 0),
        teamBWon: pgcr.entries.some(e => teamMap[e.values?.team?.basic?.value] === 'Bravo' && e.values?.standing?.basic?.value === 0),
    };
}
