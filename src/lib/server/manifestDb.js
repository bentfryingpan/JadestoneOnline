/**
 * Jadestone — Manifest SQLite Database Service
 *
 * Downloads the Destiny 2 manifest SQLite file from Bungie, caches it to disk
 * (/tmp for Vercel, or a local data dir for self-hosted), and queries it with
 * better-sqlite3 for fast synchronous lookups.
 *
 * Falls back to the JSON manifest service (manifest.js) if:
 *   - better-sqlite3 is not installed
 *   - the SQLite download fails
 *   - running in an environment without filesystem write access
 *
 * Usage:
 *   import { dbGetItem, dbGetActivity, dbQuery } from '$lib/server/manifestDb.js';
 *   const def = await dbGetItem(1234567890);
 *
 * SQLite table structure:
 *   Each DestinyXxxDefinition table has:
 *     id   INTEGER PRIMARY KEY  (signed 32-bit hash)
 *     json TEXT                 (full definition JSON)
 *
 *   DestinyHistoricalStatsDefinition has:
 *     key  TEXT PRIMARY KEY     (string stat ID)
 *     json TEXT
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';

const BUNGIE_ROOT = 'https://www.bungie.net';
const DB_TTL      = 86_400_000; // 24 h — re-download once a day or on manifest version change
const DATA_DIR    = process.env.MANIFEST_DIR ?? join(tmpdir(), 'jadestone-manifest');

// Ensure data directory exists
try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// ── Dynamic imports (avoid crashing if better-sqlite3 not installed) ──────────
let Database = null;
try {
    const mod = await import('better-sqlite3');
    Database = mod.default ?? mod;
} catch {
    console.warn('[manifestDb] better-sqlite3 not available — using JSON fallback');
}

// ── In-memory registry of open DB connections ─────────────────────────────────
const openDbs = new Map(); // manifestVersion → Database instance

// ── Bungie helpers ────────────────────────────────────────────────────────────
async function bungieGet(url) {
    const r = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!r.ok) throw new Error(`Bungie ${r.status}: ${url}`);
    return r.json();
}

// ── Manifest version + path resolution ───────────────────────────────────────
async function getManifestMeta() {
    const cached = cacheGet('mdb:meta');
    if (cached) return cached;
    const data = await bungieGet('/Platform/Destiny2/Manifest/');
    const meta = data?.Response ?? null;
    if (meta) cacheSet('mdb:meta', meta, 3_600_000); // 1h
    return meta;
}

/** Returns the SQLite .content file URL for English locale. */
async function getSqliteUrl() {
    const meta = await getManifestMeta();
    const path = meta?.mobileWorldContentPaths?.en;
    if (!path) throw new Error('No SQLite manifest path found');
    return { url: BUNGIE_ROOT + path, version: meta.version };
}

// ── Download and extract SQLite ───────────────────────────────────────────────
async function downloadManifest(url, destPath) {
    // The .content file is a ZIP containing a single SQLite file
    let AdmZip;
    try {
        const mod = await import('adm-zip');
        AdmZip = mod.default ?? mod;
    } catch {
        throw new Error('adm-zip not installed — run: npm install adm-zip');
    }

    const tmpZip = destPath + '.zip';
    console.log('[manifestDb] Downloading manifest SQLite…');

    const res = await fetch(url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!res.ok) throw new Error(`Failed to download manifest: ${res.status}`);

    // Stream to disk
    const { Writable } = await import('stream');
    const chunks = [];
    const reader = res.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    const buf = Buffer.concat(chunks);

    // Write zip file
    const { writeFileSync } = await import('fs');
    writeFileSync(tmpZip, buf);

    // Extract SQLite from zip
    const zip    = new AdmZip(tmpZip);
    const entry  = zip.getEntries()[0];
    if (!entry) throw new Error('Empty zip from Bungie manifest');
    zip.extractEntryTo(entry, DATA_DIR, false, true);

    // Rename extracted file to our versioned path
    const extracted = join(DATA_DIR, entry.entryName);
    const { renameSync } = await import('fs');
    try { renameSync(extracted, destPath); } catch {
        // already at destPath or rename failed — try copy
        writeFileSync(destPath, zip.readFile(entry));
    }

    // Cleanup zip
    try { unlinkSync(tmpZip); } catch {}
    console.log('[manifestDb] Manifest SQLite ready at', destPath);
}

