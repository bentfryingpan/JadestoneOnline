/**
 * Destiny 2 Manifest Service (Robust 1:1)
 * 
 * Provides high-performance lookups by querying the local Supabase mirror.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { redisGet, redisSet } from './redis.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
const TABLE_TTL   = 86_400_000 * 7; 

async function bungieFetch(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!res.ok) return null;
    const text = await res.text();
    const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixed);
}

async function getDef(tableName, hash) {
    if (!hash) return null;
    const hStr = String(hash >>> 0);
    const redisKey = `manifest:${tableName}:${hStr}`;

    const cached = await redisGet(redisKey);
    if (cached) return cached;

    try {
        const { data: row } = await supabaseAdmin
            .from('manifest_definitions')
            .select('data')
            .eq('table_name', tableName)
            .eq('hash', hStr)
            .single();
        
        if (row?.data) {
            await redisSet(redisKey, row.data, TABLE_TTL);
            return row.data;
        }
    } catch { }

    // Fallback: Live API
    try {
        const data = await bungieFetch(`/Platform/Destiny2/Manifest/${tableName}/${hStr}/`);
        const def = data?.Response;
        if (def) {
            await redisSet(redisKey, def, TABLE_TTL);
            supabaseAdmin.from('manifest_definitions').upsert({
                table_name: tableName, hash: hStr, data: def, updated_at: new Date().toISOString()
            }).then(() => {});
            return def;
        }
    } catch { }
    return null;
}

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
export const getClassDef            = (h) => getDef('DestinyClassDefinition', h);
export const getRaceDef             = (h) => getDef('DestinyRaceDefinition', h);

/** Bulk resolve definitions for a table. */
export async function getDefs(tableName, hashes) {
    if (!hashes?.length) return {};
    const hStrings = hashes.map(h => String(h >>> 0));
    try {
        const { data } = await supabaseAdmin
            .from('manifest_definitions')
            .select('hash, data')
            .eq('table_name', tableName)
            .in('hash', hStrings);
        if (data) return Object.fromEntries(data.map(r => [r.hash, r.data]));
    } catch { }
    return {};
}

/** Resolves historical stats/medals by string key (e.g. medalMassacre). */
export async function getMedalDef(statId) {
    if (!statId) return null;
    const redisKey = `manifest:DestinyHistoricalStatsDefinition:${statId}`;
    const cached = await redisGet(redisKey);
    if (cached) return cached;

    try {
        const { data: row } = await supabaseAdmin
            .from('manifest_definitions')
            .select('data')
            .eq('table_name', 'DestinyHistoricalStatsDefinition')
            .eq('hash', statId)
            .single();
        if (row?.data) {
            await redisSet(redisKey, row.data, TABLE_TTL);
            return row.data;
        }
    } catch { }
    return null;
}

export async function getAllMedals() {
    try {
        const { data } = await supabaseAdmin
            .from('manifest_definitions')
            .select('hash, data')
            .eq('table_name', 'DestinyHistoricalStatsDefinition');
        if (data?.length) return Object.fromEntries(data.map(r => [r.hash, r.data]));
    } catch { }
    return {};
}

export async function getStatNames(hashes) {
    const defs = await Promise.all(hashes.map(h => getStatDef(h)));
    return Object.fromEntries(hashes.map((h, i) => [h, defs[i]?.displayProperties?.name ?? null]));
}

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

export async function getRawTable(tableName) {
    try {
        const { data } = await supabaseAdmin
            .from('manifest_definitions')
            .select('hash, data')
            .eq('table_name', tableName);
        if (data) return Object.fromEntries(data.map(r => [r.hash, r.data]));
    } catch { }
    return {};
}

export const getManifestVersion = async () => 'latest';
export const warmManifest       = async () => {};
export async function getItemDefs(hashes) { return Promise.all(hashes.map(h => getItemDef(h))); }
