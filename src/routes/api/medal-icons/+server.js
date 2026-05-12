/**
 * /api/medal-icons — Returns icon URLs for every Gambit medal we track.
 *
 * Fetches DestinyHistoricalStatsDefinition from the Bungie manifest and
 * returns a two-part response:
 *
 *   1. `byCanonical` — { canonicalName: { name, description, iconUrl, tier } }
 *      One entry per medal we score in ego.js (18 medals).
 *
 *   2. `allMedalKeys` — { apiKey: iconUrl }
 *      Every alias key variant → its Bungie icon URL.
 *      Lets the profile template look up icons from raw PGCR medal keys.
 *
 * Cached 24 hours at the CDN (manifest medal defs change only on patch days).
 */

import { json } from '@sveltejs/kit';
import { getAllMedals } from '$lib/server/manifest.js';
import { MEDAL_ALIASES } from '$lib/ego.js';

const BUNGIE_ROOT = 'https://www.bungie.net';

// Human-readable display names for canonical medal IDs
const MEDAL_DISPLAY_NAMES = {
    notOnMyWatch:         'Not On My Watch',
    armyOfOne:            'Army of One',
    locksmith:            'Locksmith',
    blockbuster:          'Blockbuster',
    rapidPayback:         'Rapid Payback',
    massacre:             'Massacre',
    motesHaveBeen:        'Motes Have Been Denied',
    halfBanked:           'Half Banked',
    firstToBlock:         'First to Block',
    payback:              'Payback',
    overkillmonger:       'Overkillmonger',
    killmonger:           'Killmonger',
    thrillmonger:         'Thrillmonger',
    fastFill:             'Fast Fill',
    killAfterInvasion:    'Kill After Invasion',
    bigGameHunter:        'Big Game Hunter',
    lastGuardianStanding: 'Last Guardian Standing',
    noEscape:             'No Escape',
};

export async function GET({ setHeaders }) {
    setHeaders({
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
    });

    try {
        const table = await getAllMedals();

        // Build a key-normalised lookup: lowercased-no-underscores api key → definition
        const byNormKey = {};
        for (const [id, def] of Object.entries(table)) {
            const norm = id.toLowerCase().replace(/_/g, '');
            byNormKey[norm] = { id, def };
        }

        // 1. byCanonical — one entry per scored medal
        const byCanonical = {};
        for (const [canon, aliases] of Object.entries(MEDAL_ALIASES)) {
            // Try each alias until we find a manifest entry with an icon
            let found = null;
            for (const alias of aliases) {
                const norm = alias.toLowerCase().replace(/_/g, '');
                const entry = byNormKey[norm];
                if (entry?.def?.iconImage) {
                    found = entry;
                    break;
                }
            }
            // Also try common primary key patterns
            if (!found) {
                const candidates = [
                    `medalgambit${canon[0].toLowerCase()}${canon.slice(1)}`,
                    `medal${canon[0].toLowerCase()}${canon.slice(1)}`,
                    `medalspvecompmedal${canon[0].toLowerCase()}${canon.slice(1)}`,
                ];
                for (const c of candidates) {
                    const norm = c.toLowerCase().replace(/_/g, '');
                    const entry = byNormKey[norm];
                    if (entry?.def?.iconImage) {
                        found = entry;
                        break;
                    }
                }
            }

            byCanonical[canon] = {
                name:        MEDAL_DISPLAY_NAMES[canon] ?? canon,
                description: found?.def?.statDescription ?? '',
                iconUrl:     found?.def?.iconImage ? BUNGIE_ROOT + found.def.iconImage : null,
                tier:        found?.def?.medalTierInfo?.identifier ?? null,
                // Fallback to local static PNG (copied from desktop app icons/)
                localIcon:   `/icons/medals/${canon.replace(/([A-Z])/g, m => m.toLowerCase())}.png`,
            };
        }

        // 2. allMedalKeys — every alias → icon URL (for raw PGCR key lookups)
        const allMedalKeys = {};
        for (const [canon, aliases] of Object.entries(MEDAL_ALIASES)) {
            const iconUrl = byCanonical[canon]?.iconUrl;
            for (const alias of aliases) {
                allMedalKeys[alias] = iconUrl ?? null;
            }
        }

        return json({ byCanonical, allMedalKeys });
    } catch (err) {
        console.error('[medal-icons] Error:', err.message);
        return json({ error: 'Failed to load medal icons' }, { status: 502 });
    }
}
