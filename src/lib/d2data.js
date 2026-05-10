/**
 * Destiny 2 static ability & stat tier data.
 *
 * Cooldown values sourced from the community:
 *   • Destiny Data Compendium (Mercules904)
 *   • d2foundry.gg
 *   • DestinyItemManager / d2-additional-info
 *
 * Edge of Fate (2025) stat renames:
 *   Mobility     → Weapons (sprint speed, jump height, Hunters: class ability cooldown)
 *   Resilience   → Health  (damage resistance; Titans: barricade cooldown)
 *   Recovery     → Class   (regen speed; Warlocks: rift cooldown)
 *   Discipline   → Grenade (grenade cooldown)
 *   Intellect    → Super   (super recharge speed)
 *   Strength     → Melee   (melee cooldown)
 *
 * Hashes are stable across renames — we use the old hashes but display
 * whatever name the manifest returns at runtime.
 *
 * Cooldowns shown in seconds (PvE values). PvP values differ significantly.
 * Ability cooldowns also vary by specific ability — these are baseline averages.
 */

// T0–T10: stat value 0–9 = T0, 10–19 = T1, … 100+ = T10
// Secondary zone T11–T20 (stat 110–200) provides additional damage resistance
// and ability damage bonuses — not cooldown changes beyond T10.

// ── Grenade cooldowns (Discipline / Grenade stat) ────────────────────────────
// Source: DDC, representative across most standard grenades (PvE)
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

// ── Melee cooldowns (Strength / Melee stat) ───────────────────────────────────
// Uncharged melee; charged melees have separate internal timers.
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

// ── Warlock Rift cooldowns (Recovery / Class stat) ────────────────────────────
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

// ── Titan Barricade cooldowns (Resilience / Health stat) ─────────────────────
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

// ── Hunter Dodge cooldowns (Mobility / Weapons stat) ─────────────────────────
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

// ── Resilience damage resistance (PvE) ───────────────────────────────────────
// Percentage of incoming damage blocked (in addition to base resistance)
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

// ── Super charge speed (Intellect / Super stat) ───────────────────────────────
// Relative reduction in super charge time compared to T0 baseline
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

/**
 * Map from Bungie stat hash → ability data.
 * classAbility differs per class so we provide all three.
 */
export const STAT_ABILITY_DATA = {
    // Discipline / Grenade
    1735777505: {
        label:       'Grenade Cooldown',
        table:       GRENADE_COOLDOWNS,
        format:      'time',
        note:        'Varies by grenade type. PvP cooldowns are significantly longer.',
    },
    // Strength / Melee
    4244567218: {
        label:       'Melee Cooldown',
        table:       MELEE_COOLDOWNS,
        format:      'time',
        note:        'Uncharged melee baseline. Charged melee & Titan Shoulder Charge have independent timers.',
    },
    // Intellect / Super
    144602215: {
        label:       'Super Recharge',
        table:       SUPER_BONUS,
        format:      'pct_faster',
        note:        'Reduces super charge requirement. Kills, orbs, and ability use also charge super.',
    },
    // Resilience / Health
    392767087: {
        label:       'Damage Resistance (PvE) & Barricade Cooldown (Titans)',
        table:       RESILIENCE_DR,
        format:      'pct_dr',
        barricade:   BARRICADE_COOLDOWNS,
        note:        'T6 Resilience is the breakpoint for 10% DR — widely considered mandatory in endgame PvE.',
    },
    // Recovery / Class
    1943323491: {
        label:       'Class Ability Cooldown',
        rift:        RIFT_COOLDOWNS,
        barricade:   null,
        dodge:       null,
        format:      'class_ability',
        note:        'Warlock: Rift. Also governs health & shield regeneration speed.',
    },
    // Mobility / Weapons
    2996146975: {
        label:       'Class Ability Cooldown (Hunter Dodge)',
        table:       DODGE_COOLDOWNS,
        format:      'time',
        note:        'Also affects sprint speed and jump height for all classes.',
    },
};

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
 * Subclass socket type identifiers — used to label sockets in the UI.
 * Matched against itemTypeDisplayName (lowercase).
 */
export const SOCKET_TYPE_LABELS = {
    super:     ['super ability'],
    grenade:   ['grenade'],
    melee:     ['melee ability'],
    class:     ['class ability'],
    movement:  ['movement ability'],
    aspect:    ['aspect'],
    fragment:  ['fragment'],
};

/** Socket category → display color */
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

/** Classify a subclass socket by its itemTypeDisplayName */
export function classifySubclassSocket(itemTypeDisplayName = '') {
    const lower = itemTypeDisplayName.toLowerCase();
    for (const [type, keywords] of Object.entries(SOCKET_TYPE_LABELS)) {
        if (keywords.some(k => lower.includes(k))) return type;
    }
    return 'other';
}
