/**
 * Destiny 2 static ability & stat tier data — Edge of Fate (2025)
 *
 * Primary-zone cooldowns sourced from:
 *   • Destiny Data Compendium (Mercules904)
 *   • d2foundry.gg
 *
 * Secondary-zone (101-200) bonuses sourced from:
 *   • TheGamer Armor 3.0 guide  https://www.thegamer.com/destiny-2-edge-of-fate-armor-rework-guide/
 *   • Boosting Ground Armor 3.0  https://boosting-ground.com/Destiny2/guides/pve-guides/armor-3-0-complete-guide
 *
 * SCALING RULES (Edge of Fate):
 *   Primary zone (0-100):   T0-T10, discrete cooldown tiers every 10 points
 *   Secondary zone (101-200): FULLY LINEAR — every point counts equally
 *     formula:  bonus = (statValue - 100) / 100 × maxBonus
 *
 * Edge of Fate stat renames (hashes unchanged):
 *   Mobility   → Weapons  | Resilience → Health | Recovery → Class
 *   Discipline → Grenade  | Intellect  → Super  | Strength → Melee
 */

// ── Primary zone cooldown tables (T0-T10) ────────────────────────────────────

export const GRENADE_COOLDOWNS = [
    { tier: 0,  seconds: 91 },
    { tier: 1,  seconds: 82 },
    { tier: 2,  seconds: 74 },
    { tier: 3,  seconds: 67 },
    { tier: 4,  seconds: 60 },
    { tier: 5,  seconds: 53 },
    { tier: 6,  seconds: 46 },
    { tier: 7,  seconds: 40 },
    { tier: 8,  seconds: 33 },
    { tier: 9,  seconds: 28 },
    { tier: 10, seconds: 25 },
];

export const MELEE_COOLDOWNS = [
    { tier: 0,  seconds: 91 },
    { tier: 1,  seconds: 82 },
    { tier: 2,  seconds: 74 },
    { tier: 3,  seconds: 67 },
    { tier: 4,  seconds: 60 },
    { tier: 5,  seconds: 53 },
    { tier: 6,  seconds: 46 },
    { tier: 7,  seconds: 40 },
    { tier: 8,  seconds: 33 },
    { tier: 9,  seconds: 28 },
    { tier: 10, seconds: 25 },
];

export const RIFT_COOLDOWNS = [
    { tier: 0,  seconds: 82 },
    { tier: 1,  seconds: 75 },
    { tier: 2,  seconds: 68 },
    { tier: 3,  seconds: 62 },
    { tier: 4,  seconds: 56 },
    { tier: 5,  seconds: 50 },
    { tier: 6,  seconds: 44 },
    { tier: 7,  seconds: 36 },
    { tier: 8,  seconds: 30 },
    { tier: 9,  seconds: 25 },
    { tier: 10, seconds: 22 },
];

export const BARRICADE_COOLDOWNS = [
    { tier: 0,  seconds: 46 },
    { tier: 1,  seconds: 42 },
    { tier: 2,  seconds: 38 },
    { tier: 3,  seconds: 35 },
    { tier: 4,  seconds: 32 },
    { tier: 5,  seconds: 28 },
    { tier: 6,  seconds: 25 },
    { tier: 7,  seconds: 22 },
    { tier: 8,  seconds: 19 },
    { tier: 9,  seconds: 16 },
    { tier: 10, seconds: 13 },
];

export const DODGE_COOLDOWNS = [
    { tier: 0,  seconds: 29 },
    { tier: 1,  seconds: 26 },
    { tier: 2,  seconds: 23 },
    { tier: 3,  seconds: 20 },
    { tier: 4,  seconds: 18 },
    { tier: 5,  seconds: 16 },
    { tier: 6,  seconds: 13 },
    { tier: 7,  seconds: 11 },
    { tier: 8,  seconds: 9  },
    { tier: 9,  seconds: 8  },
    { tier: 10, seconds: 7  },
];

