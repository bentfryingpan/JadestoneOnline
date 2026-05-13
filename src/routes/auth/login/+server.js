import { BUNGIE_CLIENT_ID } from '$env/static/private';
import { redirect } from '@sveltejs/kit';

export function GET() {
	const params = new URLSearchParams({
		client_id: BUNGIE_CLIENT_ID,
		response_type: 'code'
	});

	throw redirect(302, `https://www.bungie.net/en/OAuth/Authorize?${params}`);
}
