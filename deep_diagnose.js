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

async function diagnose() {
    console.log('--- Deep Diagnostic: Jadestone Career Data ---');

    const targetId = '4611686018437770947';

    // 1. Check manifest_definitions
    const { count: manifestCount, error: mErr } = await supabase
        .from('manifest_definitions')
        .select('*', { count: 'exact', head: true });
    
    if (mErr) console.error('❌ Manifest Table Error:', mErr.message);
    else console.log(`✅ Manifest Definitions: ${manifestCount} rows`);

    // 2. Check matches table
    const { count: matchCount, data: matchSamples, error: matchErr } = await supabase
        .from('matches')
        .select('id, player_id, map_name, outcome, stats_json', { count: 'exact' })
        .eq('player_id', targetId)
        .limit(3);

    if (matchErr) console.error('❌ Matches Table Error:', matchErr.message);
    else {
        console.log(`✅ Matches for ${targetId}: ${matchCount} rows`);
        if (matchSamples?.length > 0) {
            console.log('Match Sample:', JSON.stringify(matchSamples[0], null, 2));
        } else {
            console.warn('⚠️ No matches found for this player ID string.');
            
            // Check for ANY matches to see what ID format is being used
            const { data: anyMatch } = await supabase.from('matches').select('player_id').limit(1);
            if (anyMatch?.length > 0) {
                console.log('Found match with player_id:', anyMatch[0].player_id, '(Type:', typeof anyMatch[0].player_id, ')');
            }
        }
    }

    // 3. Check players table
    const { data: playerRow, error: pErr } = await supabase
        .from('players')
        .select('*')
        .eq('id', targetId)
        .single();
    
    if (pErr) console.error('❌ Player Record Error:', pErr.message);
    else console.log(`✅ Player Record: Found ${playerRow.bungie_name}#${playerRow.bungie_code} (Games: ${playerRow.games_played})`);

    console.log('--- Diagnosis Complete ---');
}

diagnose();