export const RESILIENCE_DR = [
    { tier: 0,  pct: 0    },
    { tier: 1,  pct: 1.96 },
    { tier: 2,  pct: 3.84 },
    { tier: 3,  pct: 5.63 },
    { tier: 4,  pct: 7.33 },
    { tier: 5,  pct: 9.00 },
    { tier: 6,  pct: 10.17},
    { tier: 7,  pct: 11.11},
    { tier: 8,  pct: 12.00},
    { tier: 9,  pct: 12.86},
    { tier: 10, pct: 13.67},
];

export const SUPER_BONUS = [
    { tier: 0,  pct: 0  },
    { tier: 1,  pct: 2  },
    { tier: 2,  pct: 4  },
    { tier: 3,  pct: 6  },
    { tier: 4,  pct: 8  },
    { tier: 5,  pct: 10 },
    { tier: 6,  pct: 12 },
    { tier: 7,  pct: 14 },
    { tier: 8,  pct: 16 },
    { tier: 9,  pct: 18 },
    { tier: 10, pct: 20 },
];

// ── Secondary zone bonus definitions (101-200, linear per point) ──────────────
// All `max` values apply at stat = 200.
// At any stat value S > 100: bonus = (S - 100) / 100 × max
//
// Sources: TheGamer Armor 3.0 guide, Boosting Ground Armor 3.0 guide

