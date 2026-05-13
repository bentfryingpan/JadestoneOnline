import { BUNGIE_API_KEY } from '$env/static/private';
import { cacheWrap, AUTH_TTL } from '$lib/server/cache.js';

export async function load({ cookies }) {
	const accessToken = cookies.get('bungie_access_token');
	const membershipId = cookies.get('bungie_membership_id');

	if (!accessToken || !membershipId) return { user: null };

	// Cache the auth check per access-token so we don't call Bungie on every
	// single page navigation. TTL matches our AUTH_TTL (60s).
	const cacheKey = `auth:${accessToken.slice(-16)}`; // use suffix, not full token
	const user = await cacheWrap(cacheKey, AUTH_TTL, async () => {
		try {
			const res = await fetch(
				'https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/',
				{ headers: { 'X-API-Key': BUNGIE_API_KEY, Authorization: `Bearer ${accessToken}` } }
			);
			const data = await res.json();
			if (data.ErrorCode !== 1) return null;

			const primary =
				data.Response?.destinyMemberships?.find((m) => m.crossSaveOverride === m.membershipType) ??
				data.Response?.destinyMemberships?.[0];

			return {
				displayName: data.Response.bungieNetUser.uniqueName,
				membershipId: primary?.membershipId,
				membershipType: primary?.membershipType
			};
		} catch {
			return null;
		}
	});

	return { user };
}
