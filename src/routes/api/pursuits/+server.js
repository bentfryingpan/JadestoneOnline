/**
 * /api/pursuits — Fetch player's Gambit-related Records (Triumphs) and Collectibles.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { getRecordDef, getCollectibleDef, getPresentationNodeDef } from '$lib/server/manifest.js';

const BUNGIE_ROOT = 'https://www.bungie.net';

export async function GET({ url }) {
    const membershipType = url.searchParams.get('membershipType');
    const membershipId   = url.searchParams.get('membershipId');

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
        const records      = profileData?.Response?.profileRecords?.data?.records ?? {};
        const collectibles = profileData?.Response?.profileCollectibles?.data?.collectibles ?? {};

        // 2. We want to find Gambit-related pursuits.
        // Instead of hardcoding 1000s of hashes, we'll scan the presentation nodes
        // for the "Gambit" category and its children.
        
        // Gambit Triumphs Root Node: 1864115160
        const gambitRootNode = await getPresentationNodeDef(1864115160);
        const allGambitRecordHashes = new Set();
        
        if (gambitRootNode) {
            // Recursive scan of children nodes to find all records
            async function scanNode(nodeHash) {
                const node = await getPresentationNodeDef(nodeHash);
                if (!node) return;
                
                for (const r of node.children?.records ?? []) {
                    allGambitRecordHashes.add(r.recordHash);
                }
                for (const childNode of node.children?.presentationNodes ?? []) {
                    await scanNode(childNode.presentationNodeHash);
                }
            }
            await scanNode(1864115160);
        }

        const gambitRecords = [];
        for (const hash of allGambitRecordHashes) {
            const def = await getRecordDef(hash);
            if (!def || def.redacted) continue;
            
            const state = records[hash]?.state ?? 0;
            const isCompleted = !(state & 1); // 1 = objective not completed
            const objectives  = records[hash]?.objectives ?? [];

            gambitRecords.push({
                hash,
                name: def.displayProperties?.name,
                description: def.displayProperties?.description,
                icon: def.displayProperties?.hasIcon ? BUNGIE_ROOT + def.displayProperties.icon : null,
                isCompleted,
                state,
                objectives: objectives.map(obj => ({
                    progress: obj.progress,
                    completionValue: obj.completionValue,
                    complete: obj.complete
                }))
            });
        }

        // 3. Similarly for Collectibles (Shaders/Emblems)
        // Gambit Collectibles Node: 3514751421 (Gambit Gear)
        const allGambitCollHashes = new Set();
        const collRoot = await getPresentationNodeDef(3514751421);
        if (collRoot) {
            async function scanColl(nodeHash) {
                const node = await getPresentationNodeDef(nodeHash);
                if (!node) return;
                for (const c of node.children?.collectibles ?? []) {
                    allGambitCollHashes.add(c.collectibleHash);
                }
                for (const childNode of node.children?.presentationNodes ?? []) {
                    await scanColl(childNode.presentationNodeHash);
                }
            }
            await scanColl(3514751421);
        }

        const gambitCollectibles = [];
        for (const hash of allGambitCollHashes) {
            const def = await getCollectibleDef(hash);
            if (!def) continue;
            const state = collectibles[hash]?.state ?? 0;
            const acquired = !(state & 1);

            gambitCollectibles.push({
                hash,
                name: def.displayProperties?.name,
                icon: BUNGIE_ROOT + def.displayProperties.icon,
                acquired,
                state
            });
        }

        return json({
            records: gambitRecords.sort((a, b) => (a.isCompleted === b.isCompleted ? 0 : a.isCompleted ? 1 : -1)),
            collectibles: gambitCollectibles
        });

    } catch (e) {
        console.error('Pursuits fetch failed', e);
        return json({ error: e.message }, { status: 500 });
    }
}
