/**
 * /api/sync/wipe — Robust Wipe Utility to clear corrupted data.
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

export async function POST({ request }) {
    const { membershipId } = await request.json();
    if (!membershipId) return json({ error: 'Missing membershipId' }, { status: 400 });

    try {
        const idStr = String(membershipId);
        // Rounded IDs typically zero out the last 3-4 digits
        const prefix = idStr.substring(0, 15); 
        
        console.log(`[wipe] Clearing data for ID ${idStr} and prefix ${prefix}...`);

        // 1. Reset player stats in the 'players' table
        // We delete rounded variations too
        await supabaseAdmin
            .from('players')
            .delete()
            .or(`id.eq.${idStr},id.like.${prefix}%`);

        // 2. Wipe matches from the 'matches' table
        const { count, error } = await supabaseAdmin
            .from('matches')
            .delete({ count: 'exact' })
            .or(`player_id.eq.${idStr},player_id.like.${prefix}%`);

        if (error) throw error;

        return json({ 
            success: true, 
            message: `Cleared ${count ?? 0} matches and reset player profile.`,
            clearedCount: count 
        });
    } catch (e) {
        console.error('Wipe failed:', e.message);
        return json({ error: e.message }, { status: 500 });
    }
}
