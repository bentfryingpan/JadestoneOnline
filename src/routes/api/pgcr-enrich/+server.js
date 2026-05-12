/**
 * /api/pgcr-enrich — Fetch PGCRs in bulk, compute full EGO stats (with medals +
 * fireteam size), detect hard-carry/carried, and upsert into player_matches.
 *
 * This is the desktop app's core "fetch + cache" pipeline brought to the web.
 * Called by the profile page after loading activity history, giving us the full
 * career dataset needed for playstyle, trophy wall, time analysis, etc.
 *
 * POST body: { membershipId, membershipType, bungieDisplayName, bungieDisplayCode, instanceIds: string[] }
 *
 * Returns: { stored: number, skipped: number, errors: number }
 *
 * Rate: processes up to 20 PGCRs per call (caller batches as needed).
 * PGCRs are immutable → already-stored instances are skipped.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { calcEgo, extractMedals as _extractMedals, detectRole } from '$lib/server/ego.js';
import { getItemDef, getActivityDef, getMapImage, getExoticIconBase64 } from '$lib/server/manifest.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const PGCR_ROOT   = 'https://stats.bungie.net';
const PGCR_TTL    = 86_400_000; // 24 h in-process

// Slot bucket hashes (from Python Jadestone)
const SLOT_BUCKETS = {
    1491708835: 'Kinetic',
    2465295065: 'Energy',
    95395402:   'Power'
};

async function fetchPgcr(instanceId) {
    const key = `pgcr:${instanceId}`;
    const cached = cacheGet(key);
    if (cached) return cached;
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
    return data;
}

function sv(entry, key) {
    return entry?.extended?.values?.[key]?.basic?.value
        ?? entry?.values?.[key]?.basic?.value
        ?? 0;
}

function extractMedals(entry) {
    return _extractMedals(entry.extended?.values ?? {});
}

async function processPgcr(pgcr, targetMembershipId) {
    const entries = pgcr.entries ?? [];

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
        const pName  = pInfo.bungieGlobalDisplayName ?? pInfo.displayName ?? 'Unknown';
        const pCode  = pInfo.bungieGlobalDisplayNameCode ?? null;
        const pClass = { 0: 'Titan', 1: 'Hunter', 2: 'Warlock' }[e.player?.classType ?? -1] ?? 'Unknown';
        const ftId   = e.values?.fireteamId?.basic?.value ?? 0;
        const ftSize = ftGroups[ftId] ?? 1;
        const tv     = e.values?.team?.basic?.value ?? 0;
        const team   = teamMap[tv] ?? 'Alpha';

        const kills        = sv(e, 'kills');
        const deaths       = sv(e, 'deaths');
        const assists      = sv(e, 'assists');
        const invasionKills = sv(e, 'invasionKills') || sv(e, 'invaderKills');
        const motesDeposited = sv(e, 'motesDeposited') || sv(e, 'motesBanked');
        const motesLost    = sv(e, 'motesLost');
        const motesDenied  = sv(e, 'motesDenied');
        const motesPickedUp = sv(e, 'motesPickedUp') || (motesDeposited + motesLost);
        const primevalDamage = sv(e, 'primevalDamage');
        const superKills   = sv(e, 'weaponKillsSuper') || sv(e, 'superKills');
        const grenadeKills = sv(e, 'weaponKillsGrenade') || sv(e, 'grenadeKills');
        const meleeKills   = sv(e, 'weaponKillsMelee') || sv(e, 'meleeKills');
        const mobKills     = Math.max(0, kills - invasionKills);
        const completed    = sv(e, 'completed') === 1;
        const standing     = sv(e, 'standing');
        const medals       = extractMedals(e);

        const rawWeapons = e.extended?.weapons ?? [];
        const topWeapons = [];
        let matchExotic = null;

        for (const w of rawWeapons) {
            const wHash = w.referenceId;
            const wDef  = await getItemDef(wHash);
            if (!wDef) continue;
            const wKills = w.values?.uniqueWeaponKills?.basic?.value ?? 0;
            if (wKills > 0) {
                const slot = SLOT_BUCKETS[wDef.inventory?.bucketTypeHash] ?? 'Unknown';
                topWeapons.push({
                    name: wDef.displayProperties?.name ?? 'Unknown',
                    hash: wHash,
                    icon: wDef.displayProperties?.icon ? BUNGIE_ROOT + wDef.displayProperties.icon : null,
                    slot,
                    kills: wKills
                });
                if (wDef.inventory?.tierType === 6 && !matchExotic) {
                    const iconB64 = await getExoticIconBase64(wHash);
                    matchExotic = { name: wDef.displayProperties.name, icon: iconB64, source: 'weapon' };
                }
            }
        }

        const stats = {
            kills, mobKills, deaths, assists, invasionKills,
            invasions: sv(e, 'invasions'),
            invasionsDefeated: sv(e, 'invasionsDefeated'),
            motesDeposited, motesDenied, motesPickedUp, motesLost,
            primevalDamage, superKills, grenadeKills, meleeKills,
            fireteamSize: ftSize,
            medals,
            top_weapons: topWeapons,
        };

        let ego = null;
        if (completed) {
            ego = calcEgo(stats);
        }

        const isTarget = pId === String(targetMembershipId);
        const rosterEntry = {
            id: pId, name: pName, code: pCode ? String(pCode).padStart(4,'0') : null,
            team, className: pClass, score: ego?.finalScore ?? 0,
            fireteam_size: ftSize, is_target: isTarget,
        };
        roster.push(rosterEntry);

        if (isTarget && completed) {
            targetEntry = {
                entry: e, stats, ego, standing, ftSize, matchExotic,
                outcome: standing === 0 ? 'Win' : 'Loss',
            };
        }
    }

    if (!targetEntry) return null;

    const { isCarry, isCarried } = detectRole(targetEntry.ego.finalScore, roster.filter(r => r.team === teamMap[targetEntry.standing === 0 ? sv(targetEntry.entry, 'team') : entries.find(e => e.values?.standing?.basic?.value !== 0)?.values?.team?.basic?.value] && r.score > 0).map(r => r.score));

    return {
        outcome: targetEntry.outcome,
        stats: targetEntry.stats,
        ego: targetEntry.ego,
        fireteamSize: targetEntry.ftSize,
        matchExotic: targetEntry.matchExotic,
        isHardCarry: isCarry,
        isCarried: isCarried,
        roster,
    };
}

export async function POST({ request }) {
    const body = await request.json();
    const { membershipId, membershipType, bungieDisplayName, bungieDisplayCode, instanceIds } = body;
    if (!membershipId || !Array.isArray(instanceIds) || instanceIds.length === 0) {
        return json({ error: 'Missing params' }, { status: 400 });
    }

    const batch = instanceIds.slice(0, 20);

    let existingIds = new Set();
    try {
        const { data } = await supabaseAdmin
            .from('player_matches')
            .select('pgcr_id')
            .eq('player_id', membershipId) // string
            .in('pgcr_id', batch);
        if (data) existingIds = new Set(data.map(r => r.pgcr_id));
    } catch { }

    const toFetch = batch.filter(id => !existingIds.has(id));
    let stored = 0, errors = 0;

    for (const instanceId of toFetch) {
        try {
            const pgcrData = await fetchPgcr(instanceId);
            if (!pgcrData || pgcrData.ErrorCode !== 1 || !pgcrData.Response) { errors++; continue; }

            const pgcr = pgcrData.Response;
            const result = await processPgcr(pgcr, membershipId);
            if (!result) { errors++; continue; }

            const refId = pgcr.activityDetails?.referenceId;
            const actDef = refId ? await getActivityDef(refId) : null;
            const mapName  = (actDef?.displayProperties?.name ?? 'Gambit').replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';
            const mapImage = await getMapImage(mapName);

            await supabaseAdmin.from('player_matches').upsert({
                pgcr_id:         instanceId,
                player_id:       membershipId,
                bungie_name:     bungieDisplayName ?? null,
                bungie_code:     bungieDisplayCode ? String(bungieDisplayCode) : null,
                membership_type: membershipType ? parseInt(membershipType) : null,
                map_name:        mapName,
                map_image:       mapImage,
                period:          pgcr.period,
                duration:        sv(pgcr.entries?.[0], 'activityDurationSeconds'),
                outcome:         result.outcome,
                ego_score:       result.ego.finalScore,
                ego_base:        result.ego.basePps,
                ego_pem:         result.ego.pem,
                mote_eff:        result.ego.moteEff,
                kd:              result.ego.simpleKd,
                inv_yield:       result.ego.invYield ?? null,
                fireteam_size:   result.fireteamSize,
                is_hard_carry:   result.isHardCarry,
                is_carried:      result.isCarried,
                stats:           result.stats,
                components:      result.ego.components,
                roster:          result.roster,
                exotic_json:     result.matchExotic,
                updated_at:      new Date().toISOString(),
            }, { onConflict: 'pgcr_id,player_id' });

            const { data: ngrRow } = await supabaseAdmin
                .from('player_ngr_cache')
                .select('ngr,games')
                .eq('player_id', membershipId)
                .single();
            const prevNgr   = ngrRow?.ngr   ?? 0;
            const prevGames = ngrRow?.games  ?? 0;
            const newGames  = prevGames + 1;
            const newNgr    = (prevNgr * prevGames + result.ego.finalScore) / newGames;
            await supabaseAdmin.from('player_ngr_cache').upsert({
                player_id:   membershipId,
                bungie_name: bungieDisplayName ?? null,
                bungie_code: bungieDisplayCode ? String(bungieDisplayCode) : null,
                ngr:         Math.round(newNgr * 10) / 10,
                games:       newGames,
                updated_at:  new Date().toISOString(),
            }, { onConflict: 'player_id' });

            stored++;
        } catch (e) {
            console.error(`PGCR enrich error ${instanceId}:`, e.message);
            errors++;
        }
    }

    return json({
        stored,
        skipped: existingIds.size,
        errors,
        total: batch.length,
        needsEnrichment: stored < batch.length
    });
}
