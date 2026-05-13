/**
 * Jadestone — Supabase-backed Manifest Lookups
 *
 * Queries the pre-populated d2_* Supabase tables instead of fetching from
 * Bungie's CDN on every request. Falls back to the JSON manifest service
 * (manifest.js) on any error.
 *
 * This gives us:
 *   - Structured SQL queries (e.g. search weapons by perk, filter by type)
 *   - Zero CDN traffic after initial sync
 *   - Proper relational data (items ↔ perks ↔ socket types)
 *   - Works on any deployment platform (no filesystem required)
 *
 * Import:
 *   import { sbGetItem, sbGetActivity, sbSearchWeapons } from '$lib/server/manifestSupabase.js';
 */

import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { cacheGet, cacheSet } from '$lib/server/cache.js';
// Fallback to JSON manifest
import { getItemDef, getActivityDef, getSandboxPerkDef, getStatDef } from '$lib/server/manifest.js';

const CACHE_TTL = 86_400_000; // 24h — manifest data is stable

// Service-role client — bypasses RLS for server-side reads
const sb = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});

const BUNGIE_ROOT = 'https://www.bungie.net';

/** Prepend Bungie CDN root to icon path. */
function icon(path) {
	if (!path || path.startsWith('http')) return path ?? null;
	return BUNGIE_ROOT + path;
}

// ── Generic Supabase hash lookup ──────────────────────────────────────────────
async function sbLookup(table, hash, fallback) {
	if (!hash) return null;
	const key = `sb:${table}:${hash}`;
	const cached = cacheGet(key);
	if (cached !== undefined) return cached;

	try {
		const { data, error } = await sb.from(table).select('raw').eq('hash', Number(hash)).single();

		if (error || !data) throw error ?? new Error('not found');
		const def = JSON.parse(data.raw);
		cacheSet(key, def, CACHE_TTL);
		return def;
	} catch {
		// Fall back to JSON manifest service
		const def = fallback ? await fallback(hash) : null;
		if (def) cacheSet(key, def, CACHE_TTL);
		return def;
	}
}

// ── Public item lookups ───────────────────────────────────────────────────────

/** Get an item definition by hash. Falls back to JSON manifest. */
export async function sbGetItem(hash) {
	return sbLookup('d2_items', hash, getItemDef);
}

/** Get an activity definition by hash. Falls back to JSON manifest. */
export async function sbGetActivity(hash) {
	return sbLookup('d2_activities', hash, getActivityDef);
}

/** Get a stat definition by hash. */
export async function sbGetStat(hash) {
	return sbLookup('d2_stats', hash, getStatDef);
}

/** Get a sandbox perk definition by hash. */
export async function sbGetPerk(hash) {
	return sbLookup('d2_perks', hash, getSandboxPerkDef);
}

/** Get a socket type definition by hash. */
export async function sbGetSocketType(hash) {
	return sbLookup('d2_socket_types', hash, null);
}

/** Get a socket category definition by hash. */
export async function sbGetSocketCategory(hash) {
	return sbLookup('d2_socket_cats', hash, null);
}

/** Get a damage type definition by hash. */
export async function sbGetDamageType(hash) {
	return sbLookup('d2_damage_types', hash, null);
}

/** Get a medal/historical-stats definition by string stat key. */
export async function sbGetMedal(statId) {
	if (!statId) return null;
	const key = `sb:d2_medals:${statId}`;
	const cached = cacheGet(key);
	if (cached !== undefined) return cached;

	try {
		const { data, error } = await sb
			.from('d2_medals')
			.select('raw, icon')
			.eq('stat_id', statId)
			.single();

		if (error || !data) throw error ?? new Error('not found');
		const def = JSON.parse(data.raw);
		cacheSet(key, def, CACHE_TTL);
		return def;
	} catch {
		return null;
	}
}

/** Get all medals from Supabase. Returns Map<statId → def>. */
export async function sbGetAllMedals() {
	const key = 'sb:d2_medals:all';
	const cached = cacheGet(key);
	if (cached !== undefined) return cached;

	try {
		const { data, error } = await sb.from('d2_medals').select('stat_id, raw');
		if (error) throw error;

		const map = new Map((data ?? []).map((r) => [r.stat_id, JSON.parse(r.raw)]));
		cacheSet(key, map, CACHE_TTL);
		return map;
	} catch {
		return new Map();
	}
}

