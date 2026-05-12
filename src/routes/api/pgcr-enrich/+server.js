/**
 * /api/pgcr-enrich — Database-Aligned Enrichment (1:1 with Live Schema)
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { calcEgo, extractMedals as _extractMedals } from '$lib/server/ego.js';
import { getItemDef, getActivityDef } from '$lib/server/manifest.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

const PGCR_ROOT = 'https://stats.bungie.net';
const PGCR_TTL  = 86_400_000;

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

async function processPgcr(pgcr, targetId, targetName, targetCode) {
    const entries = pgcr.entries ?? [];
    const targetPrefix = targetName ? targetName.split('#')[0].toLowerCase() : null;
    const targetCodeStr = targetCode ? String(targetCode).padStart(4, '0') : null;

    const teamMap = {};
    let tIdx = 0;
    for (const e of entries) {
        const tv = e.values?.team?.basic?.value ?? 0;
        if (!(tv in teamMap)) teamMap[tv] = tIdx++ === 0 ? 'Alpha' : 'Bravo';
    }

    const roster = [];
    let targetData = null;

    for (const e of entries) {
        const pInfo = e.player?.destinyUserInfo ?? {};
        const pId = String(pInfo.membershipId ?? '');
        const pName = pInfo.bungieGlobalDisplayName ?? pInfo.displayName ?? 'Unknown';
        const pCode = pInfo.bungieGlobalDisplayNameCode ? String(pInfo.bungieGlobalDisplayNameCode).padStart(4, '0') : null;
        
        const isTarget = pId === String(targetId) || (targetPrefix && pName.split('#')[0].toLowerCase() === targetPrefix && pCode === targetCodeStr);

        const s = {
            kills: e.values?.kills?.basic?.value ?? 0,
            deaths: e.values?.deaths?.basic?.value ?? 0,
            assists: e.values?.assists?.basic?.value ?? 0,
            motesDeposited: e.extended?.values?.motesDeposited?.basic?.value ?? 0,
            invasionKills: e.extended?.values?.invasionKills?.basic?.value ?? 0,
            primevalDamage: e.extended?.values?.primevalDamage?.basic?.value ?? 0,
            medals: _extractMedals(e.extended?.values ?? {}),
        };

        const ego = e.values?.completed?.basic?.value === 1 ? calcEgo(s) : null;
        roster.push({ id: pId, name: pName, code: pCode, team: teamMap[e.values?.team?.basic?.value ?? 0], score: ego?.finalScore ?? 0, is_target: isTarget });

        if (isTarget && e.values?.completed?.basic?.value === 1) {
            const weapons = [];
            for (const w of e.extended?.weapons ?? []) {
                const def = await getItemDef(w.referenceId);
                if (def) {
                    weapons.push({
                        name: def.displayProperties.name,
                        hash: w.referenceId,
                        slot: SLOT_BUCKETS[def.inventory?.bucketTypeHash] ?? 'Unknown',
                        kills: w.values?.uniqueWeaponKills?.basic?.value ?? 0,
                        precision: w.values?.uniqueWeaponPrecisionKills?.basic?.value ?? 0
                    });
                }
            }
            targetData = { stats: { ...s, top_weapons: weapons }, ego, outcome: e.values?.standing?.basic?.value === 0 ? 'Win' : 'Loss' };
        }
    }

    if (!targetData) return null;
    return { ...targetData, roster };
}

export async function POST({ request }) {
    const { membershipId, membershipType, bungieDisplayName, bungieDisplayCode, instanceIds } = await request.json();
    if (!membershipId || !instanceIds?.length) return json({ error: 'Missing params' }, { status: 400 });

    const results = await Promise.all(instanceIds.map(async (id) => {
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
            fireteam_size: enriched.stats.fireteamSize ?? 1,
            stats_json: enriched.stats,
            played_at: pgcrRes.Response.period,
            created_at: new Date().toISOString()
        };
    }));

    const toUpsert = results.filter(Boolean);
    if (toUpsert.length === 0) return json({ stored: 0 });

    // Ensure player row exists before matches (FK constraint)
    try {
        await supabaseAdmin.from('players').upsert({
            id: String(membershipId),
            bungie_name: bungieDisplayName,
            bungie_code: bungieDisplayCode,
            membership_type: parseInt(membershipType)
        });
    } catch { }

    const { error } = await supabaseAdmin.from('matches').upsert(toUpsert, { onConflict: 'id,player_id' });
    if (error) return json({ error: error.message }, { status: 500 });

    // Update player NGR
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
