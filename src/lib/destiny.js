/**
 * Jadestone — Destiny 2 shared design constants
 *
 * All Destiny-specific lookup tables, color maps, and formatting helpers
 * that are needed on BOTH client (Svelte components) and server (API routes).
 * Import from $lib/destiny.js — never import server-only modules here.
 */

const BUNGIE_ROOT = 'https://www.bungie.net';

// ── Icon helpers ─────────────────────────────────────────────────────────────

/** Prepend Bungie CDN root to a relative icon path. Returns null if falsy. */
export function bungieIcon(path) {
	if (!path) return null;
	if (path.startsWith('http')) return path;
	return BUNGIE_ROOT + path;
}

// ── Rarity ───────────────────────────────────────────────────────────────────

/** Destiny item tier type numbers → rarity name. */
export const TIER_TYPE = {
	0: 'unknown',
	1: 'currency',
	2: 'common',
	3: 'uncommon',
	4: 'rare',
	5: 'legendary',
	6: 'exotic'
};

/** CSS class for a rarity tier number. */
export function rarityClass(tierType) {
	return 'rarity-' + (TIER_TYPE[tierType] ?? 'common');
}

/** Display name for a rarity tier number. */
export function rarityLabel(tierType) {
	const t = TIER_TYPE[tierType] ?? 'common';
	return t.charAt(0).toUpperCase() + t.slice(1);
}

/** CSS custom-property color for a rarity (use in inline style). */
export const RARITY_COLORS = {
	common: '#c2bbb2',
	uncommon: '#336b3e',
	rare: '#4a83b3',
	legendary: '#7854a1',
	exotic: '#ceae33',
	crafted: '#e04f2f',
	unknown: '#6b7280',
	currency: '#6b7280'
};

export function rarityColor(tierType) {
	const name = TIER_TYPE[tierType] ?? 'common';
	return RARITY_COLORS[name] ?? RARITY_COLORS.common;
}

// ── Damage / element types ────────────────────────────────────────────────────

/** Bungie damage type hash → display name. */
export const DAMAGE_TYPE_NAMES = {
	1: 'Kinetic',
	2: 'Arc',
	3: 'Solar',
	4: 'Void',
	6: 'Stasis',
	7: 'Strand'
};

/** Damage type enum number → CSS class suffix. */
export const DAMAGE_TYPE_CLASS = {
	1: 'kinetic',
	2: 'arc',
	3: 'solar',
	4: 'void',
	6: 'stasis',
	7: 'strand'
};

export const DAMAGE_TYPE_COLORS = {
	kinetic: '#c2bbb2',
	arc: '#79c2f0',
	solar: '#f0662a',
	void: '#9370db',
	stasis: '#5988ff',
	strand: '#31c46f'
};

export function damageTypeClass(damageTypeEnum) {
	return 'd2-element--' + (DAMAGE_TYPE_CLASS[damageTypeEnum] ?? 'kinetic');
}
export function damageTypeName(damageTypeEnum) {
	return DAMAGE_TYPE_NAMES[damageTypeEnum] ?? 'Kinetic';
}
export function damageTypeColor(damageTypeEnum) {
	const cls = DAMAGE_TYPE_CLASS[damageTypeEnum] ?? 'kinetic';
	return DAMAGE_TYPE_COLORS[cls] ?? DAMAGE_TYPE_COLORS.kinetic;
}

// ── Ammo types ────────────────────────────────────────────────────────────────

export const AMMO_TYPE_NAMES = {
	1: 'Primary',
	2: 'Special',
	3: 'Heavy'
};
export const AMMO_TYPE_COLORS = {
	1: '#b6bbb7',
	2: '#4a9e6b',
	3: '#c67d35'
};

// ── Item categories → weapon class ───────────────────────────────────────────

/** Weapon type category IDs → short label. */
export const WEAPON_CATEGORY = {
	6: 'Auto Rifle',
	7: 'Hand Cannon',
	8: 'Pulse Rifle',
	9: 'Scout Rifle',
	10: 'Fusion Rifle',
	11: 'Sniper Rifle',
	12: 'Shotgun',
	13: 'Machine Gun',
	14: 'Rocket Launcher',
	54: 'Sword',
	153950757: 'Grenade Launcher',
	2489664120: 'Linear Fusion Rifle',
	3317538576: 'Trace Rifle',
	3954685534: 'Bow',
	4046819993: 'Sidearm',
	2803544910: 'Submachine Gun',
	3871742104: 'Glaive'
};

