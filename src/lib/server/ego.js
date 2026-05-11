/**
 * src/lib/server/ego.js — compatibility shim
 *
 * The canonical EGO algorithm now lives in src/lib/ego.js (shared client+server).
 * This file exists so that server-only routes (history, pgcr-enrich, export) that
 * import `calcEgo` from here continue to work without changes, while getting the
 * correct Python-accurate algorithm transparently.
 *
 * Signature differences bridged here:
 *   calcEgo({ kills, fireteamSize, ... })  →  calculateEgoScore({ mobKills, fireteam_size, ... })
 */

export { ALGO_CONFIG, MEDAL_ALIASES, extractMedals, ngrTier, ngrTierColor,
         egoColor, egoTierLabel, detectRole } from '$lib/ego.js';

// Re-export MEDAL_VALUES in the shape the old file provided
import { ALGO_CONFIG } from '$lib/ego.js';
export const MEDAL_VALUES = ALGO_CONFIG.medal_values;

import { calculateEgoScore } from '$lib/ego.js';

/**
 * Backwards-compatible wrapper — preserves the original calcEgo() call signature
 * used by api/history, api/pgcr-enrich, and api/export.
 *
 * @param {object} stats
 *   kills, deaths, assists, motesDeposited, motesDenied, motesPickedUp, motesLost,
 *   invasionKills, primevalDamage, fireteamSize (NOT fireteam_size), medals
 */
export function calcEgo(stats) {
    const mobKills = Math.max(0, (stats.kills ?? 0) - (stats.invasionKills ?? 0));
    return calculateEgoScore({
        mobKills,
        invasionKills:  stats.invasionKills  ?? 0,
        motesDenied:    stats.motesDenied    ?? 0,
        motesDeposited: stats.motesDeposited ?? 0,
        motesPickedUp:  stats.motesPickedUp  ?? (stats.motesDeposited ?? 0),
        primevalDamage: stats.primevalDamage ?? 0,
        deaths:         stats.deaths         ?? 0,
        assists:        stats.assists        ?? 0,
        medals:         stats.medals         ?? {},
        fireteam_size:  stats.fireteamSize   ?? 1,
    });
}
