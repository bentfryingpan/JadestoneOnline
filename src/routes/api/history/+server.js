/**
 * /api/history — Full Gambit match history with per-match EGO scores.
 *
 * Does NOT fetch PGCRs.  All stats come from the activity-history endpoint's
 * extended.values, which carries every Gambit-specific field needed for EGO
 * (motes, invasions, primeval damage).  This scales to 10 000 matches without
 * 10 000 extra API calls.  Medals and fireteam size (which require PGCRs) are
 * omitted; fireteamSize defaults to 1.
 *
 * Params:
 *   membershipType, membershipId, charIds (comma-separated), count (1–10000)
 *
 * Cache: rounds count up to nearest 250-match page boundary, so count=100 and
 * count=200 share the same 250-entry cache key.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
import { calcEgo } from '$lib/server/ego.js';
import { getActivityDef } from '$lib/server/manifest.js';
import { supabaseAdmin } from '$lib/supabase-server.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const HISTORY_TTL = 120_000; // 2 min — recent matches change quickly

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

function n(entry, key) {
    return entry?.extended?.values?.[key]?.basic?.value
        ?? entry?.values?.[key]?.basic?.value
        ?? 0;
}

export async function GET({ url, setHeaders }) {
    setHeaders({ 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' });

    const membershipType = url.searchParams.get('membershipType');
    const membershipId   = url.searchParams.get('membershipId');
    const charIdsParam   = url.searchParams.get('charIds') ?? '';
    const count          = Math.min(parseInt(url.searchParams.get('count') ?? '100', 10), 10_000);

    if (!membershipType || !membershipId || !charIdsParam) {
        return json({ error: 'Missing params' }, { status: 400 });
    }

    const charIds = charIdsParam.split(',').map(s => s.trim()).filter(Boolean);

    // Round up to nearest 250-entry page boundary for cache efficiency
    const pageCount  = Math.ceil(count / 250);
    const cacheCount = pageCount * 250;
    const cacheKey   = `history:${membershipId}:${[...charIds].sort().join(',')}:${cacheCount}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
        // Slice to requested count (cached result may be larger)
        return json({ ...cached, matches: cached.matches.slice(0, count) });
    }

    // ── Fetch all characters in parallel ────────────────────────────────────
    const perCharData = await Promise.all(
        charIds.map(async charId => {
            const all = [];
            for (let page = 0; page < pageCount; page++) {
                const data = await bungieGet(
                    `/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=250&page=${page}`
                );
                if (data.ErrorCode !== 1) break;
                const acts = data.Response?.activities ?? [];
                all.push(...acts);
                if (acts.length < 250) break; // exhausted
            }
            return all;
        })
    );

    // ── Merge + deduplicate by instanceId ────────────────────────────────────
    const seen   = new Set();
    const merged = [];
    for (const activities of perCharData) {
        for (const act of activities) {
            const id = act.activityDetails?.instanceId;
            if (id && seen.has(id)) continue;
            if (id) seen.add(id);
            merged.push(act);
        }
    }

    // Sort newest-first
    merged.sort((a, b) => new Date(b.period ?? 0) - new Date(a.period ?? 0));

    // ── Warm activity-def table once (cached 24 h) ──────────────────────────
    const refIds = [...new Set(merged.map(a => a.activityDetails?.referenceId).filter(Boolean))];
    await Promise.all(refIds.map(id => getActivityDef(id)));

    // ── Build per-match objects ──────────────────────────────────────────────
    const matches = await Promise.all(merged.map(async act => {
        const completed = n(act, 'completed');
        const standing  = n(act, 'standing'); // 0 = win

        const kills             = n(act, 'kills');
        const deaths            = n(act, 'deaths');
        const assists           = n(act, 'assists');
        const motesDeposited    = n(act, 'motesDeposited');
        const motesDenied       = n(act, 'motesDenied');
        const motesPickedUp     = n(act, 'motesPickedUp');
        const motesLost         = n(act, 'motesLost');
        const invasions         = n(act, 'invasions');
        const invasionKills     = n(act, 'invasionKills');
        const invasionsDefeated = n(act, 'invasionsDefeated');
        const primevalDamage    = n(act, 'primevalDamage');
        const duration          = n(act, 'activityDurationSeconds');

        const refId  = act.activityDetails?.referenceId;
        const actDef = refId ? await getActivityDef(refId) : null;
        let mapName  = actDef?.displayProperties?.name ?? 'Gambit';
        mapName      = mapName.replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';

        const ego = completed ? calcEgo({
            kills, deaths, assists,
            motesDeposited, motesDenied, motesPickedUp, motesLost,
            invasions, invasionKills, invasionsDefeated, primevalDamage,
            fireteamSize: 1, // not available without PGCR
            medals: {},      // medals require PGCR — omitted for scale
        }) : null;

        return {
            instanceId:      act.activityDetails?.instanceId ?? null,
            period:          act.period ?? null,
            mapName,
            win:  completed === 1 && standing === 0,
            loss: completed === 1 && standing !== 0,
            dnf:  completed !== 1,
            k:  kills,
            d:  deaths,
            a:  assists,
            kd: deaths > 0 ? +(kills / deaths).toFixed(2) : kills,
            motesDeposited, motesDenied, motesPickedUp, motesLost,
            invasions, invasionKills, invasionsDefeated,
            primevalDamage, duration,
            ego,
        };
    }));

    // ── Merge Supabase enriched data (fireteam size, carry flags, accurate EGO) ─
    const instanceIds = matches.map(m => m.instanceId).filter(Boolean);
    if (instanceIds.length > 0) {
        try {
            const { data: enriched } = await supabaseAdmin
                .from('player_matches')
                .select('pgcr_id,fireteam_size,is_hard_carry,is_carried,ego_score,map_name,map_image')
                .eq('player_id', parseInt(membershipId))
                .in('pgcr_id', instanceIds);

            if (enriched?.length) {
                const byId = Object.fromEntries(enriched.map(r => [r.pgcr_id, r]));
                for (const m of matches) {
                    const e = byId[m.instanceId];
                    if (e) {
                        m.fireteam_size = e.fireteam_size ?? 1;
                        m.is_hard_carry = e.is_hard_carry ?? false;
                        m.is_carried    = e.is_carried    ?? false;
                        if (e.ego_score != null) {
                            m.ego = m.ego ? { ...m.ego, finalScore: e.ego_score } : { finalScore: e.ego_score };
                        }
                        if (e.map_name)  m.mapName  = e.map_name;
                        if (e.map_image) m.mapImage = e.map_image;
                    }
                }
            }
        } catch { /* table not yet created — harmless */ }
    }

    const result = {
        matches,
        totalAvailable: merged.length,
        fetched:        matches.length,
    };

    if (matches.length > 0) cacheSet(cacheKey, result, HISTORY_TTL);

    return json({ ...result, matches: matches.slice(0, count) });
}