// ── Open (or reuse) a Database connection ─────────────────────────────────────
async function getDb() {
    if (!Database) return null;

    const { url, version } = await getSqliteUrl();
    if (openDbs.has(version)) return openDbs.get(version);

    const dbPath = join(DATA_DIR, `manifest_${version.replace(/[^a-z0-9._-]/gi, '_')}.sqlite`);

    if (!existsSync(dbPath)) {
        try {
            await downloadManifest(url, dbPath);
        } catch (err) {
            console.error('[manifestDb] Download failed:', err.message);
            return null;
        }
    }

    try {
        const db = new Database(dbPath, { readonly: true, fileMustExist: true });
        db.pragma('journal_mode = WAL');
        db.pragma('cache_size = -8192');   // 8MB page cache
        openDbs.set(version, db);

        // Clean up old versions
        for (const [v, old] of openDbs) {
            if (v !== version) { try { old.close(); } catch {} openDbs.delete(v); }
        }

        return db;
    } catch (err) {
        console.error('[manifestDb] Could not open SQLite:', err.message);
        return null;
    }
}

// ── Prepared statement cache ──────────────────────────────────────────────────
const stmtCache = new Map(); // `${version}:${sql}` → Statement

function getStmt(db, version, sql) {
    const key = `${version}:${sql}`;
    if (!stmtCache.has(key)) {
        stmtCache.set(key, db.prepare(sql));
    }
    return stmtCache.get(key);
}

// ── Convert unsigned hash → signed int (SQLite stores signed ints) ────────────
function toSignedId(hash) {
    const n = Number(hash);
    if (n > 2_147_483_647) return n - 4_294_967_296;
    return n;
}

// ── Public lookup API ─────────────────────────────────────────────────────────

/**
 * Look up a definition by hash in a given Destiny table.
 * Returns parsed JSON object or null.
 *
 * @param {string} tableName  e.g. 'DestinyInventoryItemDefinition'
 * @param {number|string} hash
 */
export async function dbLookup(tableName, hash) {
    if (!hash) return null;
    const cacheKey = `mdb:${tableName}:${hash}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    const db = await getDb();
    if (!db) return null; // fall through to JSON manifest

    try {
        const { version } = await getSqliteUrl();
        const sql  = `SELECT json FROM ${tableName} WHERE id = ? LIMIT 1`;
        const stmt = getStmt(db, version, sql);
        const row  = stmt.get(toSignedId(hash));
        const def  = row ? JSON.parse(row.json) : null;
        if (def) cacheSet(cacheKey, def, DB_TTL);
        return def;
    } catch (err) {
        console.warn(`[manifestDb] lookup failed ${tableName}/${hash}:`, err.message);
        return null;
    }
}

/** Look up a weapon / armor / item definition. */
export async function dbGetItem(hash) {
    return dbLookup('DestinyInventoryItemDefinition', hash);
}

/** Look up an activity definition. */
export async function dbGetActivity(hash) {
    return dbLookup('DestinyActivityDefinition', hash);
}

/** Look up a stat definition. */
export async function dbGetStat(hash) {
    return dbLookup('DestinyStatDefinition', hash);
}

/** Look up a sandbox perk definition. */
export async function dbGetPerk(hash) {
    return dbLookup('DestinySandboxPerkDefinition', hash);
}

/** Look up an activity mode definition. */
export async function dbGetActivityMode(hash) {
    return dbLookup('DestinyActivityModeDefinition', hash);
}

/** Look up a socket type definition. */
export async function dbGetSocketType(hash) {
    return dbLookup('DestinySocketTypeDefinition', hash);
}

/** Look up a socket category definition. */
export async function dbGetSocketCategory(hash) {
    return dbLookup('DestinySocketCategoryDefinition', hash);
}

/** Look up a damage type definition. */
export async function dbGetDamageType(hash) {
    return dbLookup('DestinyDamageTypeDefinition', hash);
}

/** Look up a DestinyHistoricalStatsDefinition entry by string key. */
export async function dbGetMedalDef(statKey) {
    if (!statKey) return null;
    const cacheKey = `mdb:hist:${statKey}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    const db = await getDb();
    if (!db) return null;

    try {
        const { version } = await getSqliteUrl();
        // Historical stats use a string 'key' column, not numeric 'id'
        const sql  = `SELECT json FROM DestinyHistoricalStatsDefinition WHERE key = ? LIMIT 1`;
        const stmt = getStmt(db, version, sql);
        const row  = stmt.get(statKey);
        const def  = row ? JSON.parse(row.json) : null;
        if (def) cacheSet(cacheKey, def, DB_TTL);
        return def;
    } catch (err) {
        console.warn(`[manifestDb] hist stat lookup failed ${statKey}:`, err.message);
        return null;
    }
}

