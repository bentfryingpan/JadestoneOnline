/**
 * /api/admin/backfill-platforms
 *
 * Backfills matches.platform and players.platforms for all existing records.
 * Uses per-player batching to stay within Supabase statement timeouts.
 *
 * POST /api/admin/backfill-platforms
 * Body: { secret: "...", cursor?: "player_id_to_start_from", batchSize?: 200 }
 *
 * Returns: { processed, updated, nextCursor, done }
 * Call repeatedly with nextCursor until done === true.
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { env } from '$env/dynamic/private';

const CRON_SECRET   = env.CRON_SECRET;
const INGEST_SECRET = env.INGEST_SECRET;

const CONSOLE_TYPES = new Set([1, 2]);

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const secret = body.secret ?? '';

	if (!secret || (secret !== CRON_SECRET && secret !== INGEST_SECRET)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const batchSize = Math.min(parseInt(body.batchSize ?? 200, 10), 500);
	const cursor    = body.cursor ?? null; // player id (string) to start after

	// 1. Fetch a batch of players (ordered by id, starting after cursor)
	let q = supabaseAdmin
		.from('players')
		.select('id, membership_type')
		.order('id', { ascending: true })
		.limit(batchSize);

	if (cursor) q = q.gt('id', cursor);

	const { data: players, error: playerErr } = await q;
	if (playerErr) return json({ error: playerErr.message }, { status: 500 });
	if (!players?.length) return json({ processed: 0, updated: 0, done: true });

	// 2. For each player, update their matches.platform and players.platforms in parallel
	const CONCURRENCY = 20;
	let totalUpdated = 0;

	for (let i = 0; i < players.length; i += CONCURRENCY) {
		const chunk = players.slice(i, i + CONCURRENCY);

		await Promise.all(chunk.map(async (player) => {
			const platform = CONSOLE_TYPES.has(player.membership_type) ? 'console' : 'pc';

			// Update matches that don't have a platform set yet
			const { error: matchErr, count } = await supabaseAdmin
				.from('matches')
				.update({ platform }, { count: 'exact' })
				.eq('player_id', String(player.id))
				.is('platform', null);

			totalUpdated += count ?? 0;

			// Also ensure players.platforms is set (always overwrite so it stays accurate)
			await supabaseAdmin
				.from('players')
				.update({ platforms: [platform] })
				.eq('id', String(player.id));
		}));
	}

	const lastPlayer = players[players.length - 1];
	const done       = players.length < batchSize;

	return json({
		processed:  players.length,
		updated:    totalUpdated,
		nextCursor: done ? null : lastPlayer.id,
		done,
	});
}
