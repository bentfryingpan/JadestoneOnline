/**
 * /api/history — Full Gambit match history with per-match EGO scores.
 * 
 * Re-aligned with the live 'matches' table for flawless reconstruction.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
import { calcEgo } from '$lib/server/ego.js';
import { getActivityDef } from '$lib/server/manifest.js';
import { supabaseAdmin } from '$lib/supabase-server.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const HISTORY_TTL = 120_000;

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    const text = await res.text();
    const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixed);
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
    const pageCount  = Math.ceil(count / 250);
    const cacheCount = pageCount * 250;
    const cacheKey   = `history:v3:${membershipId}:${cacheCount}`;

    const cached = cacheGet(cacheKey);
    if (cached) return json({ ...cached, matches: cached.matches.slice(0, count) });

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
                if (acts.length < 250) break;
            }
            return all;
        })
    );

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

    merged.sort((a, b) => new Date(b.period ?? 0) - new Date(a.period ?? 0));

    const matches = await Promise.all(merged.map(async act => {
        const completed = n(act, 'completed');
        const standing  = n(act, 'standing');

        const kills             = n(act, 'kills');
        const deaths            = n(act, 'deaths');
        const assists           = n(act, 'assists');
        const motesDeposited    = n(act, 'motesDeposited');
        const motesDenied       = n(act, 'motesDenied');
        const motesLost         = n(act, 'motesLost');
        const primevalDamage    = n(act, 'primevalDamage');

        const refId  = act.activityDetails?.referenceId;
        const actDef = refId ? await getActivityDef(refId) : null;
        let mapName  = actDef?.displayProperties?.name ?? 'Gambit';
        mapName      = mapName.replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';

        const ego = completed ? calcEgo({
            kills, deaths, assists, motesDeposited, motesDenied, 
            motesLost, primevalDamage, fireteamSize: 1, medals: {}
        }) : null;

        return {
            instanceId: act.activityDetails?.instanceId ?? null,
            period: act.period ?? null,
            mapName,
            win:  completed === 1 && standing === 0,
            kd: deaths > 0 ? +(kills / deaths).toFixed(2) : kills,
            motesDeposited,
            primevalDamage,
            ego,
        };
    }));

    // ── Sync with Live 'matches' table ──────────────────────────────────────
    const instanceIds = matches.map(m => m.instanceId).filter(Boolean);
    if (instanceIds.length > 0) {
        try {
            const idStr = String(membershipId);
            const prefix = idStr.substring(0, 15);

            const { data: enriched } = await supabaseAdmin
                .from('matches')
                .select('id, ego_score, stats_json')
                .or(`player_id.eq.${idStr},and(player_id.gte.${prefix}0000,player_id.lte.${prefix}9999)`)
                .in('id', instanceIds);

            if (enriched?.length) {
                const byId = Object.fromEntries(enriched.map(r => [String(r.id), r]));
                for (const m of matches) {
                    const e = byId[m.instanceId];
                    if (e) {
                        m.isEnriched = true;
                        if (e.ego_score != null) m.ego = { ...m.ego, finalScore: e.ego_score };
                        if (e.stats_json) m.stats_json = e.stats_json;
                    }
                }
            }
        } catch { }
    }

    const result = { matches, totalAvailable: merged.length };
    if (matches.length > 0) cacheSet(cacheKey, result, HISTORY_TTL);

    return json({ ...result, matches: matches.slice(0, count) });
}
