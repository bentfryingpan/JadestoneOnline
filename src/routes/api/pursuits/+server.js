/**
 * /api/pursuits — Fetch player's Gambit-related Records (Triumphs) and Collectibles.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { getRecordDef, getCollectibleDef, getPresentationNodeDef } from '$lib/server/manifest.js';

const BUNGIE_ROOT = 'https://www.bungie.net';

export async function GET({ url }) {
	const membershipType = url.searchParams.get('membershipType');
	const membershipId = url.searchParams.get('membershipId');

	if (!membershipId || !membershipType) {
		return json({ error: 'Missing parameters' }, { status: 400 });
	}

	try {
		// 1. Fetch Profile Components 800 (Collectibles), 900 (Records)
		const profileRes = await fetch(
			`${BUNGIE_ROOT}/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=800,900`,
			{ headers: { 'X-API-Key': BUNGIE_API_KEY } }
		);
		const profileData = await profileRes.json();
		const records = profileData?.Response?.profileRecords?.data?.records ?? {};
		const collectibles = profileData?.Response?.profileCollectibles?.data?.collectibles ?? {};

		// 2. Comprehensive Node Discovery
		// We'll target several known Gambit root nodes and any nodes named "Gambit"
		const GAMBIT_ROOTS = [
			97371225,   // Triumphs -> Lifetime -> Competitive -> Gambit
			3783427643, // Triumphs -> Medals -> Gambit
			4111024827, // Collections -> Gambit
			22122108    // Legacy/Other Gambit
		];

		const allRecordHashes = new Set();
		const allCollectibleHashes = new Set();

		async function scanNode(nodeHash) {
			const node = await getPresentationNodeDef(nodeHash);
			if (!node) return;

			for (const r of node.children?.records ?? []) {
				allRecordHashes.add(r.recordHash);
			}
			for (const c of node.children?.collectibles ?? []) {
				allCollectibleHashes.add(c.collectibleHash);
			}
			for (const childNode of node.children?.presentationNodes ?? []) {
				await scanNode(childNode.presentationNodeHash);
			}
		}

		// Execute recursive scan
		for (const root of GAMBIT_ROOTS) {
			await scanNode(root);
		}

		// 3. Process Records (Triumphs & Medals)
		const processedRecords = [];
		for (const hash of allRecordHashes) {
			const def = await getRecordDef(hash);
			if (!def || def.redacted) continue;

			const recordState = records[hash] ?? {};
			const state = recordState.state ?? 0;
			const isCompleted = !(state & 1); 
			const objectives = recordState.objectives ?? [];

			processedRecords.push({
				hash,
				name: def.displayProperties?.name,
				description: def.displayProperties?.description,
				icon: def.displayProperties?.hasIcon ? BUNGIE_ROOT + def.displayProperties.icon : null,
				isCompleted,
				state,
				recordType: def.recordTypeName || 'Triumph',
				objectives: objectives.map((obj) => ({
					progress: obj.progress,
					completionValue: obj.completionValue,
					complete: obj.complete
				}))
			});
		}

		// 4. Process Collectibles
		const processedCollectibles = [];
		for (const hash of allCollectibleHashes) {
			const def = await getCollectibleDef(hash);
			if (!def) continue;
			const state = collectibles[hash]?.state ?? 0;
			const acquired = !(state & 1);

			processedCollectibles.push({
				hash,
				name: def.displayProperties?.name,
				icon: BUNGIE_ROOT + def.displayProperties.icon,
				acquired,
				state
			});
		}

		return json({
			records: processedRecords.sort((a, b) =>
				a.isCompleted === b.isCompleted ? 0 : a.isCompleted ? 1 : -1
			),
			collectibles: processedCollectibles,
			summary: {
				totalRecords: processedRecords.length,
				completedRecords: processedRecords.filter(r => r.isCompleted).length,
				totalCollectibles: processedCollectibles.length,
				acquiredCollectibles: processedCollectibles.filter(c => c.acquired).length
			}
		});
	} catch (e) {
		console.error('Pursuits fetch failed', e);
		return json({ error: e.message }, { status: 500 });
	}
}