// ── Weapon stat hashes ────────────────────────────────────────────────────────

/** Stat hashes for common weapon stats (Bungie's manifest hashes). */
export const WEAPON_STAT_HASHES = {
	2996146975: { name: 'Mobility', order: 99 }, // Edge of Fate rename
	392767087: { name: 'Resilience', order: 99 },
	1943323491: { name: 'Recovery', order: 99 },
	1935470627: { name: 'Rounds/Minute', order: 0 },
	3871231066: { name: 'Charge Time', order: 0 },
	2961396640: { name: 'Draw Time', order: 0 },
	4043523819: { name: 'Impact', order: 1 },
	1240592695: { name: 'Range', order: 2 },
	155624089: { name: 'Stability', order: 3 },
	943549884: { name: 'Handling', order: 4 },
	4188031367: { name: 'Reload Speed', order: 5 },
	1345609583: { name: 'Aim Assistance', order: 6 },
	2715839340: { name: 'Recoil Direction', order: 7 },
	3555269338: { name: 'Zoom', order: 8 },
	2961396640: { name: 'Draw Time', order: 0 },
	2523465841: { name: 'Velocity', order: 0 },
	4284893193: { name: 'Blast Radius', order: 0 },
	209426660: { name: 'Swing Speed', order: 0 },
	925767036: { name: 'Guard Resistance', order: 9 },
	1540203877: { name: 'Guard Efficiency', order: 10 },
	3779394102: { name: 'Guard Endurance', order: 11 },
	447667954: { name: 'Ammo Capacity', order: 12 }
};

/** Stats to display on weapon tooltips (ordered list). */
export const DISPLAY_STAT_ORDER = [
	1935470627, // Rounds/Minute
	3871231066, // Charge Time
	2961396640, // Draw Time
	2523465841, // Velocity
	4284893193, // Blast Radius
	4043523819, // Impact
	1240592695, // Range
	155624089, // Stability
	943549884, // Handling
	4188031367, // Reload Speed
	1345609583, // Aim Assistance
	2715839340, // Recoil Direction
	3555269338, // Zoom
	209426660, // Swing Speed
	925767036, // Guard Resistance
	1540203877, // Guard Efficiency
	3779394102, // Guard Endurance
	447667954 // Ammo Capacity
];

/** Maximum values for weapon stat bars (Bungie max = 100 for most stats). */
export const STAT_MAX_VALUES = {
	1935470627: 1000, // RPM can exceed 100
	3871231066: 1000, // Charge Time
	2961396640: 1000, // Draw Time
	2715839340: 100,
	default: 100
};

export function statMaxValue(statHash) {
	return STAT_MAX_VALUES[statHash] ?? STAT_MAX_VALUES.default;
}

// ── Membership types ──────────────────────────────────────────────────────────

export const MEMBERSHIP_TYPE_NAMES = {
	1: 'Xbox',
	2: 'PlayStation',
	3: 'Steam',
	5: 'Stadia',
	6: 'Epic',
	10: 'Demon',
	254: 'BungieNext'
};

// ── EGO scoring tiers ─────────────────────────────────────────────────────────

export const EGO_TIERS = [
	{ tier: 'S', min: 90, color: '#ceae33', label: 'Mythic' },
	{ tier: 'A', min: 70, color: '#e08030', label: 'Elite' },
	{ tier: 'B', min: 50, color: '#4a9e6b', label: 'Seasoned' },
	{ tier: 'C', min: 30, color: '#4a83b3', label: 'Competent' },
	{ tier: 'D', min: 10, color: '#7854a1', label: 'Developing' },
	{ tier: 'F', min: -Infinity, color: '#6b7280', label: 'Weak' }
];

export function egoTier(score) {
	return EGO_TIERS.find((t) => score >= t.min) ?? EGO_TIERS.at(-1);
}

// ── Gambit-specific stats ─────────────────────────────────────────────────────

