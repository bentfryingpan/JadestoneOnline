/**
 * /api/pgcr-enrich — Optimized Bulk Enrichment (Flawless Engine)
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { calcEgo, extractMedals as _extractMedals, detectRole } from '$lib/server/ego.js';
import { getItemDef, getActivityDef, getMapImage, getExoticIconBase64 } from '$lib/server/manifest.js';
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
        if (data.ErrorCode === 1 && data.Response) {
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
                         (targetPrefix && pName.split('#')[0].toLowerCase() === targetPrefix && pCode === targetCodeStr);

        const stats = {
            kills: sv(e, 'kills'),
            deaths: sv(e, 'deaths'),
            assists: sv(e, 'assists'),
            invasionKills: sv(e, 'invasionKills') || sv(e, 'invaderKills'),
            invasions: sv(e, 'invasions'),
            invasionsDefeated: sv(e, 'invasionsDefeated'),
            motesDeposited: sv(e, 'motesDeposited') || sv(e, 'motesBanked'),
            motesDenied: sv(e, 'motesDenied'),
            motesLost: sv(e, 'motesLost'),
            primevalDamage: sv(e, 'primevalDamage'),
            superKills: sv(e, 'weaponKillsSuper') || sv(e, 'superKills'),
            fireteamSize: ftSize,
            medals: _extractMedals(e.extended?.values ?? {}),
        };

        const ego = sv(e, 'completed') === 1 ? calcEgo(stats) : null;

        roster.push({
            id: pId, name: pName, code: pCode, team, 
            className: { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }[e.player?.classType ?? -1] ?? 'Unknown',
            score: ego?.finalScore ?? 0, fireteam_size: ftSize, is_target: isTarget 
        });

        if (isTarget && sv(e, 'completed') === 1) {
            const rawWeapons = e.extended?.weapons ?? [];
            const topWeapons = [];
            let matchExotic = null;

            for (const w of rawWeapons) {
                const wDef = await getItemDef(w.referenceId);
                if (!wDef) continue;
                const wk = w.values?.uniqueWeaponKills?.basic?.value ?? 0;
                if (wk > 0) {
                    topWeapons.push({
                        name: wDef.displayProperties?.name,
                        hash: w.referenceId,
                        icon: wDef.displayProperties?.hasIcon ? BUNGIE_ROOT + wDef.displayProperties.icon : null,
                        slot: SLOT_BUCKETS[wDef.inventory?.bucketTypeHash] ?? 'Unknown',
                        kills: wk,
                        precision: w.values?.uniqueWeaponPrecisionKills?.basic?.value ?? 0
                    });
                    if (wDef.inventory?.tierType === 6 && !matchExotic) {
                        const iconB64 = await getExoticIconBase64(w.referenceId);
                        matchExotic = { name: wDef.displayProperties.name, icon: iconB64, source: 'weapon' };
                    }
                }
            }
            stats.top_weapons = topWeapons;
            targetEntryData = { stats, ego, matchExotic, outcome: sv(e, 'standing') === 0 ? 'Win' : 'Loss' };
        }
    }

    if (!targetEntryData) return null;

    const myTeamScores = roster.filter(r => r.team === roster.find(x => x.is_target)?.team && r.score > 0).map(r => r.score);
    const { isCarry, isCarried } = detectRole(targetEntryData.ego.finalScore, myTeamScores);

    return { ...targetEntryData, isHardCarry: isCarry, isCarried, roster };
}

export async function POST({ request }) {
    const body = await request.json();
    const { membershipId, membershipType, bungieDisplayName, bungieDisplayCode, instanceIds } = body;
    if (!membershipId || !instanceIds?.length) return json({ error: 'Missing params' }, { status: 400 });

    const results = await Promise.all(instanceIds.map(async (id) => {
        try {
            const pgcrRes = await fetchPgcr(id);
            if (!pgcrRes?.Response) return null;
            const enriched = await processPgcr(pgcrRes.Response, membershipId, bungieDisplayName, bungieDisplayCode);
            if (!enriched) return null;

            const refId = pgcrRes.Response.activityDetails?.referenceId;
            const actDef = await getActivityDef(refId);
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
                fireteam_size: enriched.stats.fireteamSize,
                stats_json: enriched.stats,
                played_at: pgcrRes.Response.period,
                created_at: new Date().toISOString(),
                roster: enriched.roster
            };
        } catch { return null; }
    }));

    const toUpsert = results.filter(Boolean);
    if (toUpsert.length === 0) return json({ stored: 0 });

    // 1. Ensure Player Record exists
    try {
        await supabaseAdmin.from('players').upsert({
            id: String(membershipId),
            bungie_name: bungieDisplayName,
            bungie_code: String(bungieDisplayCode).padStart(4, '0'),
            membership_type: parseInt(membershipType)
        }, { onConflict: 'id' });
    } catch { }

    // 2. Bulk Upsert Matches
    const { error } = await supabaseAdmin.from('matches').upsert(toUpsert, { onConflict: 'id,player_id' });
    if (error) return json({ error: error.message }, { status: 500 });

    // 3. Update player NGR/Stats
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
