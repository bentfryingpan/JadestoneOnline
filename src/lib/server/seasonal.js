/**
 * Seasonal Gambit stats computation.
 *
 * Extracted from api/seasonal so that the profile server-side load can kick
 * off the fetch in parallel with SSR, eliminating the client-side waterfall
 * (browser had to hydrate first, then POST a separate /api/seasonal request).
 *
 * Both api/seasonal and profile/+page.server.js import computeSeasonal().
 * Because they share this module, they also share the in-process cache — a
 * cache miss from a profile load warms the cache for the API endpoint and
 * vice-versa.
 *
 * Cache: 10-minute in-process TTL (expensive multi-page Bungie pagination).
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { cacheGet, cacheSet } from './cache.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const SEASONAL_TTL = 600_000; // 10 min

// Known Destiny 2 Gambit season date ranges (UTC, start inclusive / end exclusive)
const SEASONS = [
	{ name: 'Season of the Haunted', number: 17, start: '2022-05-24', end: '2022-08-23' },
	{ name: 'Season of Plunder', number: 18, start: '2022-08-23', end: '2022-12-06' },
	{ name: 'Season of the Seraph', number: 19, start: '2022-12-06', end: '2023-02-28' },
	{ name: 'Season of Defiance', number: 20, start: '2023-02-28', end: '2023-05-23' },
	{ name: 'Season of the Deep', number: 21, start: '2023-05-23', end: '2023-09-05' },
	{ name: 'Season of the Witch', number: 22, start: '2023-09-05', end: '2023-11-28' },
	{ name: 'Season of the Wish', number: 23, start: '2023-11-28', end: '2024-02-27' },
	{ name: 'The Final Shape / Echoes', number: 24, start: '2024-02-27', end: '2024-10-08' },
	{ name: 'Revenant', number: 25, start: '2024-10-08', end: '2025-02-04' },
	{ name: 'Heresy', number: 26, start: '2025-02-04', end: '2025-05-20' },
	{ name: 'Edge of Fate', number: 27, start: '2025-05-20', end: '2099-01-01' }
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

function accumulate(bucket, entry) {
	const v = entry.values ?? {};
	const ext = entry.extended?.values ?? {};
	function n(obj, key) {
		return obj?.[key]?.basic?.value ?? 0;
	}

	bucket.activitiesEntered++;
	const standing = n(v, 'standing'); // 0 = win, 1 = loss
	if (standing === 0 && n(v, 'completed') === 1) bucket.wins++;

	bucket.kills += n(v, 'kills');
	bucket.deaths += n(v, 'deaths');
	bucket.assists += n(v, 'assists');
	bucket.motesDeposited += n(ext, 'motesDeposited') || n(ext, 'motesBanked');
	bucket.motesDenied += n(ext, 'motesDenied');
	bucket.motesPickedUp += n(ext, 'motesPickedUp');
	bucket.motesLost += n(ext, 'motesLost');
	bucket.invasions += n(ext, 'invasions');
	bucket.invasionKills += n(ext, 'invasionKills') || n(ext, 'invaderKills');
	bucket.invasionsDefeated += n(ext, 'invasionsDefeated');
	bucket.invaderDeaths += n(ext, 'invaderDeaths') || n(ext, 'invasionDeaths');
	bucket.primevalDamage += n(ext, 'primevalDamage');
	bucket.durationSeconds += n(v, 'activityDurationSeconds');

	bucket.meleeKills += n(ext, 'weaponKillsMelee');
	bucket.grenadeKills += n(ext, 'weaponKillsGrenade');
	bucket.superKills += n(ext, 'weaponKillsSuper');
	bucket.smallBlockersSent += n(ext, 'smallBlockersSent');
	bucket.mediumBlockersSent += n(ext, 'mediumBlockersSent');
	bucket.largeBlockersSent += n(ext, 'largeBlockersSent');
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
		invaderDeaths: 0,
		primevalDamage: 0,
		durationSeconds: 0,
		meleeKills: 0,
		grenadeKills: 0,
		superKills: 0,
		smallBlockersSent: 0,
		mediumBlockersSent: 0,
		largeBlockersSent: 0
	};
}

async function paginateChar(membershipType, membershipId, charId, maxPages) {
	const all = [];
	for (let page = 0; page < maxPages; page++) {
		const data = await bungieGet(
			`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=250&page=${page}`
		);
		if (data.ErrorCode !== 1) break;
		const activities = data.Response?.activities ?? [];
		all.push(...activities);
		if (activities.length < 250) break;
	}
	return all;
}

/**
 * Compute (or return from cache) seasonal Gambit stats for a player.
 *
 * @param {string|number} membershipType
 * @param {string}        membershipId
 * @param {string[]}      charIds       - all character IDs to aggregate
 * @param {number}        [maxPages=25] - max pages per character (25 × 250 = 6 250 activities)
 * @returns {Promise<{ seasons: object[], totalActivities: number, charsScanned: number }>}
 */
export async function computeSeasonal(membershipType, membershipId, charIds, maxPages = 25) {
	const sortedIds = [...charIds].sort();
	const cacheKey = `seasonal:v2:${membershipId}:${sortedIds.join(',')}`;

	const cached = cacheGet(cacheKey);
	if (cached) return cached;

	// Fetch all characters in parallel, then deduplicate by instanceId
	const perCharActivities = await Promise.all(
		sortedIds.map((cid) => paginateChar(membershipType, membershipId, cid, maxPages))
	);

	const seen = new Set();
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

	const totalActivities = seen.size;

	const seasons = Object.values(buckets)
		.sort((a, b) => b.seasonNumber - a.seasonNumber)
		.map((b) => ({
			...b,
			winRate: b.activitiesEntered > 0 ? +((b.wins / b.activitiesEntered) * 100).toFixed(1) : 0,
			kd: b.deaths > 0 ? +(b.kills / b.deaths).toFixed(2) : b.kills,
			avgMotes: b.activitiesEntered > 0 ? +(b.motesDeposited / b.activitiesEntered).toFixed(1) : 0,
			avgInvasions: b.activitiesEntered > 0 ? +(b.invasions / b.activitiesEntered).toFixed(2) : 0
		}));

	const result = { seasons, totalActivities, charsScanned: sortedIds.length };

	// Only cache when we actually got data (Bungie may be down on empty results)
	if (totalActivities > 0) cacheSet(cacheKey, result, SEASONAL_TTL);

	return result;
}
