import { supabaseAdmin } from '$lib/supabase-server.js';
import { BUNGIE_API_KEY } from '$env/static/private';

const BUNGIE_ROOT = 'https://www.bungie.net';

export async function load({ url }) {
	const error   = url.searchParams.get('error');
	const success = url.searchParams.get('success');
	const primaryId = url.searchParams.get('primary');

	if (!success || !primaryId) {
		const messages = {
			self:           'You cannot link your own account as an alt.',
			has_alts:       'That account already has alts linked to it and cannot itself become an alt.',
			already_linked: 'That account is already linked to a different primary.',
			db:             'A database error occurred. Please try again.',
		};
		return { success: false, message: messages[error] ?? 'Something went wrong.' };
	}

	// Fetch primary player name to redirect back to their profile
	const { data: player } = await supabaseAdmin
		.from('players')
		.select('bungie_name, bungie_code, membership_type')
		.eq('id', primaryId)
		.single();

	return {
		success: true,
		primaryId,
		primaryName: player?.bungie_name ?? null,
		primaryCode: player?.bungie_code ?? null,
		primaryMt:   player?.membership_type ?? 3,
	};
}
