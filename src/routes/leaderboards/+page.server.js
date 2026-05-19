import { supabaseAdmin } from '$lib/supabase-server.js';

const SEGMENTS = ['solo', 'duo', 'trio', 'stack'];

export async function load({ url }) {
	const segment = SEGMENTS.includes(url.searchParams.get('seg') ?? '')
		? url.searchParams.get('seg')
		: 'solo';

	// Fetch JPR rows for segment
	const { data: jprRows } = await supabaseAdmin
		.from('player_jpr')
		.select('player_id, segment, jpr, output, impact, form, games_played, updated_at')
		.eq('segment', segment)
		.not('jpr', 'is', null)
		.order('jpr', { ascending: false })
		.limit(100);

	if (!jprRows?.length) return { rows: [], segment };

	// Fetch player names for those IDs
	const playerIds = jprRows.map(r => r.player_id);
	const { data: playerRows } = await supabaseAdmin
		.from('players')
		.select('id, bungie_name, bungie_code, membership_type')
		.in('id', playerIds);

	const playerMap = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));

	const rows = jprRows.map(r => ({
		...r,
		players: playerMap[r.player_id] ?? null,
	}));

	return { rows, segment };
}
