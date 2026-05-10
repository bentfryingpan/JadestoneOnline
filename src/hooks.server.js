/**
 * SvelteKit server hooks.
 *
 * The `handle` hook runs on every request.  We also use module-level code to
 * kick off a background manifest warm-up the moment the first serverless
 * instance starts — this way the manifest tables are ready (or being fetched)
 * before any real user request needs them.
 */

import { warmManifest } from '$lib/server/manifest.js';

// Fire-and-forget: warm all manifest tables on cold start.
// Never throws, so a Bungie outage doesn't break the server.
warmManifest().catch(err =>
    console.error('[hooks] manifest warm-up failed:', err?.message ?? err)
);

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
    return resolve(event);
}
