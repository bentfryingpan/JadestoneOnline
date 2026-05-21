/**
 * /api/profile/alts
 *
 * GET  — list all alts for a primary player (owner or admin only)
 * DELETE — unlink a specific alt
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { recomputeGroupJPR } from '$lib/server/alts.js';

export async function GET({ url, locals }) {
	const primaryId = url.searchParams.get('primary_id');
	if (!primaryId) return json({ error: 'Missing primary_id' }, { status: 400 });

	// Must be owner
	if (locals.user?.membershipId !== primaryId) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { data: alts, error: err } = await supabaseAdmin
		.from('alt_accounts')
		.select(`
			alt_player_id,
			verified_at,
			alt:players!alt_accounts_alt_player_id_fkey(bungie_name, bungie_code, membership_type)
		`)
		.eq('primary_player_id', primaryId)
		.order('verified_at', { ascending: true });

	if (err) return json({ error: err.message }, { status: 500 });

	return json({ alts: alts ?? [] });
}

export async function DELETE({ request, locals }) {
	const body = await request.json().catch(() => ({}));
	const { primary_id, alt_id } = body;

	if (!primary_id || !alt_id) return json({ error: 'Missing fields' }, { status: 400 });
	if (locals.user?.membershipId !== primary_id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { error: err } = await supabaseAdmin
		.from('alt_accounts')
		.delete()
		.eq('primary_player_id', primary_id)
		.eq('alt_player_id', alt_id);

	if (err) return json({ error: err.message }, { status: 500 });

	// Recompute JPR after unlinking (fire-and-forget)
	recomputeGroupJPR(supabaseAdmin, primary_id).catch(() => {});

	return json({ ok: true });
}
