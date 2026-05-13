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
                                hash: pHash,
                                isEnhanced: pDef.displayProperties?.name?.includes('(Enhanced)') || pDef.inventory?.tierType === 3
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
        const psHashes = item.sockets.socketEntries
            .map(e => e.randomizedPlugSetHash || e.reusablePlugSetHash)
            .filter(Boolean);
        
        const plugSets = await getDefs('DestinyPlugSetDefinition', psHashes);
        
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

            const seenPerks = new Set();
            for (const pHash of hashes) {
                const pDef = allPerkDefs[pHash];
                if (pDef && pDef.displayProperties?.name && !pDef.displayProperties.name.includes('Empty')) {
                    const type = pDef.itemTypeDisplayName || '';
                    if (type.includes('Perk') || type.includes('Frame') || type.includes('Barrel') || type.includes('Magazine') || type.includes('Intrinsic') || type.includes('Trait')) {
                        // Deduplicate by name and icon (stripping enhanced tag for deduplication logic if needed, but here we just use name)
                        const key = `${pDef.displayProperties.name}_${pDef.displayProperties.icon}`;
                        if (seenPerks.has(key)) continue;
                        seenPerks.add(key);

                        pool.perks.push({
                            name: pDef.displayProperties.name,
                            icon: BUNGIE_ROOT + pDef.displayProperties.icon,
                            description: pDef.displayProperties.description,
                            hash: pHash,
                            isEnhanced: pDef.displayProperties.name.includes('(Enhanced)') || pDef.inventory?.tierType === 3
                        });
                    }
                }
            }
            if (pool.perks.length > 0) {
                // Filter out pools that are just empty slots or generic mods
                const firstPerk = pool.perks[0].name.toLowerCase();
                if (!firstPerk.includes('empty') && !firstPerk.includes('tracker')) {
                    perkPools.push(pool);
                }
            }
        }
    }

    // 3. Categorize Stats (Bar vs Value)
    const stats = [];
    const statSource = liveStats || item.stats?.stats || {};
    
    // Stats that should be displayed as progress bars (0-100)
    const barStatHashes = [
        4043527740, // Impact
        1240592695, // Range
        155624089,  // Stability
        943540823,  // Handling
        4188034523, // Reload Speed
        4254817677, // Aim Assistance
        1345609583, // Aim Assist (Alt)
        2715839340, // Recoil Direction
        3871231018, // Airborne Effectiveness
        446212391,  // Blast Radius
        2523465841, // Velocity
    ];

    // Stats that are just numeric values
    const valueStatHashes = [
        4284893193, // Rounds Per Minute
        3614671103, // Charge Time
        3893976251, // Magazine
        2961396640, // Draw Time
        2837207746, // Swing Speed
    ];

    for (const sHash of Object.keys(statSource)) {
        const h = Number(sHash);
        const isBar = barStatHashes.includes(h);
        const isValue = valueStatHashes.includes(h);
        if (!isBar && !isValue) continue;

        const sDef = await getStatDef(sHash);
        if (sDef && sDef.displayProperties.name) {
            stats.push({
                name: sDef.displayProperties.name,
                value: statSource[sHash].value ?? statSource[sHash],
                isBar,
                icon: sDef.displayProperties.hasIcon ? BUNGIE_ROOT + sDef.displayProperties.icon : null
            });
        }
    }

    // Resolve Damage Type
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
            return a.name.localeCompare(b.name);
        }),
        livePerks,
        perkPools,
        damageType: dmgType,
        tier: item.inventory?.tierTypeName,
        isExotic: item.inventory?.tierType === 6,
        isLive: !!liveStats,
        hash
    });
}
