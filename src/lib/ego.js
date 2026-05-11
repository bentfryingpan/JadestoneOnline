/**
 * ego.js — EGO Scoring Algorithm (ported from Python core/scoring.py)
 *
 * This is the canonical scoring implementation shared between:
 *   - Match API routes (server-side)
 *   - Career API routes (server-side)
 *   - Profile page display (client-side helpers)
 *
 * Algorithm: diminishing-returns component buckets (PvE / PvP / Banking / Medals)
 * × fireteam multiplier × soft cap × PEM (Performance Efficiency Multiplier).
 */

// ── Configuration ─────────────────────────────────────────────────────────────
// Exact values from Python config/config.py ALGO_CONFIG
export const ALGO_CONFIG = {
    dr_rate:       0.05,
    medal_dr_rate: 0.15,
    base_values: {
        mobKills:       0.19,
        assists:        0.08,
        motesDenied:    0.99,
        invasionKills:  1.90,
        motesDeposited: 0.58,
        primevalDamage: 0.00041,
        deaths:        -5.0,
        wastedMotes:   -0.25,
    },
    medal_values: {
        notOnMyWatch:         5.34,
        armyOfOne:            2.02,
        locksmith:            2.94,
        blockbuster:          3.96,
        rapidPayback:         4.14,
        massacre:             2.48,
        motesHaveBeen:        2.94,
        halfBanked:           2.48,
        firstToBlock:         2.12,
        payback:              1.66,
        overkillmonger:       1.29,
        killmonger:           0.83,
        thrillmonger:         0.46,
        fastFill:             1.29,
        killAfterInvasion:    0.83,
        bigGameHunter:        0.64,
        lastGuardianStanding: 0.46,
        noEscape:             0.46,
    },
    pem_config: {
        mote_efficiency_bonus_step:    5,
        mote_efficiency_bonus_val:     0.02,
        mote_efficiency_penalty_scale: 0.30,
        mote_efficiency_penalty_power: 0.85,
        inv_yield_benchmarks: { 1: 6.0, 2: 8.0, 3: 10.0, 4: 12.0 },
        inv_yield_bonus_step:  4,
        inv_yield_bonus_val:   0.01,
        primeval_dmg_benchmarks: { 1: 80000, 2: 60000, 3: 50000, 4: 40000 },
        primeval_bonus_val:    0.01,
        pem_floor:             0.90,
        pem_cap:               1.10,
    },
};

// Medal aliases — maps every API variant → canonical medal name
// (from Python config/config.py MEDAL_ALIASES + MEDAL_PRIMARY_KEYS)
export const MEDAL_ALIASES = {
    // canonical → list of API key variants (all lowercase, no underscores)
    notOnMyWatch:         ['medalgambitsaviour','medalsaviour','medalgambitnotonmywatch','medalspvecompmedaldenied','medaldenied','medalspvecompmedalinvasionshutdown'],
    armyOfOne:            ['medalspvecompmedalinvaderkillfour','medalinvaderkillfour'],
    locksmith:            ['medalspvecompmedallocksmith'],
    blockbuster:          ['medalspvecompmedalblockparty','medalblockparty','medalspvecompmedalblockbuster'],
    rapidPayback:         ['medalspvecompmedalrapidpayback','medalrapidpayback'],
    massacre:             ['medalspvecompmedalmassacre'],
    motesHaveBeen:        ['medalgambitmotesdrained','medalmotesdrained','medalspvecompmedaltagsdenied15'],
    halfBanked:           ['medalspvecompmedalhalfbanked'],
    firstToBlock:         ['medalspvecompmedalfirsttoblock'],
    payback:              ['medalgambitpayback','medalpayback','medalspvecompmedalrevenge'],
    overkillmonger:       ['medalgambitoverkillmonger','medaloverkillmonger','medalspvecompmedaloverkillmonger'],
    killmonger:           ['medalgambitkillmonger','medalkillmonger','medalspvecompmedalkillmonger'],
    thrillmonger:         ['medalgambitthrillmonger','medalthrillmonger','medalspvecompmedalthrillmonger'],
    fastFill:             ['medalspvecompmedalfastfill'],
    killAfterInvasion:    ['medalspvecompmedalkillafterinvasion'],
    bigGameHunter:        ['medalgambithunter','medalhunter','medalspvecompmedalbiggamehunter'],
    lastGuardianStanding: ['medalgambitlastmanstanding','medallastmanstanding'],
    noEscape:             ['medalspvecompmedalbankkill','medalspvecompmedalnoescape'],
};

