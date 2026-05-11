/**
 * EGO Scoring Engine — ported from Jadestone desktop app config.py / scoring.py
 *
 * Shared by the match page (full score with medals + fireteam size from PGCR)
 * and the history API (base score from activity-history extended values only,
 * no PGCRs, fireteamSize defaults to 1, medals omitted).
 */

const DR_RATE       = 0.05;
const MEDAL_DR_RATE = 0.15;

const BASE_VALUES = {
    mobKills:       0.19,
    assists:        0.08,
    motesDenied:    0.99,
    invasionKills:  1.90,
    motesDeposited: 0.58,
    primevalDamage: 0.00041,
    deaths:        -5.0,
    wastedMotes:   -0.25,
};

export const MEDAL_VALUES = {
    notOnMyWatch:        5.34,
    armyOfOne:           2.02,
    locksmith:           2.94,
    blockbuster:         3.96,
    rapidPayback:        4.14,
    massacre:            2.48,
    motesHaveBeen:       2.94,
    halfBanked:          2.48,
    firstToBlock:        2.12,
    payback:             1.66,
    overkillmonger:      1.29,
    killmonger:          0.83,
    thrillmonger:        0.46,
    fastFill:            1.29,
    killAfterInvasion:   0.83,
    bigGameHunter:       0.64,
    lastGuardianStanding:0.46,
    noEscape:            0.46,
};

function calcDR(cnt, val, rate) {
    let total = 0, cur = val;
    for (let i = 0; i < Math.floor(cnt); i++) { total += cur; cur *= (1 - rate); }
    return total;
}

/**
 * Calculate EGO score for a single Gambit match.
 *
 * @param {object} stats
 *   kills, deaths, assists, motesDeposited, motesDenied, motesPickedUp,
 *   motesLost, invasions, invasionKills, invasionsDefeated, primevalDamage,
 *   fireteamSize (1–4, default 1), medals (canonical key → count, default {})
 * @returns {{ basePps, pem, finalScore, moteEff, simpleKd, components }}
 */
export function calcEgo(stats) {
    const fts = stats.fireteamSize ?? 1;
    let pve = 0, pvp = 0, obj = 0, med = 0;

    // PvE: mob kills (kills minus invasion kills) + primeval damage
    const mobK   = Math.max(0, (stats.kills ?? 0) - (stats.invasionKills ?? 0));
    pve += calcDR(mobK, BASE_VALUES.mobKills, DR_RATE);
    const dmg    = stats.primevalDamage ?? 0;
    const chunks = Math.floor(dmg / 10000);
    pve += calcDR(chunks, 10000 * BASE_VALUES.primevalDamage, DR_RATE)
        + ((dmg % 10000) * (BASE_VALUES.primevalDamage * Math.pow(1 - DR_RATE, chunks)));

    // PvP: invasion kills + motes denied
    pvp += calcDR(stats.invasionKills ?? 0, BASE_VALUES.invasionKills, DR_RATE);
    pvp += calcDR(stats.motesDenied   ?? 0, BASE_VALUES.motesDenied,   DR_RATE);

    // Banking: motes deposited
    obj += calcDR(stats.motesDeposited ?? 0, BASE_VALUES.motesDeposited, DR_RATE);

    // Assists split 50/50 between PvE and PvP
    const ast = calcDR(stats.assists ?? 0, BASE_VALUES.assists, DR_RATE);
    pve += ast / 2; pvp += ast / 2;

    // Penalties: deaths + wasted motes
    let pen = (stats.deaths ?? 0) * BASE_VALUES.deaths;
    const wasted = Math.max(0, (stats.motesPickedUp ?? 0) - (stats.motesDeposited ?? 0));
    if (wasted > 0) pen += wasted * BASE_VALUES.wastedMotes;

    // Medals (only when PGCR data available)
    for (const [medal, count] of Object.entries(stats.medals ?? {})) {
        const mv = MEDAL_VALUES[medal];
        if (count > 0 && mv != null) med += calcDR(count, mv, MEDAL_DR_RATE);
    }

    // Fireteam multiplier
    const stackMult = { 1: 1.0, 2: 1.1, 3: 1.2, 4: 1.3 }[fts] ?? 1.0;
    let base = (pve + pvp + obj + med + pen) * stackMult;

    // Soft cap at 100 and 120
    if      (base > 120) base = 100 + (20 * 0.5) + ((base - 120) * 0.25);
    else if (base > 100) base = 100 + ((base - 100) * 0.5);

    // PEM — Performance Efficiency Multiplier
    let pem = 1.0;
    const pk      = Math.max(stats.motesPickedUp ?? 0, stats.motesDeposited ?? 0);
    const moteEff = pk > 0 ? ((stats.motesDeposited ?? 0) / pk * 100) : 100.0;
    const dbMote  = { 1: 77.5, 2: 81.5, 3: 86.0, 4: 90.0 }[fts] ?? 77.5;
    const dbKd    = { 1: 25,   2: 28,   3: 31,   4: 35   }[fts] ?? 25;
    if (moteEff > dbMote) pem += Math.floor((moteEff - dbMote) / 5) * 0.02;
    else if (moteEff < dbMote) pem *= (1.0 - ((dbMote - moteEff) * 0.004));
    const simpleKd = ((stats.kills ?? 0) + (stats.invasionKills ?? 0)) / Math.max(1, stats.deaths ?? 0);
    if (simpleKd > dbKd) pem += Math.floor((simpleKd - dbKd) / 8) * 0.01;

    return {
        basePps:    +base.toFixed(1),
        pem:        +pem.toFixed(3),
        finalScore: +(base * pem).toFixed(1),
        moteEff:    +moteEff.toFixed(1),
        simpleKd:   +simpleKd.toFixed(2),
        components: {
            PvE:     +pve.toFixed(1),
            PvP:     +pvp.toFixed(1),
            Banking: +obj.toFixed(1),
            Medals:  +med.toFixed(1),
        },
    };
}

/** Colour class for an EGO score (Tailwind) */
export function egoColor(score) {
    if (score == null) return 'text-zinc-600';
    if (score >= 80)   return 'text-amber-400';
    if (score >= 60)   return 'text-emerald-400';
    if (score >= 40)   return 'text-zinc-300';
    return 'text-red-400';
}
