/**
 * /api/admin/seed-queue — Seed the crawler queue with known players
 *
 * POST with { players: [{ player_id, membership_type, bungie_name, bungie_code }] }
 * or hit GET to auto-seed from existing players + matches tables.
 *
 * Protected by CRON_SECRET.
 */

import { CRON_SECRET } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

function auth(request) {
	const h = request.headers.get('authorization');
	return !CRON_SECRET || h === `Bearer ${CRON_SECRET}`;
}

// GET: seed from all players already in the players table
export async function GET({ request }) {
	if (!auth(request)) return json({ error: 'Unauthorized' }, { status: 401 });

	const { data: existing, error } = await supabaseAdmin
		.from('players')
		.select('id, membership_type, bungie_name, bungie_code')
		.limit(10_000);

	if (error) return json({ error: error.message }, { status: 500 });

	const rows = (existing ?? []).map(p => ({
		player_id:       p.id,
		membership_type: p.membership_type ?? 3,
		bungie_name:     p.bungie_name,
		bungie_code:     p.bungie_code,
		priority:        2, // treat known visitors as elevated priority
		added_at:        new Date().toISOString(),
	}));

	if (!rows.length) return json({ seeded: 0, message: 'no players to seed' });

	const { error: uErr } = await supabaseAdmin
		.from('player_queue')
		.upsert(rows, { onConflict: 'player_id', ignoreDuplicates: true });

	if (uErr) return json({ error: uErr.message }, { status: 500 });

	return json({ seeded: rows.length });
}

// POST: seed specific players, or seed from roster data in stats_json
export async function POST({ request }) {
	if (!auth(request)) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));

	if (body.players?.length) {
		// Explicit list provided
		const rows = body.players.map(p => ({
			player_id:       String(p.player_id),
			membership_type: p.membership_type ?? 3,
			bungie_name:     p.bungie_name ?? null,
			bungie_code:     p.bungie_code ?? null,
			priority:        p.priority ?? 3, // seeds get highest priority
			added_at:        new Date().toISOString(),
		}));

		await supabaseAdmin
			.from('player_queue')
			.upsert(rows, { onConflict: 'player_id', ignoreDuplicates: false });

		return json({ seeded: rows.length });
	}

	// No explicit list — extract all known roster players from stored matches
	// This seeds the crawler from the social graph already in the DB
	const { data: matches, error } = await supabaseAdmin
		.from('matches')
		.select('stats_json')
		.not('stats_json->roster', 'is', null)
		.limit(5000);

	if (error) return json({ error: error.message }, { status: 500 });

	const seen = new Set();
	const rows = [];

	for (const m of matches ?? []) {
		for (const r of m.stats_json?.roster ?? []) {
			if (!r.id || r.id === '0' || seen.has(r.id)) continue;
			seen.add(r.id);
			rows.push({
				player_id:       r.id,
				membership_type: r.membershipType ?? 3,
				bungie_name:     r.name ?? null,
				bungie_code:     r.code ?? null,
				priority:        1,
				added_at:        new Date().toISOString(),
			});
		}
	}

	if (!rows.length) return json({ seeded: 0, message: 'no roster players found in matches' });

	await supabaseAdmin
		.from('player_queue')
		.upsert(rows, { onConflict: 'player_id', ignoreDuplicates: true });

	return json({ seeded: rows.length, unique: seen.size });
}
