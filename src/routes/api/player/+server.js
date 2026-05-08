import { BUNGIE_API_KEY } from '$env/static/private';

export async function GET({ url }) {
    console.log('API KEY:', BUNGIE_API_KEY);
    const name = url.searchParams.get('name');

    const res = await fetch(
        `https://www.bungie.net/Platform/Destiny2/SearchDestinyPlayer/-1/${encodeURIComponent(name)}/`,
        { headers: { 'X-API-Key': BUNGIE_API_KEY } }
    );

    const data = await res.json();
    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
    });
}