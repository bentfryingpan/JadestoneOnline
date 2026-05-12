/**
 * Destiny 2 Manifest Service (Database-Aligned 1:1)
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { cacheGet, cacheSet } from './cache.js';

const BUNGIE_ROOT   = 'https://www.bungie.net';
const TABLE_TTL     = 86_400_000;   // 24 h

// Mapping for our internal definitions to actual Supabase table names
const TABLE_MAP = {
    'DestinyInventoryItemDefinition':   'd2_items',
    'DestinyActivityDefinition':        'd2_activities',
    'DestinyStatDefinition':            'd2_stats',
    'DestinySandboxPerkDefinition':     'd2_perks',
    'DestinyDamageTypeDefinition':      'd2_damage_types',
    'DestinySocketTypeDefinition':      'd2_socket_types',
    'DestinySocketCategoryDefinition':  'd2_socket_cats',
};

async function getDbDef(tableName, hash) {
    if (!hash) return null;
    const hStr = String(hash >>> 0);
    const dbTable = TABLE_MAP[tableName];
    if (!dbTable) return null;

    const cacheKey = `manifest:${dbTable}:${hStr}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    try {
        const { data } = await supabaseAdmin
            .from(dbTable)
            .select('raw')
            .eq('hash', hStr)
            .single();
        
        if (data?.raw) {
            const def = typeof data.raw === 'string' ? JSON.parse(data.raw) : data.raw;
            cacheSet(cacheKey, def, TABLE_TTL);
            return def;
        }
    } catch { }

    // Fallback to Live API if not in DB
    try {
        const res = await fetch(`${BUNGIE_ROOT}/Platform/Destiny2/Manifest/${tableName}/${hStr}/`, {
            headers: { 'X-API-Key': BUNGIE_API_KEY }
        });
        const json = await res.json();
        const def = json.Response;
        if (def) {
            cacheSet(cacheKey, def, TABLE_TTL);
            return def;
        }
    } catch { }

    return null;
}

export const getItemDef             = (h) => getDbDef('DestinyInventoryItemDefinition', h);
export const getActivityDef         = (h) => getDbDef('DestinyActivityDefinition', h);
export const getStatDef             = (h) => getDbDef('DestinyStatDefinition', h);
export const getSandboxPerkDef      = (h) => getDbDef('DestinySandboxPerkDefinition', h);
export const getDamageTypeDef       = (h) => getDbDef('DestinyDamageTypeDefinition', h);
export const getSocketTypeDef       = (h) => getDbDef('DestinySocketTypeDefinition', h);
export const getSocketCategoryDef   = (h) => getDbDef('DestinySocketCategoryDefinition', h);

// The remaining definitions use the same logic but don't have specialized tables yet.
// We'll use the generic live-fetch-with-cache for them.
async function getGenericDef(tableName, hash) {
    if (!hash) return null;
    const hStr = String(hash >>> 0);
    const cacheKey = `manifest:gen:${tableName}:${hStr}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;
    try {
        const res = await fetch(`${BUNGIE_ROOT}/Platform/Destiny2/Manifest/${tableName}/${hStr}/`, {
            headers: { 'X-API-Key': BUNGIE_API_KEY }
        });
        const json = await res.json();
        const def = json.Response;
        cacheSet(cacheKey, def, TABLE_TTL);
        return def;
    } catch { return null; }
}

export const getSeasonDef           = (h) => getGenericDef('DestinySeasonDefinition', h);
export const getProgressionDef      = (h) => getGenericDef('DestinyProgressionDefinition', h);
export const getClassDef            = (h) => getGenericDef('DestinyClassDefinition', h);
export const getRaceDef             = (h) => getGenericDef('DestinyRaceDefinition', h);
export const getBreakerTypeDef      = (h) => getGenericDef('DestinyBreakerTypeDefinition', h);
export const getItemCategoryDef     = (h) => getGenericDef('DestinyItemCategoryDefinition', h);
export const getTraitDef            = (h) => getGenericDef('DestinyTraitDefinition', h);
export const getRecordDef           = (h) => getGenericDef('DestinyRecordDefinition', h);
export const getCollectibleDef      = (h) => getGenericDef('DestinyCollectibleDefinition', h);
export const getPresentationNodeDef = (h) => getGenericDef('DestinyPresentationNodeDefinition', h);
export const getTalentGridDef       = (h) => getGenericDef('DestinyTalentGridDefinition', h);
export const getMaterialRequirement = (h) => getGenericDef('DestinyMaterialRequirementSetDefinition', h);
export const getVendorDef           = (h) => getGenericDef('DestinyVendorDefinition', h);
export const getArtifactDef         = (h) => getGenericDef('DestinyArtifactDefinition', h);
export const getPowerCapDef         = (h) => getGenericDef('DestinyPowerCapDefinition', h);
export const getObjectiveDef        = (h) => getGenericDef('DestinyObjectiveDefinition', h);
export const getBucketDef           = (h) => getGenericDef('DestinyInventoryBucketDefinition', h);

export async function getMedalDef(statId) {
    if (!statId) return null;
    const cacheKey = `manifest:medals:${statId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
    try {
        const { data } = await supabaseAdmin.from('d2_medals').select('raw').eq('stat_id', statId).single();
        if (data?.raw) {
            const def = typeof data.raw === 'string' ? JSON.parse(data.raw) : data.raw;
            cacheSet(cacheKey, def, TABLE_TTL);
            return def;
        }
    } catch { }
    return null;
}

export async function getAllMedals() {
    try {
        const { data } = await supabaseAdmin.from('d2_medals').select('stat_id, raw');
        if (data) return Object.fromEntries(data.map(r => [r.stat_id, typeof r.raw === 'string' ? JSON.parse(r.raw) : r.raw]));
    } catch { }
    return {};
}

export async function getStatNames(hashes) {
    const entries = await Promise.all([...new Set(hashes)].map(async h => [h, (await getStatDef(h))?.displayProperties?.name ?? null]));
    return Object.fromEntries(entries.filter(([, v]) => v !== null));
}

export async function getMapImage(mapName) {
    if (!mapName) return null;
    const cleanName = mapName.replace(/^(Gambit[:\-]\s*)/i, '').trim();
    try {
        const { data } = await supabaseAdmin.from('d2_activities').select('pgcr_image').ilike('name', `%${cleanName}%`).limit(1).single();
        if (data?.pgcr_image) return BUNGIE_ROOT + data.pgcr_image;
    } catch { }
    return null;
}

export async function getExoticIconBase64(itemHash) {
    const def = await getItemDef(itemHash);
    if (!def || def.inventory?.tierType !== 6) return null;
    const iconPath = def.displayProperties?.icon;
    if (!iconPath) return null;
    try {
        const res = await fetch(`${BUNGIE_ROOT}${iconPath}`);
        const buf = await res.arrayBuffer();
        return Buffer.from(buf).toString('base64');
    } catch { return null; }
}

export async function getRawTable(comp) { return {}; }
export async function getManifestVersion() { return 'latest'; }
export async function warmManifest() { }
