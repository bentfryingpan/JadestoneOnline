/**
 * /scripts/sync-manifest.js — Omni-Sync Manifest Engine (Pro Edition)
 * 
 * Performs a complete mirror of the Destiny 2 Manifest into Supabase.
 * Designed for high-speed bulk ingestion with BigInt protection.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BUNGIE_API_KEY = process.env.BUNGIE_API_KEY;
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUNGIE_ROOT = 'https://www.bungie.net';

if (!BUNGIE_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing environment variables. Check .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function bungieFetch(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!res.ok) throw new Error(`Bungie API Error: ${res.status} ${url}`);
    const text = await res.text();
    // BigInt Shield: Quote numeric IDs before parsing
    const fixedText = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixedText);
}

async function sync() {
    console.log('\n🔷 Jadestone Omni-Sync Manifest Engine (Flawless Mode)\n');

    // 1. Get Manifest Metadata
    const manifestMeta = await bungieFetch('/Platform/Destiny2/Manifest/');
    const version = manifestMeta.Response?.version;
    const componentPaths = manifestMeta.Response?.jsonWorldComponentContentPaths?.en;

    if (!componentPaths) {
        console.error('Manifest paths not found.');
        process.exit(1);
    }

    // 2. Select Critical Tables for Core Intelligence
    const criticalTables = [
        'DestinyInventoryItemDefinition',
        'DestinyActivityDefinition',
        'DestinyRecordDefinition',
        'DestinyHistoricalStatsDefinition',
        'DestinyPresentationNodeDefinition',
        'DestinySocketTypeDefinition',
        'DestinyPlugSetDefinition',
        'DestinyObjectiveDefinition',
        'DestinyStatDefinition',
        'DestinyInventoryBucketDefinition',
        'DestinyDamageTypeDefinition',
        'DestinyProgressionDefinition',
        'DestinyClassDefinition',
        'DestinyRaceDefinition',
        'DestinyLoreDefinition'
    ];

    console.log(`📦 Manifest Version: ${version}`);
    console.log(`📂 Syncing ${criticalTables.length} critical definition tables...\n`);

    for (const tableName of criticalTables) {
        const path = componentPaths[tableName];
        if (!path) {
            // Some tables might be in stats definitions instead
            if (tableName === 'DestinyHistoricalStatsDefinition') {
                await syncHistoricalStats(version);
            }
            continue;
        }

        console.log(`📥 Syncing ${tableName}...`);
        try {
            const tableData = await bungieFetch(path);
            const entries = Object.entries(tableData);
            console.log(`   Fetched ${entries.length} entries. Upserting to Supabase...`);

            const rows = entries.map(([hash, data]) => ({
                table_name: tableName,
                hash: String(hash >>> 0),
                data,
                version,
                updated_at: new Date().toISOString()
            }));

            // Bulk Upsert in chunks of 1000
            const CHUNK_SIZE = 1000;
            for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                const chunk = rows.slice(i, i + CHUNK_SIZE);
                const { error } = await supabase.from('manifest_definitions').upsert(chunk, {
                    onConflict: 'table_name,hash'
                });
                if (error) console.error(`   ❌ Error in chunk ${i/CHUNK_SIZE}:`, error.message);
                else process.stdout.write(`   Progress: ${Math.min(i + CHUNK_SIZE, rows.length)} / ${rows.length}\r`);
            }
            console.log(`\n   ✅ ${tableName} complete.\n`);
        } catch (err) {
            console.error(`   ❌ Failed to sync ${tableName}:`, err.message);
        }
    }

    console.log('\n🏁 Omni-Sync Complete!');
}

async function syncHistoricalStats(version) {
    console.log(`📥 Syncing DestinyHistoricalStatsDefinition (Special Fetch)...`);
    try {
        const data = await bungieFetch('/Platform/Destiny2/Stats/Definition/');
        const entries = Object.entries(data.Response);
        console.log(`   Fetched ${entries.length} stat definitions.`);

        const rows = entries.map(([id, data]) => ({
            table_name: 'DestinyHistoricalStatsDefinition',
            hash: id,
            data,
            version,
            updated_at: new Date().toISOString()
        }));

        const CHUNK_SIZE = 500;
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            await supabase.from('manifest_definitions').upsert(chunk, { onConflict: 'table_name,hash' });
        }
        console.log(`   ✅ Historical Stats complete.\n`);
    } catch (err) {
        console.error(`   ❌ Failed to sync Historical Stats:`, err.message);
    }
}

sync();
