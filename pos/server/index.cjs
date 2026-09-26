const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { initRedis, cacheInvalidatePattern, closeRedis } = require('./redis.cjs');
const logger = require('./utils/logger.cjs');
const { pool } = require('./config/db.cjs');
const { authMiddleware } = require('./middleware/auth.cjs');
const { globalApiLimiter, transactionLimiter } = require('./middleware/rateLimit.cjs');
const { vpnSuppression } = require('./middleware/securityMiddleware.cjs');
const { branchContextMiddleware } = require('./middleware/branchContext.cjs');
const authRoutes = require('./routes/auth.cjs');
const userRoutes = require('./routes/userRoutes.cjs');
const roleRoutes = require('./routes/roleRoutes.cjs');
const branchRoutes = require('./routes/branchRoutes.cjs');
const staffRoutes = require('./routes/staffRoutes.cjs');
const consumerRoutes = require('./routes/consumerRoutes.cjs');
const auditRoutes = require('./routes/auditRoutes.cjs');
const publicRoutes = require('./routes/publicRoutes.cjs');
const dashboardRoutes = require('./routes/dashboardRoutes.cjs');
const transactionRoutes = require('./routes/transactionRoutes.cjs');
const menuRoutes = require('./routes/menuRoutes.cjs');
const printRoutes = require('./routes/printRoutes.cjs');
const printerRoutes = require('./routes/printerRoutes.cjs');
const aiRoutes = require('./routes/aiRoutes.cjs');
const categoryRoutes = require('./routes/categoryRoutes.cjs');
const studentOrderRoutes = require('./routes/studentOrderRoutes.cjs');
const uploadRoutes = require('./routes/uploadRoutes.cjs');
const documentTemplateRoutes = require('./routes/documentTemplateRoutes.cjs');
const { initSocket, getIO, emitEvent } = require('./socket.cjs');
const { validateEnvironment } = require('./utils/envValidator.cjs');
const { getSafeTimezone } = require('./utils/timezone.cjs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

// ARCH-C1: Global error handlers — must be registered before any async work
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', { reason: reason?.stack || reason, promise });
});
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception — shutting down', { error: err.stack });
    process.exit(1);
});

// CRITICAL: Validate environment variables before any other initialization
validateEnvironment();

// Initialize Redis — failure is non-fatal; the app degrades gracefully without cache.
// The error event handler in redis.cjs keeps isConnected = false on runtime errors,
// and isRedisAvailable() lets callers check liveness before using cache APIs.
initRedis().then((client) => {
    if (client) {
        logger.info('Redis connected successfully');
    } else {
        logger.warn('Redis unavailable — running without cache. Set REDIS_URL to enable caching.');
    }
}).catch(err => {
    // initRedis() swallows most errors internally and returns null; this catch is a safety net.
    logger.warn('Redis initialization failed — running without cache', { error: err.message });
});

const app = express();
const port = process.env.PORT || 5000;

if (!process.env.CORS_ORIGIN) {
    logger.warn('CORS_ORIGIN not set. Defaulting to block all origins in production.');
}

// Trust proxy for correct IP detection behind nginx/reverse proxy
app.set('trust proxy', 1);

// Standard Logger - MUST be at the very top to catch all requests
// Strip sensitive query params (tokens, keys, secrets) before writing to access log
morgan.token('safe-url', (req) => {
    const url = new URL(req.url, 'http://localhost');
    ['token', 'key', 'apikey', 'api_key', 'secret', 'password'].forEach(p => {
        if (url.searchParams.has(p)) url.searchParams.set(p, '[REDACTED]');
    });
    return url.pathname + (url.search || '');
});
app.use(morgan(':method :safe-url :status :response-time ms', { stream: { write: message => logger.info(message.trim()) } }));

// SEC-C4: Cloudflare CIDR ranges — only trust cf-connecting-ip when request originates from CF
const CLOUDFLARE_CIDRS = [
    '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '104.16.0.0/13',  '104.24.0.0/14',   '108.162.192.0/18',
    '131.0.72.0/22',  '141.101.64.0/18', '162.158.0.0/15',
    '172.64.0.0/13',  '173.245.48.0/20', '188.114.96.0/20',
    '190.93.240.0/20','197.234.240.0/22', '198.41.128.0/17'
];

