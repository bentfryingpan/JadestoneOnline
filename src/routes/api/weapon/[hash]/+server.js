import { BUNGIE_API_KEY } from '$env/static/private';
import { getItemDef, getStatDef, getDamageTypeDef } from '$lib/server/manifest.js';
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

    // ── Optional: Live Peer-to-Peer Inspection ──────────────────────────────
    if (membershipId && membershipType) {
        try {
            const profile = await bungieGet(
                `/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=205,302,305`
            );
            const equipment = profile.Response?.characterEquipment?.data || {};
            
            // Find the item in their current loadout
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
                if (instData) {
                    liveStats = instData.stats;
                }
                const plugData = profile.Response?.itemComponents?.sockets?.data?.[instanceId];
                if (plugData) {
                    // Extract perks (limited to meaningful ones)
                    for (const s of plugData.sockets) {
                        if (s.plugHash) {
                            const pDef = await getItemDef(s.plugHash);
                            if (pDef && pDef.itemTypeDisplayName?.includes('Perk')) {
                                livePerks.push({
                                    name: pDef.displayProperties.name,
                                    icon: BUNGIE_ROOT + pDef.displayProperties.icon,
                                    description: pDef.displayProperties.description
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error('[live-inspect] Failed:', e.message); }
    }

    // ── Resolve Stats (Live vs Catalog) ────────────────────────────────────
    const stats = [];
    const statSource = liveStats || item.stats?.stats || {};
    const statHashes = Object.keys(statSource);
    
    for (const sHash of statHashes) {
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

    // ── Resolve Damage Type ────────────────────────────────────────────────
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
        perks: livePerks,
        damageType: dmgType,
        tier: item.inventory?.tierTypeName,
        isExotic: item.inventory?.tierType === 6,
        isLive: !!liveStats,
        hash
    });
}
