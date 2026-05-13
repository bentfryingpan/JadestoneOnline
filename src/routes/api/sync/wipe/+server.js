/**
 * /api/sync/wipe — Robust BigInt-Aware Wipe Utility
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

export async function POST({ request }) {
	const { membershipId } = await request.json();
	if (!membershipId) return json({ error: 'Missing membershipId' }, { status: 400 });

	try {
		const idStr = String(membershipId);
		// Robust Range: Catch all variations of the ID (rounded or exact)
		// BigInt IDs are 19 digits. First 15 are stable.
		const prefix = idStr.substring(0, 15);
		const minId = prefix + '0000';
		const maxId = prefix + '9999';

		console.log(`[wipe] Aggressive clear for range ${minId} to ${maxId}...`);

		// 1. Wipe from 'players' (removes both correct and rounded entries)
		await supabaseAdmin.from('players').delete().gte('id', minId).lte('id', maxId);

		// 2. Wipe from 'matches'
		const { count, error } = await supabaseAdmin
			.from('matches')
			.delete({ count: 'exact' })
			.gte('player_id', minId)
			.lte('player_id', maxId);

		if (error) throw error;

		// 3. Wipe from 'player_gambit_stats'
		await supabaseAdmin
			.from('player_gambit_stats')
			.delete()
			.gte('player_id', minId)
			.lte('player_id', maxId);

		return json({
			success: true,
			message: `Cleared ${count ?? 0} matches and reset player profile across range.`,
			clearedCount: count
		});
	} catch (e) {
		console.error('Wipe failed:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
}