// ── Weapon search & filtering ─────────────────────────────────────────────────

/**
 * Search weapons by name (partial match).
 * Returns array of structured weapon objects.
 */
export async function sbSearchWeapons(query, { limit = 20, tierType, damageType } = {}) {
	let q = sb
		.from('d2_items')
		.select(
			'hash, name, description, icon, screenshot, tier_type, tier_type_name, damage_type, ammo_type, item_type, item_type_name, flavor_text'
		)
		.ilike('name', `%${query}%`)
		.in('item_type', [3]) // 3 = Weapon
		.limit(limit);

	if (tierType != null) q = q.eq('tier_type', tierType);
	if (damageType != null) q = q.eq('damage_type', damageType);

	const { data, error } = await q;
	if (error) {
		console.error('[manifestSupabase] searchWeapons:', error.message);
		return [];
	}

	return (data ?? []).map((w) => ({
		...w,
		icon: icon(w.icon),
		screenshot: icon(w.screenshot)
	}));
}

/**
 * Get all weapons of a given sub-type (e.g. all Hand Cannons).
 * itemSubType values match Bungie's DestinyItemSubType enum.
 */
export async function sbGetWeaponsBySubType(itemSubType, { limit = 100, tierType } = {}) {
	let q = sb
		.from('d2_items')
		.select('hash, name, icon, tier_type, damage_type, ammo_type, item_type_name, stats, sockets')
		.eq('item_type', 3)
		.eq('item_sub_type', itemSubType)
		.limit(limit);

	if (tierType != null) q = q.eq('tier_type', tierType);

	const { data, error } = await q;
	if (error) {
		console.error('[manifestSupabase] getWeaponsBySubType:', error.message);
		return [];
	}

	return (data ?? []).map((w) => ({
		...w,
		icon: icon(w.icon),
		stats: w.stats ? JSON.parse(w.stats) : {}
	}));
}

/**
 * Get all Gambit activities from Supabase.
 */
export async function sbGetGambitActivities() {
	const key = 'sb:gambit-activities';
	const cached = cacheGet(key);
	if (cached) return cached;

	const { data, error } = await sb
		.from('d2_activities')
		.select('hash, name, description, icon, pgcr_image, raw');

	if (error) {
		console.error('[manifestSupabase] getGambitActivities:', error.message);
		return [];
	}

	// Filter client-side for Gambit mode (modeType 63 in raw JSON)
	const gambit = (data ?? [])
		.filter((r) => {
			try {
				const raw = JSON.parse(r.raw);
				return (
					(raw.activityModeHashes ?? []).some((h) => h === 1164760504) || // Gambit
					(raw.activityModeTypes ?? []).includes(63)
				);
			} catch {
				return false;
			}
		})
		.map((r) => ({
			hash: r.hash,
			name: r.name,
			icon: icon(r.icon),
			pgcrImage: icon(r.pgcr_image)
		}));

	cacheSet(key, gambit, CACHE_TTL);
	return gambit;
}

/**
 * Batch-resolve item hashes to names + icons.
 * Returns Map<hash → { name, icon, tierType }>
 */
export async function sbResolveItemHashes(hashes) {
	if (!hashes?.length) return new Map();
	const uniqueHashes = [...new Set(hashes.map(Number))];

	const { data, error } = await sb
		.from('d2_items')
		.select('hash, name, icon, tier_type, damage_type')
		.in('hash', uniqueHashes);

	if (error) {
		console.error('[manifestSupabase] resolveItemHashes:', error.message);
		return new Map();
	}

	return new Map(
		(data ?? []).map((w) => [
			w.hash,
			{
				name: w.name,
				icon: icon(w.icon),
				tierType: w.tier_type,
				damageType: w.damage_type
			}
		])
	);
}

/**
 * Batch-resolve activity hashes to names.
 * Returns Map<hash → { name, icon }>
 */
