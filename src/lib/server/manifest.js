/**
 * Destiny 2 Manifest Service (Unified Database Mirror)
 * 
 * Provides high-performance lookups by querying the local Supabase mirror.
 * Automatically falls back to Bungie's live API if the mirror is out of date.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { cacheGet, cacheSet } from './cache.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const TABLE_TTL   = 86_400_000; // 24 hours

/** Robust Bungie Fetch with BigInt Shield. */
async function bungieFetch(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!res.ok) return null;
    const text = await res.text();
    const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixed);
}

/** The Core Lookup Engine. */
async function getDef(tableName, hash) {
    if (!hash) return null;
    const hStr = String(hash >>> 0);
    const cacheKey = `manifest:${tableName}:${hStr}`;

    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    // 1. Query Supabase Mirror
    try {
        const { data: row } = await supabaseAdmin
            .from('manifest_definitions')
            .select('data')
            .eq('table_name', tableName)
            .eq('hash', hStr)
            .single();
        
        if (row?.data) {
            cacheSet(cacheKey, row.data, TABLE_TTL);
            return row.data;
        }
    } catch { }

    // 2. Fallback: Live Bungie API
    try {
        const data = await bungieFetch(`/Platform/Destiny2/Manifest/${tableName}/${hStr}/`);
        const def = data?.Response;
        if (def) {
            cacheSet(cacheKey, def, TABLE_TTL);
            // Proactively cache back to DB
            supabaseAdmin.from('manifest_definitions').upsert({
                table_name: tableName,
                hash: hStr,
                data: def,
                updated_at: new Date().toISOString()
            }).then(() => {});
            return def;
        }
    } catch { }

    return null;
}

// ── Standard Definition Accessors ────────────────────────────────────────────

export const getItemDef             = (h) => getDef('DestinyInventoryItemDefinition', h);
export const getActivityDef         = (h) => getDef('DestinyActivityDefinition', h);
export const getStatDef             = (h) => getDef('DestinyStatDefinition', h);
export const getSandboxPerkDef      = (h) => getDef('DestinySandboxPerkDefinition', h);
export const getDamageTypeDef       = (h) => getDef('DestinyDamageTypeDefinition', h);
export const getRecordDef           = (h) => getDef('DestinyRecordDefinition', h);
export const getCollectibleDef      = (h) => getDef('DestinyCollectibleDefinition', h);
export const getPresentationNodeDef = (h) => getDef('DestinyPresentationNodeDefinition', h);
export const getSeasonDef           = (h) => getDef('DestinySeasonDefinition', h);
export const getProgressionDef      = (h) => getDef('DestinyProgressionDefinition', h);
export const getObjectiveDef        = (h) => getDef('DestinyObjectiveDefinition', h);
export const getBucketDef           = (h) => getDef('DestinyInventoryBucketDefinition', h);
export const getSocketTypeDef       = (h) => getDef('DestinySocketTypeDefinition', h);
export const getSocketCategoryDef   = (h) => getDef('DestinySocketCategoryDefinition', h);
export const getTraitDef            = (h) => getDef('DestinyTraitDefinition', h);
export const getTalentGridDef       = (h) => getDef('DestinyTalentGridDefinition', h);
export const getClassDef            = (h) => getDef('DestinyClassDefinition', h);
export const getRaceDef             = (h) => getDef('DestinyRaceDefinition', h);
export const getMedalDef            = (id) => getDef('DestinyHistoricalStatsDefinition', id);

// ── Enhanced Lookup Utilities ────────────────────────────────────────────────

/** Returns every record found in the local mirror for a table. */
export async function getLocalTable(tableName) {
    try {
        const { data } = await supabaseAdmin
            .from('manifest_definitions')
            .select('hash, data')
            .eq('table_name', tableName);
        if (data) return Object.fromEntries(data.map(r => [r.hash, r.data]));
    } catch { }
    return {};
}

/** Optimized batch fetch for item definitions. */
export async function getItemDefs(hashes) {
    const unique = [...new Set(hashes.filter(Boolean))];
    const results = await Promise.all(unique.map(h => getItemDef(h)));
    const map = Object.fromEntries(unique.map((h, i) => [h, results[i]]));
    return hashes.map(h => map[h]);
}

/** Resolves the map image path for a named activity. */
export async function getMapImage(mapName) {
    if (!mapName) return null;
    const cleanName = mapName.replace(/^(Gambit[:\-]\s*)/i, '').trim();
    try {
        const { data } = await supabaseAdmin
            .from('manifest_definitions')
            .select('data')
            .eq('table_name', 'DestinyActivityDefinition')
            .ilike('data->displayProperties->name', `%${cleanName}%`)
            .limit(1)
            .single();
        if (data?.data?.pgcrImage) return BUNGIE_ROOT + data.data.pgcrImage;
    } catch { }
    return null;
}

/** Fetches and base64 encodes an exotic icon. */
export async function getExoticIconBase64(itemHash) {
    const def = await getItemDef(itemHash);
    if (!def || def.inventory?.tierType !== 6) return null;
    const path = def.displayProperties?.icon;
    if (!path) return null;
    try {
        const res = await fetch(BUNGIE_ROOT + path);
        const buf = await res.arrayBuffer();
        return Buffer.from(buf).toString('base64');
    } catch { return null; }
}

// ── Compatibility Stubs ──────────────────────────────────────────────────────
export const getManifestVersion = async () => 'latest';
export const warmManifest       = async () => {};
export const getRawTable        = async (n) => getLocalTable(n);
export const getAllMedals       = async () => getLocalTable('DestinyHistoricalStatsDefinition');
export const getStatNames       = async (hashes) => {
    const defs = await Promise.all(hashes.map(h => getStatDef(h)));
    return Object.fromEntries(hashes.map((h, i) => [h, defs[i]?.displayProperties?.name ?? null]));
};
