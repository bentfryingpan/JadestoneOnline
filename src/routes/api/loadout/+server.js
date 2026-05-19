import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import {
	getItemDef,
	getSandboxPerkDef,
	getStatDef,
	getDamageTypeDef,
	getStatNames
} from '$lib/server/manifest.js';
import { getClarityMap, getClarityDescription } from '$lib/server/clarity.js';
// getItemDef and getSandboxPerkDef use makeHashLookup with a shared in-process
// cache — the same keys used by the match page, so a weapon looked up on a
// match page is already warm when the loadout tab opens (and vice-versa).

const BUNGIE_ROOT = 'https://www.bungie.net';

const BUCKET_HASHES = {
	1498876634: 'kinetic',
	2465295065: 'energy',
	953998645: 'power',
	3448274439: 'helmet',
	3551918588: 'gauntlets',
	14239492: 'chest',
	20886954: 'legs',
	1585787867: 'classItem',
	4023194814: 'ghost',
	2025709351: 'vehicle',
	284967655: 'ship',
	4274335291: 'emblem',
	3284755031: 'subclass',
	1506418338: 'artifact'
};

// Weapon stat hashes — stable Bungie API values.
// Names are also fetched live from DestinyStatDefinition below; these are fallbacks.
// Order mirrors the in-game / DIM display order.
const WEAPON_STAT_MAP = {
	// Fire-mode stat (only one shows per weapon type — RPM / Draw Time / Charge Time)
	1480404414: { name: 'RPM', order: 0 },
	4284893193: { name: 'Draw Time', order: 0 },
	2961396640: { name: 'Charge Time', order: 0 },
	// Universal damage stats
	4043523819: { name: 'Impact', order: 1 },
	3614673599: { name: 'Blast Radius', order: 1 }, // rockets / GLs (same slot as Impact on other weapons)
	// Range / Velocity
	1240592695: { name: 'Range', order: 2 },
	2523465841: { name: 'Velocity', order: 2 }, // rockets / LFRs (same slot as Range)
	// Handling & reload
	155624089: { name: 'Stability', order: 3 },
	943549884: { name: 'Handling', order: 4 },
	4188031367: { name: 'Reload Speed', order: 5 },
	// Aiming
	1345609583: { name: 'Aim Assistance', order: 6 },
	1931675084: { name: 'Airborne', order: 7 },
	2846385770: { name: 'Zoom', order: 8 }, // actual Zoom hash (separate from Blast Radius)
	// Ammo
	3871231066: { name: 'Mag', order: 9 }, // Magazine size
	1885944937: { name: 'Inventory Size', order: 10 }, // Total reserve ammo
	// Ballistics
	4188031367: { name: 'Reload Speed', order: 5 },
	// Recoil
	2714273228: { name: 'Recoil Dir.', order: 11 },
	// Accuracy / Bounce (bows, swords)
	3700468519: { name: 'Accuracy', order: 11 },
	// Sword stats
	2837207746: { name: 'Swing Speed', order: 0 },
	3736848092: { name: 'Guard Efficiency', order: 3 },
	3600925574: { name: 'Guard Endurance', order: 4 },
	3779501674: { name: 'Guard Resistance', order: 5 },
	925767036: { name: 'Charge Rate', order: 1 }, // glaive / sword
	// Glaive
	1890422460: { name: 'Shield Duration', order: 3 }
};

// Hashes are stable; names are fetched live from DestinyStatDefinition so
// they stay current if Bungie renames them (e.g. Resilience → Health).
// Colors are positional — we control these.
const ARMOR_STAT_CONFIG = [
	{ hash: 2996146975, color: 'bg-sky-400', text: 'text-sky-400' }, // Mobility / Weapons
	{ hash: 392767087, color: 'bg-green-400', text: 'text-green-400' }, // Resilience / Health
	{ hash: 1943323491, color: 'bg-fuchsia-400', text: 'text-fuchsia-400' }, // Recovery / Class
	{ hash: 1735777505, color: 'bg-teal-400', text: 'text-teal-400' }, // Discipline / Grenade
	{ hash: 144602215, color: 'bg-yellow-400', text: 'text-yellow-400' }, // Intellect / Super
	{ hash: 4244567218, color: 'bg-red-400', text: 'text-red-400' } // Strength / Melee
];

async function bungieGet(url) {
	const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
	return res.json();
}

// Thin wrappers so the rest of the file keeps its [hash, def] tuple convention
async function fetchDef(hash) {
	const def = await getItemDef(hash);
	return [hash, def];
}

async function fetchPerkDef(hash) {
	const def = await getSandboxPerkDef(hash);
	return [hash, def];
}

