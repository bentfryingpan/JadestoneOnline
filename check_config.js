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

async function checkConfig() {
    console.log('URL:', process.env.PUBLIC_SUPABASE_URL);
    // Hide the key but check if it's there
    console.log('Key length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length);

    const { data, error } = await supabase.from('player_gambit_stats').select('player_id').limit(1);
    if (error) console.log('Error player_gambit_stats:', error.message);
    else console.log('Successfully read from player_gambit_stats:', data);

    const { data: d2, error: e2 } = await supabase.from('player_matches').select('*').limit(1);
    if (e2) console.log('Error player_matches:', e2.message);
    else console.log('Successfully read from player_matches:', d2);
}

checkConfig();
