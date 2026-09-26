const { pool } = require('../../config/db.cjs');
const { cacheGet, cacheSet, cacheSetNX, isRedisAvailable } = require('../../redis.cjs');
const logger = require('../../utils/logger.cjs');

// IDEMPOTENCY: TTLs for idempotency keys
const IDEMPOTENCY_TTL = 86400;      // completed responses kept 24 hours
const IDEM_INFLIGHT_TTL = 90;       // reservation marker safety net (seconds)
const IDEM_POLL_INTERVAL_MS = 200;  // wait granularity for an in-flight twin
const IDEM_POLL_TIMEOUT_MS = 5000;  // max wait for a concurrent request to finish
const LOG_THROTTLE_MS = 60000;

let lastFailOpenLogAt = 0;
const logFailOpenThrottled = (message) => {
    const now = Date.now();
    if (now - lastFailOpenLogAt < LOG_THROTTLE_MS) return;
    lastFailOpenLogAt = now;
    logger.error(message);
};

const isInFlightMarker = (value) => value && typeof value === 'object' && value.__inFlight === true;

/**
 * Checks for a cached idempotent response, using an ATOMIC Redis reservation
 * (SET NX EX) to close the GET-then-SET race:
 *   - Completed response exists          → returned and replayed by the caller.
 *   - No key                             → reserves it via SET NX and returns
 *     null so exactly ONE concurrent request proceeds; the winner's later
 *     setIdempotentResponse call overwrites the marker with the real body.
 *   - Key holds an in-flight marker from a concurrent duplicate → polls briefly
 *     for completion; if it completes the real response is returned, otherwise
 *     returns a conflict payload ({ error, __idempotencyConflict: true }) which
 *     callers replay as-is — the client sees a retryable error, never a
 *     duplicate financial side-effect.
 *   - Stale marker (older than IDEM_INFLIGHT_TTL, e.g. crashed attempt) →
 *     taken over by refreshing the marker; null is returned (request proceeds).
 *
 * @param {string} key - The Idempotency-Key header value from the client.
 * @returns {Promise<object|null>} Cached response body / conflict payload, or null.
 */
const getIdempotentResponse = async (key) => {
    if (!key || !isRedisAvailable()) return null;

    const redisKey = `idempotency:${key}`;

    try {
        const reserved = await cacheSetNX(redisKey, { __inFlight: true, at: Date.now() }, IDEM_INFLIGHT_TTL);
        if (reserved) return null; // we own the key until setIdempotentResponse completes it

        const existing = await cacheGet(redisKey);
        if (existing && !isInFlightMarker(existing)) return existing;

        if (isInFlightMarker(existing)) {
            const ageMs = Date.now() - (existing.at || 0);
            if (ageMs < IDEM_INFLIGHT_TTL * 1000) {
                // A twin request is executing right now — wait briefly for its response.
                const deadline = Date.now() + IDEM_POLL_TIMEOUT_MS;
                while (Date.now() < deadline) {
                    await new Promise(resolve => setTimeout(resolve, IDEM_POLL_INTERVAL_MS));
                    const retry = await cacheGet(redisKey);
                    if (retry && !isInFlightMarker(retry)) return retry;
                }
                // Still in flight past the wait window — surface a conflict.
                logger.warn('Idempotency: duplicate request arrived while original still in progress', { key });
                return { error: 'Request already in progress', __idempotencyConflict: true };
            }
            // Stale marker from a dead attempt — take over the reservation.
            logger.warn('Idempotency: taking over stale in-flight marker', { key, ageMs });
            await cacheSet(redisKey, { __inFlight: true, at: Date.now() }, IDEM_INFLIGHT_TTL);
            return null;
        }

        // Key vanished between NX and GET (expired/released) — proceed without protection.
        logFailOpenThrottled(`Idempotency: key ${redisKey} evicted mid-check — proceeding unprotected`);
        return null;
    } catch (err) {
        logFailOpenThrottled(`Idempotency cache read failed — fail-open: ${err.message}`);
        return null;
    }
};

/**
 * Stores a response body under the idempotency key with a 24h TTL.
 * Overwrites this request's in-flight reservation marker, completing the key.
 * Silently skips if Redis is unavailable (graceful degradation).
 * @param {string} key - The Idempotency-Key header value.
 * @param {object} body - The response body to cache.
 */
const setIdempotentResponse = async (key, body) => {
    if (!key || !isRedisAvailable()) return;
    try {
        await cacheSet(`idempotency:${key}`, body, IDEMPOTENCY_TTL);
    } catch (err) {
        logFailOpenThrottled(`Idempotency cache write failed — fail-open: ${err.message}`);
    }
};
// ARCH-H3: Use Redis-backed cache with 5-minute TTL for the Main Branch ID.
// The previous module-level variable had no TTL, meaning a restart was required
// to pick up any change to which branch is "Main Branch".
const MAIN_BRANCH_KEY = 'system:main_branch_id';
const getMainBranchId = async () => {
    try {
        const cached = await cacheGet(MAIN_BRANCH_KEY);
        if (cached) return cached;
    } catch {}
    const res = await pool.query("SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1");
    const id = res.rows[0]?.id || null;
    if (id) {
        try { await cacheSet(MAIN_BRANCH_KEY, id, 300); } catch {}
    }
    return id;
};
module.exports = { getIdempotentResponse, setIdempotentResponse, getMainBranchId };
