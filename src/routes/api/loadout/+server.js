import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { cacheGet, cacheSet, MANIFEST_TTL, PROFILE_TTL } from '$lib/server/cache.js';

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
    1506418338: 'artifact'
};

const ARMOR_STATS = [
    { hash: 2996146975, name: 'Mobility',   short: 'MOB', color: 'bg-sky-400',     text: 'text-sky-400'     },
    { hash: 392767087,  name: 'Resilience', short: 'RES', color: 'bg-green-400',   text: 'text-green-400'   },
    { hash: 1943323491, name: 'Recovery',   short: 'REC', color: 'bg-fuchsia-400', text: 'text-fuchsia-400' },
    { hash: 1735777505, name: 'Discipline', short: 'DIS', color: 'bg-teal-400',    text: 'text-teal-400'    },
    { hash: 144602215,  name: 'Intellect',  short: 'INT', color: 'bg-yellow-400',  text: 'text-yellow-400'  },
    { hash: 4244567218, name: 'Strength',   short: 'STR', color: 'bg-red-400',     text: 'text-red-400'     }
];

async function bungieGet(url) {
    const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    return res.json();
}

async function fetchDef(hash) {
    // Manifest definitions are versioned by Bungie and change only on patch days.
    // Cache them for 1 hour. On a warm instance, loadout tabs skip ALL these calls.
    const cacheKey = `manifest:${hash}`;
    const cached   = cacheGet(cacheKey);
    if (cached !== undefined) return [hash, cached];

    try {
        const r = await fetch(
            `${BUNGIE_ROOT}/Platform/Destiny2/Manifest/DestinyInventoryItemDefinition/${hash}/`,
            { headers: { 'X-API-Key': BUNGIE_API_KEY } }
        );
        const d   = await r.json();
        const def = d.Response ?? null;
        cacheSet(cacheKey, def, MANIFEST_TTL);
        return [hash, def];
    } catch {
        return [hash, null];
    }
}

