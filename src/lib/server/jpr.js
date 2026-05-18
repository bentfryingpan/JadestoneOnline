/**
 * JPR (Jadestone Performance Rating)
 *
 * Segment-separated leaderboard rating that measures raw output within a
 * fireteam-size bucket, so solo players and full-stacks are never competing
 * on the same axis.
 *
 * JPR = Output × Impact × Form
 *
 * Output  — how hard you play on average, blended with a prior to prevent
 *            new players gaming early spots, boosted slightly by peak games
 * Impact  — your win-rate relative to the EXPECTED win-rate for your queue
 *            type (full-stacks win more, so the bar is higher)
 * Form    — your recent trend vs your own baseline (EMA of last 20 games)
 */

export const SEGMENT_CONFIG = {
	solo:  { minFt: 1, maxFt: 1, expectedWR: 0.50, globalAvg: 72,  label: 'Solo Queue'  },
	duo:   { minFt: 2, maxFt: 2, expectedWR: 0.55, globalAvg: 76,  label: 'Duo Stack'   },
	trio:  { minFt: 3, maxFt: 3, expectedWR: 0.62, globalAvg: 80,  label: 'Trio Stack'  },
	stack: { minFt: 4, maxFt: 4, expectedWR: 0.66, globalAvg: 86,  label: 'Full Stack'  },
};

const MIN_GAMES    = 5;     // minimum matches per segment to appear on leaderboard
const PRIOR_WEIGHT = 15;    // games before the global-average prior fades out
const EMA_ALPHA    = 0.15;  // weight of most-recent game in form EMA
const EMA_WINDOW   = 20;    // last N games used for form EMA
const FORM_MIN     = 0.90;
const FORM_MAX     = 1.10;
const IMPACT_MIN   = 0.50;
const IMPACT_MAX   = 2.00;

/**
 * Calculate JPR for a player from their full match history.
 *
 * @param {Array<{ego_score: number, outcome: string, fireteam_size: number, period: string}>} matches
 *   Must be sorted newest-first (or any order — we re-sort internally).
 *
 * @returns {{ solo, duo, trio, stack }} — each value is null (< MIN_GAMES)
 *   or { jpr, output, impact, form, games_played }
 */
export function calcJPR(matches) {
	const result = {};

	for (const [seg, cfg] of Object.entries(SEGMENT_CONFIG)) {
		// Filter to this segment's fireteam size bucket, enriched matches only
		const segMatches = matches
			.filter(m =>
				m.ego_score != null &&
				m.fireteam_size >= cfg.minFt &&
				m.fireteam_size <= cfg.maxFt
			)
			.sort((a, b) => new Date(a.period) - new Date(b.period)); // oldest → newest for EMA

		if (segMatches.length < MIN_GAMES) {
			result[seg] = null;
			continue;
		}

		const scores = segMatches.map(m => m.ego_score);
		const wins   = segMatches.filter(m => m.outcome === 'Win').length;
		const n      = segMatches.length;

		// ── Output ─────────────────────────────────────────────────────────────
		// Trimmed mean: drop top/bottom 10% to remove outlier inflation/deflation
		const sorted = [...scores].sort((a, b) => a - b);
		const trimN  = Math.max(1, Math.floor(n * 0.1));
		const trimmed = sorted.slice(trimN, n - trimN);
		const trimmedMean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

		// Peak factor: extra credit for exceptional performance ceilings
		const topN     = Math.max(1, Math.floor(n * 0.1));
		const topScores = sorted.slice(-topN);
		const topAvg    = topScores.reduce((a, b) => a + b, 0) / topScores.length;
		const peakFactor = trimmedMean > 0 ? (topAvg / trimmedMean - 1) * 0.1 : 0;

		// Prior blend: new players are pulled toward the segment average
		// so they can't skip to #1 with 5 good games
		const priorWeight = Math.max(0, PRIOR_WEIGHT - n);
		const blended = priorWeight > 0
			? (trimmedMean * n + cfg.globalAvg * priorWeight) / PRIOR_WEIGHT
			: trimmedMean;
		const output = blended * (1 + peakFactor);

		// ── Impact ─────────────────────────────────────────────────────────────
		// Actual win-rate divided by expected win-rate for this queue type.
		// A solo player hitting 66% WR is way harder than a full-stack hitting 66%.
		const winRate = wins / n;
		const impact  = Math.max(IMPACT_MIN, Math.min(IMPACT_MAX, winRate / cfg.expectedWR));

		// ── Form ───────────────────────────────────────────────────────────────
		// Exponential moving average of the last EMA_WINDOW games.
		// Tells us if the player is on an upswing or downswing vs their own baseline.
		const recent = scores.slice(-EMA_WINDOW);
		let ema = recent[0];
		for (let i = 1; i < recent.length; i++) {
			ema = EMA_ALPHA * recent[i] + (1 - EMA_ALPHA) * ema;
		}
		const rawForm = trimmedMean > 0 ? ema / trimmedMean : 1;
		const form = Math.max(FORM_MIN, Math.min(FORM_MAX, rawForm));

		// ── JPR ────────────────────────────────────────────────────────────────
		const jpr = Math.round(output * impact * form * 10) / 10;

		result[seg] = {
			jpr,
			output:       Math.round(output * 10) / 10,
			impact:       Math.round(impact * 1000) / 1000,
			form:         Math.round(form * 1000) / 1000,
			games_played: n,
		};
	}

	return result;
}

/**
 * Upsert JPR rows to Supabase for a single player.
 * Skips segments where JPR is null (< MIN_GAMES).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} playerId
 * @param {ReturnType<typeof calcJPR>} jprResult
 */
export async function saveJPR(supabase, playerId, jprResult) {
	const rows = Object.entries(jprResult)
		.filter(([, v]) => v != null)
		.map(([seg, v]) => ({
			player_id:    playerId,
			segment:      seg,
			jpr:          v.jpr,
			output:       v.output,
			impact:       v.impact,
			form:         v.form,
			games_played: v.games_played,
			updated_at:   new Date().toISOString(),
		}));

	if (rows.length === 0) return;

	await supabase
		.from('player_jpr')
		.upsert(rows, { onConflict: 'player_id,segment' });
}
