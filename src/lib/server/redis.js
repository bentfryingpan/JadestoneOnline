/**
 * Redis Cache Service (ioredis)
 *
 * High-performance, persistent caching using standard Redis protocol.
 */

import Redis from 'ioredis';
import { env } from '$env/dynamic/private';
import { cacheGet as memGet, cacheSet as memSet } from './cache.js';

const REDIS_URL = env.REDIS_URL ?? '';

let redis = null;

if (REDIS_URL) {
	try {
		redis = new Redis(REDIS_URL, {
			maxRetriesPerRequest: 1,
			connectTimeout: 5000
		});
		redis.on('error', (err) => console.error('[redis] Connection error:', err.message));
	} catch (e) {
		console.error('[redis] Initialization failed:', e.message);
	}
}

/** Get from Redis with local Memory fallback. */
export async function redisGet(key) {
	const mem = memGet(key);
	if (mem !== undefined) return mem;

	if (redis) {
		try {
			const data = await redis.get(key);
			if (data) {
				const parsed = JSON.parse(data);
				memSet(key, parsed, 600_000); // 10m L1 cache
				return parsed;
			}
		} catch (e) {
			console.warn('[redis] GET failed:', e.message);
		}
	}
	return undefined;
}

/** Set to Redis and local Memory. */
export async function redisSet(key, value, ttlMs = 86_400_000) {
	memSet(key, value, ttlMs);
	if (redis) {
		try {
			const str = JSON.stringify(value);
			await redis.set(key, str, 'PX', ttlMs);
		} catch (e) {
			console.warn('[redis] SET failed:', e.message);
		}
	}
}

/** Distributed Lock. */
export async function redisLock(key, ttlSec = 60) {
	if (!redis) return true;
	try {
		const result = await redis.set(`lock:${key}`, '1', 'EX', ttlSec, 'NX');
		return result === 'OK';
	} catch {
		return true;
	}
}

export async function redisUnlock(key) {
	if (redis) await redis.del(`lock:${key}`);
}

export default redis;
