import { supabaseAdmin } from '$lib/supabase-server.js';

const SEGMENTS = ['solo', 'duo', 'trio', 'stack'];

export async function load({ url }) {
	const segment = SEGMENTS.includes(url.searchParams.get('seg') ?? '')
		? url.searchParams.get('seg')
		: 'solo';

	const { data: rows } = await supabaseAdmin
		.from('player_jpr')
		.select(
			'player_id, segment, jpr, output, impact, form, games_played, updated_at, players(bungie_name, bungie_code, membership_type)'
		)
		.eq('segment', segment)
		.not('jpr', 'is', null)
		.order('jpr', { ascending: false })
		.limit(100);

	return { rows: rows ?? [], segment };
}
