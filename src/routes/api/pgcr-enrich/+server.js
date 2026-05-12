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
import { calcEgo, extractMedals as _extractMedals } from '$lib/server/ego.js';
import { getItemDef, getActivityDef } from '$lib/server/manifest.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const PGCR_ROOT   = 'https://stats.bungie.net';
const PGCR_TTL    = 86_400_000; // 24 h in-process

// Medal extraction now handled by the canonical ego.js implementation

async function fetchPgcr(instanceId) {
    const key = `pgcr:${instanceId}`;
    const cached = cacheGet(key);
    if (cached) return cached;
    const res = await fetch(
        `${PGCR_ROOT}/Platform/Destiny2/Stats/PostGameCarnageReport/${instanceId}/`,
        { headers: { 'X-API-Key': BUNGIE_API_KEY } }
    );
    const data = await res.json();
    if (data.ErrorCode === 1 && data.Response) {
        cacheSet(key, data, PGCR_TTL);
    }
    return data;
}

function sv(entry, key) {
    return entry?.extended?.values?.[key]?.basic?.value
        ?? entry?.values?.[key]?.basic?.value
        ?? 0;
}

// Delegate to canonical ego.js extractMedals (imported as _extractMedals)
function extractMedals(entry) {
    return _extractMedals(entry.extended?.values ?? {});
}

function processPgcr(pgcr, targetMembershipId) {
    const entries = pgcr.entries ?? [];

    // Build fireteam size map
    const ftGroups = {};
    for (const e of entries) {
        const ftId = e.values?.fireteamId?.basic?.value ?? 0;
        if (ftId > 0) ftGroups[ftId] = (ftGroups[ftId] ?? 0) + 1;
    }

    // Map team values → Alpha/Bravo
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
        const motesDenied  = sv(e, 'motesDenied');
        const motesPickedUp = sv(e, 'motesPickedUp') || (motesDeposited + sv(e, 'motesLost'));
        const motesLost    = sv(e, 'motesLost');
        const primevalDamage = sv(e, 'primevalDamage');
        const superKills   = sv(e, 'weaponKillsSuper') || sv(e, 'superKills');
        const grenadeKills = sv(e, 'weaponKillsGrenade') || sv(e, 'grenadeKills');
        const meleeKills   = sv(e, 'weaponKillsMelee') || sv(e, 'meleeKills');
        const mobKills     = Math.max(0, kills - invasionKills);
        const completed    = sv(e, 'completed') === 1;
        const standing     = sv(e, 'standing');
        const medals       = extractMedals(e);

        // Top weapons (sort by kills desc, take top 5)
        const topWeapons = (e.extended?.weapons ?? [])
            .map(w => ({ hash: w.referenceId, kills: w.values?.uniqueWeaponKills?.basic?.value ?? 0 }))
            .filter(w => w.kills > 0)
            .sort((a, b) => b.kills - a.kills)
            .slice(0, 5);

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
                entry: e, stats, ego, standing, ftSize,
                outcome: standing === 0 ? 'Win' : 'Loss',
            };
        }
    }

    if (!targetEntry) return null; // player not in match or DNF

    // ── Hard carry / carried detection (exact desktop app thresholds) ──────
    const targetTeam = roster.find(r => r.is_target)?.team;
    const myTeam = roster.filter(r => r.team === targetTeam && r.score > 0);
    const myScore = targetEntry.ego.finalScore;
    const teamTotal = myTeam.reduce((s, p) => s + p.score, 0);
    const teamAvg = myTeam.length > 0 ? teamTotal / myTeam.length : 0;
    const sortedScores = [...myTeam].sort((a, b) => b.score - a.score);
    const topScore = sortedScores[0]?.score ?? 0;
    const secondScore = sortedScores[1]?.score ?? 0;

    const isHardCarry = myTeam.length > 1
        && myScore === topScore
        && myScore > teamTotal * 0.40
        && myScore >= secondScore + 30;
    const isCarried = myTeam.length > 1
        && myScore < teamAvg * 0.50
        && topScore >= myScore + 50;

    return {
        outcome: targetEntry.outcome,
        stats: targetEntry.stats,
        ego: targetEntry.ego,
        fireteamSize: targetEntry.ftSize,
        isHardCarry,
        isCarried,
        roster,
    };
}

