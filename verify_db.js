import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDb() {
    console.log('--- Database Integrity Report ---');
    
    // 1. Total matches count
    const { count: totalMatches, error: err1 } = await supabase
        .from('player_matches')
        .select('*', { count: 'exact', head: true });
    
    if (err1) console.error('Error fetching matches:', err1);
    else console.log(`Total Matches Stored: ${totalMatches}`);

    // 2. Check for potentially corrupted IDs (rounded values ending in 000)
    const { data: corrupted, error: err2 } = await supabase
        .from('player_matches')
        .select('player_id')
        .like('player_id', '%000')
        .limit(5);

    if (err2) console.error('Error checking corruption:', err2);
    else if (corrupted?.length > 0) {
        console.warn(`WARNING: Found ${corrupted.length} potentially corrupted IDs (rounded). Repair may still be needed.`);
    } else {
        console.log('SUCCESS: No rounded BigInt corruption detected in the first samples.');
    }

    // 3. Check Manifest status
    const { count: manifestCount } = await supabase
        .from('manifest_definitions')
        .select('*', { count: 'exact', head: true });
    
    console.log(`Manifest Definitions Stored: ${manifestCount}`);

    // 4. Check NGR cache
    const { data: ngrRows } = await supabase
        .from('player_ngr_cache')
        .select('player_id, ngr, games')
        .order('updated_at', { ascending: false })
        .limit(3);
    
    console.log('Recent NGR Updates:');
    ngrRows?.forEach(r => console.log(` - ID: ${r.player_id}, NGR: ${r.ngr}, Games: ${r.games}`));

    console.log('---------------------------------');
}

checkDb();
