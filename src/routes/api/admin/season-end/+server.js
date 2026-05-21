/**
 * /api/admin/season-end
 *
 * Computes end-of-season awards for all categories and writes them to
 * player_season_awards. Idempotent — running it multiple times is safe
 * (uses upsert). Protect with CRON_SECRET or INGEST_SECRET.
 *
 * POST /api/admin/season-end
 * Body: { season: 27, secret: "..." }
 *
 * Categories awarded:
 *   jpr_overall   — top JPR (best single segment per player)
 *   motes         — total motes deposited this season
 *   invasion_kills — total invasion kills
 *   win_rate      — win rate (min 50 matches)
 *   mote_eff      — mote efficiency % (min 50 matches)
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { CRON_SECRET, INGEST_SECRET } from '$env/static/private';

// Season date ranges — kept in sync with seasonal.js
const SEASON_DATES = {
	17: { start: '2022-05-24', end: '2022-08-23' },
	18: { start: '2022-08-23', end: '2022-12-06' },
	19: { start: '2022-12-06', end: '2023-02-28' },
	20: { start: '2023-02-28', end: '2023-05-23' },
	21: { start: '2023-05-23', end: '2023-09-05' },
	22: { start: '2023-09-05', end: '2023-11-28' },
	23: { start: '2023-11-28', end: '2024-02-27' },
	24: { start: '2024-02-27', end: '2024-10-08' },
	25: { start: '2024-10-08', end: '2025-02-04' },
	26: { start: '2025-02-04', end: '2025-05-20' },
	27: { start: '2025-05-20', end: '2099-01-01' },
};

// Award tier config — rank → { tier slug, color, icon label }
const TIERS = [
	{ maxRank: 1,  tier: '1st',   color: 'amber',   icon: '1' },
	{ maxRank: 2,  tier: '2nd',   color: 'silver',  icon: '2' },
	{ maxRank: 3,  tier: '3rd',   color: 'bronze',  icon: '3' },
	{ maxRank: 5,  tier: 'top5',  color: 'emerald', icon: '5' },
	{ maxRank: 10, tier: 'top10', color: 'zinc',    icon: '10' },
];

function getTier(rank) {
	return TIERS.find((t) => rank <= t.maxRank) ?? null;
}

/** Award category definitions */
const CATEGORIES = [
	{
		slug: 'jpr_overall',
		title: 'JPR Champion',
		description: 'Highest Jadestone Performance Rating (best segment)',
		minGames: 20,
	},
	{
		slug: 'motes',
		title: 'Mote Lord',
		description: 'Most motes deposited this season',
		minGames: 20,
	},
	{
		slug: 'invasion_kills',
		title: 'Invasion King',
		description: 'Most invasion kills this season',
		minGames: 20,
	},
	{
		slug: 'win_rate',
		title: 'Flawless Record',
		description: 'Highest win rate (min 50 matches)',
		minGames: 50,
	},
	{
		slug: 'mote_efficiency',
		title: 'Mote Machine',
		description: 'Highest mote efficiency % (min 50 matches)',
		minGames: 50,
	},
];

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const secret = body.secret ?? '';

	// Auth check
	if (!secret || (secret !== CRON_SECRET && secret !== INGEST_SECRET)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const season = parseInt(body.season ?? 0, 10);
	if (!season || !SEASON_DATES[season]) {
		return json({ error: 'Invalid or missing season number' }, { status: 400 });
	}

	const { start, end } = SEASON_DATES[season];
	const awarded = [];
	const errors = [];

	// ── 1. JPR leaderboard (already computed in player_jpr table) ────────────
	try {
		const { data: jprRows } = await supabaseAdmin
			.from('player_jpr')
			.select('player_id, segment, jpr, games_played')
			.gte('games_played', CATEGORIES.find((c) => c.slug === 'jpr_overall').minGames)
			.order('jpr', { ascending: false });

		// Best JPR per player across all segments
		const bestPerPlayer = {};
		for (const row of jprRows ?? []) {
			if (!bestPerPlayer[row.player_id] || row.jpr > bestPerPlayer[row.player_id].jpr) {
				bestPerPlayer[row.player_id] = row;
			}
		}
		const ranked = Object.values(bestPerPlayer).sort((a, b) => b.jpr - a.jpr);
		for (let i = 0; i < Math.min(ranked.length, 10); i++) {
			const tier = getTier(i + 1);
			if (!tier) continue;
			awarded.push({
				player_id: ranked[i].player_id,
				season,
				slug: 'jpr_overall',
				title: 'JPR Champion',
				rank: i + 1,
				tier: tier.tier,
				color: tier.color,
				icon: tier.icon,
				data: { value: ranked[i].jpr, segment: ranked[i].segment },
			});
		}
	} catch (e) {
		errors.push(`jpr_overall: ${e.message}`);
	}

	// ── 2. Season stats from matches table ───────────────────────────────────
	// Aggregate per player for this season's date range
	try {
		const { data: matches } = await supabaseAdmin
			.from('matches')
			.select('player_id, outcome, stats_json, period')
			.gte('period', start)
			.lt('period', end)
			.not('stats_json', 'is', null);

		// Per-player aggregation
		const playerStats = {};
		for (const m of matches ?? []) {
			const pid = m.player_id;
			if (!pid) continue;
			if (!playerStats[pid]) {
				playerStats[pid] = {
					games: 0, wins: 0,
					motes: 0, motesPickedUp: 0, motesLost: 0,
					invasionKills: 0,
				};
			}
			const s = m.stats_json ?? {};
			const p = playerStats[pid];
			p.games++;
			if (m.outcome === 'Win') p.wins++;
			p.motes += s.motesDeposited ?? 0;
			p.motesPickedUp += s.motesPickedUp ?? 0;
			p.motesLost += s.motesLost ?? 0;
			p.invasionKills += s.invasionKills ?? 0;
		}

		// ── Motes ──
		const motesRanked = Object.entries(playerStats)
			.filter(([, s]) => s.games >= 20)
			.sort(([, a], [, b]) => b.motes - a.motes);
		for (let i = 0; i < Math.min(motesRanked.length, 10); i++) {
			const tier = getTier(i + 1);
			if (!tier) continue;
			const [pid, s] = motesRanked[i];
			awarded.push({
				player_id: pid, season, slug: 'motes', title: 'Mote Lord',
				rank: i + 1, tier: tier.tier, color: tier.color, icon: tier.icon,
				data: { value: s.motes },
			});
		}

		// ── Invasion kills ──
		const invRanked = Object.entries(playerStats)
			.filter(([, s]) => s.games >= 20)
			.sort(([, a], [, b]) => b.invasionKills - a.invasionKills);
		for (let i = 0; i < Math.min(invRanked.length, 10); i++) {
			const tier = getTier(i + 1);
			if (!tier) continue;
			const [pid, s] = invRanked[i];
			awarded.push({
				player_id: pid, season, slug: 'invasion_kills', title: 'Invasion King',
				rank: i + 1, tier: tier.tier, color: tier.color, icon: tier.icon,
				data: { value: s.invasionKills },
			});
		}

		// ── Win rate (min 50 games) ──
		const wrRanked = Object.entries(playerStats)
			.filter(([, s]) => s.games >= 50)
			.map(([pid, s]) => [pid, s, s.wins / s.games])
			.sort(([, , a], [, , b]) => b - a);
		for (let i = 0; i < Math.min(wrRanked.length, 10); i++) {
			const tier = getTier(i + 1);
			if (!tier) continue;
			const [pid, s, wr] = wrRanked[i];
			awarded.push({
				player_id: pid, season, slug: 'win_rate', title: 'Flawless Record',
				rank: i + 1, tier: tier.tier, color: tier.color, icon: tier.icon,
				data: { value: +(wr * 100).toFixed(1), games: s.games },
			});
		}

		// ── Mote efficiency (min 50 games) ──
		const effRanked = Object.entries(playerStats)
			.filter(([, s]) => s.games >= 50 && (s.motesPickedUp + s.motesLost) > 0)
			.map(([pid, s]) => {
				const eff = s.motesPickedUp > 0
					? s.motes / s.motesPickedUp
					: s.motes / (s.motes + s.motesLost);
				return [pid, s, eff];
			})
			.sort(([, , a], [, , b]) => b - a);
		for (let i = 0; i < Math.min(effRanked.length, 10); i++) {
			const tier = getTier(i + 1);
			if (!tier) continue;
			const [pid, , eff] = effRanked[i];
			awarded.push({
				player_id: pid, season, slug: 'mote_efficiency', title: 'Mote Machine',
				rank: i + 1, tier: tier.tier, color: tier.color, icon: tier.icon,
				data: { value: +(eff * 100).toFixed(1) },
			});
		}
	} catch (e) {
		errors.push(`match_stats: ${e.message}`);
	}

	// ── 3. Write awards (upsert — idempotent) ────────────────────────────────
	if (awarded.length > 0) {
		const { error: upsertErr } = await supabaseAdmin
			.from('player_season_awards')
			.upsert(awarded, { onConflict: 'player_id,season,slug' });
		if (upsertErr) errors.push(`upsert: ${upsertErr.message}`);
	}

	return json({
		season,
		awarded: awarded.length,
		categories: CATEGORIES.map((c) => c.slug),
		errors: errors.length ? errors : undefined,
	});
}