/**
 * Checks whether a dotted-decimal IPv4 address falls within a CIDR range.
 * Only handles IPv4; IPv6 CF ranges are not implemented here.
 */
function ipInCidr(ip, cidr) {
    try {
        const [range, bitsStr] = cidr.split('/');
        const bits = parseInt(bitsStr, 10);
        const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
        const ipNum   = ip.split('.').reduce((acc, oct) => (acc << 8) | parseInt(oct, 10), 0) >>> 0;
        const rangeNum = range.split('.').reduce((acc, oct) => (acc << 8) | parseInt(oct, 10), 0) >>> 0;
        return (ipNum & mask) === (rangeNum & mask);
    } catch {
        return false;
    }
}

function isCloudflareIp(ip) {
    if (!ip) return false;
    // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:1.2.3.4)
    const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    return CLOUDFLARE_CIDRS.some(cidr => ipInCidr(cleanIp, cidr));
}

// IP Identification Middleware
app.use((req, res, next) => {
    const cfIp = req.headers['cf-connecting-ip'];
    const remoteAddr = req.socket?.remoteAddress || req.connection?.remoteAddress;
    if (cfIp && isCloudflareIp(remoteAddr)) {
        req.realIp = cfIp;
    } else {
        if (cfIp) {
            // CF header present but connection is not from a known CF range — ignore it
            logger.warn('cf-connecting-ip header ignored: connection not from Cloudflare IP', { remoteAddr });
        }
        req.realIp = req.ip || remoteAddr;
    }
    if (req.path.startsWith('/api/public')) {
        logger.info(`Incoming Public Request: ${req.method} ${req.path} from ${req.realIp}`);
    }
    next();
});

// --- Cron Jobs & Scheduled Tasks ---