export async function sbResolveActivityHashes(hashes) {
	if (!hashes?.length) return new Map();
	const uniqueHashes = [...new Set(hashes.map(Number))];

	const { data, error } = await sb
		.from('d2_activities')
		.select('hash, name, icon')
		.in('hash', uniqueHashes);

	if (error) {
		console.error('[manifestSupabase] resolveActivityHashes:', error.message);
		return new Map();
	}

	return new Map((data ?? []).map((a) => [a.hash, { name: a.name, icon: icon(a.icon) }]));
}

// ── Supabase SQL setup helper (run once to create tables) ─────────────────────
export const SUPABASE_SCHEMA_SQL = `
-- Run this in Supabase SQL editor to create the manifest tables

create table if not exists d2_manifest_meta (
    id         integer primary key default 1,
    version    text not null,
    synced_at  timestamptz default now()
);

create table if not exists d2_items (
    hash           bigint primary key,
    name           text,
    description    text,
    icon           text,
    screenshot     text,
    item_type      integer,
    item_sub_type  integer,
    tier_type      integer,
    tier_type_name text,
    class_type     integer,
    damage_type    integer,
    ammo_type      integer,
    bucket_hash    bigint,
    flavor_text    text,
    item_type_name text,
    equippable     boolean,
    stats          jsonb,
    sockets        jsonb,
    perks          jsonb,
    raw            jsonb
);
create index if not exists d2_items_name_idx       on d2_items (name);
create index if not exists d2_items_type_idx       on d2_items (item_type, item_sub_type);
create index if not exists d2_items_tier_idx       on d2_items (tier_type);
create index if not exists d2_items_damage_idx     on d2_items (damage_type);

create table if not exists d2_activities (
    hash               bigint primary key,
    name               text,
    description        text,
    icon               text,
    pgcr_image         text,
    is_pvp             boolean,
    activity_type_hash bigint,
    mode_hashes        jsonb,
    raw                jsonb
);
create index if not exists d2_activities_name_idx  on d2_activities (name);

create table if not exists d2_stats (
    hash        bigint primary key,
    name        text,
    description text,
    icon        text,
    raw         jsonb
);

create table if not exists d2_perks (
    hash        bigint primary key,
    name        text,
    description text,
    icon        text,
    perk_groups jsonb,
    raw         jsonb
);
create index if not exists d2_perks_name_idx on d2_perks (name);

create table if not exists d2_socket_types (
    hash                  bigint primary key,
    name                  text,
    socket_category_hash  bigint,
    raw                   jsonb
);

create table if not exists d2_socket_cats (
    hash        bigint primary key,
    name        text,
    description text,
    raw         jsonb
);

create table if not exists d2_damage_types (
    hash              bigint primary key,
    name              text,
    description       text,
    icon              text,
    transparent_icon  text,
    enum_value        integer,
    raw               jsonb
);

create table if not exists d2_medals (
    stat_id        text primary key,
    name           text,
    description    text,
    icon           text,
    medal_tier     text,
    activity_mode  integer,
    raw            jsonb
);
create index if not exists d2_medals_tier_idx  on d2_medals (medal_tier);
create index if not exists d2_medals_mode_idx  on d2_medals (activity_mode);

-- Row Level Security: allow public reads
alter table d2_manifest_meta enable row level security;
alter table d2_items         enable row level security;
alter table d2_activities    enable row level security;
alter table d2_stats         enable row level security;
alter table d2_perks         enable row level security;
alter table d2_socket_types  enable row level security;
alter table d2_socket_cats   enable row level security;
alter table d2_damage_types  enable row level security;
alter table d2_medals        enable row level security;

create policy "public_read" on d2_manifest_meta for select using (true);
create policy "public_read" on d2_items         for select using (true);
create policy "public_read" on d2_activities    for select using (true);
create policy "public_read" on d2_stats         for select using (true);
create policy "public_read" on d2_perks         for select using (true);
create policy "public_read" on d2_socket_types  for select using (true);
create policy "public_read" on d2_socket_cats   for select using (true);
create policy "public_read" on d2_damage_types  for select using (true);
create policy "public_read" on d2_medals        for select using (true);
`;
