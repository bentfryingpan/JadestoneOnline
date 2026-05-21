/**
 * /api/cron/awards — Daily standings refresh
 *
 * Recomputes the current season's leaderboard standings and upserts the top-10
 * award rows for all 5 categories. Awards are only visible on profiles after the
 * season's end date passes — this cron just keeps the data fresh so rankings are
 * locked in accurately when that happens.
 *
 * Also back-fills any completed seasons that have no awards yet (e.g., first deploy).
 *
 * Auth: Bearer <CRON_SECRET>   (same header Vercel Cron sends)
 * Schedule: once daily (e.g., 04:00 UTC via vercel.json crons)
 *
 * POST /api/cron/awards
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { computeSeasonAwards, SEASONS, currentSeason } from '$lib/server/awards.js';

const CRON_SECRET = env.CRON_SECRET;

export async function POST({ request }) {
	// Auth
	const authHeader = request.headers.get('authorization') ?? '';
	if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const results = [];
	const today = new Date().toISOString().slice(0, 10);

	// Determine which seasons to process:
	//  1. The current (active) season — keeps live rankings fresh
	//  2. Any completed seasons that somehow have no awards (back-fill safety net)
	const toProcess = new Set();

	const active = currentSeason();
	if (active) toProcess.add(active.number);

	// Check for completed seasons missing awards
	const completedSeasons = SEASONS.filter((s) => today >= s.end && s.number >= 17);
	if (completedSeasons.length) {
		// Which seasons already have at least one award row?
		const { data: existing } = await supabaseAdmin
			.from('player_season_awards')
			.select('season')
			.in('season', completedSeasons.map((s) => s.number));
		const covered = new Set((existing ?? []).map((r) => r.season));
		for (const s of completedSeasons) {
			if (!covered.has(s.number)) toProcess.add(s.number);
		}
	}

	for (const seasonNumber of toProcess) {
		for (const platform of ['pc', 'console']) {
			try {
				const result = await computeSeasonAwards(seasonNumber, supabaseAdmin, platform);
				results.push({ season: seasonNumber, platform, ...result });
			} catch (e) {
				results.push({ season: seasonNumber, platform, error: e.message });
			}
		}
	}

	return json({ processed: results });
}
