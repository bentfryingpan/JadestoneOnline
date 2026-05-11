#!/usr/bin/env node
/**
 * Jadestone — Manifest Supabase Sync Script
 *
 * Downloads the Destiny 2 manifest from Bungie and populates Supabase tables
 * for fast, structured manifest queries without requiring SQLite on the server.
 *
 * Run with:
 *   node scripts/sync-manifest.js
 *
 * Required environment variables (in .env):
 *   BUNGIE_API_KEY
 *   PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY    (service role key, NOT anon key)
 *
 * Supabase tables it creates/syncs:
 *   d2_items          — DestinyInventoryItemDefinition
 *   d2_activities     — DestinyActivityDefinition
 *   d2_stats          — DestinyStatDefinition
 *   d2_perks          — DestinySandboxPerkDefinition
 *   d2_socket_types   — DestinySocketTypeDefinition
 *   d2_socket_cats    — DestinySocketCategoryDefinition
 *   d2_damage_types   — DestinyDamageTypeDefinition
 *   d2_medals         — DestinyHistoricalStatsDefinition
 *   d2_manifest_meta  — version tracking
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

const BUNGIE_API_KEY       = process.env.BUNGIE_API_KEY;
const SUPABASE_URL         = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUNGIE_ROOT          = 'https://www.bungie.net';

if (!BUNGIE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing env vars: BUNGIE_API_KEY, PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY');
    process.exit(1);
}

// ── Supabase client (service role — bypasses RLS) ─────────────────────────────
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function bungieGet(url) {
    const r = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!r.ok) throw new Error(`Bungie ${r.status}: ${url}`);
    return r.json();
}

async function bungieGetAbsolute(absUrl) {
    const r = await fetch(absUrl, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
    if (!r.ok) throw new Error(`Bungie ${r.status}: ${absUrl}`);
    return r.json();
}

function toSignedId(hash) {
    const n = Number(hash);
    return n > 2_147_483_647 ? n - 4_294_967_296 : n;
}

async function upsertBatch(table, rows, batchSize = 500) {
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from(table).upsert(batch, { onConflict: 'hash' });
        if (error) console.error(`  Error upserting ${table}:`, error.message);
        else process.stdout.write(`  ${table}: ${Math.min(i + batchSize, rows.length)}/${rows.length}\r`);
    }
    console.log(`  ${table}: ✓ ${rows.length} rows`);
}

// ── Table transformation helpers ──────────────────────────────────────────────
function itemRow(hash, def) {
    return {
        hash:              Number(hash),
        name:              def.displayProperties?.name ?? '',
        description:       def.displayProperties?.description ?? '',
        icon:              def.displayProperties?.icon ?? null,
        screenshot:        def.screenshot ?? null,
        item_type:         def.itemType ?? 0,
        item_sub_type:     def.itemSubType ?? 0,
        tier_type:         def.inventory?.tierType ?? 0,
        tier_type_name:    def.inventory?.tierTypeName ?? '',
        class_type:        def.classType ?? 3,
        damage_type:       def.defaultDamageType ?? 0,
        ammo_type:         def.equippingBlock?.ammoType ?? 0,
        bucket_hash:       def.inventory?.bucketTypeHash ?? null,
        flavor_text:       def.flavorText ?? '',
        item_type_name:    def.itemTypeDisplayName ?? '',
        equippable:        def.equippable ?? false,
        stats:             def.stats?.stats ? JSON.stringify(def.stats.stats) : null,
        sockets:           def.sockets ? JSON.stringify(def.sockets) : null,
        perks:             def.perks ? JSON.stringify(def.perks) : null,
        raw:               JSON.stringify(def),
    };
}

function activityRow(hash, def) {
    return {
        hash:         Number(hash),
        name:         def.displayProperties?.name ?? '',
        description:  def.displayProperties?.description ?? '',
        icon:         def.displayProperties?.icon ?? null,
        pgcr_image:   def.pgcrImage ?? null,
        is_pvp:       def.isPvP ?? false,
        activity_type_hash: def.activityTypeHash ?? null,
        mode_hashes:  JSON.stringify(def.activityModeHashes ?? []),
        raw:          JSON.stringify(def),
    };
}

function statRow(hash, def) {
    return {
        hash:        Number(hash),
        name:        def.displayProperties?.name ?? '',
        description: def.displayProperties?.description ?? '',
        icon:        def.displayProperties?.icon ?? null,
        raw:         JSON.stringify(def),
    };
}

function perkRow(hash, def) {
    return {
        hash:        Number(hash),
        name:        def.displayProperties?.name ?? '',
        description: def.displayProperties?.description ?? '',
        icon:        def.displayProperties?.icon ?? null,
        perk_groups: JSON.stringify(def.perkGroups ?? []),
        raw:         JSON.stringify(def),
    };
}

function socketTypeRow(hash, def) {
    return {
        hash:              Number(hash),
        name:              def.displayProperties?.name ?? '',
        socket_category_hash: def.socketCategoryHash ?? null,
        raw:               JSON.stringify(def),
    };
}

function socketCatRow(hash, def) {
    return {
        hash:        Number(hash),
        name:        def.displayProperties?.name ?? '',
        description: def.displayProperties?.description ?? '',
        raw:         JSON.stringify(def),
    };
}

function damageTypeRow(hash, def) {
    return {
        hash:             Number(hash),
        name:             def.displayProperties?.name ?? '',
        description:      def.displayProperties?.description ?? '',
        icon:             def.displayProperties?.icon ?? null,
        transparent_icon: def.transparentIconPath ?? null,
        enum_value:       def.enumValue ?? 0,
        raw:              JSON.stringify(def),
    };
}

function medalRow(key, def) {
    return {
        stat_id:       key,
        name:          def.statName ?? key,
        description:   def.statDescription ?? '',
        icon:          def.iconImage ?? null,
        medal_tier:    def.medalTierInfo?.identifier ?? null,
        activity_mode: def.activityModeType ?? null,
        raw:           JSON.stringify(def),
    };
}

// ── Main sync ─────────────────────────────────────────────────────────────────
console.log('\n🔷 Jadestone Manifest Sync\n');

// 1. Get manifest metadata
const manifestData = await bungieGet('/Platform/Destiny2/Manifest/');
const meta = manifestData.Response;
const version = meta.version;
console.log(`📦 Manifest version: ${version}`);

// Check if already up-to-date
const { data: metaRow } = await supabase
    .from('d2_manifest_meta')
    .select('version')
    .single();

if (metaRow?.version === version) {
    console.log('✅ Supabase manifest is already up-to-date. Nothing to do.\n');
    process.exit(0);
}

const paths = meta.jsonWorldComponentContentPaths?.en ?? {};

// 2. Sync each table
const tableConfigs = [
    { component: 'DestinyInventoryItemDefinition', table: 'd2_items',       rowFn: itemRow },
    { component: 'DestinyActivityDefinition',      table: 'd2_activities',   rowFn: activityRow },
    { component: 'DestinyStatDefinition',          table: 'd2_stats',        rowFn: statRow },
    { component: 'DestinySandboxPerkDefinition',   table: 'd2_perks',        rowFn: perkRow },
    { component: 'DestinySocketTypeDefinition',    table: 'd2_socket_types', rowFn: socketTypeRow },
    { component: 'DestinySocketCategoryDefinition',table: 'd2_socket_cats',  rowFn: socketCatRow },
    { component: 'DestinyDamageTypeDefinition',    table: 'd2_damage_types', rowFn: damageTypeRow },
];

for (const { component, table, rowFn } of tableConfigs) {
    const path = paths[component];
    if (!path) { console.warn(`  ⚠️  No path for ${component}`); continue; }

    console.log(`\n📥 Fetching ${component}…`);
    const rawTable = await bungieGetAbsolute(BUNGIE_ROOT + path);
    const rows = Object.entries(rawTable).map(([hash, def]) => rowFn(hash, def));
    console.log(`   ${rows.length} entries — upserting to ${table}…`);
    await upsertBatch(table, rows);
}

// 3. Sync DestinyHistoricalStatsDefinition (string keys)
console.log('\n📥 Fetching DestinyHistoricalStatsDefinition…');
const histData = await bungieGet('/Platform/Destiny2/Stats/Definition/');
const histTable = histData.Response ?? {};
const medalRows = Object.entries(histTable).map(([key, def]) => medalRow(key, def));
console.log(`   ${medalRows.length} entries — upserting to d2_medals…`);
// Medals use stat_id as primary key
for (let i = 0; i < medalRows.length; i += 500) {
    const batch = medalRows.slice(i, i + 500);
    const { error } = await supabase.from('d2_medals').upsert(batch, { onConflict: 'stat_id' });
    if (error) console.error('  Error:', error.message);
}
console.log(`  d2_medals: ✓ ${medalRows.length} rows`);

// 4. Update version tracking
await supabase.from('d2_manifest_meta').upsert({ id: 1, version, synced_at: new Date().toISOString() });
console.log('\n✅ Manifest sync complete!\n');
