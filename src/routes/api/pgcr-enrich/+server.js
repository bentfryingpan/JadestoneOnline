/**
 * /api/pgcr-enrich — Optimized Bulk Enrichment (Robust Schema-Aligned)
 * 
 * Extracts deep stats (Grenades, Melee, Super, Blockers) for all players 
 * and stores them in 'stats_json' for 1:1 parity with desktop tools.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { calcEgo, extractMedals as _extractMedals, detectRole } from '$lib/server/ego.js';
import { getItemDef, getActivityDef } from '$lib/server/manifest.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const PGCR_ROOT   = 'https://stats.bungie.net';
const PGCR_TTL    = 86_400_000;

const SLOT_BUCKETS = {
    1491708835: 'Kinetic',
    2465295065: 'Energy',
    95395402:   'Power'
};

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

async function processPgcr(pgcr, targetId, targetName, targetCode) {
    const entries = pgcr.entries ?? [];
    if (!entries.length) return null;

    const targetPrefix = targetName ? targetName.split('#')[0].toLowerCase() : null;
    const targetCodeStr = targetCode ? String(targetCode).padStart(4, '0') : null;

    const ftGroups = {};
    for (const e of entries) {
        const ftId = e.values?.fireteamId?.basic?.value ?? 0;
        if (ftId > 0) ftGroups[ftId] = (ftGroups[ftId] ?? 0) + 1;
    }

    const teamMap = {};
    let tIdx = 0;
    for (const e of entries) {
        const tv = e.values?.team?.basic?.value ?? 0;
        if (!(tv in teamMap)) teamMap[tv] = tIdx++ === 0 ? 'Alpha' : 'Bravo';
    }

    const roster = [];
    let targetEntryData = null;

    for (const e of entries) {
        const pInfo = e.player?.destinyUserInfo ?? {};
        const pId = String(pInfo.membershipId ?? '');
        const pName = pInfo.bungieGlobalDisplayName ?? pInfo.displayName ?? 'Unknown';
        const pCode = pInfo.bungieGlobalDisplayNameCode ? String(pInfo.bungieGlobalDisplayNameCode).padStart(4, '0') : null;
        
        const ftSize = ftGroups[e.values?.fireteamId?.basic?.value ?? 0] ?? 1;
        const team = teamMap[e.values?.team?.basic?.value ?? 0] ?? 'Alpha';

        const isTarget = pId === String(targetId) || 
                         (pName.split('#')[0].toLowerCase() === targetPrefix && pCode === targetCodeStr);

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
            fireteamSize: ftSize,
            medals: _extractMedals(e.extended?.values ?? {}),
            raw_medals: e.extended?.values ?? {}
        };

        const ego = e.values?.completed?.basic?.value === 1 ? calcEgo(stats) : null;

        const playerWeapons = [];
        for (const w of e.extended?.weapons ?? []) {
            const def = await getItemDef(w.referenceId);
            if (def) {
                playerWeapons.push({
                    name: def.displayProperties.name,
                    hash: w.referenceId,
                    slot: SLOT_BUCKETS[def.inventory?.bucketTypeHash] ?? 'Unknown',
                    kills: sv(w, 'uniqueWeaponKills'),
                    precision: sv(w, 'uniqueWeaponPrecisionKills'),
                    icon: BUNGIE_ROOT + def.displayProperties.icon
                });
            }
        }

        const rosterItem = {
            id: pId, name: pName, code: pCode, team, 
            className: { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }[e.player?.classType ?? -1] ?? 'Unknown',
            score: ego?.finalScore ?? 0, fireteam_size: ftSize, is_target: isTarget,
            stats,
            weapons: playerWeapons
        };
        roster.push(rosterItem);

        if (isTarget && e.values?.completed?.basic?.value === 1) {
            targetEntryData = { 
                stats: { ...stats, top_weapons: playerWeapons }, 
                ego, 
                outcome: e.values?.standing?.basic?.value === 0 ? 'Win' : 'Loss' 
            };
        }
    }

    if (!targetEntryData) return null;

    const myTeamName = roster.find(r => r.is_target)?.team;
    const myTeamScores = roster.filter(r => r.team === myTeamName && r.score > 0).map(r => r.score);
    const { isCarry, isCarried } = detectRole(targetEntryData.ego.finalScore, myTeamScores);

    const stats_json = {
        ...targetEntryData.stats,
        ego_breakdown: targetEntryData.ego.components,
        is_hard_carry: isCarry,
        is_carried: isCarried,
        roster
    };

    return { ...targetEntryData, stats_json };
}

export async function POST({ request }) {
    const { membershipId, membershipType, bungieDisplayName, bungieDisplayCode, instanceIds } = await request.json();
    if (!membershipId || !instanceIds?.length) return json({ error: 'Missing params' }, { status: 400 });

    const results = await Promise.all(instanceIds.map(async (id) => {
        try {
            const pgcrRes = await fetchPgcr(id);
            if (!pgcrRes?.Response) return null;
            const enriched = await processPgcr(pgcrRes.Response, membershipId, bungieDisplayName, bungieDisplayCode);
            if (!enriched) return null;

            const actDef = await getActivityDef(pgcrRes.Response.activityDetails?.referenceId);
            const mapName = (actDef?.displayProperties?.name ?? 'Gambit').replace(/^Gambit[:\-]\s*/i, '').trim();

            return {
                id,
                player_id: String(membershipId),
                map_name: mapName,
                outcome: enriched.outcome,
                ego_score: enriched.ego.finalScore,
                base_score: enriched.ego.basePps,
                pem: enriched.ego.pem,
                kd: enriched.ego.simpleKd,
                mote_efficiency: enriched.ego.moteEff,
                fireteam_size: enriched.stats_json.fireteamSize,
                stats_json: enriched.stats_json,
                played_at: pgcrRes.Response.period,
                created_at: new Date().toISOString()
            };
        } catch (e) {
            console.error(`[enrich] Match ${id} failed:`, e.message);
            return null;
        }
    }));

    const toUpsert = results.filter(Boolean);
    if (toUpsert.length === 0) return json({ stored: 0 });

    try {
        await supabaseAdmin.from('players').upsert({
            id: String(membershipId),
            bungie_name: bungieDisplayName,
            bungie_code: String(bungieDisplayCode).padStart(4, '0'),
            membership_type: parseInt(membershipType),
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
    } catch { }

    const { error: mErr } = await supabaseAdmin.from('matches').upsert(toUpsert, { onConflict: 'id,player_id' });
    if (mErr) return json({ error: mErr.message }, { status: 500 });

    const { data: p } = await supabaseAdmin.from('players').select('ngr,games_played').eq('id', String(membershipId)).single();
    const newGames = (p?.games_played ?? 0) + toUpsert.length;
    const newNgr = ((p?.ngr ?? 0) * (p?.games_played ?? 0) + toUpsert.reduce((s, m) => s + m.ego_score, 0)) / newGames;

    await supabaseAdmin.from('players').upsert({
        id: String(membershipId),
        ngr: Math.round(newNgr * 10) / 10,
        ego_score_avg: Math.round(newNgr * 10) / 10,
        games_played: newGames,
        updated_at: new Date().toISOString()
    });

    return json({ stored: toUpsert.length });
}
