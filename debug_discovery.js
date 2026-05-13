import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const BUNGIE_API_KEY = process.env.BUNGIE_API_KEY;
const headers = { 'X-API-Key': BUNGIE_API_KEY };

async function debugDiscovery() {
	const membershipType = 2; // PSN (Cross-save override)
	const membershipId = '4611686018437770947';

	console.log(`--- Debugging Discovery for ${membershipId} (Type ${membershipType}) ---`);

	// 1. Get Profile to find active characters
	const profRes = await fetch(
		`https://www.bungie.net/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100`,
		{ headers }
	);
	const profData = await profRes.json();
	const charIds = profData.Response?.profile?.data?.characterIds ?? [];

	if (!charIds.length) {
		console.error('No characters found for this account.');
		console.log('Full Response:', JSON.stringify(profData, null, 2));
		return;
	}
	console.log(`Found characters: ${charIds.join(', ')}`);

	// 2. Try fetching Gambit matches for the first character
	const charId = charIds[0];
	console.log(`Fetching Gambit activities for character ${charId}...`);

	const actRes = await fetch(
		`https://www.bungie.net/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${charId}/Stats/Activities/?mode=63&count=10&page=0`,
		{ headers }
	);
	const actData = await actRes.json();

	if (actData.ErrorCode !== 1) {
		console.error(`Bungie Error: ${actData.Message}`);
	} else {
		const activities = actData.Response?.activities ?? [];
		console.log(`Successfully fetched ${activities.length} activities.`);
		if (activities.length > 0) {
			console.log('Sample Instance ID:', activities[0].activityDetails?.instanceId);
		} else {
			console.warn('Bungie returned 0 activities for mode 63 (Gambit).');
		}
	}
}

debugDiscovery();
