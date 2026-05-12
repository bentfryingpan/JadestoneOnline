/**
 * /api/sync/wipe — Maintenance tool to clear corrupted match data.
 * Useful if IDs were previously rounded by JS precision loss.
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

export async function POST({ request }) {
    const { membershipId } = await request.json();
    if (!membershipId) return json({ error: 'Missing membershipId' }, { status: 400 });

    try {
        const idStr = String(membershipId);
        const prefix = idStr.substring(0, 13); // Even more aggressive prefix matching
        
        await supabaseAdmin
            .from('player_ngr_cache')
            .delete()
            .or(`player_id.eq.${idStr},player_id.like.${prefix}%`);

        const { count, error } = await supabaseAdmin
            .from('player_matches')
            .delete({ count: 'exact' })
            .or(`player_id.eq.${idStr},player_id.like.${prefix}%`);

        return json({ 
            success: true, 
            message: `Cleared ${count ?? 0} corrupted matches using prefix ${prefix}.`,
            clearedCount: count 
        });
    } catch (e) {
        return json({ error: e.message }, { status: 500 });
    }
}
