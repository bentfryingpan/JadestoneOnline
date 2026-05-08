import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { error } from '@sveltejs/kit';

export async function load({ params, parent }) {
    const { name, code } = params;
    const { user } = await parent();

    const searchRes = await fetch(
        `https://www.bungie.net/Platform/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(name + '#' + code)}/`,
        { headers: { 'X-API-Key': BUNGIE_API_KEY } }
    );

    const searchData = await searchRes.json();

    if (searchData.ErrorCode !== 1 || !searchData.Response.length) {
        throw error(404, 'Player not found');
    }

    let player = searchData.Response.find(p => p.crossSaveOverride === p.membershipType);
    if (!player) player = searchData.Response.find(p => p.membershipType === 3) ?? searchData.Response[0];

    const profileRes = await fetch(
        `https://www.bungie.net/Platform/Destiny2/${player.membershipType}/Profile/${player.membershipId}/?components=100,200,202`,
        { headers: { 'X-API-Key': BUNGIE_API_KEY } }
    );

    const profileData = await profileRes.json();
    const profile = profileData.Response ?? {};

    const characterIds = profile?.profile?.data?.characterIds ?? [];

    let recentMatches = [];
    if (characterIds.length > 0) {
        const actRes = await fetch(
            `https://www.bungie.net/Platform/Destiny2/${player.membershipType}/Account/${player.membershipId}/Character/${characterIds[0]}/Stats/Activities/?mode=63&count=10&page=0`,
            { headers: { 'X-API-Key': BUNGIE_API_KEY } }
        );
        const actData = await actRes.json();
        recentMatches = actData.Response?.activities ?? [];
    }

    // Check claim status
    const { data: dbPlayer } = await supabaseAdmin
        .from('players')
        .select('claimed_by')
        .eq('id', player.membershipId)
        .single();

    const isClaimed = !!dbPlayer?.claimed_by;
    const isOwner = user?.membershipId === player.membershipId;
    const canClaim = isOwner && !isClaimed;

    return {
        player,
        profile,
        recentMatches,
        characterIds,
        isClaimed,
        isOwner,
        canClaim
    };
}