export const SECONDARY_ZONE = {
    // Grenade / Discipline  (hash 1735777505)
    1735777505: {
        label: 'Grenade Damage',
        bonuses: [
            { label: 'Grenade DMG (PvE)',  key: 'grenadeDmgPvE',  max: 65,  unit: '%', desc: 'Scales all grenade damage in PvE activities. Does NOT apply to keyword-only grenades (e.g. Grapple Melee portion, Healing Grenade restoration).' },
            { label: 'Grenade DMG (PvP)',  key: 'grenadeDmgPvP',  max: 20,  unit: '%', desc: 'Crucible & Trials — stacks with standard grenade damage. Notable power investment for aggressive builds.' },
        ],
        note: 'Linear: every point above 100 = +0.65% PvE / +0.20% PvP. Keyword-triggered effects (Cure, Restoration, Ignite) are not amplified.',
        highlight: 150,
        highlightNote: '+32.5% PvE grenade damage at stat 150 — common midrange target.',
    },

    // Melee / Strength  (hash 4244567218)
    4244567218: {
        label: 'Melee Damage',
        bonuses: [
            { label: 'Melee DMG (PvE)',    key: 'meleeDmgPvE',    max: 30,  unit: '%', desc: 'Applies to powered melees, uncharged melees, and Glaive melee attacks.' },
            { label: 'Melee DMG (PvP)',    key: 'meleeDmgPvP',    max: 20,  unit: '%', desc: 'Stacks with other melee buffs. Significant for Titan Shoulder Charge / Hunter backstab builds.' },
        ],
        note: 'Linear: every point above 100 = +0.30% PvE / +0.20% PvP melee damage.',
        highlight: 150,
        highlightNote: '+15% PvE melee damage at stat 150.',
    },

    // Super / Intellect  (hash 144602215)
    144602215: {
        label: 'Super Damage',
        bonuses: [
            { label: 'Super DMG (PvE)',    key: 'superDmgPvE',    max: 45,  unit: '%', desc: 'Boosts total Super damage output. Great for boss DPS supers (e.g. Well of Radiance, Blade Barrage, Chaos Reach).' },
            { label: 'Super DMG (PvP)',    key: 'superDmgPvP',    max: 15,  unit: '%', desc: 'Can push one-shot thresholds in Crucible.' },
        ],
        note: 'Linear: every point above 100 = +0.45% PvE / +0.15% PvP Super damage. Stacks multiplicatively with Super damage buffs.',
        highlight: 160,
        highlightNote: '+27% PvE Super damage at stat 160.',
    },

    // Health / Resilience  (hash 392767087)
    392767087: {
        label: 'Shield Capacity & Recharge',
        bonuses: [
            { label: 'Shield Capacity (PvE)',      key: 'shieldCap',       max: 20,   unit: ' HP', desc: 'Additional shield HP on top of your base 70 HP shield. At 200 you have a 90 HP shield.' },
            { label: 'Shield Regen Start',         key: 'regenStart',      max: 25,   unit: '%',  desc: 'Your shields begin recharging this much faster after damage stops.' },
            { label: 'Full Regen Speed',           key: 'regenFull',       max: 50,   unit: '%',  desc: 'Shields recharge to full in this much less time once regen begins. At 200, full regen is twice as fast.' },
        ],
        note: 'Linear per point. Health 160 = shield regen speed equivalent to old T10 Recovery. T6 Health (60 pts) remains the key PvE DR breakpoint in the primary zone (~10% DR).',
        highlight: 160,
        highlightNote: 'At stat 160: +12HP shield, +15% regen start, +30% faster full regen — matches old max Recovery regen speed.',
    },

    // Class / Recovery  (hash 1943323491)
    1943323491: {
        label: 'Class Ability Overshield',
        bonuses: [
            { label: 'Overshield (PvE)',   key: 'overshieldPvE',  max: 40,  unit: ' HP', desc: 'Grants an overshield on top of normal HP when you use your class ability. Lasts 5s for quick abilities (Dodge), 10s for slower ones (Barricade, Rift).' },
            { label: 'Overshield (PvP)',   key: 'overshieldPvP',  max: 20,  unit: ' HP', desc: 'Provides a temporary HP buffer in Crucible — powerful for Titans with extended Barricade.' },
        ],
        note: 'Linear: every point above 100 = +0.40 PvE / +0.20 PvP overshield HP. Duration is fixed (not affected by the stat).',
        highlight: 150,
        highlightNote: '+20HP PvE / +10HP PvP overshield at stat 150.',
    },

    // Weapons / Mobility  (hash 2996146975)
    2996146975: {
        label: 'Weapon Damage & Ammo',
        bonuses: [
            { label: 'Boss DMG — Primary/Special', key: 'bossDmgPS',   max: 15,  unit: '%', desc: 'Increases damage to boss-tier enemies from Kinetic, Energy, and Special weapons.' },
            { label: 'Boss DMG — Heavy',           key: 'bossDmgH',    max: 10,  unit: '%', desc: 'Increases damage to boss-tier enemies from Power/Heavy slot weapons.' },
            { label: 'Guardian DMG (PvP)',         key: 'pvpDmg',      max: 6,   unit: '%', desc: 'Bonus weapon damage vs. other Guardians in Crucible/Trials.' },
            { label: 'Double Ammo Bricks',         key: 'doubleBricks', max: 100, unit: '%', desc: 'Chance for ammo pickups to contain double ammo. At 200, guaranteed double ammo from every brick.' },
        ],
        note: 'Linear. At 200: +15% primary/special boss DMG, +10% heavy boss DMG, +6% PvP, guaranteed double ammo bricks. Primary zone still governs sprint speed, jump height, and Hunter dodge cooldown.',
        highlight: 200,
        highlightNote: 'At stat 200: guaranteed double ammo bricks — maximum ammo economy.',
    },
};

/**
 * Calculate secondary zone bonus at a given stat value.
 * @param {number} statVal  - Current total stat value (can exceed 100)
 * @param {number} maxBonus - The bonus at stat 200
 * @returns {number}        - Current bonus (0 if statVal ≤ 100)
 */
export function calcSecondary(statVal, maxBonus) {
    if (statVal <= 100) return 0;
    return Math.min(1, (statVal - 100) / 100) * maxBonus;
}

/**
 * Format a secondary bonus for display.
 * @param {number} val   - Numeric bonus value
 * @param {string} unit  - '%', ' HP', etc.
 * @param {number} decimals
 */
export function fmtSecondary(val, unit, decimals = 1) {
    if (val === 0) return null;
    const prefix = val > 0 ? '+' : '';
    return `${prefix}${val.toFixed(decimals)}${unit}`;
}

