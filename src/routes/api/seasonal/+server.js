import { json } from '@sveltejs/kit';
import { computeSeasonal } from '$lib/server/seasonal.js';

export async function GET({ url, setHeaders }) {
    // Vercel CDN: 5-min fresh, 10-min stale-while-revalidate
    setHeaders({ 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' });

    const membershipType = url.searchParams.get('membershipType');
    const membershipId   = url.searchParams.get('membershipId');
    const charIdsParam   = url.searchParams.get('charIds') ?? url.searchParams.get('charId') ?? '';
    const maxPages       = parseInt(url.searchParams.get('maxPages') ?? '25', 10);

    if (!membershipType || !membershipId || !charIdsParam) {
        return json({ error: 'Missing params' }, { status: 400 });
    }

    const charIds = charIdsParam.split(',').map(s => s.trim()).filter(Boolean);
    const result  = await computeSeasonal(membershipType, membershipId, charIds, maxPages);
    return json(result);
}
