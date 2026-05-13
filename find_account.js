import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const BUNGIE_API_KEY = process.env.BUNGIE_API_KEY;
const headers = { 'X-API-Key': BUNGIE_API_KEY };

async function findAccount() {
	const name = 'bent';
	const code = '9599';

	console.log(`Searching for ${name}#${code}...`);
	const res = await fetch(
		`https://www.bungie.net/Platform/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(name + '#' + code)}/`,
		{ headers }
	);
	const data = await res.json();

	console.log('Results:', JSON.stringify(data.Response, null, 2));
}

findAccount();
