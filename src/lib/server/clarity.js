/**
 * D2 Clarity — server-side description cache
 * https://github.com/Database-Clarity/Live-Clarity-Database
 *
 * Fetches clarity.json once per version bump (versions.json is only 27 bytes).
 * Falls back to the stale cache on network failure so the site never breaks.
 */

const VERSIONS_URL =
	'https://raw.githubusercontent.com/Database-Clarity/Live-Clarity-Database/live/versions.json';
const DATA_URL =
	'https://raw.githubusercontent.com/Database-Clarity/Live-Clarity-Database/live/descriptions/clarity.json';

/** @type {Record<string, any> | null} */
let _cache = null;
let _cachedVersion = null;
let _fetchPromise = null; // deduplicate concurrent cold-start fetches

/**
 * Returns the full clarity map (keyed by hash string).
 * Refreshes only when the upstream version number changes.
 */
export async function getClarityMap() {
	try {
		const vRes = await fetch(VERSIONS_URL, { signal: AbortSignal.timeout(4000) });
		const { descriptions: version } = await vRes.json();

		if (_cache && _cachedVersion === version) return _cache;

		// Deduplicate if two requests race on a cold start
		if (!_fetchPromise) {
			_fetchPromise = fetch(DATA_URL, { signal: AbortSignal.timeout(15000) })
				.then((r) => r.json())
				.then((data) => {
					_cache = data;
					_cachedVersion = version;
					return data;
				})
				.finally(() => {
					_fetchPromise = null;
				});
		}

		return await _fetchPromise;
	} catch (e) {
		console.warn('[clarity] fetch failed, using stale cache:', e?.message ?? e);
		return _cache ?? {};
	}
}

/**
 * Extracts a plain-text description string from a Clarity entry.
 * Skips spacer rows, strips classNames-only spans, joins lines with spaces.
 */
export function flattenClarity(entry) {
	if (!entry?.descriptions?.en) return '';
	return entry.descriptions.en
		.flatMap((section) => {
			if (!section.linesContent) return []; // spacer
			return section.linesContent.map((line) => line.text ?? '').filter(Boolean);
		})
		.join(' ')
		.trim();
}

/**
 * Convenience: look up a hash in the map and return its plain-text description,
 * or '' if not found.
 */
export function getClarityDescription(map, hash) {
	if (!hash || !map) return '';
	const entry = map[String(hash)];
	return flattenClarity(entry);
}
