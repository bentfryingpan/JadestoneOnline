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

async function manualWipe() {
    const targetId = '4611686018437770947';
    // The corrupted ID is 4611686018437771000
    const corruptedId = '4611686018437771000';

    console.log(`--- Manual Database Wipe (Corrected) ---`);

    // 1. Wipe from 'matches'
    console.log('Wiping from matches...');
    const { count: mCount, error: mErr } = await supabase
        .from('matches')
        .delete({ count: 'exact' })
        .or(`player_id.eq.${targetId},player_id.eq.${corruptedId}`);
    
    if (mErr) console.error('Error wiping matches:', mErr.message);
    else console.log(`Successfully deleted ${mCount} rows from 'matches'.`);

    // 2. Wipe from 'players'
    console.log('Wiping from players...');
    const { count: pCount, error: pErr } = await supabase
        .from('players')
        .delete({ count: 'exact' })
        .or(`id.eq.${targetId},id.eq.${corruptedId}`);

    if (pErr) console.error('Error wiping players:', pErr.message);
    else console.log(`Successfully deleted ${pCount} rows from 'players'.`);

    // 3. Wipe from 'player_gambit_stats'
    console.log('Wiping from player_gambit_stats...');
    const { count: sCount, error: sErr } = await supabase
        .from('player_gambit_stats')
        .delete({ count: 'exact' })
        .or(`player_id.eq.${targetId},player_id.eq.${corruptedId}`);

    if (sErr) console.error('Error wiping player_gambit_stats:', sErr.message);
    else console.log(`Successfully deleted ${sCount} rows from 'player_gambit_stats'.`);

    console.log('--- Manual Wipe Complete ---');
}

manualWipe();
