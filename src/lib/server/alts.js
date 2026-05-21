/**
 * Alt account group utilities.
 *
 * An alt group has exactly one primary player and zero or more alt players.
 * All accounts in a group share the same JPR/rating, computed from their
 * combined match history.
 */

import { calcJPR, saveJPR } from '$lib/server/jpr.js';

/**
 * Given any player ID (primary or alt), return the full group.
 * @returns {{ primaryId: string, altIds: string[], allIds: string[] } | null}
 */
export async function getAltGroup(db, playerId) {
	const id = String(playerId);

	// Is this player a primary with alts?
	const { data: asAlts } = await db
		.from('alt_accounts')
		.select('alt_player_id')
		.eq('primary_player_id', id);

	if (asAlts?.length) {
		const altIds = asAlts.map((r) => String(r.alt_player_id));
		return { primaryId: id, altIds, allIds: [id, ...altIds] };
	}

	// Is this player an alt of someone else?
	const { data: asPrimary } = await db
		.from('alt_accounts')
		.select('primary_player_id')
		.eq('alt_player_id', id)
		.single();

	if (asPrimary) {
		const primaryId = String(asPrimary.primary_player_id);
		const { data: siblings } = await db
			.from('alt_accounts')
			.select('alt_player_id')
			.eq('primary_player_id', primaryId);
		const altIds = (siblings ?? []).map((r) => String(r.alt_player_id));
		return { primaryId, altIds, allIds: [primaryId, ...altIds] };
	}

	return null; // not in any alt group
}

/**
 * Recompute JPR from the combined match history of all accounts in a group,
 * then write that identical JPR to every account in the group.
 *
 * Safe to call for any account — if it's not in an alt group it's a no-op.
 */
export async function recomputeGroupJPR(db, playerId) {
	const group = await getAltGroup(db, playerId);
	if (!group || group.allIds.length < 2) return; // no group or solo — nothing to sync

	// Fetch combined matches for all accounts (last 500 per account for perf)
	const { data: allMatches } = await db
		.from('matches')
		.select('ego_score, outcome, fireteam_size, period')
		.in('player_id', group.allIds)
		.not('ego_score', 'is', null)
		.order('period', { ascending: false })
		.limit(500 * group.allIds.length);

	if (!allMatches?.length) return;

	// Remove duplicate instance matches (same game, different linked account)
	// De-dupe by (period, fireteam_size, outcome, ego_score) as a practical proxy
	const seen = new Set();
	const deduped = allMatches.filter((m) => {
		const key = `${m.period}|${m.fireteam_size}|${m.outcome}|${m.ego_score}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	const jprResult = calcJPR(deduped);

	// Write the same JPR to every account in the group
	await Promise.all(group.allIds.map((id) => saveJPR(db, id, jprResult)));
}
