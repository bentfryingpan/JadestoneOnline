import { supabaseAdmin } from '$lib/supabase-server.js';

const SEGMENTS = ['solo', 'duo', 'trio', 'stack'];

export async function load({ url }) {
	const seg = url.searchParams.get('seg') ?? 'solo';
	const segment = [...SEGMENTS, 'overall'].includes(seg) ? seg : 'solo';

	if (segment === 'overall') {
		// Pull all JPR rows, group by player, average across segments
		const { data: allJpr } = await supabaseAdmin
			.from('player_jpr')
			.select('player_id, segment, jpr, games_played')
			.not('jpr', 'is', null)
			.gte('games_played', 20);

		if (!allJpr?.length) return { rows: [], segment };

		// Group by player
		const byPlayer = {};
		for (const r of allJpr) {
			if (!byPlayer[r.player_id]) byPlayer[r.player_id] = { segments: {}, totalGames: 0 };
			byPlayer[r.player_id].segments[r.segment] = r.jpr;
			byPlayer[r.player_id].totalGames += r.games_played ?? 0;
		}

		// Compute net JPR = average across qualifying segments
		const netRows = Object.entries(byPlayer).map(([player_id, d]) => {
			const scores = Object.values(d.segments).filter(v => v != null);
			const netJpr = scores.length > 0
				? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
				: null;
			return {
				player_id,
				jpr: netJpr,
				games_played: d.totalGames,
				segments_qualified: scores.length,
				segment_scores: d.segments,
			};
		}).filter(r => r.jpr != null)
		  .sort((a, b) => b.jpr - a.jpr)
		  .slice(0, 100);

		const playerIds = netRows.map(r => r.player_id);
		const { data: playerRows } = await supabaseAdmin
			.from('players')
			.select('id, bungie_name, bungie_code, membership_type')
			.in('id', playerIds);

		const playerMap = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));
		const rows = netRows.map(r => ({ ...r, players: playerMap[r.player_id] ?? null }));

		return { rows, segment };
	}

	// Single segment
	const { data: jprRows } = await supabaseAdmin
		.from('player_jpr')
		.select('player_id, segment, jpr, output, impact, form, games_played, updated_at')
		.eq('segment', segment)
		.not('jpr', 'is', null)
		.gte('games_played', 20)
		.order('jpr', { ascending: false })
		.limit(100);

	if (!jprRows?.length) return { rows: [], segment };

	const playerIds = jprRows.map(r => r.player_id);
	const { data: playerRows } = await supabaseAdmin
		.from('players')
		.select('id, bungie_name, bungie_code, membership_type')
		.in('id', playerIds);

	const playerMap = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));
	const rows = jprRows.map(r => ({ ...r, players: playerMap[r.player_id] ?? null }));

	return { rows, segment };
}
