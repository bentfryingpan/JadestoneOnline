/**
 * /auth/link-alt
 *
 * Starts a Bungie OAuth flow for linking an alt account.
 * The `state` param carries the current user's membershipId so the
 * callback knows this is an alt-link (not a normal login) and which
 * primary to link to.
 *
 * The user must already be logged in with a claimed primary account.
 */

import { BUNGIE_CLIENT_ID } from '$env/static/private';
import { redirect, error } from '@sveltejs/kit';

export function GET({ cookies }) {
	const membershipId = cookies.get('bungie_membership_id');
	if (!membershipId) throw error(401, 'You must be logged in to link an alt account.');

	const state = `link_alt:${membershipId}`;

	const params = new URLSearchParams({
		client_id:     BUNGIE_CLIENT_ID,
		response_type: 'code',
		state,
	});

	throw redirect(302, `https://www.bungie.net/en/OAuth/Authorize?${params}`);
}