const runDailyReset = async () => {
    const systemTz = getSafeTimezone();
    // Get current date in system timezone: YYYY-MM-DD
    const today = new Date().toLocaleDateString('en-CA', { timeZone: systemTz });

    try {
        const res = await pool.query("SELECT value FROM system_settings WHERE key = 'last_menu_reset'");
        const lastReset = res.rows[0]?.value;

        if (!lastReset) {
            // First run initialization: assume we start tracking from today
            // Do NOT reset immediately to avoid wiping data mid-day on deployment
            logger.info(`Initializing Daily Reset tracking for date: ${today}`);
            await pool.query("INSERT INTO system_settings (key, value) VALUES ('last_menu_reset', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [today]);
        } else if (lastReset !== today) {
            logger.info(`Detected date change (${lastReset} -> ${today}). Running daily reset of Today Menu and Self-Service visibility...`);
            await pool.query('UPDATE menu SET is_today_menu = false, is_self_service = false');
            await cacheInvalidatePattern('menu:*');
            // Update the tracked date
            await pool.query("UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = 'last_menu_reset'", [today]);
            logger.info('Daily Reset: All items removed from Today Menu and Self-Service visibility cleared.');
            emitEvent('data:updated', { type: 'menu' }); // Notify clients
        }
    } catch (err) {
        logger.error('Daily Reset Check Failed', err);
    }
};

// 2. Automated Housekeeping: Prune abandoned sessions and expired tokens
const runDatabaseHousekeeping = async () => {
    try {
        logger.info('Running Database Housekeeping...');

        // Prune abandoned FnB sessions (> 7 days)
        const sessionPrune = await pool.query("DELETE FROM fnb_sessions WHERE status = 'ABANDONED' AND started_at < NOW() - INTERVAL '7 days'");
        if (sessionPrune.rowCount > 0) logger.info(`Housekeeping: Pruned ${sessionPrune.rowCount} abandoned sessions.`);

        // Prune expired refresh tokens
        const tokenPrune = await pool.query("DELETE FROM refresh_tokens WHERE expires_at < NOW()");
        if (tokenPrune.rowCount > 0) logger.info(`Housekeeping: Pruned ${tokenPrune.rowCount} expired refresh tokens.`);

        logger.info('Housekeeping: Daily cleanup completed.');

        // --- Log Retention Policies ---
        logger.info('Housekeeping: Running log retention policies...');

        // 1. FnB Activity Logs — 90-day retention
        const activityPrune = await pool.query(`DELETE FROM fnb_activity_logs WHERE created_at < NOW() - INTERVAL '90 days'`);
        if (activityPrune.rowCount > 0) logger.info(`Housekeeping: Pruned ${activityPrune.rowCount} old activity logs (90d).`);

        // 2. Audit Logs — F7.2: 365-day retention via partition drop + boundary
        // DELETE (was 35 days — too short for financial audit evidence).
        // Dropping whole monthly partitions is instant (no table scan). Only the
        // boundary month (the one containing the cutoff) is row-deleted.
        const AUDIT_LOG_RETENTION_DAYS = 365; // prune_audit_logs() is defined in schema.sql
        const auditPruneResult = await pool.query(`SELECT prune_audit_logs($1)`, [AUDIT_LOG_RETENTION_DAYS]);
        const { dropped_partitions, deleted_rows } = auditPruneResult.rows[0].prune_audit_logs;
        if (dropped_partitions > 0 || deleted_rows > 0) {
            logger.info(`Housekeeping: Audit log retention (${AUDIT_LOG_RETENTION_DAYS}d): dropped ${dropped_partitions} partition(s), deleted ${deleted_rows} boundary row(s).`);
        }

        // 3. Print Jobs — aggressive cleanup for PRINTED, 90-day cap for others
        const printedPrune = await pool.query("DELETE FROM print_jobs WHERE status = 'PRINTED' AND updated_at < NOW() - INTERVAL '24 hours'");
        if (printedPrune.rowCount > 0) logger.info(`Housekeeping: Pruned ${printedPrune.rowCount} PRINTED print jobs older than 24h.`);

        const globalPrintPrune = await pool.query(`DELETE FROM print_jobs WHERE created_at < NOW() - INTERVAL '90 days'`);
        if (globalPrintPrune.rowCount > 0) logger.info(`Housekeeping: Pruned ${globalPrintPrune.rowCount} old print logs (90d).`);

        logger.info('Housekeeping: Log retention completed.');

    } catch (err) {
        logger.error('Database Housekeeping Failed', err);
    }
};

// MEDIUM: Temporary upload garbage collection — deletes files older than 24h
// under server/uploads/tmp only. uploadController.cjs stages uploads there before
// moving them to their final destination; interrupted/abandoned uploads would
// otherwise accumulate forever. Never touches any other directory.
const runTmpUploadGc = async () => {
    const tmpDir = path.join(__dirname, 'uploads', 'tmp');
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    let deleted = 0;
    try {
        const entries = await fs.promises.readdir(tmpDir);
        for (const entry of entries) {
            // Resolve inside tmpDir and refuse anything that escapes it (defensive).
            const filePath = path.join(tmpDir, entry);
            if (!filePath.startsWith(tmpDir + path.sep)) continue;
            try {
                const st = await fs.promises.stat(filePath);
                if (st.isFile() && st.mtimeMs < cutoffMs) {
                    await fs.promises.unlink(filePath);
                    deleted++;
                }
            } catch (fileErr) {
                if (fileErr.code !== 'ENOENT') {
                    logger.warn(`Tmp upload GC: could not process ${entry}`, { message: fileErr.message });
                }
            }
        }
        logger.info(`Tmp upload GC: deleted ${deleted} file(s) older than 24h from server/uploads/tmp`);
    } catch (err) {
        if (err.code !== 'ENOENT') logger.error('Tmp upload GC failed', err);
    }
};

// 2.3 Refresh Materialized Views (Can be called hourly)
const refreshMaterializedViews = async () => {
    try {
        logger.info('Refreshing Materialized Views...');

        try {
            await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_branch_daily_sales');
        } catch (mvErr) {
            logger.warn('Concurrent refresh failed for mv_branch_daily_sales, falling back to standard refresh');
            await pool.query('REFRESH MATERIALIZED VIEW mv_branch_daily_sales');
        }
        // DB-H1: Record refresh timestamp so monitoring queries can detect stale MVs
        await pool.query(
            `INSERT INTO mv_refresh_log (view_name, last_refreshed_at)
             VALUES ('mv_branch_daily_sales', NOW())
             ON CONFLICT (view_name) DO UPDATE SET last_refreshed_at = NOW()`
        );

        try {
            await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_item_sales_summary');
        } catch (mvErr) {
            logger.warn('Concurrent refresh failed for mv_item_sales_summary, falling back to standard refresh');
            await pool.query('REFRESH MATERIALIZED VIEW mv_item_sales_summary');
        }
        // DB-H1: Record refresh timestamp so monitoring queries can detect stale MVs
        await pool.query(
            `INSERT INTO mv_refresh_log (view_name, last_refreshed_at)
             VALUES ('mv_item_sales_summary', NOW())
             ON CONFLICT (view_name) DO UPDATE SET last_refreshed_at = NOW()`
        );

        logger.info('Materialized Views refreshed successfully.');
    } catch (err) {
        logger.error('Materialized View Refresh Failed', err);
    }
};

// Issue 3 (HIGH): Automated Partition Management — delegated to jobs/partitionMaintenance.cjs.
// The job creates the next 3 months of partitions for transactions and audit_logs.
// It is called immediately at startup and by the daily housekeeping cron.
const { runPartitionMaintenance } = require('./jobs/partitionMaintenance.cjs');
// H7: Sweeps print_jobs stuck in PENDING and retries or fails them explicitly.
const { runPrintJobSweeper } = require('./jobs/printJobSweeper.cjs');

// Reset Today Menu daily at midnight in the system timezone (primary instance only)
cron.schedule('0 0 * * *', async () => {
    const isPrimary = process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE;
    if (isPrimary) await runDailyReset();
}, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC'
});

