import { BUNGIE_API_KEY } from '$env/static/private';
import { getItemDef, getStatDef, getDamageTypeDef, getRawTable } from '$lib/server/manifest.js';
import { json } from '@sveltejs/kit';

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
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
                if (match) {
                    instanceId = match.itemInstanceId;
                    break;
                }
            }

            if (instanceId) {
                const instData = profile.Response?.itemComponents?.stats?.data?.[instanceId];
                if (instData) liveStats = instData.stats;
                const plugData = profile.Response?.itemComponents?.sockets?.data?.[instanceId];
                if (plugData) {
                    for (const s of plugData.sockets) {
                        if (s.plugHash) {
                            const pDef = await getItemDef(s.plugHash);
                            if (pDef && (pDef.itemTypeDisplayName?.includes('Perk') || pDef.itemTypeDisplayName?.includes('Frame'))) {
                                livePerks.push({
                                    name: pDef.displayProperties.name,
                                    icon: BUNGIE_ROOT + pDef.displayProperties.icon,
                                    description: pDef.displayProperties.description,
                                    hash: s.plugHash
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error('[live-inspect] Failed:', e.message); }
    }

    // 2. Resolve Possible Perk Pools (Manifest Sockets)
    const perkPools = [];
    if (item.sockets?.socketEntries) {
        const plugSets = await getRawTable('DestinyPlugSetDefinition');
        
        for (const entry of item.sockets.socketEntries) {
            const pool = { socketType: entry.socketTypeHash, perks: [] };
            const hashes = new Set();

            // Collect curated/initial
            if (entry.singleInitialItemHash) hashes.add(entry.singleInitialItemHash);
            
            // Collect reusable/random pools
            const setHash = entry.randomizedPlugSetHash || entry.reusablePlugSetHash;
            if (setHash && plugSets[setHash]) {
                plugSets[setHash].reusablePlugItems?.forEach(p => hashes.add(p.plugItemHash));
            }

            for (const pHash of hashes) {
                const pDef = await getItemDef(pHash);
                // Filter for actual meaningful perks (ignore trackers/empty sockets)
                if (pDef && (pDef.itemTypeDisplayName?.includes('Perk') || pDef.itemTypeDisplayName?.includes('Frame') || pDef.itemTypeDisplayName?.includes('Barrel') || pDef.itemTypeDisplayName?.includes('Magazine'))) {
                    if (pDef.displayProperties?.name && !pDef.displayProperties.name.includes('Empty')) {
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

    // 3. Filter and Resolve Stats (Filter out hidden/irrelevant ones)
    const stats = [];
    const statSource = liveStats || item.stats?.stats || {};
    const visibleStats = [
        4284893193, // Rounds Per Minute
        3614671103, // Charge Time
        2523465841, // Velocity
        4043527740, // Impact
        1240592695, // Range
        155624089,  // Stability
        943540823,  // Handling
        4188034523, // Reload Speed
        4254817677, // Aim Assistance
        1345609583, // Aim Assist (Alternate)
        3555963035, // Combat Readiness
        2715839340, // Recoil Direction
        2837207746, // Swing Speed
        209426660,  // Guard Defense
        105267050,  // Guard Resistance
        1842278914, // Guard Endurance
        2961396640, // Draw Time
        446212391,  // Blast Radius
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
