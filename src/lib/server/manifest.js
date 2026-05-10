/**
 * Destiny 2 Manifest Service
 *
 * Bulk-downloads every useful definition table from the Bungie manifest and
 * exposes typed lookup functions. Tables are cached in-memory keyed by the
 * manifest version string (e.g. "100.2025.04.30.01-4") so they are
 * automatically refreshed on patch days with zero extra logic.
 *
 * Cache lifetime: 24 hours (MANIFEST_BULK_TTL).  That's safe because:
 *   - Bungie only pushes a new manifest on patch/hotfix days.
 *   - The version key changes whenever Bungie does, so stale data is never
 *     served after a patch — the new version key produces a cache miss and
 *     triggers a fresh download.
 *
 * Usage:
 *   import { getItemDef, getMedalDef, getStatDef, ... } from '$lib/server/manifest.js';
 *   const def = await getItemDef(1234567890);
 *
 * Available lookups (all async, hash → definition object | null):
 *   getItemDef            DestinyInventoryItemDefinition
 *   getStatDef            DestinyStatDefinition
 *   getDamageTypeDef      DestinyDamageTypeDefinition
 *   getEnergyTypeDef      DestinyEnergyTypeDefinition
 *   getActivityDef        DestinyActivityDefinition
 *   getActivityModeDef    DestinyActivityModeDefinition
 *   getSeasonDef          DestinySeasonDefinition
 *   getProgressionDef     DestinyProgressionDefinition
 *   getSocketTypeDef      DestinySocketTypeDefinition
 *   getSocketCategoryDef  DestinySocketCategoryDefinition
 *   getClassDef           DestinyClassDefinition
 *   getRaceDef            DestinyRaceDefinition
 *   getBreakerTypeDef     DestinyBreakerTypeDefinition
 *   getItemCategoryDef    DestinyItemCategoryDefinition
 *   getTraitDef           DestinyTraitDefinition
 *   getMilestoneDef       DestinyMilestoneDefinition
 *   getMetricDef          DestinyMetricDefinition
 *   getObjectiveDef       DestinyObjectiveDefinition
 *   getBucketDef          DestinyInventoryBucketDefinition
 *   getLoreBookDef        DestinyLoreDefinition
 *   getRecordDef          DestinyRecordDefinition
 *   getCollectibleDef     DestinyCollectibleDefinition
 *   getPresentationNodeDef DestinyPresentationNodeDefinition
 *   getTalentGridDef      DestinyTalentGridDefinition
 *   getSandboxPerkDef     DestinySandboxPerkDefinition
 *   getMaterialRequirement DestinyMaterialRequirementSetDefinition
 *   getVendorDef          DestinyVendorDefinition
 *   getArtifactDef        DestinyArtifactDefinition
 *
 *   getMedalDef(statId)   DestinyHistoricalStatsDefinition (medals / historical stats)
 *   getAllMedals()         Full medals table as a plain object
 *
 *   warmManifest()        Pre-fetches ALL tables eagerly (call from hooks.server.js)
 *   getManifestVersion()  Returns the current manifest version string
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { cacheGet, cacheSet } from './cache.js';

const BUNGIE_ROOT   = 'https://www.bungie.net';
const VERSION_TTL   =  3_600_000;   // 1 h  — re-check manifest version every hour
const TABLE_TTL     = 86_400_000;   // 24 h — individual tables live a full day

// ---------------------------------------------------------------------------
// All component names we want to bulk-download.
// The key is used as a short handle; the value is the exact Bungie component
// name (used in jsonWorldComponentContentPaths).
// ---------------------------------------------------------------------------
const COMPONENTS = {
    item:               'DestinyInventoryItemDefinition',
    stat:               'DestinyStatDefinition',
    damageType:         'DestinyDamageTypeDefinition',
    energyType:         'DestinyEnergyTypeDefinition',
    activity:           'DestinyActivityDefinition',
    activityMode:       'DestinyActivityModeDefinition',
    activityType:       'DestinyActivityTypeDefinition',
    season:             'DestinySeasonDefinition',
    progression:        'DestinyProgressionDefinition',
    socketType:         'DestinySocketTypeDefinition',
    socketCategory:     'DestinySocketCategoryDefinition',
    class:              'DestinyClassDefinition',
    race:               'DestinyRaceDefinition',
    gender:             'DestinyGenderDefinition',
    breakerType:        'DestinyBreakerTypeDefinition',
    itemCategory:       'DestinyItemCategoryDefinition',
    trait:              'DestinyTraitDefinition',
    milestone:          'DestinyMilestoneDefinition',
    metric:             'DestinyMetricDefinition',
    objective:          'DestinyObjectiveDefinition',
    bucket:             'DestinyInventoryBucketDefinition',
    lore:               'DestinyLoreDefinition',
    record:             'DestinyRecordDefinition',
    collectible:        'DestinyCollectibleDefinition',
    presentationNode:   'DestinyPresentationNodeDefinition',
    talentGrid:         'DestinyTalentGridDefinition',
    sandboxPerk:        'DestinySandboxPerkDefinition',
    materialRequirement:'DestinyMaterialRequirementSetDefinition',
    vendor:             'DestinyVendorDefinition',
    artifact:           'DestinyArtifactDefinition',
    checklistEntry:     'DestinyChecklistDefinition',
    powerCap:           'DestinyPowerCapDefinition',
    energyCapacity:     'DestinyEnergyCapacityEntryDefinition',
};

// DestinyHistoricalStatsDefinition is NOT a world component — it lives at a
// separate endpoint and is keyed by string IDs, not hashes.
const HISTORICAL_STATS_URL = '/Platform/Destiny2/Stats/Definition/';

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, {
        headers: { 'X-API-Key': BUNGIE_API_KEY },
    });
    if (!res.ok) throw new Error(`Bungie ${res.status}: ${url}`);
    return res.json();
}

async function bungieGetAbsolute(absoluteUrl) {
    const res = await fetch(absoluteUrl, {
        headers: { 'X-API-Key': BUNGIE_API_KEY },
    });
    if (!res.ok) throw new Error(`Bungie ${res.status}: ${absoluteUrl}`);
    return res.json();
}

// ---------------------------------------------------------------------------
// Version resolution
// ---------------------------------------------------------------------------

/** Returns the current manifest version string (cached 1 h). */
export async function getManifestVersion() {
    const cached = cacheGet('manifest:version');
    if (cached !== undefined) return cached;

    const data    = await bungieGet('/Platform/Destiny2/Manifest/');
    const version = data?.Response?.version ?? null;
    if (version) cacheSet('manifest:version', version, VERSION_TTL);
    return version;
}

