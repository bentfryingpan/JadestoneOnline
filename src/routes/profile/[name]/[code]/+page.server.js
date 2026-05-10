import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { error } from '@sveltejs/kit';
import { cacheWrap, SEARCH_TTL, PROFILE_TTL } from '$lib/server/cache.js';

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!res.ok) throw new Error(`Bungie ${res.status}: ${url}`);
    return res.json();
}

export async function load({ params, parent, url, setHeaders }) {
    const { name, code } = params;

    // Parent (layout.server) is cached — no Bungie call on cache hit
    const { user } = await parent();

    // ── 1. Resolve player ─────────────────────────────────────────────────────
    // Fast path: when navigating from a match page we already have the IDs —
    // skip the Bungie search entirely (avoids 502s for renamed/cross-saved players).
    let membershipType, membershipId;

    const midParam = url.searchParams.get('mid');
    const mtParam  = url.searchParams.get('mt');

    if (midParam && mtParam) {
        membershipId   = midParam;
        membershipType = parseInt(mtParam, 10);
    } else {
        // Slow path: resolve name → IDs via Bungie search (cached 5 min)
        try {
            const searchKey = `search:${name.toLowerCase()}#${code}`;
            const player = await cacheWrap(searchKey, SEARCH_TTL, async () => {
                const d = await bungieGet(
                    `/Platform/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(name + '#' + code)}/`
                );
                if (!d || d.ErrorCode !== 1 || !Array.isArray(d.Response) || !d.Response.length) return null;
                return (
                    d.Response.find(p => p.crossSaveOverride === p.membershipType) ??
                    d.Response.find(p => p.membershipType === 3) ??
                    d.Response[0]
                );
            });

            if (!player?.membershipType || !player?.membershipId) {
                throw error(404, 'Player not found');
            }
            membershipType = player.membershipType;
            membershipId   = player.membershipId;
        } catch (e) {
            if (e?.status) throw e; // re-throw SvelteKit errors
            throw error(502, 'Bungie API unavailable');
        }
    }

    // ── 2. Profile data (cached 60s) + match history fired in parallel ────────
    const profileKey = `profile:${membershipId}`;
    const matchKey   = `matches:${membershipId}`;

    let profileBundle, dbPlayer;
    try {
        [profileBundle, , dbPlayer] = await Promise.all([

            // Profile + clan + stats — cached as one bundle
            cacheWrap(profileKey, PROFILE_TTL, async () => {
                const [profileData, clanData, acctStats] = await Promise.all([
                    bungieGet(`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,200,205`),
                    bungieGet(`/Platform/GroupV2/User/${membershipType}/${membershipId}/0/1/`),
                    bungieGet(`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Stats/?modes=63`),
                ]);
                return { profileData, clanData, acctStats };
            }),

            // placeholder slot (match key resolved below after we have mainCharId)
            cacheWrap(matchKey, PROFILE_TTL, async () => null),

            // Supabase claim check
            supabaseAdmin.from('players').select('claimed_by').eq('id', membershipId).single()
                .then(r => r.data)
                .catch(() => null),
        ]);
    } catch (e) {
        if (e?.status) throw e;
        throw error(502, 'Bungie API unavailable');
    }

    const { profileData, clanData, acctStats } = profileBundle;
    const profile      = profileData?.Response ?? {};
    const charIds      = profile?.profile?.data?.characterIds ?? [];
    const characters   = profile?.characters?.data ?? {};
    const progressions = profile?.characterProgressions?.data ?? {};
    const clan         = clanData?.Response?.results?.[0]?.group ?? null;
    const lifetimeStats= acctStats?.Response?.gambit?.allTime ?? null;

    const sortedCharIds = [...charIds].sort((a, b) =>
        new Date(characters[b]?.dateLastPlayed ?? 0) - new Date(characters[a]?.dateLastPlayed ?? 0)
    );
    const mainCharId = sortedCharIds[0];

    // ── 3. Match history (cached 60s per membershipId+char) ──────────────────
    // Now that we have mainCharId we can fetch properly. Use a char-specific key
    // so switching characters fetches fresh data.
    let recentMatches = [];
    if (mainCharId) {
        const key = `matches:${membershipId}:${mainCharId}`;
        const matchData = await cacheWrap(key, PROFILE_TTL, () =>
            bungieGet(
                `/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${mainCharId}/Stats/Activities/?mode=63&count=25&page=0`
            )
        );
        recentMatches = matchData?.Response?.activities ?? [];
    }

    // ── 4. Claim / ownership ──────────────────────────────────────────────────
    const isClaimed = !!dbPlayer?.claimed_by;
    const isOwner   = user?.membershipId === membershipId;
    const canClaim  = isOwner && !isClaimed;

    // ── 5. Fire-and-forget leaderboard upsert ────────────────────────────────
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

    // ── 6. Tell Vercel CDN it can reuse this SSR response for 30 seconds ─────
    setHeaders({ 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' });

    const mainChar = characters[mainCharId];
    const emblemBg = mainChar?.emblemBackgroundPath ? BUNGIE_ROOT + mainChar.emblemBackgroundPath : null;
    const gambitProgression = progressions[mainCharId]?.progressions?.[3008065600];

    return {
        // Expose the fields the page template expects, using URL params as the
        // canonical name/code (they were already used to resolve the player).
        player: {
            membershipType,
            membershipId,
            bungieGlobalDisplayName:     name,
            bungieGlobalDisplayNameCode: code,
        },
        characters,
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
