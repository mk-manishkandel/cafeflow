const { Pool } = require('pg');
const { getSafeTimezone } = require('../utils/timezone.cjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// SECURITY FIX: Use logger instead of console for proper log management
// Logger is loaded after env validation, so we use a lazy load pattern
let logger;
const getLogger = () => {
    if (!logger) {
        logger = require('../utils/logger.cjs');
    }
    return logger;
};

if (!process.env.DB_PASSWORD) {
    // Use console.error only for fatal startup errors (before logger is available)
    console.error('FATAL: DB_PASSWORD environment variable is required');
    process.exit(1);
}

// Calculate optimal pool size based on cluster instances
// For PM2 cluster mode: divide total connections across instances
const totalConnections = parseInt(process.env.DB_POOL_MAX) || 100;
const instanceCount = parseInt(process.env.NODE_APP_INSTANCE_COUNT) ||
                     require('os').cpus().length;
const poolSize = Math.max(5, Math.floor(totalConnections / instanceCount));

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    // Dynamic Connection Pool for Clustering
    // In cluster mode: 100 total connections / 8 instances = ~12 per instance
    // In single mode: 100 / 1 = 100 connections
    max: poolSize,
    min: 2, // Keep 2 warm connections per instance to avoid cold-start latency after idle
    idleTimeoutMillis: 30000, // Close idle clients after 30s
    connectionTimeoutMillis: 5000, // Return an error after 5s (raised from 2s to reduce failures under traffic spikes)
    // DB-M5: guard against runaway queries and abandoned transactions
    statement_timeout: 30000,                    // Kill queries that run > 30s
    idle_in_transaction_session_timeout: 10000,  // Kill sessions idle in transaction > 10s
});

// Log pool configuration on startup
pool.on('connect', () => {
    // Only log once (on first connection)
    if (!pool._hasLoggedConfig) {
        getLogger().info('Database pool initialized', {
            poolSize,
            instanceCount,
            totalConnections,
            instance: process.env.NODE_APP_INSTANCE || 'single'
        });
        pool._hasLoggedConfig = true;
    }
});

pool.on('error', (err) => {
    getLogger().error('Unexpected error on idle database client', err);
});

// Set timezone once per connection (not per query) to avoid double round-trips
pool.on('connect', (client) => {
    const tz = getSafeTimezone(process.env.TZ);
    // Defense-in-depth: confirm the validated timezone contains only safe characters
    // before interpolating into the SET statement (getSafeTimezone already validates).
    if (!/^[A-Za-z0-9/_\-+]+$/.test(tz)) {
        getLogger().error(`Timezone rejected by format check: ${tz}`);
        return;
    }
    // SECURITY: getSafeTimezone() validates against IANA database, preventing injection
    // Note: PostgreSQL SET commands don't support parameterized identifiers
    client.query(`SET timezone = '${tz}'`).catch((err) => {
        getLogger().error('Failed to set timezone on connection:', err.message);
    });
});

// Simple query wrapper — timezone is now handled at connection time
const query = async (text, params) => {
    return pool.query(text, params);
};

// DB-M8: pool.connect() has no built-in timeout, so under high concurrency a
// saturated pool would make requests hang indefinitely. Race it against a deadline
// so callers get a clear 'DB connection timeout' error instead.
const connectWithTimeout = (p = pool, ms = 5000) =>
    Promise.race([
        p.connect(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('DB connection timeout')), ms)
        )
    ]);

module.exports = {
    pool,
    query,
    connectWithTimeout,
};