/**
 * Returns the full manifest Response object (paths + version, cached 1 h).
 * Includes `jsonWorldComponentContentPaths` and `jsonWorldContentPaths`.
 */
async function getManifestMeta() {
    const cached = cacheGet('manifest:meta');
    if (cached !== undefined) return cached;

    const data = await bungieGet('/Platform/Destiny2/Manifest/');
    const meta = data?.Response ?? null;
    if (meta) cacheSet('manifest:meta', meta, VERSION_TTL);
    return meta;
}

// ---------------------------------------------------------------------------
// Bulk table downloader
// ---------------------------------------------------------------------------

/**
 * Downloads a single world-component table and returns the result as a
 * plain object mapping hash → definition.
 *
 * Cached under `manifest:table:{version}:{componentName}` for TABLE_TTL so
 * a patch day automatically invalidates all cached tables.
 */
async function fetchTable(componentName) {
    const meta = await getManifestMeta();
    if (!meta) throw new Error('Could not fetch manifest metadata');

    const version  = meta.version;
    const cacheKey = `manifest:table:${version}:${componentName}`;

    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    const path = meta?.jsonWorldComponentContentPaths?.en?.[componentName];
    if (!path) {
        console.warn(`[manifest] No path for ${componentName}`);
        cacheSet(cacheKey, {}, TABLE_TTL);
        return {};
    }

    try {
        const table = await bungieGetAbsolute(BUNGIE_ROOT + path);
        cacheSet(cacheKey, table, TABLE_TTL);
        return table;
    } catch (err) {
        console.error(`[manifest] Failed to fetch ${componentName}:`, err.message);
        return {};
    }
}

/**
 * Downloads the DestinyHistoricalStatsDefinition (medals / PGCR stats).
 * Keyed by string identifiers (e.g. "kills", "weaponKillsAutoRifle"), not hashes.
 */
async function fetchHistoricalStats() {
    const meta = await getManifestMeta();
    const version  = meta?.version ?? 'unknown';
    const cacheKey = `manifest:table:${version}:DestinyHistoricalStatsDefinition`;

    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    try {
        const data  = await bungieGet(HISTORICAL_STATS_URL);
        const table = data?.Response ?? {};
        cacheSet(cacheKey, table, TABLE_TTL);
        return table;
    } catch (err) {
        console.error('[manifest] Failed to fetch HistoricalStats:', err.message);
        return {};
    }
}

// ---------------------------------------------------------------------------
// Generic lookup factory
// ---------------------------------------------------------------------------

/**
 * Returns a lookup function: (hash) => definition | null
 * The hash can be a number or numeric string; Bungie JSON uses signed-int keys.
 */
