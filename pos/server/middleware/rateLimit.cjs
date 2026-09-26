const rateLimit = require('express-rate-limit');
const { ipKeyGenerator, MemoryStore } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger.cjs');

// Rate-limit key: the authenticated user, not the IP. Every request reaches the
// app through the same upstream proxy, so all staff share one IP and IP-keyed
// limits pooled the whole cafe into a single bucket (one person's failed logins
// or token refreshes locked everyone out). Tokens are verified so a forged token
// cannot pick another user's bucket; anonymous requests fall back to the IP.
const userOrIpKey = (req) => {
    const authHeader = req.headers['authorization'];
    const accessToken = req.cookies?.token || (authHeader && authHeader.split(' ')[1]);
    if (accessToken) {
        try { return `user:${jwt.verify(accessToken, process.env.JWT_SECRET).id}`; } catch { /* expired or invalid */ }
    }
    // /api/auth/refresh arrives with an expired access token but a valid refresh token
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
        try { return `user:${jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET).id}`; } catch { /* expired or invalid */ }
    }
    return `ip:${ipKeyGenerator(req.ip)}`;
};

// Login attempts are limited per username, so one person's typos never block
// another person's login.
const loginKey = (req) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    return username ? `login:${username}` : userOrIpKey(req);
};

// Initialize Redis client for rate limiting (if available)
let redisClient;
let redisReady = false;

if (process.env.REDIS_URL) {
    try {
        redisClient = createClient({
            url: process.env.REDIS_URL,
            // Fail fast while disconnected instead of queueing, so a Redis outage
            // can never make rate-limited requests hang (passOnStoreError lets them through).
            disableOfflineQueue: true,
            socket: {
                connectTimeout: 2000,         // Give up connecting after 2s
                reconnectStrategy: (retries) => Math.min(retries * 500, 5000)
            }
        });
        // 'ready' fires on the first connect and again after every reconnect.
        redisClient.on('ready', () => {
            redisReady = true;
            logger.info('Redis-backed rate limiting enabled (cluster-safe)');
        });
        redisClient.on('error', () => { redisReady = false; });
        redisClient.on('end', () => { redisReady = false; });
        redisClient.connect().catch((err) => {
            logger.warn('Rate limiting Redis store unavailable, falling back to memory', { error: err.message });
        });
    } catch (err) {
        logger.warn('Failed to initialize Redis rate limiting store', { error: err.message });
    }
}

// Limiters are created at module load, before the Redis client has connected, so a
// RedisStore cannot be built up front (every limiter used to silently fall back to a
// per-worker MemoryStore, making limits per worker instead of cluster-wide). This
// store uses Redis whenever it is connected and an in-memory store otherwise.
class RedisWhenReadyStore {
    constructor(prefix) {
        this.prefix = prefix;
        this.localKeys = false;
        this.memory = new MemoryStore();
        this.redis = null;
    }

    init(options) {
        this.options = options;
        this.memory.init(options);
    }

    active() {
        if (!redisClient || !redisReady) return this.memory;
        if (!this.redis) {
            this.redis = new RedisStore({
                sendCommand: (...args) => redisClient.sendCommand(args),
                prefix: this.prefix,
            });
            // The script loads start in the constructor; a failure is retried on the
            // next increment, so mark the promises handled to avoid unhandled rejections.
            this.redis.incrementScriptSha.catch(() => {});
            this.redis.getScriptSha.catch(() => {});
            this.redis.init(this.options);
        }
        return this.redis;
    }

    get(key) { return this.active().get(key); }
    increment(key) { return this.active().increment(key); }
    decrement(key) { return this.active().decrement(key); }
    resetKey(key) { return this.active().resetKey(key); }
}

// A new store instance per limiter (required by express-rate-limit v7+)
const createRedisStore = (prefix) => new RedisWhenReadyStore(prefix);

// Security: Global API Rate Limiter - applies to all API routes
// ARCH-L3: Reduced from 600 to 120 req/min to limit brute-force amplification surface
const globalApiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 requests per minute per user
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Too many requests, please try again later' },
    store: createRedisStore('rl:global:'),
    passOnStoreError: true,
    skip: (req) => {
        // Skip non-API paths and the print-job queue routes.
        // Use '/api/print/' (with trailing slash) to avoid accidentally
        // matching '/api/printers' (printer management), which must be rate-limited.
        return !req.path.startsWith('/api') || req.path.startsWith('/api/print/');
    }
});

// Security: Stricter Rate Limiting for Auth (brute force protection)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: loginKey,
    message: { error: 'Too many login attempts, please try again after an hour' },
    skipSuccessfulRequests: true,
    store: createRedisStore('rl:auth:'),
    passOnStoreError: true,
});

// Rate limiting for transaction-heavy routes
const transactionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Transaction rate limit exceeded, please slow down' },
    store: createRedisStore('rl:txn:'),
    passOnStoreError: true,
});

// Rate limiting for bulk import operations (staff, consumer)
const bulkImportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Too many bulk import requests, please try again later' },
    store: createRedisStore('rl:bulk:'),
    passOnStoreError: true,
});

// Rate limiting for financial operations (balance settlements, allowance resets)
const financialLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Financial operation rate limit exceeded, please slow down' },
    store: createRedisStore('rl:financial:'),
    passOnStoreError: true,
});

// Rate limiting for configuration mutations (printer, template, branch settings)
const configLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Configuration operation rate limit exceeded, please slow down' },
    store: createRedisStore('rl:config:'),
    passOnStoreError: true,
});

// SEC-L4: Rate limiting for print-bridge routes (high-frequency polling but still bounded)
// Applied per-route in index.cjs on /api/print to replace the global limiter skip
const printLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 req/min — covers polling intervals without allowing abuse
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Print route rate limit exceeded, please slow down' },
    store: createRedisStore('rl:print:'),
    passOnStoreError: true,
});

// Rate limiting for student pre-orders (5 per minute per IP)
const studentOrderLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Too many order attempts, please slow down' },
    store: createRedisStore('rl:student-order:'),
    passOnStoreError: true,
});

// Issue 8: Rate limiting for token refresh (prevent token rotation flooding)
// 30 per user: each staff member is typically logged in on several devices,
// and every device refreshes its 15-minute access token.
const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Too many requests, please try again later.' },
    store: createRedisStore('rl:refresh:'),
    passOnStoreError: true,
});

// Issue 8: Rate limiting for logout (prevent session invalidation flooding)
const logoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Too many requests, please try again later.' },
    store: createRedisStore('rl:logout:'),
    passOnStoreError: true,
});

// Issue 9: Rate limiting for public read endpoints (branches)
const publicMenuLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Too many requests, please try again later.' },
    store: createRedisStore('rl:public-menu:'),
    passOnStoreError: true,
});

// SEC-M23: Tight rate limiter for destructive bulk admin operations (e.g. reset-allowances).
// 3 requests per 15 minutes prevents repeated financial state churn even from authenticated admins.
const bulkAdminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    keyGenerator: userOrIpKey,
    message: { error: 'Too many bulk admin operations. Please wait before trying again.' },
    store: createRedisStore('rl:bulk-admin:'),
    passOnStoreError: true,
});

module.exports = {
    globalApiLimiter,
    authLimiter,
    transactionLimiter,
    bulkImportLimiter,
    financialLimiter,
    studentOrderLimiter,
    configLimiter,
    printLimiter,
    refreshLimiter,
    logoutLimiter,
    publicMenuLimiter,
    bulkAdminLimiter
};
