import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { error } from '@sveltejs/kit';

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

async function manifestItem(hash) {
    const data = await bungieGet(`/Platform/Destiny2/Manifest/DestinyInventoryItemDefinition/${hash}/`);
    return data.Response ?? null;
}

export async function load({ params, parent }) {
    const { name, code } = params;
    const { user } = await parent();

    const searchData = await bungieGet(
        `/Platform/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(name + '#' + code)}/`
    );

    if (searchData.ErrorCode !== 1 || !searchData.Response.length) {
        throw error(404, 'Player not found');
    }

    let player = searchData.Response.find(p => p.crossSaveOverride === p.membershipType);
    if (!player) player = searchData.Response.find(p => p.membershipType === 3) ?? searchData.Response[0];

    const { membershipType, membershipId } = player;

    // Fetch profile with all needed components in parallel with clan
    const [profileData, clanData] = await Promise.all([
        bungieGet(`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,200,202,204,205`),
        bungieGet(`/Platform/GroupV2/User/${membershipType}/${membershipId}/0/1/`)
    ]);

    const profile = profileData.Response ?? {};
    const characterIds = profile?.profile?.data?.characterIds ?? [];
    const characters = profile?.characters?.data ?? {};
    const equipment = profile?.characterEquipment?.data ?? {};
    const progressions = profile?.characterProgressions?.data ?? {};

    // Get clan info
    const clan = clanData.Response?.results?.[0]?.group ?? null;

    // Get most recently played character
    const sortedCharIds = [...characterIds].sort((a, b) =>
        new Date(characters[b]?.dateLastPlayed ?? 0) - new Date(characters[a]?.dateLastPlayed ?? 0)
    );
    const mainCharId = sortedCharIds[0];

    // Fetch recent Gambit matches for main character
    let recentMatches = [];
    if (mainCharId) {
        const actData = await bungieGet(
            `/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${mainCharId}/Stats/Activities/?mode=63&count=15&page=0`
        );
        recentMatches = actData.Response?.activities ?? [];
    }

    // Get equipped items for each character and resolve manifests
    const characterEquipment = {};
    for (const charId of characterIds) {
        const items = equipment[charId]?.items ?? [];
        const resolved = await Promise.all(
            items.slice(0, 8).map(async (item) => {
                const def = await manifestItem(item.itemHash);
                return {
                    hash: item.itemHash,
                    name: def?.displayProperties?.name ?? 'Unknown',
                    icon: def?.displayProperties?.icon ? BUNGIE_ROOT + def.displayProperties.icon : null,
                    tierType: def?.inventory?.tierType,
                    itemType: def?.itemType,
                    itemSubType: def?.itemSubType
                };
            })
        );
        characterEquipment[charId] = resolved;
    }

    // Resolve emblem for main character
    const mainChar = characters[mainCharId];
    let emblemBackground = null;
    if (mainChar?.emblemBackgroundPath) {
        emblemBackground = BUNGIE_ROOT + mainChar.emblemBackgroundPath;
    }

    // Get Gambit rank for main character
    const gambitRankDef = 3008065600; // Infamy progression hash
    const gambitProgression = progressions[mainCharId]?.progressions?.[gambitRankDef];

    // Check claim status
    const { data: dbPlayer } = await supabaseAdmin
        .from('players')
        .select('claimed_by')
        .eq('id', membershipId)
        .single();

    const isClaimed = !!dbPlayer?.claimed_by;
    const isOwner = user?.membershipId === membershipId;
    const canClaim = isOwner && !isClaimed;

    return {
        player,
        profile,
        characters,
        characterIds: sortedCharIds,
        characterEquipment,
        recentMatches,
        clan,
        emblemBackground,
        gambitProgression,
        isClaimed,
        isOwner,
        canClaim
    };
}
