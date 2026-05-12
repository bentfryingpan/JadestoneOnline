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

async function inspectData() {
    console.log('--- Data Inspection ---');
    
    // Check one match
    const { data: matches, error: err1 } = await supabase
        .from('player_matches')
        .select('player_id, pgcr_id')
        .limit(3);
    
    if (err1) console.log('Error matches:', err1.message);
    else console.log('Recent Match Samples:', matches);

    // Check NGR
    const { data: ngr, error: err2 } = await supabase
        .from('player_ngr_cache')
        .select('*')
        .limit(3);
    
    if (err2) console.log('Error NGR:', err2.message);
    else console.log('NGR Samples:', ngr);

    // Check Manifest
    const { data: manifest, error: err3 } = await supabase
        .from('manifest_definitions')
        .select('table_name, hash')
        .limit(3);
    
    if (err3) console.log('Error Manifest:', err3.message);
    else console.log('Manifest Samples:', manifest);

    console.log('-----------------------');
}

inspectData();