export async function GET({ url, setHeaders }) {
	const membershipType = url.searchParams.get('membershipType');
	const membershipId = url.searchParams.get('membershipId');
	const charId = url.searchParams.get('charId');

	if (!membershipType || !membershipId || !charId) {
		return json({ error: 'Missing params' }, { status: 400 });
	}

	setHeaders({ 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' });

	// ── 1. One Bungie profile call: equipment + sockets + instances + stats ───
	// 104=profileProgressions(artifact), 202=characterEquipment,
	// 205=characterProgressions (REQUIRED — without it 202 returns empty, Bungie quirk),
	// 300=itemInstances(power), 303=itemStats(armor stats), 304=itemSockets, 305=socketPlugStates
	const profileData = await bungieGet(
		`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=104,202,205,300,303,304,305`
	);

	const profile = profileData.Response ?? {};
	const equipData = profile?.characterEquipment?.data ?? {};
	const socketsData = profile?.itemComponents?.sockets?.data ?? {};
	const instancesData = profile?.itemComponents?.instances?.data ?? {};
	const statsData = profile?.itemComponents?.stats?.data ?? {};

	const items = equipData[charId]?.items ?? [];
	const instanceIds = items.map((i) => i.itemInstanceId).filter(Boolean);

	// ── 2. Collect ALL unique hashes: items + plugs + artifact ───────────────
	const itemHashes = items.map((i) => i.itemHash);
	const plugHashes = instanceIds.flatMap((id) =>
		(socketsData[id]?.sockets ?? []).map((s) => s.plugHash).filter(Boolean)
	);
	const artifactHash = profile?.profileProgression?.data?.seasonalArtifact?.artifactHash;

	const allHashes = [
		...new Set([...itemHashes, ...plugHashes, ...(artifactHash ? [artifactHash] : [])])
	];

	// ── 3. Pre-fetch item defs → extract unique damage type hashes ──────────
	const defEntries_pre = await Promise.all(allHashes.map(fetchDef));
	const defMap_pre = new Map(defEntries_pre);
	const dmgTypeHashes = [
		...new Set(items.map((i) => defMap_pre.get(i.itemHash)?.defaultDamageTypeHash).filter(Boolean))
	];

	// ── 4. Fetch armor stat defs + damage type defs + weapon stat names + clarity in parallel
	// Uses manifest service (which maintains its own bulk-table cache).
	const weaponStatHashes = Object.keys(WEAPON_STAT_MAP).map(Number);
	const [armorStatDefs, dmgTypeDefs, weaponStatNames, clarityMap] = await Promise.all([
		Promise.all(ARMOR_STAT_CONFIG.map((s) => getStatDef(s.hash))),
		Promise.all(dmgTypeHashes.map((h) => getDamageTypeDef(h).then((d) => [h, d]))),
		getStatNames(weaponStatHashes),
		getClarityMap()
	]);
	const defMap = defMap_pre; // alias — item defs already fetched above
	const dmgTypeMap = new Map(dmgTypeDefs);

	// Build the live ARMOR_STATS from manifest names — stays correct through renames
	const ARMOR_STATS = ARMOR_STAT_CONFIG.map((cfg, i) => {
		const def = armorStatDefs[i];
		const name =
			def?.displayProperties?.name ??
			['Mobility', 'Resilience', 'Recovery', 'Discipline', 'Intellect', 'Strength'][i];
		const desc = def?.displayProperties?.description ?? '';
		// Short label: first 3 chars of each word capitalised
		const short = name
			.split(' ')
			.map((w) => w.slice(0, 3).toUpperCase())
			.join('/')
			.slice(0, 7);
		return { hash: cfg.hash, name, short, description: desc, color: cfg.color, text: cfg.text };
	});

	// ── 4. Build equipment synchronously ─────────────────────────────────────

	function classifySocket(s, def) {
		if (!def) return null;
		const typeName = (def.itemTypeDisplayName ?? '').toLowerCase();
		const name = def.displayProperties?.name ?? '';
		if (!name || name === 'Default Shader' || name === 'Empty Mod Socket') return null;
		if (
			typeName.includes('tracker') ||
			typeName.includes('shader') ||
			typeName.includes('ornament')
		)
			return null;

		// investmentStats: numerical bonuses this plug grants (e.g. +10 to a stat)
		// Filter out conditional-only stats (perks that only trigger sometimes)
		const statBonuses = (def.investmentStats ?? [])
			.filter((st) => st.value !== 0 && !st.isConditionallyActive)
			.map((st) => ({ statHash: st.statTypeHash, value: st.value }));

		// Conditionally active stats shown separately (e.g. Charged with Light mods)
		const conditionalBonuses = (def.investmentStats ?? [])
			.filter((st) => st.value !== 0 && st.isConditionallyActive)
			.map((st) => ({ statHash: st.statTypeHash, value: st.value }));

		// Collect perk hashes for sandbox perk fallback lookup.
		// Do NOT filter by isDisplayable — Bungie leaves that false for most fragment/aspect
		// perks even though DestinySandboxPerkDefinition does have useful descriptions for them.
		const perkHashes = (def.perks ?? [])
			.filter((p) => p.perkHash)
			.map((p) => p.perkHash);

		// D2 Clarity description — keyed by the item hash itself
		const clarityDescription = getClarityDescription(clarityMap, s.plugHash);

		return {
			hash: s.plugHash,
			name,
			icon: def.displayProperties?.icon ? BUNGIE_ROOT + def.displayProperties.icon : null,
			isEnabled: s.isEnabled,
			isIntrinsic: typeName.includes('intrinsic'),
			isMasterwork: typeName.includes('masterwork'),
			isEnhanced: name.toLowerCase().startsWith('enhanced ') || typeName.includes('enhanced trait'),
			isMod: typeName.includes('weapon mod') || typeName.includes('armor mod'),
			energyCost: def.plug?.energyCost?.energyCost ?? 0,
			itemTypeDisplayName: def.itemTypeDisplayName ?? '',
			description: def.displayProperties?.description ?? '',
			flavorText: def.flavorText ?? '',
			clarityDescription,
			perkHashes,
			statBonuses,
			conditionalBonuses
		};
	}

	const grouped = {};

	for (const item of items) {
		const def = defMap.get(item.itemHash);
		const slot = BUCKET_HASHES[def?.inventory?.bucketTypeHash] ?? 'other';
		if (slot === 'other' || slot === 'emblem') continue;

		const instance = instancesData[item.itemInstanceId];

		// Resolve damage type definition for icon + color
		const dmgHash = def?.defaultDamageTypeHash;
		const dmgTypeDef = dmgHash ? dmgTypeMap.get(dmgHash) : null;

		const itemData = {
			instanceId: item.itemInstanceId,
			hash: item.itemHash,
			name: def?.displayProperties?.name ?? 'Unknown',
			icon: def?.displayProperties?.icon ? BUNGIE_ROOT + def.displayProperties.icon : null,
			// Full-resolution weapon/armor artwork (used as inspect-panel banner background)
			screenshot: def?.screenshot ? BUNGIE_ROOT + def.screenshot : null,
			// DLC / seasonal watermark badge overlaid on the item icon (same pixel dimensions as icon)
			iconWatermark: def?.iconWatermark
				? BUNGIE_ROOT + def.iconWatermark
				: def?.iconWatermarkShelved
					? BUNGIE_ROOT + def.iconWatermarkShelved
					: null,
			tierType: def?.inventory?.tierType,
			tierTypeName: def?.inventory?.tierTypeName ?? null,
			itemType: def?.itemType,
			itemSubType: def?.itemSubType,
			damageType: def?.defaultDamageType,
			damageTypeIcon: dmgTypeDef?.displayProperties?.icon
				? BUNGIE_ROOT + dmgTypeDef.displayProperties.icon
				: null,
			damageTypeName: dmgTypeDef?.displayProperties?.name ?? null,
			slot,
			flavorText: def?.flavorText ?? '',
			itemTypeDisplayName: def?.itemTypeDisplayName ?? '',
			power: instance?.primaryStat?.value ?? null
		};

		// Weapon perks (itemType 3)
		if (def?.itemType === 3 && item.itemInstanceId) {
			const sockets = socketsData[item.itemInstanceId]?.sockets ?? [];
			itemData.perks = sockets
				.map((s) => (s.plugHash && s.isVisible ? classifySocket(s, defMap.get(s.plugHash)) : null))
				.filter(Boolean);
			// Masterwork: any enabled socket whose type mentions 'masterwork'
			itemData.masterwork = sockets.some((s) => {
				if (!s.plugHash || !s.isEnabled) return false;
				const sdef = defMap.get(s.plugHash);
				return (sdef?.itemTypeDisplayName ?? '').toLowerCase().includes('masterwork');
			});
			// Weapon stats from itemStats component (component 303)
			if (statsData[item.itemInstanceId]) {
				const raw = statsData[item.itemInstanceId].stats ?? {};
				itemData.weaponStats = Object.entries(raw)
					.map(([hashStr, stat]) => {
						const hash = Number(hashStr);
						const info = WEAPON_STAT_MAP[hash];
						if (!info) return null;
						// Prefer live manifest stat name, fall back to our map label
						const liveName = weaponStatNames[hash];
						return {
							hash,
							name: liveName ?? info.name,
							value: stat.value ?? 0,
							maximum: stat.displayMaximum ?? stat.maximum ?? 100,
							order: info.order
						};
					})
					.filter(Boolean)
					// De-duplicate by hash (WEAPON_STAT_MAP has intentional dupes for blast-radius/range overlap)
					.filter((s, i, arr) => arr.findIndex((x) => x.hash === s.hash) === i)
					.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
			}
		}

		// Armor (itemType 2): stats + mods + energy + masterwork
		if (def?.itemType === 2 && item.itemInstanceId) {
			// Energy capacity indicates masterwork (cap=10 means fully masterworked)
			const energy = instance?.energy ?? {};
			itemData.masterwork = (energy.energyCapacity ?? 0) >= 10;
			itemData.energyCapacity = energy.energyCapacity ?? 10;
			itemData.energyUsed = energy.energyUsed ?? 0;

			// Stats from API — include max so the UI can scale bars correctly
			if (statsData[item.itemInstanceId]) {
				const raw = statsData[item.itemInstanceId].stats ?? {};
				itemData.armorStats = ARMOR_STATS.map(({ hash, name, short, color, text }) => ({
					name,
					short,
					color,
					text,
					value: raw[hash]?.value ?? 0,
					maximum: raw[hash]?.maximum ?? 30
				}));
			}

			// Sockets: count true mod slots (filled OR empty), return filled mods only
			const sockets = socketsData[item.itemInstanceId]?.sockets ?? [];
			let modSlotCount = 0;
			const filledMods = [];
			for (const s of sockets) {
				if (!s.plugHash) continue;
				const sdef = defMap.get(s.plugHash);
				const sName = sdef?.displayProperties?.name ?? '';
				const sType = (sdef?.itemTypeDisplayName ?? '').toLowerCase();
				// Empty armor mod slot
				if (sName === 'Empty Mod Socket') {
					modSlotCount++;
					continue;
				}
				// Skip everything that isn't an armor mod
				if (!sType.includes('armor mod')) continue;
				modSlotCount++;
				const classified = classifySocket(s, sdef);
				if (classified && classified.isMod) filledMods.push(classified);
			}
			itemData.modSlotCount = modSlotCount || 4; // fallback 4
			itemData.mods = filledMods;
		}

		grouped[slot] = itemData;
	}

	// ── 5. Subclass sockets ───────────────────────────────────────────────────
	const subclassItem = items.find((i) => {
		const def = defMap.get(i.itemHash);
		return BUCKET_HASHES[def?.inventory?.bucketTypeHash] === 'subclass';
	});

	if (subclassItem?.itemInstanceId) {
		const sockets = socketsData[subclassItem.itemInstanceId]?.sockets ?? [];
		const resolved = sockets
			.map((s) => (s.plugHash && s.isVisible ? classifySocket(s, defMap.get(s.plugHash)) : null))
			.filter(Boolean);

		// Batch-fetch DestinySandboxPerkDefinition for any socket that has an empty description
		// (Bungie leaves displayProperties.description blank for many aspects/fragments)
		const needsPerkLookup = resolved.filter((s) => !s.description && s.perkHashes?.length > 0);
		if (needsPerkLookup.length > 0) {
			const allPerkHashes = [...new Set(needsPerkLookup.flatMap((s) => s.perkHashes))];
			const perkEntries = await Promise.all(allPerkHashes.map(fetchPerkDef));
			const perkMap = new Map(perkEntries);
			for (const s of needsPerkLookup) {
				// Use the first perk with a non-empty description
				for (const ph of s.perkHashes) {
					const pd = perkMap.get(ph);
					const desc = pd?.displayProperties?.description ?? '';
					if (desc) {
						s.perkDescription = desc;
						break;
					}
				}
			}
		}

		grouped.subclassSockets = {
			super: resolved.find((s) => s.itemTypeDisplayName?.toLowerCase().includes('super')),
			abilities: resolved.filter((s) =>
				['grenade', 'melee', 'class ability', 'movement ability'].some((k) =>
					s.itemTypeDisplayName?.toLowerCase().includes(k)
				)
			),
			aspects: resolved.filter((s) => s.itemTypeDisplayName?.toLowerCase().includes('aspect')),
			fragments: resolved.filter((s) => s.itemTypeDisplayName?.toLowerCase().includes('fragment'))
		};
	}

	// ── 6. Seasonal artifact ─────────────────────────────────────────────────
	let artifact = null;
	if (artifactHash) {
		const artifactRaw = profile?.profileProgression?.data?.seasonalArtifact ?? {};
		const def = defMap.get(artifactHash);
		artifact = {
			name: def?.displayProperties?.name ?? 'Seasonal Artifact',
			icon: def?.displayProperties?.icon ? BUNGIE_ROOT + def.displayProperties.icon : null,
			powerBonus: artifactRaw.powerBonus ?? 0,
			pointsAcquired: artifactRaw.pointsAcquired ?? 0,
			pointsUsed: artifactRaw.pointsUsed ?? 0
		};
	}

	return json({ equipment: grouped, artifact, armorStatMeta: ARMOR_STATS });
}
