/**
 * /api/sync/wipe — Database-Aligned Wipe Utility
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

export async function POST({ request }) {
    const { membershipId } = await request.json();
    if (!membershipId) return json({ error: 'Missing membershipId' }, { status: 400 });

    try {
        const idStr = String(membershipId);
        const prefix = idStr.substring(0, 13);
        
        // 1. Reset player stats in the 'players' table
        await supabaseAdmin
            .from('players')
            .update({ ngr: 0, ego_score_avg: 0, games_played: 0 })
            .or(`id.eq.${idStr},id.like.${prefix}%`);

        // 2. Wipe matches from the 'matches' table
        const { count, error } = await supabaseAdmin
            .from('matches')
            .delete({ count: 'exact' })
            .or(`player_id.eq.${idStr},player_id.like.${prefix}%`);

        if (error) throw error;

        return json({ 
            success: true, 
            message: `Cleared ${count ?? 0} matches from 'matches' table using prefix ${prefix}.`,
            clearedCount: count 
        });
    } catch (e) {
        console.error('Wipe failed:', e.message);
        return json({ error: e.message }, { status: 500 });
    }
}
