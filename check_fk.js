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

async function checkFK() {
    console.log('Checking players table...');
    const id = '4611686018437770947';
    const { data, error } = await supabase.from('players').select('*').eq('id', id).single();
    if (error) console.log('Player not found in players table:', error.message);
    else console.log('Player exists:', data.bungie_name);

    if (!data) {
        console.log('Creating player record...');
        await supabase.from('players').insert({
            id: id,
            bungie_name: 'bent',
            bungie_code: 9599,
            membership_type: 2
        });
        console.log('Created.');
    }
}

checkFK();
