/**
 * /scripts/sync-missing.js — Targeted sync for missing manifest tables.
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function bungieFetch(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    const text = await res.text();
    const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixed);
}

async function run() {
    const meta = await bungieFetch('/Platform/Destiny2/Manifest/');
    const paths = meta.Response.jsonWorldComponentContentPaths.en;
    const version = meta.Response.version;

    const targetTables = [
        'DestinySocketCategoryDefinition',
        'DestinySocketTypeDefinition',
        'DestinyStatDefinition',
        'DestinyInventoryBucketDefinition',
        'DestinyDamageTypeDefinition',
        'DestinyPlugSetDefinition'
    ];

    for (const table of targetTables) {
        console.log(`Syncing ${table}...`);
        const data = await bungieFetch(paths[table]);
        const entries = Object.entries(data);
        
        const rows = entries.map(([hash, blob]) => ({
            table_name: table,
            hash: String(hash >>> 0),
            data: blob,
            version,
            updated_at: new Date().toISOString()
        }));

        for (let i = 0; i < rows.length; i += 1000) {
            const chunk = rows.slice(i, i + 1000);
            await supabase.from('manifest_definitions').upsert(chunk, { onConflict: 'table_name,hash' });
            process.stdout.write(`  Progress: ${i + chunk.length}/${rows.length}\r`);
        }
        console.log(`\nDone ${table}.`);
    }
}

run();