// Build reverse lookup: api_key_normalised → canonical name  (built once at import)
const _MEDAL_REVERSE = (() => {
    const rev = {};
    for (const [canon, aliases] of Object.entries(MEDAL_ALIASES)) {
        for (const alias of aliases) {
            rev[alias.toLowerCase().replace(/_/g, '')] = canon;
        }
        // Also map the primary key pattern used in some API responses
        const fk = canon[0].toUpperCase() + canon.slice(1);
        for (const variant of [
            `medalgambit${fk}`,
            `medal${fk}`,
            `medalspvecompmedal${canon}`,
        ]) {
            rev[variant.toLowerCase().replace(/_/g, '')] = canon;
        }
    }
    return rev;
})();

/** Normalise a raw PGCR extended.values object → { medalCanonicalName: count } */
export function extractMedals(extValues = {}) {
    const medals = {};
    for (const [k, v] of Object.entries(extValues)) {
        const canon = _MEDAL_REVERSE[k.toLowerCase().replace(/_/g, '')];
        if (canon) {
            const count = typeof v === 'object'
                ? (v?.basic?.value ?? 0)
                : Number(v) || 0;
            if (count > 0) medals[canon] = (medals[canon] ?? 0) + count;
        }
    }
    return medals;
}

// ── Core diminishing-returns helper ──────────────────────────────────────────
function calcDR(cnt, val, rate) {
    let total = 0;
    let current = val;
    for (let i = 0; i < Math.floor(cnt); i++) {
        total += current;
        current *= (1 - rate);
    }
    return total;
}

// ── Main EGO scoring function ─────────────────────────────────────────────────
/**
 * @param {object} stats
 * @param {number} stats.mobKills         PvE / mob kills (total kills minus invasion kills)
 * @param {number} stats.invasionKills
 * @param {number} stats.motesDenied
 * @param {number} stats.motesDeposited
 * @param {number} stats.motesPickedUp
 * @param {number} stats.primevalDamage
 * @param {number} stats.deaths
 * @param {number} stats.assists
 * @param {object} stats.medals           { canonicalMedalName: count }
 * @param {number} stats.fireteam_size    1-4, defaults to 1
 *
 * @returns {{ basePps, pem, finalScore, moteEff, simpleKd, invYield, components,
 *             dynamicMoteBenchmark, dynamicInvBenchmark }}
 */
