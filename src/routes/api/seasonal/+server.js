import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { cacheGet, cacheSet } from '$lib/server/cache.js';

const BUNGIE_ROOT = 'https://www.bungie.net';

// 10-minute in-process cache for full career history (expensive multi-page fetch)
const SEASONAL_TTL = 600_000;

// Known Destiny 2 Gambit season date ranges (UTC)
// Seasons are inclusive of start, exclusive of end
const SEASONS = [
    { name: 'Season of the Haunted',  number: 17, start: '2022-05-24', end: '2022-08-23' },
    { name: 'Season of Plunder',       number: 18, start: '2022-08-23', end: '2022-12-06' },
    { name: 'Season of the Seraph',   number: 19, start: '2022-12-06', end: '2023-02-28' },
    { name: 'Season of Defiance',     number: 20, start: '2023-02-28', end: '2023-05-23' },
    { name: 'Season of the Deep',     number: 21, start: '2023-05-23', end: '2023-09-05' },
    { name: 'Season of the Witch',    number: 22, start: '2023-09-05', end: '2023-11-28' },
    { name: 'Season of the Wish',     number: 23, start: '2023-11-28', end: '2024-02-27' },
    { name: 'The Final Shape / Echoes', number: 24, start: '2024-02-27', end: '2024-10-08' },
    { name: 'Revenant',               number: 25, start: '2024-10-08', end: '2025-02-04' },
    { name: 'Heresy',                 number: 26, start: '2025-02-04', end: '2025-05-20' },
    { name: 'Edge of Fate',           number: 27, start: '2025-05-20', end: '2099-01-01' }, // ongoing
];

function seasonForDate(isoDate) {
    for (const s of SEASONS) {
        if (isoDate >= s.start && isoDate < s.end) return s;
    }
    return null;
}

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

// Accumulate stats from an activity entry into a season bucket
function accumulate(bucket, entry) {
    const v   = entry.values ?? {};
    const ext = entry.extended?.values ?? {};

    function n(obj, key) { return obj?.[key]?.basic?.value ?? 0; }

    bucket.activitiesEntered++;
    const standing = n(v, 'standing'); // 0 = win, 1 = loss
    if (standing === 0 && n(v, 'completed') === 1) bucket.wins++;

    bucket.kills             += n(v, 'kills');
    bucket.deaths            += n(v, 'deaths');
    bucket.assists           += n(v, 'assists');
    bucket.motesDeposited    += n(ext, 'motesDeposited');
    bucket.motesDenied       += n(ext, 'motesDenied');
    bucket.motesPickedUp     += n(ext, 'motesPickedUp');
    bucket.motesLost         += n(ext, 'motesLost');
    bucket.invasions         += n(ext, 'invasions');
    bucket.invasionKills     += n(ext, 'invasionKills');
    bucket.invasionsDefeated += n(ext, 'invasionsDefeated');
    bucket.primevalDamage    += n(ext, 'primevalDamage');
    bucket.durationSeconds   += n(v, 'activityDurationSeconds');
}

function emptyBucket(season) {
    return {
        season: season.name,
        seasonNumber: season.number,
        activitiesEntered: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        motesDeposited: 0,
        motesDenied: 0,
        motesPickedUp: 0,
        motesLost: 0,
        invasions: 0,
        invasionKills: 0,
        invasionsDefeated: 0,
        primevalDamage: 0,
        durationSeconds: 0,
    };
}

// Paginate all Gambit history for a single character, returning raw activity entries
async function paginateChar(membershipType, membershipId, charId, maxPages) {
    const allActivities = [];
    for (let page = 0; page < maxPages; page++) {
        const data = await bungieGet(
            `/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=250&page=${page}`
        );
        if (data.ErrorCode !== 1) break;
        const activities = data.Response?.activities ?? [];
        for (const entry of activities) allActivities.push(entry);
        if (activities.length < 250) break; // exhausted
    }
    return allActivities;
}

export async function GET({ url, setHeaders }) {
    // Tell Vercel CDN to cache 5 min; also use in-process cache for same-instance hits
    setHeaders({ 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' });

    const membershipType = url.searchParams.get('membershipType');
    const membershipId   = url.searchParams.get('membershipId');
    // Accept comma-separated charIds to aggregate across all characters
    const charIdsParam   = url.searchParams.get('charIds') ?? url.searchParams.get('charId') ?? '';
    // Default 25 pages × 250 activities = up to 6 250 activities per character (full career for most players)
    const maxPages       = parseInt(url.searchParams.get('maxPages') ?? '25', 10);

    if (!membershipType || !membershipId || !charIdsParam) {
        return json({ error: 'Missing params' }, { status: 400 });
    }

    const charIds = charIdsParam.split(',').map(s => s.trim()).filter(Boolean);

    // ── In-process cache (10 min) ─────────────────────────────────────────────
    // Key includes charIds so a character switch gets fresh data, but the same
    // player viewed twice within the window skips all the Bungie pagination.
    const cacheKey = `seasonal:${membershipId}:${charIds.sort().join(',')}`;
    const cached   = cacheGet(cacheKey);
    if (cached) return json(cached);

    // ── Fetch all characters in parallel ──────────────────────────────────────
    const perCharActivities = await Promise.all(
        charIds.map(cid => paginateChar(membershipType, membershipId, cid, maxPages))
    );

    // Merge all activities and deduplicate by instanceId (same match won't appear on multiple chars)
    const seen    = new Set();
    const buckets = {}; // seasonNumber → bucket

    for (const activities of perCharActivities) {
        for (const entry of activities) {
            const instanceId = entry.activityDetails?.instanceId;
            if (instanceId) {
                if (seen.has(instanceId)) continue;
                seen.add(instanceId);
            }

            const period = (entry.period ?? '').slice(0, 10); // "YYYY-MM-DD"
            if (!period) continue;

            const season = seasonForDate(period);
            if (!season) continue;

            const key = season.number;
            if (!buckets[key]) buckets[key] = emptyBucket(season);
            accumulate(buckets[key], entry);
        }
    }

    const totalActivities = [...seen].length;

    // Convert to array sorted newest first, compute derived stats
    const seasons = Object.values(buckets)
        .sort((a, b) => b.seasonNumber - a.seasonNumber)
        .map(b => ({
            ...b,
            winRate: b.activitiesEntered > 0
                ? +((b.wins / b.activitiesEntered) * 100).toFixed(1)
                : 0,
            kd: b.deaths > 0
                ? +(b.kills / b.deaths).toFixed(2)
                : b.kills,
            avgMotes: b.activitiesEntered > 0
                ? +(b.motesDeposited / b.activitiesEntered).toFixed(1)
                : 0,
            avgInvasions: b.activitiesEntered > 0
                ? +(b.invasions / b.activitiesEntered).toFixed(2)
                : 0,
        }));

    const result = { seasons, totalActivities, charsScanned: charIds.length };

    // Store in process cache — skip if the fetch returned nothing (Bungie might be down)
    if (totalActivities > 0) cacheSet(cacheKey, result, SEASONAL_TTL);

    return json(result);
}
