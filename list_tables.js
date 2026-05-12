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

async function listTables() {
    console.log('--- Database Table List ---');
    
    // Querying the schema directly using a raw SQL-like RPC or just trying common tables
    const tables = ['player_matches', 'player_ngr_cache', 'player_gambit_stats', 'manifest_definitions', 'player_queue'];
    
    for (const t of tables) {
        const { count, error } = await supabase
            .from(t)
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.log(`Table '${t}': MISSING (${error.message})`);
        } else {
            console.log(`Table '${t}': EXISTS (Count: ${count})`);
        }
    }

    console.log('---------------------------');
}

listTables();