// Start housekeeping daily at 03:00 in the system timezone (primary instance only).
// Without this guard every PM2 cluster worker runs the same DDL and DML concurrently.
cron.schedule('0 3 * * *', async () => {
    const isPrimary = process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE;
    if (!isPrimary) return;
    await runDatabaseHousekeeping();
    await runPartitionMaintenance();
    await runTmpUploadGc();
}, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC'
});

// Refresh Materialized Views every 15 minutes to reduce the live JSONB scan window on the dashboard (primary instance only)
cron.schedule('*/15 * * * *', async () => {
    const isPrimary = process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE;
    if (!isPrimary) return;
    await refreshMaterializedViews();
}, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC'
});

// F3.1: Monthly orphaned-audit reconciliation — 04:00 on the 1st of every month (primary only).
// The previous quarterly job DELETED audit rows whose user_id no longer exists in
// users — that destroyed incident evidence (orphaned rows keep their user_name
// snapshot and must be KEPT). We now only COUNT and report; nothing is deleted.
cron.schedule('0 4 1 * *', async () => {
    const isPrimary = process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE;
    if (!isPrimary) return;
    try {
        const result = await pool.query(
            `SELECT COUNT(*)::INT AS orphaned
             FROM audit_logs
             WHERE user_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM users WHERE id = audit_logs.user_id)`
        );
        logger.info(`Orphaned audit reconciliation: ${result.rows[0].orphaned} audit_log row(s) reference a deleted user. Rows are intentionally RETAINED (user_name snapshot preserved).`);
    } catch (err) {
        logger.error('Monthly orphaned-audit reconciliation failed', err);
    }
}, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC'
});

// H7: Print job sweeper — every minute, primary instance only. Reprints PENDING
// jobs older than PRINT_SWEEP_MINUTES (default 5) or fails them after 3 attempts.
cron.schedule('* * * * *', async () => {
    const isPrimary = process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE;
    if (!isPrimary) return;
    await runPrintJobSweeper();
}, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC'
});

// 3. Startup Check: Run immediately to handle downtime/missed crons
//
// SCHEMA BOOT GATE:
// The database is defined by server/schema.sql (idempotent; applied by
// deploy.sh and scripts/update.sh). The gate probes recent artifacts of that
// file — staff.avatar VARCHAR(512) and users.is_active. If either is missing
// the database is stale and the app must NOT serve (RLS, partitioning or
// column assumptions may be violated) → log CRITICAL and exit(1) so PM2 stops
// flap-serving against the wrong schema.
const verifySchemaVersion = async () => {
    const probe = await pool.query(
        `SELECT
            (SELECT character_maximum_length FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'avatar') AS avatar_len,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_active') AS has_users_is_active`
    );
    const { avatar_len: avatarLen, has_users_is_active: hasUsersIsActive } = probe.rows[0] || {};
    if (avatarLen !== 512 || !hasUsersIsActive) {
        logger.error(`CRITICAL: Database schema is out of date (staff.avatar length=${avatarLen}, ` +
            `users.is_active present=${hasUsersIsActive}). Apply server/schema.sql before starting. Refusing to start.`);
        process.exit(1);
    }
    logger.info('Schema version gate passed.');
};

