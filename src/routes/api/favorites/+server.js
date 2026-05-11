/**
 * /api/favorites — toggle a match as a favorite for a player.
 *
 * GET  ?membershipId=X              → returns array of favorited pgcr_ids
 * POST { membershipId, pgcrId }     → toggles (adds if missing, removes if present)
 *                                    returns { favorited: boolean }
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

export async function GET({ url }) {
    const membershipId = url.searchParams.get('membershipId');
    if (!membershipId) return json({ error: 'Missing membershipId' }, { status: 400 });

    try {
        const { data, error } = await supabaseAdmin
            .from('player_favorites')
            .select('pgcr_id')
            .eq('player_id', parseInt(membershipId))
            .order('created_at', { ascending: false });

        if (error) throw error;
        return json({ favorites: (data ?? []).map(r => r.pgcr_id) });
    } catch (e) {
        return json({ favorites: [], error: e.message });
    }
}

export async function POST({ request }) {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { membershipId, pgcrId } = body;
    if (!membershipId || !pgcrId) return json({ error: 'Missing params' }, { status: 400 });

    const playerId = parseInt(membershipId);

    try {
        // Check if it's already a favorite
        const { data: existing } = await supabaseAdmin
            .from('player_favorites')
            .select('pgcr_id')
            .eq('player_id', playerId)
            .eq('pgcr_id', pgcrId)
            .maybeSingle();

        if (existing) {
            // Remove
            await supabaseAdmin
                .from('player_favorites')
                .delete()
                .eq('player_id', playerId)
                .eq('pgcr_id', pgcrId);
            return json({ favorited: false });
        } else {
            // Add
            await supabaseAdmin
                .from('player_favorites')
                .insert({ player_id: playerId, pgcr_id: pgcrId });
            return json({ favorited: true });
        }
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}
