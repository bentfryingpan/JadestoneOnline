/**
 * /api/pgcr-enrich — Optimized Bulk Enrichment.
 * Fetches PGCRs, computes EGO stats, and performs bulk upserts.
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
    1498876634: 'Kinetic',
    2465295065: 'Energy',
    953998645:  'Power'
};

async function fetchPgcr(instanceId) {
    const key = `pgcr:${instanceId}`;
    const cached = cacheGet(key);
    if (cached) return cached;
    try {
        const res = await fetch(
            `${PGCR_ROOT}/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`,
            { headers: { 'X-API-Key': BUNGIE_API_KEY } }
        );
        if (!res.ok) return null;
        const data = await res.json();
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

async function processPgcr(pgcr, targetMembershipId, targetName, targetCode) {
    const entries = pgcr.entries ?? [];
    if (!entries.length) return null;

    const ftGroups = {};
    for (const e of entries) {
        const ftId = e.values?.fireteamId?.basic?.value ?? 0;
        if (ftId > 0) ftGroups[ftId] = (ftGroups[ftId] ?? 0) + 1;
    }

    const teamMap = {};
    let teamIdx = 0;
    for (const e of entries) {
        const tv = e.values?.team?.basic?.value ?? 0;
        if (!(tv in teamMap)) teamMap[tv] = teamIdx++ === 0 ? 'Alpha' : 'Bravo';
    }

    const roster = [];
    let targetEntry = null;

    for (const e of entries) {
        const pInfo  = e.player?.destinyUserInfo ?? {};
        const pId    = String(pInfo.membershipId ?? '');
        const ftId   = e.values?.fireteamId?.basic?.value ?? 0;
        const ftSize = ftGroups[ftId] ?? 1;
        const team   = teamMap[e.values?.team?.basic?.value ?? 0] ?? 'Alpha';

        // Robust matching: ID string match OR (Name + Code match)
        // This handles cases where membershipId in PGCR is returned as a number and corrupted by JS.
        const isTarget = pId === String(targetMembershipId) || 
                         (pInfo.bungieGlobalDisplayName === targetName && 
                          String(pInfo.bungieGlobalDisplayNameCode).padStart(4,'0') === String(targetCode).padStart(4,'0'));

        const stats = {
            kills: sv(e, 'kills'),
            mobKills: Math.max(0, sv(e, 'kills') - (sv(e, 'invasionKills') || sv(e, 'invaderKills'))),
            deaths: sv(e, 'deaths'),
            assists: sv(e, 'assists'),
            invasionKills: sv(e, 'invasionKills') || sv(e, 'invaderKills'),
            invasions: sv(e, 'invasions'),
            invasionsDefeated: sv(e, 'invasionsDefeated'),
            motesDeposited: sv(e, 'motesDeposited') || sv(e, 'motesBanked'),
            motesDenied: sv(e, 'motesDenied'),
            motesPickedUp: sv(e, 'motesPickedUp') || (sv(e, 'motesDeposited') + sv(e, 'motesLost')),
            motesLost: sv(e, 'motesLost'),
            primevalDamage: sv(e, 'primevalDamage'),
            superKills: sv(e, 'weaponKillsSuper') || sv(e, 'superKills'),
            grenadeKills: sv(e, 'weaponKillsGrenade') || sv(e, 'grenadeKills'),
            meleeKills: sv(e, 'weaponKillsMelee') || sv(e, 'meleeKills'),
            fireteamSize: ftSize,
            medals: _extractMedals(e.extended?.values ?? {}),
        };

        const ego = sv(e, 'completed') === 1 ? calcEgo(stats) : null;

        roster.push({
            id: pId, 
            name: pInfo.bungieGlobalDisplayName ?? pInfo.displayName ?? 'Unknown',
            code: pInfo.bungieGlobalDisplayNameCode ? String(pInfo.bungieGlobalDisplayNameCode).padStart(4,'0') : null,
            team, 
            className: { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }[e.player?.classType ?? -1] ?? 'Unknown',
            score: ego?.finalScore ?? 0,
            fireteam_size: ftSize, 
            is_target: isTarget,
        });

        if (isTarget && sv(e, 'completed') === 1) {
            // Weapon lookups (async)
            const rawWeapons = e.extended?.weapons ?? [];
            const topWeapons = [];
            let matchExotic = null;

            for (const w of rawWeapons) {
                const wDef = await getItemDef(w.referenceId);
                if (!wDef) continue;
                const wk = w.values?.uniqueWeaponKills?.basic?.value ?? 0;
                const wp = w.values?.uniqueWeaponPrecisionKills?.basic?.value ?? 0;
                
                if (wk > 0) {
                    topWeapons.push({
                        name: wDef.displayProperties?.name,
                        hash: w.referenceId,
                        icon: wDef.displayProperties?.hasIcon ? BUNGIE_ROOT + wDef.displayProperties.icon : null,
                        slot: SLOT_BUCKETS[wDef.inventory?.bucketTypeHash] ?? 'Unknown',
                        kills: wk,
                        precision: wp
                    });
                    if (wDef.inventory?.tierType === 6 && !matchExotic) {
                        const iconB64 = await getExoticIconBase64(w.referenceId);
                        matchExotic = { name: wDef.displayProperties.name, icon: iconB64, source: 'weapon' };
                    }
                }
            }
            stats.top_weapons = topWeapons;

            targetEntry = { stats, ego, matchExotic, outcome: sv(e, 'standing') === 0 ? 'Win' : 'Loss' };
        }
    }

    if (!targetEntry) return null;

    const myTeamScores = roster.filter(r => r.team === roster.find(x => x.is_target)?.team && r.score > 0).map(r => r.score);
    const { isCarry, isCarried } = detectRole(targetEntry.ego.finalScore, myTeamScores);

    return { ...targetEntry, isHardCarry: isCarry, isCarried, roster };
}

export async function POST({ request }) {
    const body = await request.json();
    const { membershipId, membershipType, bungieDisplayName, bungieDisplayCode, instanceIds } = body;
    if (!membershipId || !Array.isArray(instanceIds) || instanceIds.length === 0) {
        return json({ error: 'Missing params' }, { status: 400 });
    }

    const batch = instanceIds.slice(0, 40);
    
    // ── Optimized Parallel Processing ────────────────────────────────────────
    const results = await Promise.all(batch.map(async (id) => {
        try {
            const pgcrData = await fetchPgcr(id);
            if (!pgcrData?.Response) return null;

            const pgcr = pgcrData.Response;
            const enriched = await processPgcr(pgcr, membershipId, bungieDisplayName, bungieDisplayCode);
            if (!enriched) return null;

            const refId = pgcr.activityDetails?.referenceId;
            const actDef = refId ? await getActivityDef(refId) : null;
            const mapName = (actDef?.displayProperties?.name ?? 'Gambit').replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';

            return {
                pgcr_id: id,
                player_id: membershipId,
                bungie_name: bungieDisplayName ?? null,
                bungie_code: bungieDisplayCode ? String(bungieDisplayCode) : null,
                membership_type: parseInt(membershipType),
                map_name: mapName,
                map_image: await getMapImage(mapName),
                period: pgcr.period,
                duration: sv(pgcr.entries?.[0], 'activityDurationSeconds'),
                outcome: enriched.outcome,
                ego_score: enriched.ego.finalScore,
                ego_base: enriched.ego.basePps,
                ego_pem: enriched.ego.pem,
                mote_eff: enriched.ego.moteEff,
                kd: enriched.ego.simpleKd,
                inv_yield: enriched.ego.invYield,
                fireteam_size: enriched.stats.fireteamSize,
                is_hard_carry: enriched.isHardCarry,
                is_carried: enriched.isCarried,
                stats: enriched.stats,
                components: enriched.ego.components,
                roster: enriched.roster,
                exotic_json: enriched.matchExotic,
                updated_at: new Date().toISOString()
            };
        } catch { return null; }
    }));

    const toUpsert = results.filter(Boolean);
    if (toUpsert.length === 0) return json({ stored: 0, total: batch.length });

    // ── Bulk Upsert ──────────────────────────────────────────────────────────
    const { error: matchErr } = await supabaseAdmin
        .from('player_matches')
        .upsert(toUpsert, { onConflict: 'pgcr_id,player_id' });

    if (matchErr) return json({ error: matchErr.message }, { status: 500 });

    // ── Optimized NGR Calculation ────────────────────────────────────────────
    const { data: ngrRow } = await supabaseAdmin
        .from('player_ngr_cache')
        .select('ngr,games')
        .eq('player_id', membershipId)
        .single();
    
    let totalScore = (ngrRow?.ngr ?? 0) * (ngrRow?.games ?? 0);
    let totalGames = (ngrRow?.games ?? 0);

    for (const match of toUpsert) {
        totalScore += match.ego_score;
        totalGames += 1;
    }

    await supabaseAdmin.from('player_ngr_cache').upsert({
        player_id: membershipId,
        bungie_name: bungieDisplayName,
        bungie_code: bungieDisplayCode ? String(bungieDisplayCode) : null,
        ngr: Math.round((totalScore / totalGames) * 10) / 10,
        games: totalGames,
        updated_at: new Date().toISOString()
    }, { onConflict: 'player_id' });

    return json({ stored: toUpsert.length, total: batch.length });
}
