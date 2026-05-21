/**
 * Destiny 2 Manifest Service
 *
 * Primary source: Bungie's official SQLite manifest (via manifestDb.js)
 *   — synchronous in-process lookups after the first cold-start download
 *   — zero Supabase dependency
 *
 * Fallback: Bungie live JSON API (per-hash endpoint)
 *   — kicks in when SQLite hasn't downloaded yet (first cold start)
 *   — results written to in-process cache so subsequent calls are instant
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
import {
	dbLookup,
	dbGetDefs,
	dbGetRawTable,
	dbGetAllMedals,
	dbGetMedalDef
} from '$lib/server/manifestDb.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const FALLBACK_TTL = 3_600_000; // 1 h — live-API fallback results

async function bungieFetch(url) {
	const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
	if (!res.ok) return null;
	const text = await res.text();
	const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
	return JSON.parse(fixed);
}

/**
 * Single-hash lookup: SQLite → live Bungie API fallback.
 */
async function getDef(tableName, hash) {
	if (!hash) return null;

	// 1. SQLite (in-process, synchronous after warm-up)
	const def = await dbLookup(tableName, hash);
	if (def) return def;

	// 2. Live Bungie API (only on SQLite cold start)
	try {
		const hStr = String(hash >>> 0);
		const data = await bungieFetch(`/Platform/Destiny2/Manifest/${tableName}/${hStr}/`);
		const live = data?.Response;
		if (live) {
			cacheSet(`mdb:${tableName}:${hash}`, live, FALLBACK_TTL);
			return live;
		}
	} catch {}

	return null;
}

// ── Named exports (same API surface as before — nothing else needs changing) ──

export const getItemDef = (h) => getDef('DestinyInventoryItemDefinition', h);
export const getActivityDef = (h) => getDef('DestinyActivityDefinition', h);
export const getStatDef = (h) => getDef('DestinyStatDefinition', h);
export const getSandboxPerkDef = (h) => getDef('DestinySandboxPerkDefinition', h);
export const getDamageTypeDef = (h) => getDef('DestinyDamageTypeDefinition', h);
export const getRecordDef = (h) => getDef('DestinyRecordDefinition', h);
export const getCollectibleDef = (h) => getDef('DestinyCollectibleDefinition', h);
export const getPresentationNodeDef = (h) => getDef('DestinyPresentationNodeDefinition', h);
export const getSeasonDef = (h) => getDef('DestinySeasonDefinition', h);
export const getProgressionDef = (h) => getDef('DestinyProgressionDefinition', h);
export const getObjectiveDef = (h) => getDef('DestinyObjectiveDefinition', h);
export const getBucketDef = (h) => getDef('DestinyInventoryBucketDefinition', h);
export const getSocketTypeDef = (h) => getDef('DestinySocketTypeDefinition', h);
export const getSocketCategoryDef = (h) => getDef('DestinySocketCategoryDefinition', h);
export const getTraitDef = (h) => getDef('DestinyTraitDefinition', h);
export const getClassDef = (h) => getDef('DestinyClassDefinition', h);
export const getRaceDef = (h) => getDef('DestinyRaceDefinition', h);

/**
 * Bulk resolve multiple hashes for one table.
 * Returns { [hash]: def } — same shape as before.
 */
export async function getDefs(tableName, hashes) {
	if (!hashes?.length) return {};
	return dbGetDefs(tableName, hashes);
}

/**
 * Scan an entire definition table (used by map-icons, medal-icons, etc.).
 */
export async function getRawTable(tableName) {
	return dbGetRawTable(tableName);
}

/**
 * All historical stats / medals as { [statId]: def }.
 */
export async function getAllMedals() {
	return dbGetAllMedals();
}

/**
 * Single medal by string stat ID.
 */
export async function getMedalDef(statId) {
	return dbGetMedalDef(statId);
}

/**
 * Resolve stat display names for an array of hashes.
 */
export async function getStatNames(hashes) {
	const defs = await Promise.all(hashes.map((h) => getStatDef(h)));
	return Object.fromEntries(hashes.map((h, i) => [h, defs[i]?.displayProperties?.name ?? null]));
}

/**
 * Map image lookup by activity name — fuzzy match across all activities.
 * Kept for backwards compat; callers that use getRawTable directly are preferred.
 */
export async function getMapImage(mapName) {
	if (!mapName) return null;
	const cleanName = mapName.replace(/^(Gambit[:\-]\s*)/i, '').trim();
	const table = await getRawTable('DestinyActivityDefinition');
	const match = Object.values(table).find((act) =>
		(act.displayProperties?.name ?? '').toLowerCase().includes(cleanName.toLowerCase())
	);
	return match?.pgcrImage ? BUNGIE_ROOT + match.pgcrImage : null;
}

export async function getExoticIconBase64(itemHash) {
	const def = await getItemDef(itemHash);
	if (!def || def.inventory?.tierType !== 6) return null;
	const path = def.displayProperties?.icon;
	if (!path) return null;
	try {
		const res = await fetch(BUNGIE_ROOT + path);
		const buf = await res.arrayBuffer();
		return Buffer.from(buf).toString('base64');
	} catch {
		return null;
	}
}

/**
 * Bulk item lookup (convenience wrapper over getDefs).
 */
export async function getItemDefs(hashes) {
	const map = await getDefs('DestinyInventoryItemDefinition', hashes);
	return hashes.map((h) => map[String(h >>> 0)] ?? null);
}

export const getManifestVersion = async () => 'latest';
export const warmManifest = async () => {};
