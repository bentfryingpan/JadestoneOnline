/**
 * /api/map-icons — Returns background art for every Gambit map.
 *
 * Scans DestinyActivityDefinition for activities with activityTypeHash matching
 * Gambit (mode 63) and returns a map of clean map name → pgcrImage URL.
 *
 * Response shape:
 *   { maps: [{ name, pgcrImage, icon, hash }], byName: { mapName: pgcrImage } }
 *
 * Cached 24 hours (map pool only changes with major updates).
 */

import { json } from '@sveltejs/kit';
import { getRawTable } from '$lib/server/manifest.js';

const BUNGIE_ROOT = 'https://www.bungie.net';
// Bungie activity mode hash for Gambit (modeType 63)
const GAMBIT_MODE = 63;

export async function GET({ setHeaders }) {
	setHeaders({
		'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600'
	});

	try {
		const table = await getRawTable('DestinyActivityDefinition');

		// Also pull the activity mode table to filter by Gambit mode
		const modeTable = await getRawTable('DestinyActivityModeDefinition');

		// Collect hashes for activity mode definitions that include Gambit (modeType 63)
		const gambitModeHashes = new Set(
			Object.values(modeTable)
				.filter((m) => m.modeType === GAMBIT_MODE)
				.map((m) => m.hash)
		);

		// Filter activities that reference a Gambit activity mode
		const gambitActivities = Object.values(table).filter((act) => {
			// Direct modeType match
			if (act.activityModeType === GAMBIT_MODE) return true;
			// activityModeHashes array match
			if (act.activityModeHashes?.some((h) => gambitModeHashes.has(h >>> 0))) return true;
			// Some activities have directActivityModeType or directActivityModeHash
			if (act.directActivityModeType === GAMBIT_MODE) return true;
			return false;
		});

		// Build map list — deduplicate by clean name, prefer entries with pgcrImage
		const byName = {};
		for (const act of gambitActivities) {
			const rawName = act.displayProperties?.name ?? '';
			if (!rawName) continue;

			const cleanName = rawName.replace(/^Gambit[:\-]\s*/i, '').trim() || 'Gambit';

			const pgcrImage = act.pgcrImage ? BUNGIE_ROOT + act.pgcrImage : null;
			const icon = act.displayProperties?.icon ? BUNGIE_ROOT + act.displayProperties.icon : null;

			// Keep the entry with the best image (pgcrImage > icon > nothing)
			const existing = byName[cleanName];
			if (!existing || (!existing.pgcrImage && pgcrImage)) {
				byName[cleanName] = {
					name: cleanName,
					pgcrImage: pgcrImage,
					icon: icon,
					hash: act.hash
				};
			}
		}

		const maps = Object.values(byName).sort((a, b) => a.name.localeCompare(b.name));

		// Build flat name → pgcrImage lookup (fallback to icon if no pgcrImage)
		const byNameFlat = Object.fromEntries(maps.map((m) => [m.name, m.pgcrImage ?? m.icon ?? null]));

		return json({ maps, byName: byNameFlat });
	} catch (err) {
		console.error('[map-icons] Error:', err.message);
		return json({ error: 'Failed to load map icons' }, { status: 502 });
	}
}
