import { redirect } from '@sveltejs/kit';

export function GET({ cookies }) {
    cookies.delete('bungie_access_token', { path: '/' });
    cookies.delete('bungie_membership_id', { path: '/' });
    throw redirect(302, '/');
}
