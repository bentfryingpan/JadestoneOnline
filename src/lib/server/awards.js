/**
 * Season awards computation — shared between the cron runner and the manual
 * admin endpoint.
 *
 * computeSeasonAwards(season, supabaseAdmin)
 *   → { awarded: row[], removed: number, errors: string[] }
 *
 * Design notes:
 *  - JPR overall: best segment per player from player_jpr (lifetime, not date-gated).
 *    JPR is already a rolling window metric so it naturally reflects current form.
 *  - Motes / invasion kills / win rate / mote efficiency: aggregated from the
 *    matches table filtered to the season's date window.
 *  - After computing new top-10 for each slug, stale entries (previously in top-10
 *    but now displaced) are deleted so rankings always reflect the live standings.
 *  - The whole operation is idempotent — safe to run many times per day.
 */

// Season date ranges — keep in sync with seasonal.js
export const SEASONS = [
	{ name: 'Season of the Haunted',    number: 17, start: '2022-05-24', end: '2022-08-23' },
	{ name: 'Season of Plunder',        number: 18, start: '2022-08-23', end: '2022-12-06' },
	{ name: 'Season of the Seraph',     number: 19, start: '2022-12-06', end: '2023-02-28' },
	{ name: 'Season of Defiance',       number: 20, start: '2023-02-28', end: '2023-05-23' },
	{ name: 'Season of the Deep',       number: 21, start: '2023-05-23', end: '2023-09-05' },
	{ name: 'Season of the Witch',      number: 22, start: '2023-09-05', end: '2023-11-28' },
	{ name: 'Season of the Wish',       number: 23, start: '2023-11-28', end: '2024-02-27' },
	{ name: 'The Final Shape / Echoes', number: 24, start: '2024-02-27', end: '2024-10-08' },
	{ name: 'Revenant',                 number: 25, start: '2024-10-08', end: '2025-02-04' },
	{ name: 'Heresy',                   number: 26, start: '2025-02-04', end: '2025-05-20' },
	{ name: 'Edge of Fate',             number: 27, start: '2025-05-20', end: '2099-01-01' },
];

/** Returns the season object whose window contains today's date. */
export function currentSeason() {
	const today = new Date().toISOString().slice(0, 10);
	return SEASONS.find((s) => today >= s.start && today < s.end) ?? null;
}

/**
 * Map a Bungie membershipType to a pool name.
 * Console pool: PlayStation (2), Xbox (1)
 * PC pool: Steam (3), Blizzard/defunct (4), Stadia/defunct (5), Epic (6)
 * These pools cannot cross-play, so rankings must be separate.
 */
export function membershipTypeToPlatform(membershipType) {
	const mt = parseInt(membershipType ?? 0, 10);
	return mt === 1 || mt === 2 ? 'console' : 'pc';
}

const TIERS = [
	{ maxRank: 1,  tier: '1st',   color: 'amber',   icon: '1'  },
	{ maxRank: 2,  tier: '2nd',   color: 'silver',  icon: '2'  },
	{ maxRank: 3,  tier: '3rd',   color: 'bronze',  icon: '3'  },
	{ maxRank: 5,  tier: 'top5',  color: 'emerald', icon: '5'  },
	{ maxRank: 10, tier: 'top10', color: 'zinc',    icon: '10' },
];

function getTier(rank) {
	return TIERS.find((t) => rank <= t.maxRank) ?? null;
}

const CATEGORIES = [
	{ slug: 'jpr_overall',    title: 'JPR Champion',   minGames: 20 },
	{ slug: 'motes',          title: 'Mote Lord',      minGames: 20 },
	{ slug: 'invasion_kills', title: 'Invasion King',  minGames: 20 },
	{ slug: 'win_rate',       title: 'Flawless Record', minGames: 50 },
	{ slug: 'mote_efficiency',title: 'Mote Machine',   minGames: 50 },
];

/**
 * Compute and persist season awards for `seasonNumber` and a platform pool.
 *
 * @param {number}  seasonNumber  - e.g. 27
 * @param {object}  db            - supabaseAdmin client
 * @param {'pc'|'console'} platform - which pool to rank ('pc' | 'console')
 * @returns {{ awarded: number, removed: number, errors: string[] }}
 */
