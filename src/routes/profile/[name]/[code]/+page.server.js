import { BUNGIE_API_KEY } from '$env/static/private';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { error } from '@sveltejs/kit';

const BUNGIE_ROOT = 'https://www.bungie.net';

const BUCKET_HASHES = {
    1498876634: 'kinetic',
    2465295065: 'energy',
    953998645:  'power',
    3448274439: 'helmet',
    3551918588: 'gauntlets',
    14239492:   'chest',
    20886954:   'legs',
    1585787867: 'classItem',
    4023194814: 'ghost',
    2025709351: 'vehicle',
    284967655:  'ship',
    4274335291: 'emblem',
    3284755031: 'subclass',
    1506418338: 'subclass'
};

export const ARMOR_STATS = [
    { hash: 2996146975, name: 'Mobility',   short: 'MOB', color: 'bg-sky-400',     text: 'text-sky-400'     },
    { hash: 392767087,  name: 'Resilience', short: 'RES', color: 'bg-green-400',   text: 'text-green-400'   },
    { hash: 1943323491, name: 'Recovery',   short: 'REC', color: 'bg-fuchsia-400', text: 'text-fuchsia-400' },
    { hash: 1735777505, name: 'Discipline', short: 'DIS', color: 'bg-teal-400',    text: 'text-teal-400'    },
    { hash: 144602215,  name: 'Intellect',  short: 'INT', color: 'bg-yellow-400',  text: 'text-yellow-400'  },
    { hash: 4244567218, name: 'Strength',   short: 'STR', color: 'bg-red-400',     text: 'text-red-400'     }
];

// Per-request manifest cache — deduplicates repeated hash lookups across characters/weapons
let _cache;

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

async function manifestItem(hash) {
    if (_cache.has(hash)) return _cache.get(hash);
    const data = await bungieGet(`/Platform/Destiny2/Manifest/DestinyInventoryItemDefinition/${hash}/`);
    const result = data.Response ?? null;
    _cache.set(hash, result);
    return result;
}

async function resolveWeaponPerks(instanceId, socketsData) {
    if (!instanceId || !socketsData[instanceId]) return [];
    const sockets = socketsData[instanceId].sockets ?? [];
    const results = await Promise.all(
        sockets.map(async (s) => {
            if (!s.plugHash || !s.isVisible) return null;
            const def = await manifestItem(s.plugHash);
            if (!def) return null;
            const typeName = (def.itemTypeDisplayName ?? '').toLowerCase();
            const pName = def.displayProperties?.name ?? '';
            if (!pName || pName === 'Default Shader' || pName === 'Empty Mod Socket') return null;
            if (typeName.includes('tracker') || typeName.includes('shader') || typeName.includes('ornament')) return null;
            return {
                hash: s.plugHash,
                name: pName,
                icon: def.displayProperties?.icon ? BUNGIE_ROOT + def.displayProperties.icon : null,
                isEnabled: s.isEnabled,
                isIntrinsic: typeName.includes('intrinsic'),
                isMasterwork: typeName.includes('masterwork'),
                isMod: typeName.includes('weapon mod') || typeName.includes('armor mod'),
                itemTypeDisplayName: def.itemTypeDisplayName ?? '',
                description: def.displayProperties?.description ?? ''
            };
        })
    );
    return results.filter(Boolean);
}

