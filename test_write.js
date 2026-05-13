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

async function testWrite() {
	console.log('Testing write to matches table...');
	const match = {
		id: '999999999',
		player_id: '4611686018437770947',
		map_name: 'TEST_MAP',
		outcome: 'Win',
		ego_score: 100,
		stats_json: { kills: 10 },
		played_at: new Date().toISOString(),
		created_at: new Date().toISOString()
	};

	const { error } = await supabase.from('matches').upsert(match);
	if (error) console.error('Write failed:', error.message);
	else {
		console.log('Write successful!');
		// Delete it back
		await supabase.from('matches').delete().eq('id', '999999999');
	}
}

testWrite();
