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

async function checkMedals() {
	console.log('--- Medal Definition Diagnostic ---');

	const { data: rows, error } = await supabase
		.from('manifest_definitions')
		.select('hash, data')
		.eq('table_name', 'DestinyHistoricalStatsDefinition')
		.like('hash', 'medal%')
		.limit(5);

	if (error) {
		console.error('Error:', error.message);
	} else if (!rows || rows.length === 0) {
		console.warn(
			'No medals found in manifest_definitions under table DestinyHistoricalStatsDefinition.'
		);
	} else {
		console.log(`Found ${rows.length} sample medals.`);
		rows.forEach((r) => {
			console.log(`Medal: ${r.hash}`);
			console.log(`  Name: ${r.data.statName}`);
			console.log(`  Icon: ${r.data.iconImage}`);
		});
	}

	console.log('-----------------------------------');
}

checkMedals();
