/**
 * PATCH /api/profile/badges
 *
 * Saves the player's chosen pinned award keys to their profile.
 * Only the authenticated owner of the profile may update.
 *
 * Body: { playerMembershipId: "...", pinnedAwardKeys: ["26:jpr_overall", "25:motes"] }
 * Max 5 pinned awards.
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';

export async function PATCH({ request, cookies }) {
	// Auth — must be logged in
	const membershipId = cookies.get('bungie_membership_id');
	if (!membershipId) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const body = await request.json().catch(() => ({}));
	const { playerMembershipId, pinnedAwardKeys } = body;

	if (!playerMembershipId) {
		return json({ error: 'Missing playerMembershipId' }, { status: 400 });
	}

	// Only the owner can update their own badges
	if (String(membershipId) !== String(playerMembershipId)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	if (!Array.isArray(pinnedAwardKeys)) {
		return json({ error: 'pinnedAwardKeys must be an array' }, { status: 400 });
	}

	// Validate format: each key should be "season:slug"
	const valid = pinnedAwardKeys.every(
		(k) => typeof k === 'string' && /^\d+:[a-z_]+$/.test(k)
	);
	if (!valid) {
		return json({ error: 'Invalid key format' }, { status: 400 });
	}

	// Cap at 5 pinned awards
	const keys = pinnedAwardKeys.slice(0, 5);

	// Verify that each key actually belongs to this player
	if (keys.length > 0) {
		const { data: owned } = await supabaseAdmin
			.from('player_season_awards')
			.select('season, slug')
			.eq('player_id', String(playerMembershipId));

		const ownedSet = new Set((owned ?? []).map((r) => `${r.season}:${r.slug}`));
		const allOwned = keys.every((k) => ownedSet.has(k));
		if (!allOwned) {
			return json({ error: 'One or more awards not owned by player' }, { status: 400 });
		}
	}

	const { error: updateErr } = await supabaseAdmin
		.from('players')
		.update({ pinned_award_keys: keys })
		.eq('id', String(playerMembershipId));

	if (updateErr) {
		return json({ error: updateErr.message }, { status: 500 });
	}

	return json({ ok: true, pinnedAwardKeys: keys });
}
