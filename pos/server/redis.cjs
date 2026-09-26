const { createClient } = require('redis');
const logger = require('./utils/logger.cjs');

// ARCH-C3: Single shared Redis client (singleton).
// initRedis() guards against multiple createClient() calls with the early-return check.
// There is intentionally only ONE client here (no separate pub/sub client) because this
// application uses Socket.IO with the default in-memory adapter; no Redis pub/sub adapter
// is in use. If a Redis pub/sub adapter is added in future, document the second client here.
let redisClient = null;
let isConnected = false;

const CACHE_TTL = {
    MENU: 300,        // 5 minutes
    STAFF: 120,       // 2 minutes
    CATEGORIES: 600,  // 10 minutes
    BRANCHES: 600,    // 10 minutes
    DEFAULT: 60       // 1 minute
};

const initRedis = async () => {
    if (redisClient) return redisClient;

    try {
        if (!process.env.REDIS_URL) {
            throw new Error('REDIS_URL environment variable is required');
        }

        redisClient = createClient({
            url: process.env.REDIS_URL
        });

        redisClient.on('error', (err) => {
            isConnected = false;
            // SEC-L6: Sanitize Redis URL from error messages before logging to prevent
            // credentials embedded in redis://user:pass@host from leaking into logs.
            const safeMsg = (err.message || '').replace(/redis:\/\/[^@\s]*@/g, 'redis://**:**@');
            logger.error('Redis client error', { message: safeMsg, code: err.code });
        });

        redisClient.on('connect', () => {
            isConnected = true;
        });

        redisClient.on('disconnect', () => {
            isConnected = false;
        });

        await redisClient.connect();
        return redisClient;
    } catch (error) {
        redisClient = null;
        return null;
    }
};

// Get from cache
const cacheGet = async (key) => {
    if (!isConnected || !redisClient) return null;

    try {
        const data = await redisClient.get(key);
        if (data) {
            return JSON.parse(data);
        }
        return null;
    } catch (error) {
        return null;
    }
};

// Set to cache
const cacheSet = async (key, data, ttl = CACHE_TTL.DEFAULT) => {
    if (!isConnected || !redisClient) return false;

    try {
        await redisClient.setEx(key, ttl, JSON.stringify(data));
        return true;
    } catch (error) {
        return false;
    }
};

// Set to cache ONLY if it does not exist (SETNX)
const cacheSetNX = async (key, data, ttl = CACHE_TTL.DEFAULT) => {
    if (!isConnected || !redisClient) return false;

    try {
        const result = await redisClient.set(key, JSON.stringify(data), {
            NX: true,
            EX: ttl
        });
        return result === 'OK';
    } catch (error) {
        return false;
    }
};

// Delete from cache (invalidation)
const cacheDel = async (key) => {
    if (!isConnected || !redisClient) return false;

    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        return false;
    }
};

// Invalidate by pattern (e.g., 'menu:*') using SCAN + batched UNLINK (non-blocking, production-safe)
// ARCH-H4: Collect all matching keys first, then delete in one pipeline using UNLINK (async, non-blocking).
// This avoids N+1 round-trips and uses UNLINK instead of DEL so Redis reclaims memory in the background.
const cacheInvalidatePattern = async (pattern) => {
    if (!isConnected || !redisClient) return false;

    try {
        const keys = [];
        for await (const key of redisClient.scanIterator({
            MATCH: pattern,
            COUNT: 100
        })) {
            keys.push(key);
        }

        if (keys.length === 0) return true;

        // Batch deletes: prefer pipeline for a single round-trip; fall back to Promise.all
        if (typeof redisClient.pipeline === 'function') {
            const pipeline = redisClient.pipeline();
            keys.forEach(key => pipeline.unlink(key));
            await pipeline.exec();
        } else {
            await Promise.all(keys.map(k => redisClient.unlink(k)));
        }

        return true;
    } catch (error) {
        return false;
    }
};

/**
 * Atomically increment a counter key. Sets a TTL (in seconds) on first creation.
 * Returns the new counter value, or null if Redis is unavailable.
 *
 * FIX: the previous INCR + (value === 1) EXPIRE pair was not atomic — a crash
 * or race between the two calls could leave an unbounded key forever counting.
 * Now implemented as a single Lua script: INCR then EXPIRE only when the TTL
 * is missing, guaranteeing the window never slides and the key always expires.
 *
 * @param {string} key - Redis key
 * @param {number} [ttlSeconds=3600] - TTL applied only when the key is new (EXPIRE after INCR)
 * @returns {Promise<number|null>}
 */
const CACHE_INCR_LUA = `
local value = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return value
`;

const cacheIncr = async (key, ttlSeconds = 3600) => {
    if (!isConnected || !redisClient) return null;
    try {
        const value = await redisClient.eval(CACHE_INCR_LUA, {
            keys: [key],
            arguments: [String(ttlSeconds)]
        });
        return Number(value);
    } catch (error) {
        return null;
    }
};

// Check if Redis is available
const isRedisAvailable = () => isConnected && redisClient !== null;

// Close Redis connection
const closeRedis = async () => {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        isConnected = false;
    }
};

// Get the Redis client instance (for health checks)
const getClient = () => redisClient;

module.exports = {
    initRedis,
    cacheGet,
    cacheSet,
    cacheSetNX,
    cacheDel,
    cacheIncr,
    cacheInvalidatePattern,
    isRedisAvailable,
    getClient,
    closeRedis,
    CACHE_TTL
};