export async function POST({ request }) {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { membershipId, membershipType, bungieDisplayName, bungieDisplayCode, instanceIds } = body;
    if (!membershipId || !Array.isArray(instanceIds) || instanceIds.length === 0) {
        return json({ error: 'Missing params' }, { status: 400 });
    }

    const batch = instanceIds.slice(0, 20); // cap at 20 per call

    // ── Check which are already stored ───────────────────────────────────────
    let existingIds = new Set();
    try {
        const { data } = await supabaseAdmin
            .from('player_matches')
            .select('pgcr_id')
            .eq('player_id', parseInt(membershipId))
            .in('pgcr_id', batch);
        if (data) existingIds = new Set(data.map(r => r.pgcr_id));
    } catch { /* table may not exist yet */ }

    const toFetch = batch.filter(id => !existingIds.has(id));
    let stored = 0, errors = 0;

    // ── Fetch + process each new PGCR ────────────────────────────────────────
    for (const instanceId of toFetch) {
        try {
            const pgcrData = await fetchPgcr(instanceId);
            if (pgcrData.ErrorCode !== 1 || !pgcrData.Response) { errors++; continue; }

            const pgcr = pgcrData.Response;
            const result = processPgcr(pgcr, membershipId);
            if (!result) { errors++; continue; }

            // Resolve map name + background image from activity def
            const refId = pgcr.activityDetails?.referenceId;
            let mapName  = 'Gambit';
            let mapImage = null;
            if (refId) {
                const actDef = await getActivityDef(refId);
                mapName  = (actDef?.displayProperties?.name ?? 'Gambit')
                    .replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';
                // pgcrImage is the large widescreen art used as background; fall back to icon
                mapImage = actDef?.pgcrImage
                    ? `${BUNGIE_ROOT}${actDef.pgcrImage}`
                    : (actDef?.displayProperties?.icon
                        ? `${BUNGIE_ROOT}${actDef.displayProperties.icon}`
                        : null);
            }

            // Resolve weapon names + icons
            for (const w of result.stats.top_weapons ?? []) {
                if (w.hash) {
                    const def = await getItemDef(w.hash);
                    w.name = def?.displayProperties?.name ?? `Item ${w.hash}`;
                    w.icon = def?.displayProperties?.icon
                        ? BUNGIE_ROOT + def.displayProperties.icon : null;
                }
            }

            const period   = pgcr.period ?? null;
            const duration = pgcr.entries?.[0]?.values?.activityDurationSeconds?.basic?.value ?? 0;

            await supabaseAdmin.from('player_matches').upsert({
                pgcr_id:         instanceId,
                player_id:       parseInt(membershipId),
                bungie_name:     bungieDisplayName ?? null,
                bungie_code:     bungieDisplayCode ? String(bungieDisplayCode) : null,
                membership_type: membershipType ? parseInt(membershipType) : null,
                map_name:        mapName,
                map_image:       mapImage,
                period:          period,
                duration:        duration,
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
                updated_at:      new Date().toISOString(),
            }, { onConflict: 'pgcr_id,player_id' });

            // ── Update NGR (running-mean EGO) for this player ─────────────────
            // Uses the same incremental formula as the desktop app:
            // new_ngr = (old_ngr * old_games + new_score) / (old_games + 1)
            try {
                const { data: ngrRow } = await supabaseAdmin
                    .from('player_ngr_cache')
                    .select('ngr,games')
                    .eq('player_id', parseInt(membershipId))
                    .single();
                const prevNgr   = ngrRow?.ngr   ?? 0;
                const prevGames = ngrRow?.games  ?? 0;
                const newGames  = prevGames + 1;
                const newNgr    = (prevNgr * prevGames + result.ego.finalScore) / newGames;
                await supabaseAdmin.from('player_ngr_cache').upsert({
                    player_id:   parseInt(membershipId),
                    bungie_name: bungieDisplayName ?? null,
                    bungie_code: bungieDisplayCode ? String(bungieDisplayCode) : null,
                    ngr:         Math.round(newNgr * 10) / 10,
                    games:       newGames,
                    updated_at:  new Date().toISOString(),
                }, { onConflict: 'player_id' });
            } catch { /* non-fatal: NGR table may not exist yet */ }

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
    });
}