/**
 * Run an arbitrary SELECT query against the manifest.
 * @param {string} sql  — parameterized SQL string
 * @param {Array}  params
 * @returns {Array<{json: string}>} raw rows
 */
export async function dbQuery(sql, params = []) {
    const db = await getDb();
    if (!db) return [];
    try {
        const stmt = db.prepare(sql);
        return stmt.all(...params);
    } catch (err) {
        console.warn('[manifestDb] query failed:', err.message);
        return [];
    }
}

/**
 * Search items by name (case-insensitive LIKE).
 * Returns up to `limit` parsed definitions.
 */
export async function dbSearchItems(nameQuery, limit = 20) {
    const rows = await dbQuery(
        `SELECT json FROM DestinyInventoryItemDefinition
         WHERE json LIKE ? LIMIT ?`,
        [`%"name":"${nameQuery}%`, limit]
    );
    return rows.map(r => { try { return JSON.parse(r.json); } catch { return null; } }).filter(Boolean);
}

/**
 * Get all Gambit activities.
 */
export async function dbGetGambitActivities() {
    const cacheKey = 'mdb:gambit-activities';
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const rows = await dbQuery(
        `SELECT json FROM DestinyActivityDefinition WHERE json LIKE '%"modeType":63%'`
    );
    const defs = rows.map(r => { try { return JSON.parse(r.json); } catch { return null; } }).filter(Boolean);
    cacheSet(cacheKey, defs, DB_TTL);
    return defs;
}

/**
 * Get all Gambit medals from DestinyHistoricalStatsDefinition.
 */
export async function dbGetGambitMedals() {
    const cacheKey = 'mdb:gambit-medals';
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const db = await getDb();
    if (!db) return [];

    try {
        const rows = db.prepare(
            `SELECT key, json FROM DestinyHistoricalStatsDefinition
             WHERE json LIKE '%"activityModeTypes":[%63%]%'
                OR json LIKE '%"activityModeType":63%'
                OR key LIKE '%gambit%'
                OR key LIKE '%pvecomp%'`
        ).all();
        const defs = rows.map(r => {
            try { return { key: r.key, ...JSON.parse(r.json) }; } catch { return null; }
        }).filter(Boolean);
        cacheSet(cacheKey, defs, DB_TTL);
        return defs;
    } catch (err) {
        console.warn('[manifestDb] gambit medals query failed:', err.message);
        return [];
    }
}

/**
 * Check if the SQLite manifest is available and up-to-date.
 * Returns { available: boolean, version: string|null }
 */
export async function manifestDbStatus() {
    if (!Database) return { available: false, reason: 'better-sqlite3 not installed', version: null };
    try {
        const db = await getDb();
        if (!db) return { available: false, reason: 'DB connection failed', version: null };
        const { version } = await getSqliteUrl();
        return { available: true, version };
    } catch (err) {
        return { available: false, reason: err.message, version: null };
    }
}
