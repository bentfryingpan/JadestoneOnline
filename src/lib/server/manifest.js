/**
 * Destiny 2 Manifest Service (Database-Enhanced)
 *
 * This service manages the local manifest cache, falling back to Supabase
 * persistent storage, and finally the live Bungie API.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { cacheGet, cacheSet } from './cache.js';

const BUNGIE_ROOT   = 'https://www.bungie.net';
const VERSION_TTL   =  3_600_000;   // 1 h
const TABLE_TTL     = 86_400_000;   // 24 h

// ── Shared Helpers ───────────────────────────────────────────────────────────

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, {
        headers: { 'X-API-Key': BUNGIE_API_KEY },
    });
    if (!res.ok) throw new Error(`Bungie ${res.status}: ${url}`);
    const text = await res.text();
    // Quote BigInts before parsing
    const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixed);
}

/** Returns the current manifest version string. */
export async function getManifestVersion() {
    const cached = cacheGet('manifest:version');
    if (cached) return cached;
    const data = await bungieGet('/Platform/Destiny2/Manifest/');
    const version = data?.Response?.version;
    if (version) cacheSet('manifest:version', version, VERSION_TTL);
    return version;
}

// ── Persistent Lookup Logic ──────────────────────────────────────────────────

/**
 * Returns a definition from:
 * 1. In-memory cache (fast)
 * 2. Supabase manifest_definitions (persistent)
 * 3. Live Bungie API (source)
 */
async function getPersistentDef(tableName, hash) {
    if (!hash) return null;
    const hStr = String(hash >>> 0);
    const cacheKey = `manifest:${tableName}:${hStr}`;

    // 1. Memory Cache
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    // 2. Supabase
    try {
        const { data: row } = await supabaseAdmin
            .from('manifest_definitions')
            .select('data, version')
            .eq('table_name', tableName)
            .eq('hash', hStr)
            .single();
        
        if (row) {
            // Check version? For now, we return it. 
            // A periodic sync will handle stale data.
            cacheSet(cacheKey, row.data, TABLE_TTL);
            return row.data;
        }
    } catch { }

    // 3. Live Bungie API
    try {
        const data = await bungieGet(`/Platform/Destiny2/Manifest/${tableName}/${hStr}/`);
        const def = data?.Response ?? null;
        
        if (def) {
            const version = await getManifestVersion();
            // Fire-and-forget upsert to Supabase
            supabaseAdmin.from('manifest_definitions').upsert({
                table_name: tableName,
                hash: hStr,
                data: def,
                version,
                updated_at: new Date().toISOString()
            }, { onConflict: 'table_name,hash' }).then(() => {});
            
            cacheSet(cacheKey, def, TABLE_TTL);
            return def;
        }
    } catch (err) {
        console.warn(`[manifest] Lookup failed for ${tableName}/${hStr}:`, err.message);
    }

    return null;
}

// ── Public Lookups ───────────────────────────────────────────────────────────

export const getItemDef             = (h) => getPersistentDef('DestinyInventoryItemDefinition', h);
export const getStatDef             = (h) => getPersistentDef('DestinyStatDefinition', h);
export const getDamageTypeDef       = (h) => getPersistentDef('DestinyDamageTypeDefinition', h);
export const getEnergyTypeDef       = (h) => getPersistentDef('DestinyEnergyTypeDefinition', h);
export const getActivityDef         = (h) => getPersistentDef('DestinyActivityDefinition', h);
export const getActivityModeDef     = (h) => getPersistentDef('DestinyActivityModeDefinition', h);
export const getSeasonDef           = (h) => getPersistentDef('DestinySeasonDefinition', h);
export const getProgressionDef      = (h) => getPersistentDef('DestinyProgressionDefinition', h);
export const getSocketTypeDef       = (h) => getPersistentDef('DestinySocketTypeDefinition', h);
export const getSocketCategoryDef   = (h) => getPersistentDef('DestinySocketCategoryDefinition', h);
export const getClassDef            = (h) => getPersistentDef('DestinyClassDefinition', h);
export const getRaceDef             = (h) => getPersistentDef('DestinyRaceDefinition', h);
export const getBreakerTypeDef      = (h) => getPersistentDef('DestinyBreakerTypeDefinition', h);
export const getItemCategoryDef     = (h) => getPersistentDef('DestinyItemCategoryDefinition', h);
export const getTraitDef            = (h) => getPersistentDef('DestinyTraitDefinition', h);
export const getRecordDef           = (h) => getPersistentDef('DestinyRecordDefinition', h);
export const getCollectibleDef      = (h) => getPersistentDef('DestinyCollectibleDefinition', h);
export const getPresentationNodeDef = (h) => getPersistentDef('DestinyPresentationNodeDefinition', h);
export const getSandboxPerkDef      = (h) => getPersistentDef('DestinySandboxPerkDefinition', h);
export const getMaterialRequirement = (h) => getPersistentDef('DestinyMaterialRequirementSetDefinition', h);
export const getVendorDef           = (h) => getPersistentDef('DestinyVendorDefinition', h);
export const getArtifactDef         = (h) => getPersistentDef('DestinyArtifactDefinition', h);
export const getPowerCapDef         = (h) => getPersistentDef('DestinyPowerCapDefinition', h);
export const getObjectiveDef        = (h) => getPersistentDef('DestinyObjectiveDefinition', h);
export const getBucketDef           = (h) => getPersistentDef('DestinyInventoryBucketDefinition', h);

// Historical stats use string keys (e.g. "kills")
export async function getMedalDef(statId) {
    if (!statId) return null;
    const cacheKey = `manifest:HistoricalStats:${statId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    // We can't use getPersistentDef directly because it's not a hash lookup.
    // We check Supabase first.
    try {
        const { data: row } = await supabaseAdmin
            .from('manifest_definitions')
            .select('data')
            .eq('table_name', 'DestinyHistoricalStatsDefinition')
            .eq('hash', statId)
            .single();
        if (row) {
            cacheSet(cacheKey, row.data, TABLE_TTL);
            return row.data;
        }
    } catch { }

    // Fallback: This one usually requires a bulk fetch of all definitions.
    // For now, we'll implement a specific sync for this table.
    return null;
}

// ── Batch Helpers ────────────────────────────────────────────────────────────

export async function getItemDefs(hashes) {
    return Promise.all(hashes.map(h => getItemDef(h)));
}

/** Pre-populates common Gambit assets into memory/Supabase. */
export async function warmManifest() {
    console.log('[manifest] Warming up database cache...');
    // Add common hashes here (maps, Gambit sets, etc)
}

// ── Asset Resolution ─────────────────────────────────────────────────────────

export async function getMapImage(mapName) {
    if (!mapName) return null;
    const cleanName = mapName.replace(/^(Gambit[:\-]\s*)/i, '').trim();
    
    // We search Activity definitions in Supabase by name (requires text search or full fetch)
    // For now, we'll rely on the existing lazy mapping or a full sync.
    return null;
}

export async function getExoticIconBase64(itemHash) {
    const def = await getItemDef(itemHash);
    if (!def || def.inventory?.tierType !== 6) return null;
    const iconPath = def.displayProperties?.icon;
    if (!iconPath) return null;
    try {
        const res = await fetch(`https://www.bungie.net${iconPath}`);
        const buf = await res.arrayBuffer();
        return Buffer.from(buf).toString('base64');
    } catch { return null; }
}