/** Maps PGCR stat key → display label + icon description for the scoreboard. */
export const GAMBIT_SCOREBOARD_STATS = [
	{ key: 'motesDeposited', label: 'Motes\nDeposited', icon: 'motes' },
	{ key: 'invasionKills', label: 'Invasion\nKills', icon: 'invasion' },
	{ key: 'motesDenied', label: 'Motes\nDenied', icon: 'denied' },
	{ key: 'motesLost', label: 'Motes\nLost', icon: 'lost' },
	{ key: 'blockersDefeated', label: 'Blockers\nDefeated', icon: 'blocker' },
	{ key: 'kills', label: 'Kills', icon: null },
	{ key: 'deaths', label: 'Deaths', icon: null },
	{ key: 'assists', label: 'Assists', icon: null }
];

// ── Number formatters ─────────────────────────────────────────────────────────

/** Format a number with commas for thousands. */
export function fmtNum(n, decimals = 0) {
	if (n == null || isNaN(n)) return '—';
	return n.toLocaleString('en-US', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	});
}

/** Format a K/D ratio to 2 decimal places. */
export function fmtKD(kills, deaths) {
	if (!deaths) return kills > 0 ? fmtNum(kills, 2) : '—';
	return (kills / deaths).toFixed(2);
}

/** Format a percentage (0–100). */
export function fmtPct(value, decimals = 1) {
	if (value == null || isNaN(value)) return '—';
	return value.toFixed(decimals) + '%';
}

/** Format large numbers with K suffix. */
export function fmtCompact(n) {
	if (n == null) return '—';
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
	return String(n);
}

/** Format seconds as M:SS */
export function fmtDuration(secs) {
	if (!secs && secs !== 0) return '—';
	const m = Math.floor(secs / 60);
	const s = Math.floor(secs % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Profile URL builder ───────────────────────────────────────────────────────

/** Generate a Jadestone profile URL for a player. */
export function profileUrl(name, code) {
	if (!name) return '#';
	const n = encodeURIComponent(name);
	return code ? `/profile/${n}/${code}` : `/profile/${n}/0`;
}

/** Parse a "Name#1234" display name into { name, code }. */
export function parseDisplayName(fullName) {
	const hash = fullName?.lastIndexOf('#') ?? -1;
	if (hash < 0) return { name: fullName ?? '', code: '' };
	return {
		name: fullName.slice(0, hash),
		code: fullName.slice(hash + 1)
	};
}

// ── Socket / subclass classification ─────────────────────────────────────────

export const SOCKET_TYPE_LABELS = {
	super: ['super ability'],
	grenade: ['grenade'],
	melee: ['melee ability'],
	class: ['class ability'],
	movement: ['movement ability'],
	aspect: ['aspect'],
	fragment: ['fragment']
};

export const SOCKET_COLORS = {
	super: {
		bg: 'bg-yellow-500/20',
		ring: 'ring-yellow-500/50',
		text: 'text-yellow-300',
		label: 'Super'
	},
	grenade: { bg: 'bg-red-500/10', ring: 'ring-red-500/30', text: 'text-red-300', label: 'Grenade' },
	melee: {
		bg: 'bg-orange-500/10',
		ring: 'ring-orange-500/30',
		text: 'text-orange-300',
		label: 'Melee'
	},
	class: { bg: 'bg-sky-500/10', ring: 'ring-sky-500/30', text: 'text-sky-300', label: 'Class' },
	movement: {
		bg: 'bg-teal-500/10',
		ring: 'ring-teal-500/30',
		text: 'text-teal-300',
		label: 'Movement'
	},
	aspect: {
		bg: 'bg-purple-500/10',
		ring: 'ring-purple-500/30',
		text: 'text-purple-300',
		label: 'Aspect'
	},
	fragment: {
		bg: 'bg-slate-500/10',
		ring: 'ring-slate-500/30',
		text: 'text-slate-300',
		label: 'Fragment'
	},
	other: { bg: 'bg-white/5', ring: 'ring-white/10', text: 'text-white', label: '' }
};

export function classifySubclassSocket(itemTypeDisplayName = '') {
	const lower = itemTypeDisplayName.toLowerCase();
	for (const [type, keywords] of Object.entries(SOCKET_TYPE_LABELS)) {
		if (keywords.some((k) => lower.includes(k))) return type;
	}
	return 'other';
}
