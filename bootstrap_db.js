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

async function bootstrap() {
    console.log('--- Bootstrap: Flawless Database Setup ---');

    // Note: Since we cannot run raw DDL (CREATE TABLE) directly via the JS client
    // without a pre-existing RPC, we will check for table existence.
    // If they are missing, I will instruct the user to run the SQL in their dashboard
    // OR try to use the REST API to detect schema.

    const tables = ['manifest_definitions', 'matches', 'players', 'player_gambit_stats'];
    
    for (const t of tables) {
        const { error } = await supabase.from(t).select('*').limit(1);
        if (error && error.message.includes('Could not find the table')) {
            console.warn(`⚠️ Table '${t}' is MISSING. Please ensure the SQL schema is applied in Supabase.`);
        } else if (error) {
            console.log(`Table '${t}' error: ${error.message}`);
        } else {
            console.log(`✅ Table '${t}' is READY.`);
        }
    }

    console.log('\n--- Bootstrap Complete ---');
}

bootstrap();
