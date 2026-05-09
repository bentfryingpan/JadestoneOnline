/**
 * In-process TTL cache for server-side Bungie API responses.
 *
 * Lives in module scope → shared across requests on the SAME serverless
 * instance. Each Vercel function instance gets its own cache, but that's
 * still a massive win: the same popular player viewed twice within the TTL
 * window hits zero upstream APIs on the second request.
 *
 * TTL guidance:
 *   AUTH_TTL        60s  — tokens are valid for much longer; just re-validate occasionally
 *   PROFILE_TTL     60s  — character light/stats change each play session
 *   SEARCH_TTL     300s  — player name → membershipId mapping is stable
 *   MANIFEST_TTL  3600s  — definitions change only on patch days
 */

export const AUTH_TTL     =   60_000;
export const PROFILE_TTL  =   60_000;
export const SEARCH_TTL   =  300_000;
export const MANIFEST_TTL = 3_600_000;

const store = new Map(); // key → { value, expiresAt }

export function cacheGet(key) {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
    }
    return entry.value;
}

export function cacheSet(key, value, ttlMs) {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Read from cache; if missing, call fetcher(), cache the result, return it.
 * If fetcher throws, the error propagates — nothing gets cached.
 */
export async function cacheWrap(key, ttlMs, fetcher) {
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    const fresh = await fetcher();
    cacheSet(key, fresh, ttlMs);
    return fresh;
}

// Sweep stale entries every 2 minutes so the Map doesn't grow unboundedly
// on a long-lived instance.
setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of store) {
        if (now > entry.expiresAt) store.delete(k);
    }
}, 120_000);
