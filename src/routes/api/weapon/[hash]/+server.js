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
                        if (pDef && (pDef.itemTypeDisplayName?.includes('Perk') || pDef.itemTypeDisplayName?.includes('Frame') || pDef.itemTypeDisplayName?.includes('Intrinsic'))) {
                            livePerks.push({
                                name: pDef.displayProperties.name,
                                icon: BUNGIE_ROOT + pDef.displayProperties.icon,
                                description: pDef.displayProperties.description,
                                hash: pHash
                            });
                        }
                    }
                }
            }
        } catch (e) { console.error('[live-inspect] Failed:', e.message); }
    }

    // 2. Resolve Possible Perk Pools (Manifest Sockets)
    const perkPools = [];
    if (item.sockets?.socketEntries) {
        // Collect all PlugSet hashes to bulk fetch
        const psHashes = item.sockets.socketEntries
            .map(e => e.randomizedPlugSetHash || e.reusablePlugSetHash)
            .filter(Boolean);
        
        const plugSets = await getDefs('DestinyPlugSetDefinition', psHashes);
        
        // Collect all potential Perk hashes
        const allPotentialPerkHashes = new Set();
        for (const entry of item.sockets.socketEntries) {
            if (entry.singleInitialItemHash) allPotentialPerkHashes.add(entry.singleInitialItemHash);
            const ps = plugSets[entry.randomizedPlugSetHash || entry.reusablePlugSetHash];
            if (ps) ps.reusablePlugItems?.forEach(p => allPotentialPerkHashes.add(p.plugItemHash));
        }

        const allPerkDefs = await getDefs('DestinyInventoryItemDefinition', Array.from(allPotentialPerkHashes));

        for (const entry of item.sockets.socketEntries) {
            const pool = { socketType: entry.socketTypeHash, perks: [] };
            const hashes = new Set();
            if (entry.singleInitialItemHash) hashes.add(entry.singleInitialItemHash);
            const ps = plugSets[entry.randomizedPlugSetHash || entry.reusablePlugSetHash];
            if (ps) ps.reusablePlugItems?.forEach(p => hashes.add(p.plugItemHash));

            for (const pHash of hashes) {
                const pDef = allPerkDefs[pHash];
                if (pDef && pDef.displayProperties?.name && !pDef.displayProperties.name.includes('Empty')) {
                    const type = pDef.itemTypeDisplayName || '';
                    if (type.includes('Perk') || type.includes('Frame') || type.includes('Barrel') || type.includes('Magazine') || type.includes('Intrinsic')) {
                        pool.perks.push({
                            name: pDef.displayProperties.name,
                            icon: BUNGIE_ROOT + pDef.displayProperties.icon,
                            description: pDef.displayProperties.description,
                            hash: pHash
                        });
                    }
                }
            }
            if (pool.perks.length > 0) perkPools.push(pool);
        }
    }

    // 3. Filter and Resolve Stats (Visible Stats Only)
    const stats = [];
    const statSource = liveStats || item.stats?.stats || {};
    const visibleStats = [
        4284893193, 3614671103, 2523465841, 4043527740, 1240592695, 155624089, 
        943540823, 4188034523, 4254817677, 1345609583, 3555963035, 2715839340, 
        2837207746, 209426660, 105267050, 1842278914, 2961396640, 446212391,
        3871231018, // Airborne Effectiveness
    ];

    for (const sHash of Object.keys(statSource)) {
        if (!visibleStats.includes(Number(sHash))) continue;
        const sDef = await getStatDef(sHash);
        if (sDef && sDef.displayProperties.name) {
            stats.push({
                name: sDef.displayProperties.name,
                value: statSource[sHash].value ?? statSource[sHash],
                max: 100,
                icon: sDef.displayProperties.hasIcon ? BUNGIE_ROOT + sDef.displayProperties.icon : null
            });
        }
    }

    // Damage Type
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
        stats: stats.sort((a, b) => a.name.localeCompare(b.name)),
        livePerks,
        perkPools,
        damageType: dmgType,
        tier: item.inventory?.tierTypeName,
        isExotic: item.inventory?.tierType === 6,
        isLive: !!liveStats,
        hash
    });
}