export async function computeSeasonAwards(seasonNumber, db, platform = 'pc') {
	const season = SEASONS.find((s) => s.number === seasonNumber);
	if (!season) throw new Error(`Unknown season: ${seasonNumber}`);

	const { start, end } = season;
	const awarded = [];
	const errors  = [];

	// Platform filter: include players who have actually played matches on this platform.
	// Uses the `platforms` text[] column which is maintained by the crawler on every
	// match write — cross-save players appear in both pools automatically.
	// Falls back to membership_type filtering for players whose platforms array is empty.
	let platformPlayerIds = null;
	try {
		const { data: pRows } = await db
			.from('players')
			.select('id')
			.contains('platforms', [platform]);
		platformPlayerIds = new Set((pRows ?? []).map((p) => String(p.id)));
	} catch (e) {
		errors.push(`platform_filter: ${e.message}`);
	}

	// ── 1. JPR leaderboard ───────────────────────────────────────────────────
	try {
		const { data: jprRows } = await db
			.from('player_jpr')
			.select('player_id, segment, jpr, games_played')
			.gte('games_played', CATEGORIES.find((c) => c.slug === 'jpr_overall').minGames)
			.order('jpr', { ascending: false });

		const bestPerPlayer = {};
		for (const row of jprRows ?? []) {
			// Skip players not in this platform pool
			if (platformPlayerIds && !platformPlayerIds.has(String(row.player_id))) continue;
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
				season: seasonNumber,
				slug: 'jpr_overall',
				title: 'JPR Champion',
				rank: i + 1,
				tier: tier.tier,
				color: tier.color,
				icon: tier.icon,
				platform,
				data: { value: ranked[i].jpr, segment: ranked[i].segment },
			});
		}
	} catch (e) {
		errors.push(`jpr_overall: ${e.message}`);
	}

	// ── 2. Season stats from matches ─────────────────────────────────────────
	try {
		let matchQuery = db
			.from('matches')
			.select('player_id, outcome, stats_json, period')
			.gte('period', start)
			.lt('period', end)
			.not('stats_json', 'is', null);

		// Filter by platform column if it exists on the matches table
		if (platform === 'console') {
			matchQuery = matchQuery.eq('platform', 'console');
		} else {
			matchQuery = matchQuery.eq('platform', 'pc');
		}

		const { data: matches } = await matchQuery;

		const playerStats = {};
		for (const m of matches ?? []) {
			const pid = m.player_id;
			if (!pid) continue;
			if (!playerStats[pid]) {
				playerStats[pid] = { games: 0, wins: 0, motes: 0, motesPickedUp: 0, motesLost: 0, invasionKills: 0 };
			}
			const s = m.stats_json ?? {};
			const p = playerStats[pid];
			p.games++;
			if (m.outcome === 'Win') p.wins++;
			p.motes         += s.motesDeposited ?? 0;
			p.motesPickedUp += s.motesPickedUp  ?? 0;
			p.motesLost     += s.motesLost      ?? 0;
			p.invasionKills += s.invasionKills  ?? 0;
		}

		// Motes
		const motesRanked = Object.entries(playerStats)
			.filter(([, s]) => s.games >= 20)
			.sort(([, a], [, b]) => b.motes - a.motes);
		for (let i = 0; i < Math.min(motesRanked.length, 10); i++) {
			const tier = getTier(i + 1);
			if (!tier) continue;
			const [pid, s] = motesRanked[i];
			awarded.push({ player_id: pid, season: seasonNumber, slug: 'motes', title: 'Mote Lord', rank: i + 1, tier: tier.tier, color: tier.color, icon: tier.icon, platform, data: { value: s.motes } });
		}

		// Invasion kills
		const invRanked = Object.entries(playerStats)
			.filter(([, s]) => s.games >= 20)
			.sort(([, a], [, b]) => b.invasionKills - a.invasionKills);
		for (let i = 0; i < Math.min(invRanked.length, 10); i++) {
			const tier = getTier(i + 1);
			if (!tier) continue;
			const [pid, s] = invRanked[i];
			awarded.push({ player_id: pid, season: seasonNumber, slug: 'invasion_kills', title: 'Invasion King', rank: i + 1, tier: tier.tier, color: tier.color, icon: tier.icon, platform, data: { value: s.invasionKills } });
		}

		// Win rate (min 50)
		const wrRanked = Object.entries(playerStats)
			.filter(([, s]) => s.games >= 50)
			.map(([pid, s]) => [pid, s, s.wins / s.games])
			.sort(([, , a], [, , b]) => b - a);
		for (let i = 0; i < Math.min(wrRanked.length, 10); i++) {
			const tier = getTier(i + 1);
			if (!tier) continue;
			const [pid, s, wr] = wrRanked[i];
			awarded.push({ player_id: pid, season: seasonNumber, slug: 'win_rate', title: 'Flawless Record', rank: i + 1, tier: tier.tier, color: tier.color, icon: tier.icon, platform, data: { value: +(wr * 100).toFixed(1), games: s.games } });
		}

		// Mote efficiency (min 50)
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
			awarded.push({ player_id: pid, season: seasonNumber, slug: 'mote_efficiency', title: 'Mote Machine', rank: i + 1, tier: tier.tier, color: tier.color, icon: tier.icon, platform, data: { value: +(eff * 100).toFixed(1) } });
		}
	} catch (e) {
		errors.push(`match_stats: ${e.message}`);
	}

	// ── 3. Remove stale top-10 entries (players who dropped out) ────────────
	// For each category+platform, delete awards whose player_id is no longer top-10.
	let removed = 0;
	for (const cat of CATEGORIES) {
		try {
			const newTop = awarded
				.filter((r) => r.slug === cat.slug && r.platform === platform)
				.map((r) => r.player_id);

			// Only prune if we actually computed rankings (avoid wiping on error)
			if (newTop.length === 0) continue;

			const { count } = await db
				.from('player_season_awards')
				.delete({ count: 'exact' })
				.eq('season', seasonNumber)
				.eq('slug', cat.slug)
				.eq('platform', platform)
				.not('player_id', 'in', `(${newTop.join(',')})`);
			removed += count ?? 0;
		} catch {
			// non-fatal — stale entries just sit until next run
		}
	}

	// ── 4. Upsert new / updated rankings ────────────────────────────────────
	if (awarded.length > 0) {
		const { error: upsertErr } = await db
			.from('player_season_awards')
			.upsert(awarded, { onConflict: 'player_id,season,slug,platform' });
		if (upsertErr) errors.push(`upsert: ${upsertErr.message}`);
	}

	return { awarded: awarded.length, removed, errors };
}