export async function GET({ url, setHeaders }) {
    const membershipType = url.searchParams.get('membershipType');
    const membershipId   = url.searchParams.get('membershipId');
    const charId         = url.searchParams.get('charId');

    if (!membershipType || !membershipId || !charId) {
        return json({ error: 'Missing params' }, { status: 400 });
    }

    // Tell Vercel CDN to cache this response for 60s and serve stale for 30s
    setHeaders({ 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' });

    // ── 1. One Bungie call: equipment + sockets + instances + artifact ─────────
    // 104=profileProgressions(artifact), 202=characterEquipment,
    // 205=characterProgressions (REQUIRED — without it 202 returns empty, Bungie quirk),
    // 300=itemInstances(power level), 303=itemStats(armor stats), 304=itemSockets, 305=socketPlugStates
    const profileData = await bungieGet(
        `/Platform/Destiny2/${membershipType}/Profile/${membershipId}/?components=104,202,205,300,303,304,305`
    );

    const profile        = profileData.Response ?? {};
    const equipData      = profile?.characterEquipment?.data        ?? {};
    const socketsData    = profile?.itemComponents?.sockets?.data   ?? {};
    const instancesData  = profile?.itemComponents?.instances?.data ?? {};
    const statsData      = profile?.itemComponents?.stats?.data     ?? {};

    const items       = equipData[charId]?.items ?? [];
    const instanceIds = items.map(i => i.itemInstanceId).filter(Boolean);

    // ── 2. Collect ALL hashes upfront — items + every socket plug + artifact ───
    const itemHashes = items.map(i => i.itemHash);

    const plugHashes = instanceIds.flatMap(id =>
        (socketsData[id]?.sockets ?? []).map(s => s.plugHash).filter(Boolean)
    );

    const artifactHash = profile?.profileProgression?.data?.seasonalArtifact?.artifactHash;

    const allHashes = [...new Set([
        ...itemHashes,
        ...plugHashes,
        ...(artifactHash ? [artifactHash] : [])
    ])];

    // ── 3. Fetch ALL manifest definitions in ONE parallel wave ─────────────────
    const defEntries = await Promise.all(allHashes.map(fetchDef));
    const defMap     = new Map(defEntries);

    // ── 4. Build equipment object synchronously (no more async calls) ──────────

    // Helper to classify sockets
    function classifySocket(s, def) {
        if (!def) return null;
        const typeName = (def.itemTypeDisplayName ?? '').toLowerCase();
        const name     = def.displayProperties?.name ?? '';
        if (!name || name === 'Default Shader' || name === 'Empty Mod Socket') return null;
        if (typeName.includes('tracker') || typeName.includes('shader') || typeName.includes('ornament')) return null;
        return {
            hash:                s.plugHash,
            name,
            icon:                def.displayProperties?.icon ? BUNGIE_ROOT + def.displayProperties.icon : null,
            isEnabled:           s.isEnabled,
            isIntrinsic:         typeName.includes('intrinsic'),
            isMasterwork:        typeName.includes('masterwork'),
            isMod:               typeName.includes('weapon mod') || typeName.includes('armor mod'),
            itemTypeDisplayName: def.itemTypeDisplayName ?? '',
            description:         def.displayProperties?.description ?? ''
        };
    }

    const grouped = {};

    for (const item of items) {
        const def  = defMap.get(item.itemHash);
        const slot = BUCKET_HASHES[def?.inventory?.bucketTypeHash] ?? 'other';
        if (slot === 'other' || slot === 'emblem') continue;

        const instance = instancesData[item.itemInstanceId];

        const itemData = {
            instanceId:          item.itemInstanceId,
            hash:                item.itemHash,
            name:                def?.displayProperties?.name       ?? 'Unknown',
            icon:                def?.displayProperties?.icon        ? BUNGIE_ROOT + def.displayProperties.icon : null,
            tierType:            def?.inventory?.tierType,
            itemType:            def?.itemType,
            itemSubType:         def?.itemSubType,
            damageType:          def?.defaultDamageType,
            slot,
            flavorText:          def?.flavorText                    ?? '',
            itemTypeDisplayName: def?.itemTypeDisplayName           ?? '',
            power:               instance?.primaryStat?.value       ?? null,
        };

        // Weapon perks (itemType 3)
        if (def?.itemType === 3 && item.itemInstanceId) {
            const sockets = socketsData[item.itemInstanceId]?.sockets ?? [];
            itemData.perks = sockets
                .map(s => s.plugHash && s.isVisible ? classifySocket(s, defMap.get(s.plugHash)) : null)
                .filter(Boolean);
        }

        // Armor stats (itemType 2) from statsData
        if (def?.itemType === 2 && statsData[item.itemInstanceId]) {
            const raw = statsData[item.itemInstanceId].stats ?? {};
            itemData.armorStats = ARMOR_STATS.map(({ hash, name, short, color, text }) => ({
                name, short, color, text,
                value: raw[hash]?.value ?? 0
            }));
        }

        grouped[slot] = itemData;
    }

    // ── 5. Resolve subclass sockets ────────────────────────────────────────────
    const subclassItem = items.find(i => {
        const def = defMap.get(i.itemHash);
        return BUCKET_HASHES[def?.inventory?.bucketTypeHash] === 'subclass';
    });

    if (subclassItem?.itemInstanceId) {
        const sockets = socketsData[subclassItem.itemInstanceId]?.sockets ?? [];
        const resolved = sockets
            .map(s => s.plugHash && s.isVisible ? classifySocket(s, defMap.get(s.plugHash)) : null)
            .filter(Boolean);

        grouped.subclassSockets = {
            super:     resolved.find(s => s.itemTypeDisplayName?.toLowerCase().includes('super')),
            abilities: resolved.filter(s =>
                ['grenade', 'melee', 'class ability', 'movement ability'].some(k =>
                    s.itemTypeDisplayName?.toLowerCase().includes(k)
                )
            ),
            aspects:   resolved.filter(s => s.itemTypeDisplayName?.toLowerCase().includes('aspect')),
            fragments: resolved.filter(s => s.itemTypeDisplayName?.toLowerCase().includes('fragment'))
        };
    }

    // ── 6. Seasonal artifact ───────────────────────────────────────────────────
    let artifact = null;
    if (artifactHash) {
        const artifactRaw = profile?.profileProgression?.data?.seasonalArtifact ?? {};
        const def         = defMap.get(artifactHash);
        artifact = {
            name:           def?.displayProperties?.name ?? 'Seasonal Artifact',
            icon:           def?.displayProperties?.icon ? BUNGIE_ROOT + def.displayProperties.icon : null,
            powerBonus:     artifactRaw.powerBonus     ?? 0,
            pointsAcquired: artifactRaw.pointsAcquired ?? 0,
            pointsUsed:     artifactRaw.pointsUsed     ?? 0
        };
    }

    return json({ equipment: grouped, artifact, armorStatMeta: ARMOR_STATS });
}
