/**
 * Redis Cache Service (Upstash)
 * 
 * Provides ultra-fast, persistent caching for manifest definitions, 
 * player stats, and background task orchestration.
 */

import { Redis } from '@upstash/redis';
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from '$env/static/private';
import { cacheGet as memGet, cacheSet as memSet } from './cache.js';

let redis = null;

if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
    });
}

/** Get from Redis with local Memory fallback. */
export async function redisGet(key) {
    // 1. Check local memory (L1)
    const mem = memGet(key);
    if (mem !== undefined) return mem;

    // 2. Check Redis (L2)
    if (redis) {
        try {
            const data = await redis.get(key);
            if (data) {
                memSet(key, data, 600_000); // Cache in RAM for 10m
                return data;
            }
        } catch (e) {
            console.error('[redis] GET failed:', e.message);
        }
    }
    return undefined;
}

/** Set to Redis and local Memory. */
export async function redisSet(key, value, ttlMs = 86_400_000) {
    memSet(key, value, ttlMs);
    if (redis) {
        try {
            // Redis expects TTL in seconds
            await redis.set(key, value, { px: ttlMs });
        } catch (e) {
            console.error('[redis] SET failed:', e.message);
        }
    }
}

/** Simple distributed lock using Redis. */
export async function redisLock(key, ttlSec = 60) {
    if (!redis) return true; // Assume success if no Redis
    try {
        const set = await redis.set(`lock:${key}`, '1', { nx: true, ex: ttlSec });
        return set === 'OK';
    } catch {
        return true;
    }
}

export async function redisUnlock(key) {
    if (redis) await redis.del(`lock:${key}`);
}

export default redis;
