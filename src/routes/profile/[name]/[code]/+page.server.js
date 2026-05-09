import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { error } from '@sveltejs/kit';

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

export async function load({ params, parent }) {
    const { name, code } = params;
    const { user } = await parent();

    // ── 1. Resolve player ──────────────────────────────────────────────────────
    let searchData;
    try {
        searchData = await bungieGet(
            `/Platform/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(name + '#' + code)}/`
        );
    } catch {
        throw error(502, 'Bungie API unavailable');
    }

    if (!searchData || searchData.ErrorCode !== 1 || !Array.isArray(searchData.Response) || !searchData.Response.length) {
        throw error(404, 'Player not found');
    }

    let player = searchData.Response.find(p => p.crossSaveOverride === p.membershipType)
              ?? searchData.Response.find(p => p.membershipType === 3)
              ?? searchData.Response[0];

    if (!player?.membershipType || !player?.membershipId) {
        throw error(404, 'Player not found');
    }

    const { membershipType, membershipId } = player;

    // ── 2. Parallel: core profile + clan + gambit lifetime stats ──────────────
    // Components: 100=profile basics, 200=characters, 205=progressions
    // Intentionally excludes 202/304/305 (equipment/sockets) — loaded lazily
    const [profileData, clanData, acctStats] = await Promise.all([
        bungieGet(`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,200,205`),
        bungieGet(`/Platform/GroupV2/User/${membershipType}/${membershipId}/0/1/`),
        bungieGet(`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Stats/?modes=63`),
    ]);

    const profile      = profileData.Response ?? {};
    const charIds      = profile?.profile?.data?.characterIds ?? [];
    const characters   = profile?.characters?.data ?? {};
    const progressions = profile?.characterProgressions?.data ?? {};
    const clan         = clanData.Response?.results?.[0]?.group ?? null;
    const lifetimeStats = acctStats.Response?.gambit?.allTime ?? null;

    const sortedCharIds = [...charIds].sort((a, b) =>
        new Date(characters[b]?.dateLastPlayed ?? 0) - new Date(characters[a]?.dateLastPlayed ?? 0)
    );
    const mainCharId = sortedCharIds[0];

    // ── 3. Recent Gambit matches (needs main char ID) ─────────────────────────
    let recentMatches = [];
    if (mainCharId) {
        const matchData = await bungieGet(
            `/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${mainCharId}/Stats/Activities/?mode=63&count=25&page=0`
        );
        recentMatches = matchData.Response?.activities ?? [];
    }

    // ── 4. Claim status ────────────────────────────────────────────────────────
    const { data: dbPlayer } = await supabaseAdmin
        .from('players').select('claimed_by').eq('id', membershipId).single();
    const isClaimed = !!dbPlayer?.claimed_by;
    const isOwner   = user?.membershipId === membershipId;
    const canClaim  = isOwner && !isClaimed;

    // ── 5. Passive leaderboard upsert (fire-and-forget) ───────────────────────
    if (lifetimeStats) {
        const s       = lifetimeStats;
        const entered = s.activitiesEntered?.basic?.value ?? 0;
        const won     = s.activitiesWon?.basic?.value     ?? 0;
        const kills   = s.kills?.basic?.value             ?? 0;
        const deaths  = s.deaths?.basic?.value            ?? 0;
        supabaseAdmin.from('player_gambit_stats').upsert({
            player_id:          parseInt(membershipId),
            bungie_name:        name,
            bungie_code:        code,
            membership_type:    membershipType,
            activities_entered: entered,
            activities_won:     won,
            kills, deaths,
            assists:            s.assists?.basic?.value           ?? 0,
            invasions:          s.invasions?.basic?.value         ?? 0,
            invasion_kills:     s.invasionKills?.basic?.value     ?? 0,
            invasions_defeated: s.invasionsDefeated?.basic?.value ?? 0,
            motes_deposited:    s.motesBanked?.basic?.value       ?? 0,
            motes_lost:         s.motesLost?.basic?.value         ?? 0,
            kd_ratio:   deaths  > 0 ? +(kills / deaths).toFixed(2)         : kills,
            win_rate:   entered > 0 ? +((won  / entered) * 100).toFixed(1) : 0,
            updated_at: new Date().toISOString()
        }, { onConflict: 'player_id' }).then(() => {});
    }

    const mainChar = characters[mainCharId];
    const emblemBg = mainChar?.emblemBackgroundPath ? BUNGIE_ROOT + mainChar.emblemBackgroundPath : null;
    const gambitProgression = progressions[mainCharId]?.progressions?.[3008065600];

    return {
        player, characters,
        characterIds: sortedCharIds,
        membershipType, membershipId,
        recentMatches,
        lifetimeStats,
        clan,
        emblemBg,
        gambitProgression,
        isClaimed, isOwner, canClaim
    };
}
