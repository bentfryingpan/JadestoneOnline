import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
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
	const idStr = String(membershipId);

	try {
		// Fetch profile + alt data in parallel
		const [profileData, altAccounts, isAltOf] = await Promise.all([
			bungieGet(`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,200`),
			// Alts that belong to this primary account
			supabaseAdmin
				.from('alt_accounts')
				.select('alt_player_id, verified_at, players!alt_accounts_alt_player_id_fkey(bungie_name, bungie_code, membership_type)')
				.eq('primary_player_id', idStr)
				.order('verified_at', { ascending: true })
				.then(r => r.data ?? [])
				.catch(() => []),
			// Check if this account is itself an alt of someone
			supabaseAdmin
				.from('alt_accounts')
				.select('primary_player_id, players!alt_accounts_primary_player_id_fkey(bungie_name, bungie_code)')
				.eq('alt_player_id', idStr)
				.single()
				.then(r => r.data ?? null)
				.catch(() => null),
		]);

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
			},
			altAccounts: altAccounts.map(a => ({
				altId:      String(a.alt_player_id),
				name:       a.players?.bungie_name ?? null,
				code:       a.players?.bungie_code ?? null,
				mt:         a.players?.membership_type ?? 3,
				verifiedAt: a.verified_at,
			})),
			isAltOf: isAltOf ? {
				primaryId: String(isAltOf.primary_player_id),
				name: isAltOf.players?.bungie_name ?? null,
				code: isAltOf.players?.bungie_code ?? null,
			} : null,
		};
	} catch (e) {
		console.error('Settings load failed', e);
		return { user: null, error: 'Failed to load profile data' };
	}
}