function makeLookup(componentName) {
    return async function lookup(hash) {
        if (hash == null) return null;
        const table = await fetchTable(componentName);
        // Bungie hashes are 32-bit unsigned stored as signed ints in JSON.
        // Accept both positive and negative representations.
        const key = String(hash >>> 0);          // treat as unsigned
        const neg = String(hash | 0);            // treat as signed (may be negative)
        return table[key] ?? table[neg] ?? table[String(hash)] ?? null;
    };
}

// ---------------------------------------------------------------------------
// Public lookup functions
// ---------------------------------------------------------------------------

export const getItemDef             = makeLookup('DestinyInventoryItemDefinition');
export const getStatDef             = makeLookup('DestinyStatDefinition');
export const getDamageTypeDef       = makeLookup('DestinyDamageTypeDefinition');
export const getEnergyTypeDef       = makeLookup('DestinyEnergyTypeDefinition');
export const getActivityDef         = makeLookup('DestinyActivityDefinition');
export const getActivityModeDef     = makeLookup('DestinyActivityModeDefinition');
export const getActivityTypeDef     = makeLookup('DestinyActivityTypeDefinition');
export const getSeasonDef           = makeLookup('DestinySeasonDefinition');
export const getProgressionDef      = makeLookup('DestinyProgressionDefinition');
export const getSocketTypeDef       = makeLookup('DestinySocketTypeDefinition');
export const getSocketCategoryDef   = makeLookup('DestinySocketCategoryDefinition');
export const getClassDef            = makeLookup('DestinyClassDefinition');
export const getRaceDef             = makeLookup('DestinyRaceDefinition');
export const getGenderDef           = makeLookup('DestinyGenderDefinition');
export const getBreakerTypeDef      = makeLookup('DestinyBreakerTypeDefinition');
export const getItemCategoryDef     = makeLookup('DestinyItemCategoryDefinition');
export const getTraitDef            = makeLookup('DestinyTraitDefinition');
export const getMilestoneDef        = makeLookup('DestinyMilestoneDefinition');
export const getMetricDef           = makeLookup('DestinyMetricDefinition');
export const getObjectiveDef        = makeLookup('DestinyObjectiveDefinition');
export const getBucketDef           = makeLookup('DestinyInventoryBucketDefinition');
export const getLoreBookDef         = makeLookup('DestinyLoreDefinition');
export const getRecordDef           = makeLookup('DestinyRecordDefinition');
export const getCollectibleDef      = makeLookup('DestinyCollectibleDefinition');
export const getPresentationNodeDef = makeLookup('DestinyPresentationNodeDefinition');
export const getTalentGridDef       = makeLookup('DestinyTalentGridDefinition');
export const getSandboxPerkDef      = makeLookup('DestinySandboxPerkDefinition');
export const getMaterialRequirement = makeLookup('DestinyMaterialRequirementSetDefinition');
export const getVendorDef           = makeLookup('DestinyVendorDefinition');
export const getArtifactDef         = makeLookup('DestinyArtifactDefinition');
export const getPowerCapDef         = makeLookup('DestinyPowerCapDefinition');

// DestinyHistoricalStatsDefinition uses string keys, not numeric hashes.
export async function getMedalDef(statId) {
    if (!statId) return null;
    const table = await fetchHistoricalStats();
    return table[statId] ?? null;
}

/** Returns the FULL medals/historical-stats table. */
export async function getAllMedals() {
    return fetchHistoricalStats();
}

/** Returns the full raw table for a given component name. */
export async function getRawTable(componentName) {
    return fetchTable(componentName);
}

// ---------------------------------------------------------------------------
// Batch / convenience helpers
// ---------------------------------------------------------------------------

/**
 * Resolves multiple item hashes in parallel.
 * Returns an array of definitions (null for misses).
 */
export async function getItemDefs(hashes) {
    return Promise.all(hashes.map(h => getItemDef(h)));
}

/**
 * Resolves multiple stat hashes and returns a map of hash → display name.
 */
export async function getStatNames(hashes) {
    const entries = await Promise.all(
        [...new Set(hashes)].map(async h => {
            const def = await getStatDef(h);
            return [h, def?.displayProperties?.name ?? null];
        })
    );
    return Object.fromEntries(entries.filter(([, v]) => v !== null));
}

/**
 * Given an item hash, returns a richer object with:
 *   - Full item definition
 *   - Damage type definition (if applicable)
 *   - Energy type definition (if applicable)
 *   - Breaker type definition (if applicable)
 *   - Stat definitions keyed by statHash
 *   - Socket type / category definitions for all sockets
 */
