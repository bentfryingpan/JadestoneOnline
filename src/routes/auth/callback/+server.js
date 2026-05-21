import { BUNGIE_CLIENT_ID, BUNGIE_CLIENT_SECRET, BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { redirect } from '@sveltejs/kit';
import { recomputeGroupJPR } from '$lib/server/alts.js';

export async function GET({ url, cookies }) {
	const code  = url.searchParams.get('code');
	const state = url.searchParams.get('state') ?? '';

	if (!code) throw redirect(302, '/');

	const res = await fetch('https://www.bungie.net/platform/app/oauth/token/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type:    'authorization_code',
			code,
			client_id:     BUNGIE_CLIENT_ID,
			client_secret: BUNGIE_CLIENT_SECRET
		})
	});

	const tokens = await res.json();
	if (!tokens.access_token) throw redirect(302, '/');

	// ── Alt-link flow ────────────────────────────────────────────────────────
	if (state.startsWith('link_alt:')) {
		const primaryId = state.replace('link_alt:', '');
		const altId     = String(tokens.membership_id);

		// Resolve the alt's primary Bungie membership (cross-save aware)
		let altMembershipType = 3;
		try {
			const mr = await fetch('https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/', {
				headers: { 'X-API-Key': BUNGIE_API_KEY, Authorization: `Bearer ${tokens.access_token}` }
			});
			const md = await mr.json();
			if (md.ErrorCode === 1) {
				const primary =
					md.Response?.destinyMemberships?.find((m) => m.crossSaveOverride === m.membershipType) ??
					md.Response?.destinyMemberships?.[0];
				if (primary?.membershipId) {
					altMembershipType = primary.membershipType ?? 3;
				}
			}
		} catch {}

		// Validate: can't link yourself, can't link an account already claimed as primary
		if (altId === primaryId) {
			throw redirect(302, `/auth/link-alt/result?error=self`);
		}

		// Check alt isn't already a primary with its own alts
		const { data: altHasAlts } = await supabaseAdmin
			.from('alt_accounts')
			.select('id')
			.eq('primary_player_id', altId)
			.limit(1);
		if (altHasAlts?.length) {
			throw redirect(302, `/auth/link-alt/result?error=has_alts`);
		}

		// Check alt isn't already linked to a different primary
		const { data: existing } = await supabaseAdmin
			.from('alt_accounts')
			.select('primary_player_id')
			.eq('alt_player_id', altId)
			.single();
		if (existing && String(existing.primary_player_id) !== primaryId) {
			throw redirect(302, `/auth/link-alt/result?error=already_linked`);
		}

		// Upsert the alt link
		const { error: linkErr } = await supabaseAdmin
			.from('alt_accounts')
			.upsert(
				{ primary_player_id: primaryId, alt_player_id: altId, verified_at: new Date().toISOString() },
				{ onConflict: 'alt_player_id' }
			);

		if (linkErr) {
			throw redirect(302, `/auth/link-alt/result?error=db`);
		}

		// Ensure the alt exists in players table
		await supabaseAdmin
			.from('players')
			.upsert({ id: altId, membership_type: altMembershipType }, { onConflict: 'id', ignoreDuplicates: true });

		// Recompute combined JPR for the group (fire-and-forget)
		recomputeGroupJPR(supabaseAdmin, primaryId).catch(() => {});

		// Redirect back to the primary's profile — session cookies unchanged
		throw redirect(302, `/auth/link-alt/result?success=1&primary=${primaryId}`);
	}

	// ── Normal login flow ────────────────────────────────────────────────────
	cookies.set('bungie_access_token', tokens.access_token, {
		path:     '/',
		httpOnly: true,
		maxAge:   tokens.expires_in
	});

	cookies.set('bungie_membership_id', String(tokens.membership_id), {
		path:     '/',
		httpOnly: true,
		maxAge:   60 * 60 * 24 * 30
	});

	throw redirect(302, '/');
}
