import { BUNGIE_API_KEY } from '$env/static/private';
import { getItemDef, getStatDef, getDamageTypeDef, getDefs } from '$lib/server/manifest.js';
import { json } from '@sveltejs/kit';

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!res.ok) return null;
    const text = await res.text();
    const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
    return JSON.parse(fixed);
}

export async function GET({ params, url }) {
    const { hash } = params;
    const membershipId = url.searchParams.get('mid');
    const membershipType = url.searchParams.get('mt');

    if (!hash) return json({ error: 'Missing hash' }, { status: 400 });

    const item = await getItemDef(hash);
    if (!item) return json({ error: 'Item not found' }, { status: 404 });

    let liveStats = null;
    let livePerks = [];

    // 1. Live Peer-to-Peer Inspection
    if (membershipId && membershipType) {
        try {
            const profile = await bungieGet(
                `/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=205,302,305`
            );
            const equipment = profile.Response?.characterEquipment?.data || {};
            
            let instanceId = null;
            for (const charId in equipment) {
                const match = equipment[charId].items.find(i => String(i.itemHash) === String(hash));
                if (match) { instanceId = match.itemInstanceId; break; }
            }

            if (instanceId) {
                const instData = profile.Response?.itemComponents?.stats?.data?.[instanceId];
                if (instData) liveStats = instData.stats;
                const plugData = profile.Response?.itemComponents?.sockets?.data?.[instanceId];
                if (plugData) {
                    const plugHashes = plugData.sockets.map(s => s.plugHash).filter(Boolean);
                    const plugDefs = await getDefs('DestinyInventoryItemDefinition', plugHashes);
                    
                    for (const pHash of plugHashes) {
                        const pDef = plugDefs[pHash];
                        if (pDef && (pDef.itemTypeDisplayName?.includes('Perk') || pDef.itemTypeDisplayName?.includes('Frame') || pDef.itemTypeDisplayName?.includes('Intrinsic') || pDef.itemTypeDisplayName?.includes('Trait'))) {
                            livePerks.push({
                                name: pDef.displayProperties.name,
                                icon: BUNGIE_ROOT + pDef.displayProperties.icon,
                                description: pDef.displayProperties.description,
                                hash: pHash,
                                isEnhanced: pDef.displayProperties?.name?.includes('(Enhanced)') || pDef.inventory?.tierType === 3
                            });
                        }
                    }
                }
            }
        } catch (e) { console.error('[live-inspect] Failed:', e.message); }
    }

    // 2. Resolve Possible Perk Pools (Enhanced Selection)
    const perkPools = [];
    const originTraits = [];

    if (item.sockets?.socketEntries) {
        const psHashes = item.sockets.socketEntries
            .map(e => e.randomizedPlugSetHash || e.reusablePlugSetHash)
            .filter(Boolean);
        
        const plugSets = await getDefs('DestinyPlugSetDefinition', psHashes);
        
        const allPotentialPerkHashes = new Set();
        for (const entry of item.sockets.socketEntries) {
            if (entry.singleInitialItemHash) allPotentialPerkHashes.add(entry.singleInitialItemHash);
            const ps = plugSets[entry.randomizedPlugSetHash || entry.reusablePlugSetHash];
            if (ps) ps.reusablePlugItems?.forEach(p => allPotentialPerkHashes.add(p.plugItemHash));
            // Check reusablePlugItems directly on entry too
            entry.reusablePlugItems?.forEach(p => allPotentialPerkHashes.add(p.plugItemHash));
        }

        const allPerkDefs = await getDefs('DestinyInventoryItemDefinition', Array.from(allPotentialPerkHashes));

        item.sockets.socketEntries.forEach((entry) => {
            const pool = { perks: [] };
            const hashes = new Set();
            if (entry.singleInitialItemHash) hashes.add(entry.singleInitialItemHash);
            const ps = plugSets[entry.randomizedPlugSetHash || entry.reusablePlugSetHash];
            if (ps) ps.reusablePlugItems?.forEach(p => hashes.add(p.plugItemHash));
            entry.reusablePlugItems?.forEach(p => hashes.add(p.plugItemHash));

            const seenPerks = new Set();
            for (const pHash of hashes) {
                const pDef = allPerkDefs[pHash];
                if (pDef && pDef.displayProperties?.name && !pDef.displayProperties.name.includes('Empty')) {
                    const type = pDef.itemTypeDisplayName || '';
                    const name = pDef.displayProperties.name;
                    
                    if (type.includes('Perk') || type.includes('Frame') || type.includes('Barrel') || type.includes('Magazine') || type.includes('Intrinsic') || type.includes('Trait')) {
                        const key = `${name}_${pDef.displayProperties.icon}`;
                        if (seenPerks.has(key)) continue;
                        seenPerks.add(key);

                        const perkData = {
                            name,
                            icon: BUNGIE_ROOT + pDef.displayProperties.icon,
                            description: pDef.displayProperties.description,
                            hash: pHash,
                            isEnhanced: name.includes('(Enhanced)') || pDef.inventory?.tierType === 3
                        };

                        if (type.toLowerCase().includes('origin trait') || name.toLowerCase().includes('origin trait')) {
                            originTraits.push(perkData);
                        } else {
                            pool.perks.push(perkData);
                        }
                    }
                }
            }

            if (pool.perks.length > 0) {
                const firstPerkName = pool.perks[0].name.toLowerCase();
                if (!firstPerkName.includes('empty') && !firstPerkName.includes('tracker')) {
                    perkPools.push(pool);
                }
            }
        });
    }

    // Deduplicate origin traits globally
    const uniqueOriginTraits = [];
    const seenOT = new Set();
    for (const ot of originTraits) {
        if (!seenOT.has(ot.name)) {
            uniqueOriginTraits.push(ot);
            seenOT.add(ot.name);
        }
    }

    // 3. Categorize Stats
    const stats = [];
    const statSource = liveStats || item.stats?.stats || {};
    
    const barStatHashes = [
        4043527740, 1240592695, 155624089, 943540823, 943549884, 4188034523, 
        4188031367, 4254817677, 1345609583, 2715839340, 3871231018, 3871231066, 
        446212391, 2523465841, 1591432999, 3555963035, 1931675084, 105267050, 
        2766642535, 1842278914, 3022301684,
    ];

    const valueStatHashes = [
        3893976251, 4284893193, 3614671103, 2961396640, 2837207746,
    ];

    const PRIORITY = {
        [4043527740]: 1, [1240592695]: 2, [155624089]: 3, [943540823]: 4, [943549884]: 4,
        [4188034523]: 5, [4188031367]: 5, [4254817677]: 6, [1345609583]: 6,
        [3555963035]: 7, [1931675084]: 7, [2715839340]: 8, [3871231018]: 9, [3871231066]: 9,
        [2523465841]: 2, [446212391]: 3, [2837207746]: 2, [2766642535]: 3, [105267050]: 4,
        [1842278914]: 5, [3022301684]: 6,
    };

    for (const sHash of Object.keys(statSource)) {
        const h = Number(sHash);
        const isBar = barStatHashes.includes(h);
        const isValue = valueStatHashes.includes(h);
        if (!isBar && !isValue) continue;

        const sDef = await getStatDef(sHash);
        if (sDef && sDef.displayProperties.name) {
            stats.push({
                hash: h,
                name: sDef.displayProperties.name,
                value: statSource[sHash].value ?? statSource[sHash],
                isBar,
                priority: PRIORITY[h] ?? 99,
                icon: sDef.displayProperties.hasIcon ? BUNGIE_ROOT + sDef.displayProperties.icon : null
            });
        }
    }

    let dmgType = null;
    if (item.defaultDamageTypeHash) {
        const dDef = await getDamageTypeDef(item.defaultDamageTypeHash);
        dmgType = {
            name: dDef?.displayProperties?.name,
            icon: dDef?.displayProperties?.hasIcon ? BUNGIE_ROOT + dDef.displayProperties.icon : null
        };
    }

    return json({
        name: item.displayProperties.name,
        type: item.itemTypeDisplayName,
        icon: BUNGIE_ROOT + item.displayProperties.icon,
        screenshot: item.screenshot ? BUNGIE_ROOT + item.screenshot : null,
        description: item.displayProperties.description,
        stats: stats.sort((a, b) => {
            if (a.isBar !== b.isBar) return a.isBar ? -1 : 1;
            if (a.isBar && b.isBar) return a.priority - b.priority;
            if (a.hash === 3893976251) return -1;
            if (b.hash === 3893976251) return 1;
            return a.name.localeCompare(b.name);
        }),
        livePerks,
        perkPools,
        originTraits: uniqueOriginTraits,
        damageType: dmgType,
        tier: item.inventory?.tierTypeName,
        isExotic: item.inventory?.tierType === 6,
        isLive: !!liveStats,
        hash
    });
}