export function calculateEgoScore(stats) {
    const v    = ALGO_CONFIG.base_values;
    const dr   = ALGO_CONFIG.dr_rate;
    const m_dr = ALGO_CONFIG.medal_dr_rate;
    const conf = ALGO_CONFIG.pem_config;
    const fts  = stats.fireteam_size ?? 1;

    let pve = 0, pvp = 0, obj = 0, med = 0;

    // PvE: mob kills
    pve += calcDR(stats.mobKills ?? 0, v.mobKills, dr);

    // PvE: primeval damage (chunked in 10k units)
    const dmg    = stats.primevalDamage ?? 0;
    const chunks = Math.floor(dmg / 10000);
    pve += calcDR(chunks, 10000 * v.primevalDamage, dr)
         + ((dmg % 10000) * (v.primevalDamage * Math.pow(1 - dr, chunks)));

    // PvP: invasion kills + motes denied
    pvp += calcDR(stats.invasionKills ?? 0, v.invasionKills, dr);
    pvp += calcDR(stats.motesDenied ?? 0, v.motesDenied, dr);

    // Banking: motes deposited
    obj += calcDR(stats.motesDeposited ?? 0, v.motesDeposited, dr);

    // Assists: split 50/50 PvE/PvP
    const ast = calcDR(stats.assists ?? 0, v.assists, dr);
    pve += ast / 2;
    pvp += ast / 2;

    // Penalties
    const pen = (stats.deaths ?? 0) * v.deaths;
    const wasted = Math.max(0, (stats.motesPickedUp ?? 0) - (stats.motesDeposited ?? 0));
    const wastePen = wasted > 0 ? wasted * v.wastedMotes : 0;

    // Medals
    const medals = stats.medals ?? {};
    for (const [mName, count] of Object.entries(medals)) {
        const mVal = ALGO_CONFIG.medal_values[mName];
        if (mVal && count > 0) {
            med += calcDR(count, mVal, m_dr);
        }
    }

    // Floor boost: weak buckets get a small lift (applied before team multiplier)
    const BUCKET_FLOOR = 18;
    const FLOOR_GAIN   = 0.35;
    const buckets = [pve, pvp, obj, med];
    const floorBoost = buckets.reduce((sum, b) => sum + Math.max(0, BUCKET_FLOOR - b) * FLOOR_GAIN, 0);

    // Team multiplier
    const teamMult = { 1: 1.0, 2: 1.1, 3: 1.2, 4: 1.3 }[fts] ?? 1.0;
    let base = (pve + pvp + obj + med + pen + wastePen + floorBoost) * teamMult;

    // Soft cap
    if (base > 100) {
        base = 95.2 + (base - 100) * 0.05;
    } else if (base > 92) {
        base = 92 + (base - 92) * 0.40;
    }

    // Specialist relief: strong top-2, weak bottom-2 → 3% bonus
    const bSorted = [...buckets].sort((a, b) => b - a);
    if (bSorted[1] > BUCKET_FLOOR * 1.2 && bSorted[2] < BUCKET_FLOOR * 0.9) {
        base *= 1.03;
    }

    // ── PEM ──────────────────────────────────────────────────────────────────
    let pem = 1.0;

    // Mote efficiency
    const pk  = Math.max(stats.motesPickedUp ?? 0, stats.motesDeposited ?? 0);
    const eff = pk > 0 ? ((stats.motesDeposited ?? 0) / pk) * 100 : 100.0;
    const dbMote = { 1: 77.5, 2: 81.5, 3: 86.0, 4: 90.0 }[fts] ?? 77.5;

    if (eff > dbMote) {
        pem += Math.floor((eff - dbMote) / conf.mote_efficiency_bonus_step) * conf.mote_efficiency_bonus_val;
    } else if (eff < dbMote) {
        const deficitFrac = (dbMote - eff) / 100.0;
        pem *= 1.0 - Math.pow(deficitFrac, conf.mote_efficiency_penalty_power) * conf.mote_efficiency_penalty_scale;
    }

    // Invasion yield
    const invYield = (stats.invasionKills ?? 0) * 4.0 + (stats.motesDenied ?? 0) * 2.0;
    const dbInv    = conf.inv_yield_benchmarks[fts] ?? 6.0;
    if (invYield > dbInv) {
        pem += Math.floor((invYield - dbInv) / conf.inv_yield_bonus_step) * conf.inv_yield_bonus_val;
    }

    // Primeval contribution
    if (dmg > 0) {
        const dbPdmg = conf.primeval_dmg_benchmarks[fts] ?? 60000;
        if (dmg >= dbPdmg) pem += conf.primeval_bonus_val;
    }

    // Clamp PEM
    pem = Math.max(conf.pem_floor, Math.min(pem, conf.pem_cap));

    const finalScore = base * pem;

    // Simple KD for display / legacy storage
    const simpleKd = ((stats.mobKills ?? 0) + (stats.invasionKills ?? 0))
                   / Math.max(1, stats.deaths ?? 0);

    return {
        basePps:  Math.round(base * 10) / 10,
        pem:      Math.round(pem  * 100) / 100,
        finalScore: Math.round(finalScore * 10) / 10,
        moteEff:  Math.round(eff * 10) / 10,
        simpleKd: Math.round(simpleKd * 100) / 100,
        invYield: Math.round(invYield * 10) / 10,
        components: {
            PvE:     Math.round(pve * 10) / 10,
            PvP:     Math.round(pvp * 10) / 10,
            Banking: Math.round(obj * 10) / 10,
            Medals:  Math.round(med * 10) / 10,
        },
        dynamicMoteBenchmark: dbMote,
        dynamicInvBenchmark:  dbInv,
    };
}