const initSystem = async () => {
    try {
        // Gate BEFORE any heavy work: never serve/maintain against a stale schema.
        await verifySchemaVersion();

        const systemTz = getSafeTimezone();

        logger.info(`System initialization started with timezone: ${systemTz} (from TZ env var)`);
        // Note: SET timezone is applied per-connection in config/db.cjs pool 'connect' handler (ARCH-H6)

        // Only run resource-intensive startup tasks on the primary cluster instance
        const isPrimary = process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE;

        if (isPrimary) {
            logger.info('Primary instance performing startup maintenance...');
            await runDailyReset();
            await runDatabaseHousekeeping();
            await refreshMaterializedViews();
            await runPartitionMaintenance();
        } else {
            logger.info(`Secondary instance (${process.env.NODE_APP_INSTANCE}) skipping startup maintenance.`);
        }
    } catch (err) {
        logger.error('System Initialization Failed', err);
    }
};

// initSystem() is now deferred inside server.listen — see ARCH-M6 below

// --- Security Middleware ---
// Enhanced Helmet configuration for production
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "https://static.cloudflareinsights.com"],
            "img-src": ["'self'", "data:", "https:"],
            "connect-src": ["'self'", process.env.FRONTEND_URL ? `wss://${new URL(process.env.FRONTEND_URL).host}` : 'wss://localhost:*', "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
        },
    },
    // HSTS: Strict-Transport-Security (force HTTPS)
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
    },
    // Prevent MIME type sniffing
    noSniff: true,
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Don't expose X-Powered-By
    hidePoweredBy: true,
    // Allow cross-origin images for avatars
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(compression());
// Build the cors middleware once so the options object isn't recreated per request.
const _corsMiddleware = cors({
    origin: (origin, callback) => {
        // SEC-M2: Defensive guard — if no Origin header reaches this callback (e.g. if the
        // per-request gate below is bypassed), deny all state-changing no-origin calls.
        if (!origin) {
            // The per-request gate already handles this case; this is a belt-and-suspenders block.
            return callback(new Error('Origin header required'));
        }
        const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(o => o !== '*');
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            logger.warn(`CORS Blocked: ${origin} (Allowed: ${allowedOrigins.join(', ')})`);
            // Return null (no allow header) rather than throwing — prevents 500, lets the
            // browser's same-origin policy enforce the block with its own CORS error.
            callback(null, false);
        }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Requested-With', 'X-CSRF-Token'],
    optionsSuccessStatus: 200
});

// SECURITY: Per-request CORS gate.
// Requests with no Origin header (curl, server-to-server) are handled here directly:
//   - Safe methods (GET/HEAD/OPTIONS) are always allowed — health checks, sync polls.
//   - State-changing methods require an X-API-Key header (integrations).
//   - Any other no-origin state-changing request is rejected with 403.
// Browser requests always include Origin and go through the strict allowedOrigins check.
app.use((req, res, next) => {
    if (!req.headers.origin) {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }
        if (req.headers['x-api-key']) {
            return next(); // Server-to-server API key auth (integrations)
        }
        logger.warn(`Blocked no-origin state-changing request: ${req.method} ${req.path} from ${req.ip}`);
        return res.status(403).json({ error: 'Origin header required' });
    }
    _corsMiddleware(req, res, next);
});
const cookieParser = require('cookie-parser');

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// --- Static Asset Serving (Public) ---
// Served before rate limiting and auth to ensure images are always accessible
const uploadsDir = path.join(__dirname, 'public/uploads');
app.use('/uploads', express.static(uploadsDir, { maxAge: '30d', immutable: true }));
app.use('/api/uploads', express.static(uploadsDir, { maxAge: '30d', immutable: true }));

// Custom handling for 'Payload Too Large' errors (e.g. from large images)
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'The uploaded data is too large. Images should be under 5MB.' });
    }
    next(err);
});

const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET;

// --- CSRF Token Generation Endpoint (Must be BEFORE csrfProtection middleware) ---
// Extracted to routes/csrfRoutes.cjs (audit item #13)
app.use(require('./routes/csrfRoutes.cjs'));