/** Format seconds as M:SS */
export function fmtCooldown(s) {
    if (s == null) return '—';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Return the cooldown/bonus row for a given tier (clamped to T0–T10) */
export function getTierRow(table, tier) {
    const t = Math.min(10, Math.max(0, tier));
    return table[t] ?? table[table.length - 1];
}

/**
 * Per-stat ability data — primary zone only.
 * Secondary zone data lives in SECONDARY_ZONE above.
 */
export const STAT_ABILITY_DATA = {
    // Grenade / Discipline
    1735777505: {
        label:       'Grenade Cooldown (Primary Zone)',
        table:       GRENADE_COOLDOWNS,
        format:      'time',
        note:        'T0–T10 cooldown reduction. PvP cooldowns are ~2–3× longer. Above T10, see secondary zone below.',
    },
    // Melee / Strength
    4244567218: {
        label:       'Melee Cooldown (Primary Zone)',
        table:       MELEE_COOLDOWNS,
        format:      'time',
        note:        'Uncharged melee baseline. Charged melee & Shoulder Charge have independent internal timers.',
    },
    // Super / Intellect
    144602215: {
        label:       'Super Recharge Speed (Primary Zone)',
        table:       SUPER_BONUS,
        format:      'pct_faster',
        note:        'Reduces super charge requirement. Kills, orbs, and abilities also contribute super energy.',
    },
    // Resilience / Health
    392767087: {
        label:       'Damage Resistance & Barricade Cooldown',
        table:       RESILIENCE_DR,
        format:      'pct_dr',
        barricade:   BARRICADE_COOLDOWNS,
        note:        'T6 Health (~10% DR) is the standard endgame PvE floor. Barricade times are Titan only.',
    },
    // Recovery / Class
    1943323491: {
        label:       'Class Ability Cooldown',
        rift:        RIFT_COOLDOWNS,
        format:      'class_ability',
        note:        'Rift times shown (Warlocks). Also governs health & shield regeneration speed.',
    },
    // Mobility / Weapons
    2996146975: {
        label:       'Hunter Dodge Cooldown (Primary Zone)',
        table:       DODGE_COOLDOWNS,
        format:      'time',
        note:        'Also affects sprint speed and jump height for all classes. Above T10, see secondary zone below.',
    },
};

// ── Subclass socket classification ───────────────────────────────────────────

export const SOCKET_TYPE_LABELS = {
    super:     ['super ability'],
    grenade:   ['grenade'],
    melee:     ['melee ability'],
    class:     ['class ability'],
    movement:  ['movement ability'],
    aspect:    ['aspect'],
    fragment:  ['fragment'],
};

export const SOCKET_COLORS = {
    super:     { bg: 'bg-yellow-500/20', ring: 'ring-yellow-500/50', text: 'text-yellow-300',   label: 'Super'    },
    grenade:   { bg: 'bg-red-500/10',    ring: 'ring-red-500/30',    text: 'text-red-300',      label: 'Grenade'  },
    melee:     { bg: 'bg-orange-500/10', ring: 'ring-orange-500/30', text: 'text-orange-300',   label: 'Melee'    },
    class:     { bg: 'bg-sky-500/10',    ring: 'ring-sky-500/30',    text: 'text-sky-300',      label: 'Class'    },
    movement:  { bg: 'bg-teal-500/10',   ring: 'ring-teal-500/30',   text: 'text-teal-300',     label: 'Movement' },
    aspect:    { bg: 'bg-purple-500/10', ring: 'ring-purple-500/30', text: 'text-purple-300',   label: 'Aspect'   },
    fragment:  { bg: 'bg-slate-500/10',  ring: 'ring-slate-500/30',  text: 'text-slate-300',    label: 'Fragment' },
    other:     { bg: 'bg-white/5',       ring: 'ring-white/10',      text: 'text-white',        label: ''         },
};

export function classifySubclassSocket(itemTypeDisplayName = '') {
    const lower = itemTypeDisplayName.toLowerCase();
    for (const [type, keywords] of Object.entries(SOCKET_TYPE_LABELS)) {
        if (keywords.some(k => lower.includes(k))) return type;
    }
    return 'other';
}