// ── NGR (Normalized Game Rating) ─────────────────────────────────────────────
/**
 * Lobby difficulty tier based on opponent average EGO (NGR).
 * Thresholds from Python api.py _ngr_tier().
 */
export function ngrTier(oppNgr, tmNgr, oppKnown) {
    if (!oppKnown || oppNgr == null) return { tier: 'Unranked', modifier: '' };
    let tier;
    if (oppNgr >= 67)      tier = 'Sweaty';
    else if (oppNgr >= 57) tier = 'Competitive';
    else if (oppNgr >= 45) tier = 'Standard';
    else                   tier = 'Casual';

    let modifier = '';
    if (tmNgr != null) {
        const net = oppNgr - tmNgr;
        if (net > 10)       modifier = 'Handicapped';
        else if (net < -10) modifier = 'Supported';
    }
    return { tier, modifier };
}

/** Color for a lobby difficulty tier */
export function ngrTierColor(tier) {
    switch (tier) {
        case 'Sweaty':      return '#f87171';   // red
        case 'Competitive': return '#c084fc';   // purple
        case 'Standard':    return '#fbbf24';   // amber
        case 'Casual':      return 'var(--gambit-green)';
        default:            return 'rgba(255,255,255,0.28)';
    }
}

// ── Carry / Carried detection ─────────────────────────────────────────────────
/**
 * @param {number} myScore
 * @param {number[]} teamScores  all scores on player's team (including own)
 * @returns {{ isCarry: boolean, isCarried: boolean }}
 */
export function detectRole(myScore, teamScores) {
    if (!teamScores || teamScores.length < 2) return { isCarry: false, isCarried: false };
    const sorted     = [...teamScores].sort((a, b) => b - a);
    const teamTotal  = sorted.reduce((s, v) => s + v, 0);
    const teamAvg    = teamTotal / sorted.length;
    const topScore   = sorted[0];
    const secondScore = sorted[0] === myScore ? sorted[1] : sorted[0];

    const isCarry    = myScore > teamTotal * 0.40 && myScore >= secondScore + 30;
    const isCarried  = myScore < teamAvg * 0.50 && topScore >= myScore + 50;
    return { isCarry, isCarried };
}

// ── EGO display helpers ───────────────────────────────────────────────────────
export function egoColor(score) {
    if (!score) return 'rgba(255,255,255,0.20)';
    if (score >= 110) return '#c084fc';   // elite — purple
    if (score >= 80)  return 'var(--gambit-green)';
    if (score >= 50)  return 'rgba(255,255,255,0.85)';
    return '#f87171';   // below avg — red
}

export function egoTierLabel(score) {
    if (!score)        return { label: 'UNRANKED', color: 'rgba(255,255,255,0.20)' };
    if (score >= 110)  return { label: 'ELITE',     color: '#c084fc' };
    if (score >= 80)   return { label: 'STRONG',    color: 'var(--gambit-green)' };
    if (score >= 50)   return { label: 'AVERAGE',   color: 'rgba(255,255,255,0.75)' };
    return             { label: 'BELOW AVG',         color: '#f87171' };
}
