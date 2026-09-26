'use strict';

/**
 * Idempotency middleware for financial endpoints.
 *
 * Requires the `Idempotency-Key` header (or the legacy `X-Idempotency-Key`).
 * Uses an ATOMIC Redis reservation (SET NX EX) BEFORE the handler runs, which
 * closes the GET-then-SET race of the previous implementation:
 *
 *   - Reservation succeeds  → request proceeds; when the handler sends a JSON
 *     response it is stored under the same key (24h TTL) for replay.
 *   - Key already holds a completed response → replayed immediately.
 *   - Key is reserved but no response stored yet (concurrent duplicate) → 409
 *     "Request already in progress".
 *   - Handler fails (non-2xx / error response) → reservation is released so
 *     legitimate retries are not blocked.
 *
 * Fail-open: if Redis is unavailable requests pass through rather than blocking
 * traffic. This is logged loudly but throttled to once per minute to avoid log
 * storms during outages.
 *
 * Usage:
 *   router.post('/reset-allowances', idempotency, ...handlers);
 */

const { cacheGet, cacheSet, cacheSetNX, cacheDel, isRedisAvailable } = require('../redis.cjs');
const logger = require('../utils/logger.cjs');

const IDEMPOTENCY_TTL = 86400; // 24 hours — completed responses
const RESERVATION_TTL = 300;   // 5 minutes — in-flight marker safety net
const KEY_PREFIX = 'idempotency:financial:';
const IN_FLIGHT_MARKER = { __inFlight: true };
const LOG_THROTTLE_MS = 60000;

let lastFailOpenLogAt = 0;
const logFailOpenThrottled = (message) => {
    const now = Date.now();
    if (now - lastFailOpenLogAt < LOG_THROTTLE_MS) return;
    lastFailOpenLogAt = now;
    logger.error(message);
};

const readKeyHeader = (req) => {
    const raw = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim().slice(0, 255) : null;
};

const idempotency = async (req, res, next) => {
    const key = readKeyHeader(req);

    if (!key) {
        return res.status(400).json({
            error: 'Idempotency-Key header is required for this endpoint'
        });
    }

    const redisKey = `${KEY_PREFIX}${key}`;

    // Intercept res.json once to capture the response and manage the reservation.
    const originalJson = res.json.bind(res);
    let settled = false;         // true once a completed response was persisted
    let ownsReservation = false; // true only when THIS request holds the Redis reservation

    res.json = function (data) {
        // Restore immediately so subsequent calls in error paths work.
        res.json = originalJson;

        const status = res.statusCode || 200;
        if (status >= 200 && status < 300 && isRedisAvailable()) {
            // Optimistically mark as persisted BEFORE 'finish' can fire (the
            // cacheSet promise may not resolve until after the response flushes;
            // a synchronous flag prevents the finish handler from racing a DEL
            // against this SET on the same Redis connection).
            settled = true;
            cacheSet(redisKey, { status, body: data }, IDEMPOTENCY_TTL)
                .then((ok) => {
                    if (!ok) {
                        settled = false;
                        logFailOpenThrottled('Idempotency: failed to persist response — fail-open');
                    }
                })
                .catch(err => {
                    settled = false;
                    logFailOpenThrottled(`Idempotency cache write failed: ${err.message}`);
                });
        }
        return originalJson(data);
    };

    // Release the reservation when the response was never successfully cached
    // (handler error, non-2xx business error, or client disconnect mid-flight).
    // Only the request that owns the reservation may delete the key — replay
    // and 409 paths must never evict another request's entry.
    res.on('finish', () => {
        if (ownsReservation && !settled && isRedisAvailable()) {
            cacheDel(redisKey).catch(() => {});
        }
    });

    // Fail open when Redis is unavailable — never block legitimate traffic.
    if (!isRedisAvailable()) {
        logFailOpenThrottled('Idempotency: Redis unavailable — proceeding WITHOUT duplicate protection (fail-open)');
        return next();
    }

    try {
        // Atomic reserve: only ONE concurrent request can win the key.
        const reserved = await cacheSetNX(redisKey, IN_FLIGHT_MARKER, RESERVATION_TTL);

        if (!reserved) {
            // Distinguish "key exists" from "Redis died mid-call": cacheSetNX
            // returns false for both. If Redis is now unavailable, fail open —
            // a Redis flap must never produce spurious 409s on money endpoints.
            if (!isRedisAvailable()) {
                logFailOpenThrottled('Idempotency: Redis unavailable during reserve — proceeding WITHOUT duplicate protection (fail-open)');
                return next();
            }
            // Key exists: replay a completed response or reject an in-flight duplicate.
            const cached = await cacheGet(redisKey);
            res.json = originalJson;
            if (cached && !cached.__inFlight) {
                logger.info('Idempotency key replay', { key, status: cached.status });
                return res.status(cached.status || 200).json(cached.body);
            }
            logger.warn('Idempotency: duplicate request rejected while in progress', { key });
            return res.status(409).json({ error: 'Request already in progress' });
        }

        ownsReservation = true;
    } catch (err) {
        logFailOpenThrottled(`Idempotency reserve failed — proceeding without protection (fail-open): ${err.message}`);
    }

    next();
};

module.exports = { idempotency };
