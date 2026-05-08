import { BUNGIE_CLIENT_ID, BUNGIE_CLIENT_SECRET } from '$env/static/private';
import { redirect } from '@sveltejs/kit';

export async function GET({ url, cookies }) {
    const code = url.searchParams.get('code');

    if (!code) throw redirect(302, '/');

    const res = await fetch('https://www.bungie.net/platform/app/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: BUNGIE_CLIENT_ID,
            client_secret: BUNGIE_CLIENT_SECRET
        })
    });

    const tokens = await res.json();

    if (!tokens.access_token) throw redirect(302, '/');

    cookies.set('bungie_access_token', tokens.access_token, {
        path: '/',
        httpOnly: true,
        maxAge: tokens.expires_in
    });

    cookies.set('bungie_membership_id', String(tokens.membership_id), {
        path: '/',
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30
    });

    throw redirect(302, '/');
}
