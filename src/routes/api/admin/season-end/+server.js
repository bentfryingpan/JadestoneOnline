/**
 * /api/admin/season-end
 *
 * Manually trigger end-of-season award computation for a specific season.
 * Uses the shared computeSeasonAwards() from $lib/server/awards.js.
 * Idempotent — safe to call multiple times (upsert + stale-entry cleanup).
 *
 * POST /api/admin/season-end
 * Body: { season: 27, secret: "..." }
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { CRON_SECRET, INGEST_SECRET } from '$env/static/private';
import { computeSeasonAwards, SEASONS } from '$lib/server/awards.js';

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const secret = body.secret ?? '';

	if (!secret || (secret !== CRON_SECRET && secret !== INGEST_SECRET)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const season = parseInt(body.season ?? 0, 10);
	if (!season || !SEASONS.find((s) => s.number === season)) {
		return json({ error: 'Invalid or missing season number' }, { status: 400 });
	}

	const result = await computeSeasonAwards(season, supabaseAdmin);

	return json({
		season,
		awarded: result.awarded,
		removed: result.removed,
		categories: ['jpr_overall', 'motes', 'invasion_kills', 'win_rate', 'mote_efficiency'],
		errors: result.errors.length ? result.errors : undefined,
	});
}
