#!/usr/bin/env node
/**
 * /scripts/sync-manifest.js — Omni-Sync Manifest Engine
 * 
 * Fetches the ENTIRE Destiny 2 Manifest and caches it in Supabase for 1:1 parity
 * with Jadestone Desktop intelligence.
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!res.ok) throw new Error(`Bungie API Error: ${res.status} ${url}`);
    const text = await res.text();
    // Quote BigInts
    const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixed);
}

async function sync() {
    console.log('\n🔷 Jadestone Omni-Sync Manifest Engine\n');

    // 1. Fetch Manifest Paths
    console.log('📦 Fetching manifest metadata...');
    const manifestMeta = await bungieGet('/Platform/Destiny2/Manifest/');
    const version = manifestMeta.Response?.version;
    const paths = manifestMeta.Response?.jsonWorldComponentContentPaths?.en;

    if (!paths) {
        console.error('Manifest paths not found.');
        process.exit(1);
    }

    console.log(`📦 Manifest version: ${version}`);
    console.log(`📂 Found ${Object.keys(paths).length} definition tables.\n`);

    // 2. Iterate and Sync
    const tableNames = Object.keys(paths);
    
    for (const tableName of tableNames) {
        console.log(`📥 Syncing ${tableName}...`);
        
        try {
            const tableData = await bungieGet(paths[tableName]);
            const entries = Object.entries(tableData);
            console.log(`   Fetched ${entries.length} entries. Processing chunks...`);

            const rows = entries.map(([hash, data]) => ({
                table_name: tableName,
                hash: String(hash >>> 0),
                data,
                version,
                updated_at: new Date().toISOString()
            }));

            // Bulk Upsert in chunks of 500
            const CHUNK_SIZE = 500;
            for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                const chunk = rows.slice(i, i + CHUNK_SIZE);
                const { error } = await supabase.from('manifest_definitions').upsert(chunk, {
                    onConflict: 'table_name,hash'
                });
                
                if (error) {
                    console.error(`   ❌ Error in chunk ${i/CHUNK_SIZE}:`, error.message);
                    if (error.message.includes('Could not find the table')) {
                        console.error('   FATAL: manifest_definitions table is missing in Supabase.');
                        return;
                    }
                } else {
                    process.stdout.write(`   Progress: ${Math.min(i + CHUNK_SIZE, rows.length)} / ${rows.length}\r`);
                }
            }
            console.log(`\n   ✅ ${tableName} complete.\n`);
        } catch (err) {
            console.error(`   ❌ Failed to sync ${tableName}:`, err.message);
        }
    }

    console.log('\n🏁 Omni-Sync Complete!');
}

sync();
