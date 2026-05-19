import { supabaseAdmin } from '$lib/supabase-server.js';

const SEGMENT_KEYS = ['solo', 'duo', 'trio', 'stack'];

export async function load({ url }) {
	const seg = url.searchParams.get('seg') ?? 'solo';
	const initialSegment = [...SEGMENT_KEYS, 'overall'].includes(seg) ? seg : 'solo';

	// Single query — all segments at once, ordered by JPR desc
	const { data: allJpr } = await supabaseAdmin
		.from('player_jpr')
		.select('player_id, segment, jpr, output, impact, form, games_played, updated_at')
		.not('jpr', 'is', null)
		.gte('games_played', 20)
		.order('jpr', { ascending: false });

	if (!allJpr?.length) {
		return {
			segments: { solo: [], duo: [], trio: [], stack: [], overall: [] },
			initialSegment,
		};
	}

	// Group by segment, top 100 each
	const bySegment = {};
	for (const key of SEGMENT_KEYS) {
		bySegment[key] = allJpr.filter(r => r.segment === key).slice(0, 100);
	}

	// Overall — best single segment JPR per player
	const byPlayer = {};
	for (const r of allJpr) {
		if (!byPlayer[r.player_id]) {
			byPlayer[r.player_id] = { segments: {}, totalGames: 0 };
		}
		byPlayer[r.player_id].segments[r.segment] = r.jpr;
		byPlayer[r.player_id].totalGames += r.games_played ?? 0;
	}

	const overallRows = Object.entries(byPlayer).map(([player_id, d]) => {
		const scores = Object.values(d.segments).filter(v => v != null);
		const bestJpr = scores.length > 0 ? Math.max(...scores) : null;
		return {
			player_id,
			jpr: bestJpr,
			games_played: d.totalGames,
			segments_qualified: scores.length,
			segment_scores: d.segments,
		};
	}).filter(r => r.jpr != null)
	  .sort((a, b) => b.jpr - a.jpr)
	  .slice(0, 100);

	// One player lookup for all unique IDs across all segments
	const allPlayerIds = [...new Set(allJpr.map(r => r.player_id))];
	const { data: playerRows } = await supabaseAdmin
		.from('players')
		.select('id, bungie_name, bungie_code, membership_type')
		.in('id', allPlayerIds);

	const playerMap = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));
	const attach = rows => rows.map(r => ({ ...r, players: playerMap[r.player_id] ?? null }));

	return {
		segments: {
			solo:    attach(bySegment.solo    ?? []),
			duo:     attach(bySegment.duo     ?? []),
			trio:    attach(bySegment.trio    ?? []),
			stack:   attach(bySegment.stack   ?? []),
			overall: attach(overallRows),
		},
		initialSegment,
	};
}
