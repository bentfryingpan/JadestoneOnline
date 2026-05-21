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
			return section.linesContent.map((line) => cleanIconChars(line.text)).filter(Boolean);
		})
		.join(' ')
		.trim();
}

/**
 * Returns structured sections for rich tooltip rendering.
 * Each section is an array of { text, classNames[] } parts.
 * Spacer rows become null entries so the UI can render a divider.
 *
 * @returns {{ parts: {text:string, classNames:string[]}[] }[] | null}
 */
/**
 * Strip Destiny icon characters (Unicode Private Use Area U+E000–U+F8FF)
 * that only render correctly with the Destiny icon font.
 * Also collapses any double-spaces left behind.
 */
function cleanIconChars(text) {
	return (text ?? '').replace(/[-]/g, '').replace(/\s{2,}/g, ' ').trim();
}

export function parseClarityDescription(entry) {
	if (!entry?.descriptions?.en) return null;
	const sections = [];
	for (const section of entry.descriptions.en) {
		if (!section.linesContent) {
			// spacer — emit a visual separator only if we already have content
			if (sections.length > 0) sections.push(null);
			continue;
		}
		const parts = section.linesContent
			.map((line) => ({ text: cleanIconChars(line.text), classNames: line.classNames ?? [] }))
			.filter((p) => p.text);
		if (parts.length > 0) sections.push({ parts });
	}
	// Trim trailing spacers
	while (sections.length > 0 && sections[sections.length - 1] === null) sections.pop();
	return sections.length > 0 ? sections : null;
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

/**
 * Convenience: look up a hash and return structured sections, or null.
 */
export function getClaritySections(map, hash) {
	if (!hash || !map) return null;
	const entry = map[String(hash)];
	return parseClarityDescription(entry);
}