// --- Custom CSRF Protection ---
const csrfProtection = (req, res, next) => {
    // Skip CSRF check for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    // Skip for non-api routes (static files)
    if (!req.path.startsWith('/api')) return next();

    // API-key authenticated requests (server-to-server integrations) are exempt from CSRF.
    // CSRF (double-submit cookie) protects against a browser's *ambient* credentials — cookies
    // it attaches automatically — being replayed by a malicious cross-site page. That threat
    // doesn't apply to X-API-Key auth: a cross-site page has no way to read or forge a caller's
    // API key, since it's never stored as a cookie and must be attached explicitly by code that
    // already holds the secret. The key's actual validity is still fully enforced afterward by
    // authMiddleware — an invalid/missing key just skips this check and 401s there instead.
    if (req.headers['x-api-key']) return next();

    // Allow certain paths that are exempt from CSRF:
    // - auth/login: Initial authentication (no token yet)
    // All other public endpoints REQUIRE CSRF tokens for security
    // RBAC-L4: /api/auth/logout removed from exempt list — logout must be CSRF-protected
    //          to prevent cross-site logout DoS attacks.
    const exemptPaths = [
        '/api/auth/login',
        '/api/auth/refresh',
        '/api/auth/setup-admin', // One-time bootstrap: no session exists yet, protected by users count=0 check
    ];
    // SEC-M8: Normalize trailing slashes before comparing to prevent bypass via e.g. /api/auth/login/
    const normalizedPath = req.path.replace(/\/+$/, '');
    if (exemptPaths.includes(normalizedPath)) return next();

    // Double Submit Cookie pattern:
    // We expect the client to send a header 'x-csrf-token'
    // We also expect the HttpOnly cookie '_csrf_secret'
    const csrfHeaderToken = req.headers['x-csrf-token'];
    const csrfSecretCookie = req.cookies?.['_csrf_secret'];

    // Both must be present to establish proof-of-intent
    if (!csrfHeaderToken || !csrfSecretCookie) {
        logger.warn(`CSRF Attempt Blocked (Tokens missing) from ${req.ip} on ${req.method} ${req.path}`);
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
    }

    // Hash the secret cookie with the JWT_SECRET to see if it matches the client-provided header
    const expectedToken = crypto.createHmac('sha256', JWT_SECRET).update(csrfSecretCookie).digest('hex');

    // Use timing-safe comparison to prevent side-channel timing attacks
    let isValid = false;
    try {
        isValid = crypto.timingSafeEqual(Buffer.from(expectedToken), Buffer.from(csrfHeaderToken));
    } catch (e) {
        // Can fail if lengths mismatch
        isValid = false;
    }

    if (!isValid) {
        logger.warn(`CSRF Attempt Blocked (Token mismatch) from ${req.ip} on ${req.method} ${req.path}`);
        return res.status(403).json({ error: 'CSRF validation failed' });
    }

    next();
};

app.use(csrfProtection);

// VPN Suppression (applied after basic parsing but before routes)
if (process.env.NODE_ENV === 'production') {
    app.use(vpnSuppression);
}


