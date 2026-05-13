/**
 * /api/admin/sync-manifest — Full manifest synchronization utility.
 * Allows bulk-upserting manifest tables into Supabase JSONB.
 */

import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabase-server.js';
import { getManifestVersion } from '$lib/server/manifest.js';

const BUNGIE_ROOT = 'https://www.bungie.net';

async function bungieGet(url) {
	const res = await fetch(BUNGIE_ROOT + url, { headers: { 'X-API-Key': BUNGIE_API_KEY } });
	if (!res.ok) return null;
	const text = await res.text();
	// Quote BigInts
	const fixed = text.replace(/:\s*(\d{15,})/g, ': "$1"');
	return JSON.parse(fixed);
}

export async function POST({ request, url }) {
	const mode = url.searchParams.get('mode') ?? 'small'; // 'small' | 'medals' | 'large'
	const version = await getManifestVersion();

	// ── 1. Fetch Manifest Metadata ───────────────────────────────────────────
	const manifestRes = await bungieGet('/Platform/Destiny2/Manifest/');
	const paths = manifestRes?.Response?.jsonWorldComponentContentPaths?.en;
	if (!paths) return json({ error: 'Manifest paths not found' }, { status: 500 });

	const results = [];

	// ── 2. Handle Modes ──────────────────────────────────────────────────────

	if (mode === 'medals') {
		const data = await bungieGet('/Platform/Destiny2/Stats/Definition/');
		const medals = data?.Response ?? {};
		const toUpsert = Object.entries(medals).map(([id, def]) => ({
			table_name: 'DestinyHistoricalStatsDefinition',
			hash: id,
			data: def,
			version,
			updated_at: new Date().toISOString()
		}));

		// Batch upsert (500 at a time)
		const CHUNK = 500;
		for (let i = 0; i < toUpsert.length; i += CHUNK) {
			await supabaseAdmin.from('manifest_definitions').upsert(toUpsert.slice(i, i + CHUNK));
		}
		results.push({ table: 'Medals', count: toUpsert.length });
	}

	if (mode === 'small') {
		const smallTables = [
			'DestinyActivityDefinition',
			'DestinyActivityModeDefinition',
			'DestinyStatDefinition',
			'DestinyDamageTypeDefinition',
			'DestinySeasonDefinition',
			'DestinyProgressionDefinition',
			'DestinyClassDefinition',
			'DestinyRaceDefinition',
			'DestinyItemCategoryDefinition',
			'DestinyInventoryBucketDefinition'
		];

		for (const tableName of smallTables) {
			const path = paths[tableName];
			if (!path) continue;
			const table = await bungieGet(path);
			if (!table) continue;

			const toUpsert = Object.entries(table).map(([hash, def]) => ({
				table_name: tableName,
				hash: String(hash >>> 0),
				data: def,
				version,
				updated_at: new Date().toISOString()
			}));

			const CHUNK = 500;
			for (let i = 0; i < toUpsert.length; i += CHUNK) {
				await supabaseAdmin.from('manifest_definitions').upsert(toUpsert.slice(i, i + CHUNK));
			}
			results.push({ table: tableName, count: toUpsert.length });
		}
	}

	// mode='large' is excluded here to avoid Vercel timeouts (30s).
	// Large tables should be lazy-populated or synced char-by-char.

	return json({ success: true, version, synced: results });
}
