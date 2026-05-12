/**
 * /api/sync/discovery — Full history crawler discovery phase.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

const BUNGIE_ROOT = 'https://www.bungie.net';

/**
 * Robust JSON parser that handles Bungie's BigInt membershipIds by quoting them
 * before standard JSON.parse() can corrupt them.
 */
async function bungieFetch(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!res.ok) return null;
    const text = await res.text();
    // Quote all numeric values that are likely BigInts (15+ digits)
    const fixedText = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixedText);
}

export async function POST({ request }) {
    const body = await request.json();
    const { membershipId, membershipType, characterIds } = body;

    if (!membershipId || !membershipType || !Array.isArray(characterIds)) {
        return json({ error: 'Missing parameters' }, { status: 400 });
    }

    const cacheKey = `discovery:${membershipId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return json(cached);

    const allInstanceIds = new Set();
    
    await Promise.all(characterIds.map(async (charId) => {
        let page = 0;
        let hasMore = true;
        
        while (hasMore && page < 40) {
            const data = await bungieFetch(
                `/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=250&page=${page}`
            );
            
            const activities = data?.Response?.activities ?? [];
            if (activities.length === 0) {
                hasMore = false;
            } else {
                for (const act of activities) {
                    const id = act.activityDetails?.instanceId;
                    if (id) allInstanceIds.add(id);
                }
                if (activities.length < 250) hasMore = false;
                page++;
            }
        }
    }));

    const totalDiscovered = allInstanceIds.size;
    if (totalDiscovered === 0) {
        return json({ total: 0, missing: [], message: 'No Gambit matches found.' });
    }

    const allIdsArray = Array.from(allInstanceIds);
    const missingIds = [];
    
    const chunkSize = 500;
    for (let i = 0; i < allIdsArray.length; i += chunkSize) {
        const chunk = allIdsArray.slice(i, i + chunkSize);
        const { data, error } = await supabaseAdmin
            .from('player_matches')
            .select('pgcr_id,stats')
            .eq('player_id', membershipId)
            .in('pgcr_id', chunk);

        if (!error && data) {
            const existingMap = new Map(data.map(r => [r.pgcr_id, r.stats]));
            for (const id of chunk) {
                const stats = existingMap.get(id);
                if (!stats) {
                    missingIds.push(id);
                } else {
                    const weapons = stats.top_weapons ?? [];
                    const isLegacy = weapons.length > 0 && weapons.some(w => !w.slot || w.slot === 'Unknown' || w.precision === undefined);
                    if (isLegacy) missingIds.push(id);
                }
            }
        } else {
            for (const id of chunk) missingIds.push(id);
        }
    }

    const result = {
        total: totalDiscovered,
        missing: missingIds,
        count: missingIds.length
    };

    cacheSet(cacheKey, result, 300_000);
    return json(result);
}
