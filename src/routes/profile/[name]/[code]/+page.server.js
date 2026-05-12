import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { error } from '@sveltejs/kit';
import { cacheWrap, cacheGet, cacheSet, SEARCH_TTL, PROFILE_TTL } from '$lib/server/cache.js';
import { computeSeasonal } from '$lib/server/seasonal.js';

// 5-minute cache for Supabase claim status (rarely changes)
const CLAIM_TTL = 300_000;

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

    // ── 2. Profile data + Supabase check in parallel ─────────────────────────
    const profileKey = `profile:${membershipId}`;

    let profileBundle, dbPlayer;
    try {
        [profileBundle, dbPlayer] = await Promise.all([

            // Profile + clan + stats — cached as one bundle
            cacheWrap(profileKey, PROFILE_TTL, async () => {
                const [profileData, clanData, acctStats] = await Promise.all([
                    bungieGet(`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,104,200,202,205`),
                    bungieGet(`/Platform/GroupV2/User/${membershipType}/${membershipId}/0/1/`),
                    // groups=1 requests extended stat groups including Gambit-specific metrics
                    bungieGet(`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Stats/?modes=63&groups=1,2`),
                ]);
                return { profileData, clanData, acctStats };
            }),

            // Supabase claim check (cached 5 min — rarely changes)
            (async () => {
                const claimKey    = `claim:${membershipId}`;
                const cachedClaim = cacheGet(claimKey);
                if (cachedClaim !== undefined) return cachedClaim;
                const r = await supabaseAdmin
                    .from('players')
                    .select('claimed_by')
                    .eq('id', membershipId)
                    .single()
                    .then(r => r.data)
                    .catch(() => null);
                cacheSet(claimKey, r, CLAIM_TTL);
                return r;
            })(),
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
    const profileCurrencies = profile?.profileCurrencies?.data?.items ?? [];
    const clan         = clanData?.Response?.results?.[0]?.group ?? null;
    // _statsResults holds all mode keys from GetHistoricalStatsForAccount.
    // The actual key for Gambit varies by Bungie API version — resolved below.
    const _statsResults = acctStats?.Response?.mergedAllCharacters?.results ?? {};

    const sortedCharIds = [...charIds].sort((a, b) =>
        new Date(characters[b]?.dateLastPlayed ?? 0) - new Date(characters[a]?.dateLastPlayed ?? 0)
    );
    const mainCharId = sortedCharIds[0];

    // ── 3. Match history — fetch ALL characters in parallel ──────────────────
    // We cannot rely on mainCharId alone: dateLastPlayed tracks ANY activity,
    // not just Gambit.  A player who runs Crucible daily on their Hunter but
    // only plays Gambit on their Titan would always show the Hunter as
    // mainCharId, making us miss all recent Gambit matches on the Titan.
    // Fix: pull the last 25 Gambit matches for every character simultaneously,
    // deduplicate by instanceId (same match can't appear on two chars), and
    // merge into one recency-sorted list.
    let recentMatches = [];
    if (sortedCharIds.length > 0) {
        const perCharData = await Promise.all(
            sortedCharIds.map(charId => {
                const key = `matches:${membershipId}:${charId}`;
                return cacheWrap(key, PROFILE_TTL, () =>
                    bungieGet(
                        `/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=25&page=0`
                    )
                ).then(d => d?.Response?.activities ?? []);
            })
        );

        const seen   = new Set();
        const merged = [];
        for (const charMatches of perCharData) {
            for (const m of charMatches) {
                const id = m.activityDetails?.instanceId;
                if (id && seen.has(id)) continue;
                if (id) seen.add(id);
                merged.push(m);
            }
        }
        // Sort newest-first, cap at 25
        recentMatches = merged
            .sort((a, b) => new Date(b.period ?? 0) - new Date(a.period ?? 0))
            .slice(0, 25);
    }

    // ── 3b. Resolve lifetime Gambit stats ─────────────────────────────────────
    // Bungie uses different key names in different API versions. We try every
    // known variant, fall back to the character-level endpoint, and finally
    // synthesise approximate values from the 25 recent matches if all else fails.
    let lifetimeStats = _statsResults?.gambit?.allTime
        ?? _statsResults?.pvecomp_gambit?.allTime
        ?? _statsResults?.allPveCompetitive?.allTime
        ?? _statsResults?.allPvECompetitive?.allTime
        // Nuclear: first key that actually has activitiesEntered data
        ?? Object.values(_statsResults).find(
               r => (r?.allTime?.activitiesEntered?.basic?.value ?? 0) > 0
           )?.allTime
        ?? null;

    // Tier-2 fallback: character-level GetHistoricalStats endpoint
    // Structure is Response.{modeKey}.allTime (no mergedAllCharacters wrapper)
    if (!lifetimeStats && mainCharId) {
        try {
            const charStatsKey = `charstats:${membershipId}:${mainCharId}`;
            const charStats = await cacheWrap(charStatsKey, PROFILE_TTL, () =>
                bungieGet(
                    `/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${mainCharId}/Stats/?modes=63`
                )
            );
            const cr = charStats?.Response ?? {};
            lifetimeStats = cr?.gambit?.allTime
                ?? cr?.pvecomp_gambit?.allTime
                ?? cr?.allPveCompetitive?.allTime
                ?? cr?.allPvECompetitive?.allTime
                ?? Object.values(cr).find(
                       r => (r?.allTime?.activitiesEntered?.basic?.value ?? 0) > 0
                   )?.allTime
                ?? null;
        } catch { /* ignore */ }
    }

    // Normalise key: Bungie returns motes as 'motesDeposited' in extended stats
    // but some API versions use 'motesBanked'. Mirror both so downstream code works.
    if (lifetimeStats && !lifetimeStats.motesBanked && lifetimeStats.motesDeposited) {
        lifetimeStats = { ...lifetimeStats, motesBanked: lifetimeStats.motesDeposited };
    }

    // Tier-3 fallback: synthesise from the 25 recent matches we already have.
    // Better than showing nothing — lets the overview render with approximate data.
    if (!lifetimeStats && recentMatches.length > 0) {
        let entered = 0, won = 0, kills = 0, deaths = 0, assists = 0;
        let invasions = 0, invasionKills = 0, invasionsDefeated = 0;
        let motesDeposited = 0, motesDenied = 0, motesPickedUp = 0, motesLost = 0;
        let primevalDamage = 0, superKills = 0, grenadeKills = 0, meleeKills = 0;
        function _n(obj, key) { return obj?.[key]?.basic?.value ?? 0; }
        for (const m of recentMatches) {
            const v = m.values ?? {}, ext = m.extended?.values ?? {};
            if (!_n(v, 'completed')) continue;
            entered++;
            if (_n(v, 'standing') === 0) won++;
            kills   += _n(v, 'kills');
            deaths  += _n(v, 'deaths');
            assists += _n(v, 'assists');
            invasions         += _n(ext, 'invasions');
            invasionKills     += _n(ext, 'invasionKills');
            invasionsDefeated += _n(ext, 'invasionsDefeated');
            motesDeposited    += _n(ext, 'motesDeposited');
            motesDenied       += _n(ext, 'motesDenied');
            motesPickedUp     += _n(ext, 'motesPickedUp');
            motesLost         += _n(ext, 'motesLost');
            primevalDamage    += _n(ext, 'primevalDamage');
            superKills        += _n(ext, 'superKills');
            grenadeKills      += _n(ext, 'grenadeKills');
            meleeKills        += _n(ext, 'meleeKills');
        }
        if (entered > 0) {
            lifetimeStats = {
                activitiesEntered:  { basic: { value: entered } },
                activitiesWon:      { basic: { value: won     } },
                kills:              { basic: { value: kills   } },
                deaths:             { basic: { value: deaths  } },
                assists:            { basic: { value: assists } },
                invasions:          { basic: { value: invasions         } },
                invasionKills:      { basic: { value: invasionKills     } },
                invasionsDefeated:  { basic: { value: invasionsDefeated } },
                motesBanked:        { basic: { value: motesDeposited    } },
                motesDeposited:     { basic: { value: motesDeposited    } },
                motesDenied:        { basic: { value: motesDenied       } },
                motesPickedUp:      { basic: { value: motesPickedUp     } },
                motesLost:          { basic: { value: motesLost         } },
                primevalDamage:     { basic: { value: primevalDamage    } },
                superKills:         { basic: { value: superKills        } },
                grenadeKills:       { basic: { value: grenadeKills      } },
                meleeKills:         { basic: { value: meleeKills        } },
                _synthetic: true,   // flag: computed from recent matches only
            };
        }
    }

    // Detect if we should use Supabase or live API for the summary
    let statsSource = !lifetimeStats
        ? 'none'
        : lifetimeStats._synthetic
            ? 'recent'   // synthesized from last 25 matches
            : 'bungie';  // full lifetime data from Bungie API

    try {
        const { data: pData } = await supabaseAdmin
            .from('players')
            .select('ngr, games_played')
            .eq('id', String(membershipId))
            .single();
        if (pData && pData.games_played > 5) statsSource = 'supabase';
    } catch { }

    // ── 5. Fire-and-forget leaderboard upsert ────────────────────────────────
    if (lifetimeStats) {
        const s       = lifetimeStats;
        const entered = s.activitiesEntered?.basic?.value ?? 0;
        const won     = s.activitiesWon?.basic?.value     ?? 0;
        const kills   = s.kills?.basic?.value             ?? 0;
        const deaths  = s.deaths?.basic?.value            ?? 0;
        supabaseAdmin.from('player_gambit_stats').upsert({
            player_id:          String(membershipId),
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

    // ── 6. CDN caching + streamed seasonal data ───────────────────────────────
    // Give Vercel's CDN 60 s of fresh + 5 min stale-while-revalidate.
    setHeaders({ 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });

    // ── 7. Stream seasonal stats in parallel with SSR ─────────────────────────
    // computeSeasonal checks the in-process cache first — on warm hits it
    // returns instantly and the value is inlined in the initial HTML response.
    // On cold hits it starts the Bungie pagination in parallel with the rest of
    // the SSR and streams the result to the client once ready, eliminating the
    // client-side waterfall (old approach: hydrate → JS runs → fetch → wait).
    const seasonalCacheKey = `seasonal:${membershipId}:${[...sortedCharIds].sort().join(',')}`;
    const cachedSeasonal   = cacheGet(seasonalCacheKey);
    const seasonalStream   = cachedSeasonal != null
        ? cachedSeasonal   // cache hit → inline in initial HTML, no streaming needed
        : sortedCharIds.length > 0
            ? computeSeasonal(membershipType, membershipId, sortedCharIds, 25).catch(() => null)
            : null;         // no characters → null immediately

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
        statsSource,
        clan,
        emblemBg,
        gambitProgression,
        isClaimed, isOwner, canClaim,
        seasonal: seasonalStream,   // Promise (streamed) or resolved value (cache hit)
    };
}
