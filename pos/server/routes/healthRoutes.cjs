// Health Check endpoint (extracted from index.cjs — audit item #13)
// SEC-M7: Gate detailed diagnostics to internal IPs only; external callers get a minimal response.
const express = require('express');
const { pool } = require('../config/db.cjs');
const { isRedisAvailable, getClient: getRedisClient } = require('../redis.cjs');
const logger = require('../utils/logger.cjs');

const router = express.Router();

router.get('/health', async (req, res) => {
    const clientIp = req.realIp || req.ip || '';
    const isInternal = clientIp === '127.0.0.1' || clientIp === '::1'
        || clientIp.startsWith('10.') || clientIp.startsWith('192.168.')
        || clientIp.startsWith('172.') || clientIp.startsWith('::ffff:127.');

    if (!isInternal) {
        return res.json({ status: 'ok' });
    }

    const healthCheck = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: require('../../package.json').version,
        checks: {
            server: 'ok',
            database: 'unknown',
            redis: 'unknown',
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                unit: 'MB'
            }
        }
    };

    // Check database connection and pool capacity (M-11: SELECT 1 alone won't detect exhaustion)
    const poolMax = pool.options?.max ?? pool.totalCount;
    const poolStats = {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: poolMax,
    };
    healthCheck.checks.pool = poolStats;

    if (pool.waitingCount > 0 || (pool.totalCount >= poolMax && pool.idleCount === 0)) {
        healthCheck.checks.database = 'pool_exhausted';
        healthCheck.status = 'degraded';
    } else {
        try {
            await pool.query('SELECT 1');
            healthCheck.checks.database = 'ok';
        } catch (err) {
            healthCheck.checks.database = 'error';
            healthCheck.status = 'degraded';
            logger.error('Health check: Database connection failed', err);
        }
    }

    // Check Redis connection (if enabled)
    try {
        if (isRedisAvailable()) {
            const client = getRedisClient();
            if (client) await client.ping();
            healthCheck.checks.redis = 'ok';
        } else {
            healthCheck.checks.redis = 'disabled';
        }
    } catch (err) {
        healthCheck.checks.redis = 'error';
        healthCheck.status = 'degraded';
        logger.warn('Health check: Redis connection failed', err);
    }

    // Set appropriate HTTP status code
    const statusCode = healthCheck.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthCheck);
});

module.exports = router;
