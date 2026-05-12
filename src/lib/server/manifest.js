/**
 * Destiny 2 Manifest Service (Database-Aligned 1:1)
 *
 * This version is designed to work with the existing 'players' and 'matches' tables,
 * and will fallback to live Bungie API lookups until the manifest tables are created.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { cacheGet, cacheSet } from './cache.js';

const BUNGIE_ROOT   = 'https://www.bungie.net';
const TABLE_TTL     = 86_400_000;   // 24 h

/**
 * Robust fetch that handles BigInt membershipIds by quoting them.
 */
async function bungieFetch(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!res.ok) return null;
    const text = await res.text();
    const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixed);
}

/**
 * Returns a definition from:
 * 1. In-memory cache (fast)
 * 2. Supabase manifest_definitions (persistent) - if exists
 * 3. Live Bungie API (source)
 */
async function getDef(tableName, hash) {
    if (!hash) return null;
    const hStr = String(hash >>> 0);
    const cacheKey = `manifest:${tableName}:${hStr}`;

    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    // Check DB (Generic Table)
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

    // Fallback: Live API
    try {
        const data = await bungieFetch(`/Platform/Destiny2/Manifest/${tableName}/${hStr}/`);
        const def = data?.Response;
        if (def) {
            cacheSet(cacheKey, def, TABLE_TTL);
            // Optional: Try to store in DB for next time (fire and forget)
            supabaseAdmin.from('manifest_definitions').upsert({
                table_name: tableName,
                hash: hStr,
                data: def,
                updated_at: new Date().toISOString()
            }).then(() => {}).catch(() => {});
            return def;
        }
    } catch { }

    return null;
}

// ── Public Lookups ───────────────────────────────────────────────────────────

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

/** Resolves historical stats/medals by string key. */
export async function getMedalDef(statId) {
    if (!statId) return null;
    const cacheKey = `manifest:medals:${statId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const { data: row } = await supabaseAdmin.from('manifest_definitions').select('data').eq('table_name', 'DestinyHistoricalStatsDefinition').eq('hash', statId).single();
        if (row?.data) {
            cacheSet(cacheKey, row.data, TABLE_TTL);
            return row.data;
        }
    } catch { }

    // Fallback: We can't fetch single medals easily via ID endpoint.
    // Return placeholder or null.
    return null;
}

export async function getAllMedals() {
    try {
        const { data } = await supabaseAdmin.from('manifest_definitions').select('hash, data').eq('table_name', 'DestinyHistoricalStatsDefinition');
        if (data?.length) return Object.fromEntries(data.map(r => [r.hash, r.data]));
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
    // Search in DB if manifest synced
    try {
        const { data } = await supabaseAdmin.from('manifest_definitions').select('data').eq('table_name', 'DestinyActivityDefinition').ilike('data->displayProperties->name', `%${cleanName}%`).limit(1).single();
        if (data?.data?.pgcrImage) return BUNGIE_ROOT + data.data.pgcrImage;
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

// Stubs for build compatibility
export async function getManifestVersion() { return 'latest'; }
export async function warmManifest() { }
export async function getRawTable() { return {}; }
export async function getItemDefs(hashes) { return Promise.all(hashes.map(h => getItemDef(h))); }