// Database Connection
// Validate required environment variables
if (!process.env.DB_PASSWORD) {
    logger.error('FATAL: DB_PASSWORD environment variable is required');
    process.exit(1);
}
if (!process.env.JWT_SECRET) {
    logger.error('FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
}
if (!process.env.DB_ENCRYPTION_SECRET) {
    logger.error('FATAL: DB_ENCRYPTION_SECRET environment variable is required');
    process.exit(1);
}

// Apply global rate limiter to all API routes
app.use(globalApiLimiter);

// --- Health Check (Public) ---
// Extracted to routes/healthRoutes.cjs (audit item #13)
app.use(require('./routes/healthRoutes.cjs'));

// --- Public API Routes ---
app.use('/api/public', publicRoutes);

// Apply auth middleware to all private routes below this point
app.use(authMiddleware);

// Issue 2 (HIGH): Apply RLS branch context middleware after auth so req.user is populated.
// Sets set_branch_context() for branch-scoped users; admins without branchId bypass it.
app.use(branchContextMiddleware);

// --- Modular Routes (Authenticated) ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/consumers', consumerRoutes);
app.use('/api/ledger', require('./routes/ledgerRoutes.cjs'));
app.use('/api/audit-logs', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/transactions', transactionLimiter, transactionRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/print', printRoutes);
app.use('/api/printers', printerRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/api-keys', require('./routes/apiKeyRoutes.cjs'));
app.use('/api/self-service', require('./routes/selfServiceRoutes.cjs'));
app.use('/api/upload', uploadRoutes);
app.use('/api/document-templates', documentTemplateRoutes);
app.use('/api/setup', require('./routes/setupRoutes.cjs'));
app.use('/api/student-orders', studentOrderRoutes);

// Serve static files from the 'dist' directory with cache-control for production
app.use(express.static(path.join(__dirname, '../dist'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        const basename = path.basename(filePath);
        if (basename === 'sw.js' || basename === 'manifest.webmanifest' || basename === 'version.json') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.match(/\.(js|css|woff2|png|jpg|svg)$/) && !filePath.endsWith('sw.js')) {
            // Immutable caching for hashed assets (EXCLUDING sw.js)
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// Handle client-side routing (SPA fallback) — extracted to routes/spaRoutes.cjs (audit item #13)
app.use(require('./routes/spaRoutes.cjs'));

// Global Error Handler
app.use((err, req, res, next) => {
    logger.error(`${req.method} ${req.url} - ${err.message}`, { stack: err.stack });

    // If headers already sent, don't try to send another response
    if (res.headersSent) {
        return next(err);
    }

    // SECURITY FIX: Safer default - only show detailed errors in development
    const isDevelopment = process.env.NODE_ENV === 'development';

    res.status(500).json({
        error: 'Internal Server Error',
        message: isDevelopment ? err.message : 'An unexpected error occurred'
    });
});

const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`Server listening at http://localhost:${port}`);
    logger.info(`CORS Policy: Allowed Origins = ${process.env.CORS_ORIGIN || 'NONE'}`);
    // ARCH-M6: Defer heavy init so the server is ready to accept requests immediately
    setImmediate(() => {
        initSystem().catch(err => logger.error('initSystem failed', { error: err.message }));
    });
});

// Initialize Socket.IO
// SECURITY FIX: Remove wildcard support for Socket.IO CORS as well
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(o => o !== '*');
initSocket(server, {
    origin: allowedOrigins,
    credentials: true,
}).catch(err => logger.error('Socket.IO init error', err));

// --- Graceful Shutdown ---
// H5 ordering matters: PM2 sends SIGTERM then SIGKILLs after kill_timeout (12s).
//   1. Stop cron tasks FIRST — a scheduled job must not start mid-shutdown.
//   2. Close Socket.IO — stops accepting upgrades and disconnects clients so
//      server.close() isn't held open by hanging WebSocket connections.
//   3. server.close() with a bounded grace period before force-exit.
const shutdown = async (signal) => {
    if (global.__shuttingDown) return;
    global.__shuttingDown = true;
    logger.info(`${signal} received: initiating graceful shutdown...`);

    // 1. Stop all node-cron tasks (node-cron >= 3 exposes getTasks()).
    try {
        const tasks = cron.getTasks();
        tasks.forEach(task => task.stop());
        logger.info(`Stopped ${tasks.size} cron task(s).`);
    } catch (err) {
        logger.error('Failed to stop cron tasks during shutdown', err);
    }

    // 2. Close Socket.IO (io.close() also closes the underlying HTTP server,
    //    but we still call server.close() below defensively/idempotently).
    try {
        const io = getIO();
        if (io) {
            await Promise.race([
                new Promise(resolve => io.close(resolve)),
                new Promise(resolve => setTimeout(resolve, 3000))
            ]);
            logger.info('Socket.IO closed.');
        }
    } catch (err) {
        logger.error('Failed to close Socket.IO during shutdown', err);
    }

    // 3. Drain HTTP connections, then release DB/Redis.
    server.close(async () => {
        logger.info('HTTP server closed.');
        try {
            await pool.end();
            logger.info('Database pool closed.');
            await closeRedis();
            logger.info('Redis connection closed.');
            process.exit(0);
        } catch (err) {
            logger.error('Error during shutdown', err);
            process.exit(1);
        }
    });

    // Bounded grace: force-exit BEFORE PM2's kill_timeout (12s) so the process
    // always exits on its own terms and logs its final state.
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
