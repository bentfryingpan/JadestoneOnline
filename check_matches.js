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

async function checkMatches() {
    const membershipId = '4611686018437770947';
    console.log(`Checking stored matches for ${membershipId}...`);
    
    const { count, data } = await supabase
        .from('matches')
        .select('*', { count: 'exact' })
        .eq('player_id', membershipId);
    
    console.log(`Total rows in 'matches' for this ID: ${count}`);
    if (data?.length > 0) {
        console.log('Sample match stored:', data[0].id, data[0].map_name, data[0].ego_score);
    }
}

checkMatches();
