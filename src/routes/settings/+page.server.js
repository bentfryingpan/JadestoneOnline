import { BUNGIE_API_KEY } from '$env/static/private';
import { error } from '@sveltejs/kit';

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
	const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
	if (!res.ok) throw new Error(`Bungie ${res.status}: ${url}`);
	return res.json();
}

export async function load({ parent }) {
	const { user } = await parent();

	if (!user) return { user: null };

	const { membershipId, membershipType } = user;

	try {
		// Fetch profile to get character IDs and current display name
		const profileData = await bungieGet(
			`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,200`
		);

		const profile = profileData?.Response ?? {};
		const charIds = profile?.profile?.data?.characterIds ?? [];
		const characters = profile?.characters?.data ?? {};

		const bungieGlobalDisplayName = profile?.profile?.data?.userInfo?.bungieGlobalDisplayName;
		const bungieGlobalDisplayNameCode =
			profile?.profile?.data?.userInfo?.bungieGlobalDisplayNameCode;

		return {
			user: {
				...user,
				bungieGlobalDisplayName,
				bungieGlobalDisplayNameCode,
				characterIds: charIds,
				characters
			}
		};
	} catch (e) {
		console.error('Settings load failed', e);
		return { user: null, error: 'Failed to load profile data' };
	}
}
