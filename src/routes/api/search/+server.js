import { BUNGIE_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';

const BUNGIE_ROOT = 'https://www.bungie.net';

export async function GET({ url, setHeaders }) {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json([]);
	// CDN can cache search suggestions for 5 min — player names are stable
	setHeaders({ 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' });

	// Strip the #code suffix if present (search by name only)
	const displayNamePrefix = q.includes('#') ? q.split('#')[0].trim() : q;
	if (!displayNamePrefix) return json([]);

	try {
		// Correct endpoint: POST /Platform/User/Search/GlobalName/{page}/
		// with JSON body { displayNamePrefix: "..." }
		const res = await fetch(`${BUNGIE_ROOT}/Platform/User/Search/GlobalName/0/`, {
			method: 'POST',
			headers: {
				'X-API-Key': BUNGIE_API_KEY,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ displayNamePrefix })
		});

		const data = await res.json();
		if (data.ErrorCode !== 1) return json([]);

		const results = (data.Response?.searchResults ?? [])
			.filter((r) => r.destinyMemberships?.length)
			.slice(0, 8)
			.map((r) => {
				const memberships = r.destinyMemberships ?? [];
				// Prefer cross-save primary, then PC (3), then first
				const primary =
					memberships.find((m) => m.crossSaveOverride === m.membershipType) ??
					memberships.find((m) => m.membershipType === 3) ??
					memberships[0];

				return {
					name: r.bungieGlobalDisplayName,
					code: String(r.bungieGlobalDisplayNameCode ?? '').padStart(4, '0'),
					membershipType: primary?.membershipType,
					iconPath: primary?.iconPath ?? null
				};
			});

		return json(results);
	} catch {
		return json([]);
	}
}
