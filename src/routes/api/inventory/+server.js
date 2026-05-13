/**
 * /api/inventory — Fetch player's complete inventory (equipped + vaulted).
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import {
	getItemDef,
	getSandboxPerkDef,
	getStatDef,
	getDamageTypeDef
} from '$lib/server/manifest.js';

const BUNGIE_ROOT = 'https://www.bungie.net';

export async function GET({ url }) {
	const membershipType = url.searchParams.get('membershipType');
	const membershipId = url.searchParams.get('membershipId');

	if (!membershipId || !membershipType) {
		return json({ error: 'Missing parameters' }, { status: 400 });
	}

	try {
		// Fetch Profile Components:
		// 102: Profile Inventories (Vault)
		// 201: Character Inventories
		// 205: Character Equipment
		// 300: Item Instances (Stats/Energy)
		// 302: Item Perks
		// 305: Item Sockets (The actual rolls!)
		const res = await fetch(
			`${BUNGIE_ROOT}/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=102,201,205,300,302,305`,
			{ headers: { 'X-API-Key': BUNGIE_API_KEY } }
		);
		const data = await res.json();
		if (data.ErrorCode !== 1) throw new Error(data.Message);

		const profile = data.Response;
		const vaultItems = profile.profileInventory?.data?.items ?? [];
		const charInventories = profile.characterInventories?.data ?? {};
		const charEquipment = profile.characterEquipment?.data ?? {};
		const instances = profile.itemComponents?.instances?.data ?? {};
		const sockets = profile.itemComponents?.sockets?.data ?? {};

		// Combine all items
		const allItems = [...vaultItems];
		for (const items of Object.values(charInventories)) allItems.push(...items.items);
		for (const items of Object.values(charEquipment)) allItems.push(...items.items);

		// Filter for Weapons and Armor only (to save bandwidth/processing)
		// We'll enrich them in batches
		const weapons = [];
		const armor = [];

		for (const item of allItems) {
			const def = await getItemDef(item.itemHash);
			if (!def) continue;

			// itemType 3 = Weapon, 2 = Armor
			if (def.itemType !== 3 && def.itemType !== 2) continue;

			const inst = instances[item.itemInstanceId] ?? {};
			const sock = sockets[item.itemInstanceId]?.sockets ?? [];

			// Find interesting perks (Exclude default/intrinsic nodes if possible, or just send all)
			const perks = [];
			for (const s of sock) {
				if (!s.plugHash) continue;
				const plugDef = await getItemDef(s.plugHash);
				if (plugDef?.itemCategoryHashes?.includes(2237026323)) {
					// Trait Category
					perks.push({
						hash: s.plugHash,
						name: plugDef.displayProperties.name,
						icon: BUNGIE_ROOT + plugDef.displayProperties.icon
					});
				}
			}

			const enriched = {
				hash: item.itemHash,
				instanceId: item.itemInstanceId,
				name: def.displayProperties.name,
				icon: BUNGIE_ROOT + def.displayProperties.icon,
				tier: def.inventory.tierType,
				slot: def.inventory.bucketTypeHash,
				type: def.itemTypeDisplayName,
				power: inst.primaryStat?.value ?? 0,
				perks,
				isExotic: def.inventory.tierType === 6
			};

			if (def.itemType === 3) weapons.push(enriched);
			else armor.push(enriched);
		}

		return json({ weapons, armor });
	} catch (e) {
		console.error('Inventory fetch failed', e);
		return json({ error: e.message }, { status: 500 });
	}
}
