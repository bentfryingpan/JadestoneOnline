import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { json } from '@sveltejs/kit';

export async function POST({ cookies, request }) {
	const accessToken = cookies.get('bungie_access_token');
	if (!accessToken) return json({ error: 'Not logged in' }, { status: 401 });

	const { membershipId, membershipType, bungieName, bungieCode } = await request.json();

	// Verify the logged-in user actually owns this profile
	const res = await fetch('https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/', {
		headers: {
			'X-API-Key': BUNGIE_API_KEY,
			Authorization: `Bearer ${accessToken}`
		}
	});

	const data = await res.json();
	if (data.ErrorCode !== 1) return json({ error: 'Invalid session' }, { status: 401 });

	const owns = data.Response.destinyMemberships.some((m) => m.membershipId === membershipId);
	if (!owns) return json({ error: 'You do not own this profile' }, { status: 403 });

	// Upsert the player record and mark as claimed
	const { error } = await supabaseAdmin.from('players').upsert(
		{
			id: BigInt(membershipId),
			membership_type: membershipType,
			bungie_name: bungieName,
			bungie_code: String(bungieCode),
			claimed_by: membershipId,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'id' }
	);

	if (error) return json({ error: error.message }, { status: 500 });

	return json({ success: true });
}