export async function load({ params, parent }) {
    _cache = new Map();
    const { name, code } = params;
    const { user } = await parent();

    const searchData = await bungieGet(
        `/Platform/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(name + '#' + code)}/`
    );

    if (searchData.ErrorCode !== 1 || !searchData.Response.length) {
        throw error(404, 'Player not found');
    }

    let player = searchData.Response.find(p => p.crossSaveOverride === p.membershipType);
    if (!player) player = searchData.Response.find(p => p.membershipType === 3) ?? searchData.Response[0];

    const { membershipType, membershipId } = player;

    // components: 100=profile, 200=characters, 202=characterEquipment, 205=characterProgressions, 304=itemStats, 305=itemSockets
    const [profileData, clanData] = await Promise.all([
        bungieGet(`/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=100,200,202,205,304,305`),
        bungieGet(`/Platform/GroupV2/User/${membershipType}/${membershipId}/0/1/`)
    ]);

    const profile    = profileData.Response ?? {};
    const charIds    = profile?.profile?.data?.characterIds ?? [];
    const characters = profile?.characters?.data ?? {};
    const equipData  = profile?.characterEquipment?.data ?? {};
    const socketsData   = profile?.itemComponents?.sockets?.data ?? {};
    const statsComponent = profile?.itemComponents?.stats?.data ?? {};
    const progressions   = profile?.characterProgressions?.data ?? {};
    const clan = clanData.Response?.results?.[0]?.group ?? null;

    const sortedCharIds = [...charIds].sort((a, b) =>
        new Date(characters[b]?.dateLastPlayed ?? 0) - new Date(characters[a]?.dateLastPlayed ?? 0)
    );
    const mainCharId = sortedCharIds[0];

    let recentMatches = [];
    let lifetimeStats = null;

    if (mainCharId) {
        const [actData, acctStats] = await Promise.all([
            bungieGet(`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Character/${mainCharId}/Stats/Activities/?mode=63&count=25&page=0`),
            bungieGet(`/Platform/Destiny2/${membershipType}/Account/${membershipId}/Stats/?modes=63`)
        ]);
        recentMatches = actData.Response?.activities ?? [];
        lifetimeStats = acctStats.Response?.gambit?.allTime ?? null;
    }

    // Resolve equipment per character
    const characterEquipment = {};

    for (const charId of sortedCharIds) {
        const items = equipData[charId]?.items ?? [];

        const resolved = await Promise.all(
            items.map(async (item) => {
                const def = await manifestItem(item.itemHash);
                const slot = BUCKET_HASHES[def?.inventory?.bucketTypeHash] ?? 'other';

                const itemData = {
                    instanceId: item.itemInstanceId,
                    hash: item.itemHash,
                    name: def?.displayProperties?.name ?? 'Unknown',
                    icon: def?.displayProperties?.icon ? BUNGIE_ROOT + def.displayProperties.icon : null,
                    screenshot: def?.screenshot ? BUNGIE_ROOT + def.screenshot : null,
                    tierType: def?.inventory?.tierType,
                    itemType: def?.itemType,
                    itemSubType: def?.itemSubType,
                    damageType: def?.defaultDamageType,
                    slot,
                    flavorText: def?.flavorText ?? '',
                    itemTypeDisplayName: def?.itemTypeDisplayName ?? ''
                };

                // Weapon perks (itemType 3)
                if (def?.itemType === 3 && item.itemInstanceId) {
                    itemData.perks = await resolveWeaponPerks(item.itemInstanceId, socketsData);
                }

                // Armor stats (itemType 2)
                if (def?.itemType === 2 && item.itemInstanceId && statsComponent[item.itemInstanceId]) {
                    const raw = statsComponent[item.itemInstanceId].stats ?? {};
                    itemData.armorStats = ARMOR_STATS.map(({ hash, name, short, color, text }) => ({
                        name, short, color, text,
                        value: raw[hash]?.value ?? 0
                    }));
                }

                return itemData;
            })
        );

        const grouped = {};
        for (const item of resolved) {
            grouped[item.slot] = item;
        }

        // Subclass sockets
        const subclassItem = resolved.find(i => i.slot === 'subclass');
        if (subclassItem?.instanceId && socketsData[subclassItem.instanceId]) {
            const sockets = socketsData[subclassItem.instanceId].sockets ?? [];
            const resolvedSockets = await Promise.all(
                sockets.map(async (s) => {
                    if (!s.plugHash || !s.isVisible) return null;
                    const def = await manifestItem(s.plugHash);
                    if (!def) return null;
                    return {
                        hash: s.plugHash,
                        name: def.displayProperties?.name ?? '',
                        icon: def.displayProperties?.icon ? BUNGIE_ROOT + def.displayProperties.icon : null,
                        isEnabled: s.isEnabled,
                        itemTypeDisplayName: def.itemTypeDisplayName ?? '',
                        description: def.displayProperties?.description ?? ''
                    };
                })
            );
            const valid = resolvedSockets.filter(Boolean);
            grouped.subclassSockets = {
                super: valid.find(s => s.itemTypeDisplayName?.toLowerCase().includes('super')),
                abilities: valid.filter(s =>
                    ['grenade', 'melee', 'class ability', 'movement ability'].some(k =>
                        s.itemTypeDisplayName?.toLowerCase().includes(k)
                    )
                ),
                aspects:   valid.filter(s => s.itemTypeDisplayName?.toLowerCase().includes('aspect')),
                fragments: valid.filter(s => s.itemTypeDisplayName?.toLowerCase().includes('fragment'))
            };
        }

        characterEquipment[charId] = grouped;
    }

    const mainChar = characters[mainCharId];
    const emblemBackground = mainChar?.emblemBackgroundPath ? BUNGIE_ROOT + mainChar.emblemBackgroundPath : null;
    const gambitProgression = progressions[mainCharId]?.progressions?.[3008065600];

    const { data: dbPlayer } = await supabaseAdmin
        .from('players')
        .select('claimed_by')
        .eq('id', membershipId)
        .single();

    const isClaimed = !!dbPlayer?.claimed_by;
    const isOwner   = user?.membershipId === membershipId;
    const canClaim  = isOwner && !isClaimed;

    return {
        player, profile, characters,
        characterIds: sortedCharIds,
        characterEquipment,
        recentMatches,
        lifetimeStats,
        clan,
        emblemBackground,
        gambitProgression,
        isClaimed, isOwner, canClaim,
        armorStatMeta: ARMOR_STATS
    };
}
