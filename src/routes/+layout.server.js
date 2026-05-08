import { BUNGIE_API_KEY } from '$env/static/private';

export async function load({ cookies }) {
    const accessToken = cookies.get('bungie_access_token');
    const membershipId = cookies.get('bungie_membership_id');

    if (!accessToken || !membershipId) return { user: null };

    const res = await fetch('https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/', {
        headers: {
            'X-API-Key': BUNGIE_API_KEY,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    const data = await res.json();

    if (data.ErrorCode !== 1) return { user: null };

    const primary = data.Response?.destinyMemberships?.find(
        m => m.crossSaveOverride === m.membershipType
    ) ?? data.Response?.destinyMemberships?.[0];

    return {
        user: {
            displayName: data.Response.bungieNetUser.uniqueName,
            membershipId: primary?.membershipId,
            membershipType: primary?.membershipType
        }
    };
}