export async function getEnrichedItemDef(itemHash) {
    const item = await getItemDef(itemHash);
    if (!item) return null;

    const [
        damageTypeDef,
        energyTypeDef,
        breakerTypeDef,
    ] = await Promise.all([
        item.defaultDamageTypeHash   ? getDamageTypeDef(item.defaultDamageTypeHash)  : null,
        item.equippingBlock?.equipmentSlotTypeHash
            ? null  // energy type is on instances, not defs — skip for now
            : null,
        item.breakerTypeHash         ? getBreakerTypeDef(item.breakerTypeHash)       : null,
    ]);

    // Stat definitions for every stat on the item
    const statHashes = Object.keys(item.stats?.stats ?? {}).map(Number);
    const statDefs   = Object.fromEntries(
        await Promise.all(
            statHashes.map(async h => [h, await getStatDef(h)])
        )
    );

    // Socket type + category for each socket
    const sockets = item.sockets?.socketEntries ?? [];
    const socketTypeDefs = Object.fromEntries(
        await Promise.all(
            [...new Set(sockets.map(s => s.socketTypeHash))].map(async h => [
                h,
                await getSocketTypeDef(h),
            ])
        )
    );

    return {
        ...item,
        damageTypeDef,
        energyTypeDef,
        breakerTypeDef,
        statDefs,
        socketTypeDefs,
    };
}

// ---------------------------------------------------------------------------
// Warm-up: pre-fetch all tables in the background
// ---------------------------------------------------------------------------

/**
 * Eagerly downloads every manifest table. Call this from `hooks.server.js`
 * on server startup so the first real request is never slowed down by a cold
 * manifest cache.
 *
 * This function never throws — individual failures are logged but ignored so
 * the server still starts.
 *
 * @param {boolean} [silent=false] - suppress console output
 */
export async function warmManifest(silent = false) {
    if (!silent) console.log('[manifest] Starting warm-up…');
    const start = Date.now();

    // Fetch all world-component tables in parallel (max 10 concurrent)
    const componentNames = Object.values(COMPONENTS);
    const CONCURRENCY    = 10;

    for (let i = 0; i < componentNames.length; i += CONCURRENCY) {
        const batch = componentNames.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map(name => fetchTable(name)));
    }

    // Also fetch historical stats
    await fetchHistoricalStats().catch(err =>
        console.error('[manifest] historical stats warm-up failed:', err.message)
    );

    if (!silent) {
        console.log(`[manifest] Warm-up complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    }
}

// ---------------------------------------------------------------------------
// Introspection helpers
// ---------------------------------------------------------------------------

/**
 * Returns a list of all activity names and hashes — useful for building
 * activity selectors or debugging.
 */
export async function listActivities() {
    const table = await fetchTable('DestinyActivityDefinition');
    return Object.values(table)
        .map(a => ({
            hash:        a.hash,
            name:        a.displayProperties?.name ?? '',
            description: a.displayProperties?.description ?? '',
            activityTypeHash: a.activityTypeHash,
            isPvP:       a.isPvP,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns all season definitions sorted by season number.
 */
export async function listSeasons() {
    const table = await fetchTable('DestinySeasonDefinition');
    return Object.values(table)
        .filter(s => s.seasonNumber != null)
        .sort((a, b) => a.seasonNumber - b.seasonNumber)
        .map(s => ({
            hash:         s.hash,
            seasonNumber: s.seasonNumber,
            name:         s.displayProperties?.name ?? `Season ${s.seasonNumber}`,
            description:  s.displayProperties?.description ?? '',
            startDate:    s.startDate,
            endDate:      s.endDate,
            iconPath:     s.displayProperties?.icon ?? null,
        }));
}

/**
 * Returns medal definitions with their icon URLs and descriptions — useful
 * for building the medals tab on the profile page.
 */
export async function listMedals() {
    const table = await fetchHistoricalStats();
    return Object.entries(table)
        .filter(([, def]) => def.medalTierInfo != null)
        .map(([id, def]) => ({
            id,
            name:        def.activityModeType?.toString() ?? id,
            description: def.medalTierInfo?.identifier ?? '',
            iconPath:    def.iconImage ? BUNGIE_ROOT + def.iconImage : null,
            tierHash:    def.medalTierInfo?.hash,
            tierName:    def.medalTierInfo?.identifier,
        }));
}

/**
 * Gambit-specific: returns the Gambit activity mode definition.
 */
export async function getGambitModeDef() {
    const table = await fetchTable('DestinyActivityModeDefinition');
    return Object.values(table).find(m => m.modeType === 63) ?? null; // 63 = Gambit
}

/**
 * Returns weapon archetype display names keyed by intrinsic perk hash.
 * Useful for showing "Aggressive Frame", "Lightweight Frame", etc.
 */
export async function getFrameName(intrinsicHash) {
    if (!intrinsicHash) return null;
    const perk = await getSandboxPerkDef(intrinsicHash);
    return perk?.displayProperties?.name ?? null;
}
