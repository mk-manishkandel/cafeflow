const { ROLES } = require('../utils/roleHierarchy.cjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db.cjs'); // Used for API key validation and role re-verification
const logger = require('../utils/logger.cjs');
const crypto = require('crypto');
const { cacheGet, cacheSet, cacheDel } = require('../redis.cjs');
const { logAction } = require('../utils/actions.cjs');

// TTL for the per-user role/existence cache used by JWT re-verification (seconds)
const USER_ROLE_CACHE_TTL = 60;

const JWT_SECRET = process.env.JWT_SECRET;
// Note: API_KEY env var is unused — API key auth uses the api_keys DB table (hashed lookup)

/**
 * Authentication Middleware - Protects all API routes except login and public ones.
 */
const authMiddleware = async (req, res, next) => {
    // Skip auth for login, public routes, and static files
    if (req.path === '/api/auth/login' ||
        req.path === '/api/auth/refresh' ||
        req.path === '/api/auth/setup-status' ||
        req.path === '/api/auth/setup-admin' ||
        req.path.startsWith('/api/public') ||
        !req.path.startsWith('/api')) {
        return next();
    }

    const clientIp = req.realIp || req.ip || req.socket?.remoteAddress || 'unknown';
    const endpoint = `${req.method} ${req.originalUrl || req.path}`;

    // Method 1: Check for X-API-Key header (secure hashed check)
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        try {
            const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
            // NOTE: If the api_keys table does not yet have a 'scope' column,
            // run this migration: ALTER TABLE api_keys ADD COLUMN scope TEXT DEFAULT NULL;
            // Valid scope values: 'print', 'pos' (comma-separated for multiple)
            const result = await pool.query(
                'SELECT id, name, prefix, branch_id, scope FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
                [keyHash]
            );

            if (result.rows.length > 0) {
                const keyData = result.rows[0];
                // Update usage stats asynchronously
                pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyData.id])
                    .catch(err => logger.error('Failed to update API key stats', err));

                // SCOPE ENFORCEMENT: Map scopes to allowed path prefixes
                // If scope column does not exist yet (undefined), deny all non-GET requests
                // as a safe default until the DB migration is applied.
                const scope = keyData.scope; // may be null/undefined if column missing or unset
                const method = req.method.toUpperCase();
                const reqPath = req.path;

                const SCOPE_PATH_MAP = {
                    pos: ['/api/pos'],
                    print: ['/api/print'],
                    staff: ['/api/staff'],
                    menu: ['/api/menu'],
                    consumer: ['/api/consumers'],
                    admin: ['/api/branches', '/api/users', '/api/roles', '/api/audit-logs'],
                    // Read-only reporting scope: dashboard, staff, consumers, transactions
                    // (also covers the consumption/item-sales report views, which are just
                    // filtered transaction queries), menu, and account statements (ledger).
                    reports: ['/api/dashboard', '/api/staff', '/api/consumers', '/api/transactions', '/api/menu', '/api/ledger'],
                    // Full-access external-integration scope: same surface as 'reports'
                    // (dashboard, staff, consumers, transactions, menu, ledger) but with
                    // full read/write on staff and consumers too. This is the single scope
                    // issued via Business Setup → API Keys — no separate read-only vs.
                    // write key types; it's on the integrating system to use it appropriately.
                    full: ['/api/dashboard', '/api/staff', '/api/consumers', '/api/transactions', '/api/menu', '/api/ledger'],
                };

                // Scopes that are inherently read-only: block every mutating verb outright,
                // regardless of path match. This is enforced in addition to (not instead of)
                // the per-route permission check below, which also excludes write permissions
                // for these scopes.
                const READ_ONLY_SCOPES = ['reports'];

                // Build list of allowed path prefixes from the key's scope(s)
                let allowedPaths = [];
                const scopes = scope ? scope.split(',').map(s => s.trim().toLowerCase()) : [];
                if (scopes.some(s => READ_ONLY_SCOPES.includes(s)) && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
                    logger.warn(`AUTH_FAIL api_key_reports_readonly ip=${clientIp} endpoint="${endpoint}" key_id=${keyData.id}`);
                    return res.status(403).json({ error: `API key scope '${scope}' is read-only and cannot perform ${method} requests.` });
                }
                for (const s of scopes) {
                    if (SCOPE_PATH_MAP[s]) {
                        allowedPaths.push(...SCOPE_PATH_MAP[s]);
                    }
                }

                if (allowedPaths.length === 0) {
                    // No scope set or unrecognised scope: allow GET (safe/read-only), deny mutations
                    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
                        logger.warn(`AUTH_FAIL api_key_no_scope ip=${clientIp} endpoint="${endpoint}" key_id=${keyData.id}`);
                        return res.status(403).json({ error: 'API key has no scope configured. Read-only access only. Apply a scope to allow mutations.' });
                    }
                } else {
                    // Scope set: check that the request path is covered
                    const pathAllowed = allowedPaths.some(p => reqPath.startsWith(p));
                    if (!pathAllowed) {
                        logger.warn(`AUTH_FAIL api_key_scope_mismatch ip=${clientIp} endpoint="${endpoint}" key_id=${keyData.id} scope=${scope}`);
                        logAction(null, `ip:${clientIp}`, 'API_KEY_SCOPE_DENIED', `Key ${keyData.id} (scope=${scope}) denied on ${endpoint}`, keyData.branch_id).catch(() => {});
                        return res.status(403).json({ error: `API key scope '${scope}' does not permit access to ${reqPath}` });
                    }
                }

                req.user = {
                    // Not a real users.id — must stay null, never a placeholder string.
                    // Several write paths (audit_logs.user_id, transactions.user_id) are
                    // UUID-typed columns; a non-UUID string like 'api-user' fails the
                    // Postgres type cast at insert time. logAction() and friends already
                    // treat a null userId as "system-generated" and skip the FK check.
                    id: null,
                    // Free-text identity for audit trails (audit_logs.user_name etc. are
                    // plain VARCHAR, no FK) — traceable back to which key acted.
                    username: `API Key: ${keyData.name} (${keyData.prefix})`,
                    role: ROLES.API,
                    branchId: keyData.branch_id,
                    key_id: keyData.id,
                    api_scope: scope || null
                };
                return next(); // Successfully authenticated via API Key, skip JWT
            } else {
                logger.warn(`AUTH_FAIL api_key_invalid ip=${clientIp} endpoint="${endpoint}"`);
                logAction(null, `ip:${clientIp}`, 'API_KEY_AUTH_FAILED', `Invalid or revoked API key used on ${endpoint}`, null).catch(() => {});
                return res.status(401).json({ error: 'Invalid or revoked API Key' });
            }
        } catch (err) {
            logger.error('API Key validation error', err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // Method 2: Check for Bearer token or HttpOnly Cookie
    const authHeader = req.headers['authorization'];
    const token = req.cookies?.token || (authHeader && authHeader.split(' ')[1]);

    if (!token) {
        logger.warn(`AUTH_FAIL no_token ip=${clientIp} endpoint="${endpoint}"`);
        return res.status(401).json({ error: 'Access Denied: No Token Provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // SEC-M2: Check if this token's jti has been revoked (e.g. via logout blacklist)
        if (decoded.jti) {
            try {
                const isRevoked = await cacheGet(`blacklist:${decoded.jti}`);
                if (isRevoked) {
                    logger.warn(`AUTH_FAIL token_revoked ip=${clientIp} endpoint="${endpoint}"`);
                    return res.status(401).json({ error: 'Token revoked' });
                }
            } catch (redisErr) {
                // Redis unavailable — fail open (allow request) but log a warning
                logger.warn('JWT blacklist check failed (Redis unavailable)', { error: redisErr.message });
            }
        }

        // SEC-RBAC: Re-verify role claims against the DB on every request.
        // Cache results in Redis for USER_ROLE_CACHE_TTL seconds to avoid a DB hit
        // per request while still picking up role/suspension changes within 60 s.
        // Cache key: user_role_cache:<userId>  value: { role, exists: true }
        if (decoded.id) {
            const cacheKey = `user_role_cache:${decoded.id}`;
            let userRecord = null;

            try {
                userRecord = await cacheGet(cacheKey);
            } catch (_) {
                // Redis unavailable — fall through to DB query
            }

            if (!userRecord) {
                // Cache miss — query the DB
                try {
                    const dbResult = await pool.query(
                        'SELECT role, branch_id, is_active FROM users WHERE id = $1',
                        [decoded.id]
                    );
                    if (dbResult.rows.length === 0) {
                        // User no longer exists
                        logger.warn(`AUTH_FAIL user_not_found id=${decoded.id} ip=${clientIp} endpoint="${endpoint}"`);
                        return res.status(401).json({ error: 'Access Denied: User account not found' });
                    }
                    userRecord = { role: dbResult.rows[0].role, branchId: dbResult.rows[0].branch_id, isActive: dbResult.rows[0].is_active, exists: true };
                    // Cache for short TTL — fire-and-forget
                    cacheSet(cacheKey, userRecord, USER_ROLE_CACHE_TTL).catch(() => {});
                } catch (dbErr) {
                    // DB unavailable — fail open to avoid a full outage, but log it
                    logger.error('JWT role re-verification DB query failed', { error: dbErr.message });
                    userRecord = null;
                }
            }

            if (userRecord) {
                // Enforce: a disabled account is cut off immediately, even mid-session
                if (userRecord.isActive === false) {
                    logger.warn(`AUTH_FAIL account_disabled id=${decoded.id} ip=${clientIp} endpoint="${endpoint}"`);
                    return res.status(401).json({ error: 'Access Denied: Account has been disabled' });
                }
                // Enforce: role in the token must still match the DB
                if (userRecord.role !== decoded.role) {
                    logger.warn(`AUTH_FAIL role_mismatch id=${decoded.id} token_role=${decoded.role} db_role=${userRecord.role} ip=${clientIp} endpoint="${endpoint}"`);
                    return res.status(401).json({ error: 'Access Denied: Role has changed. Please log in again.' });
                }
                // Always use the live branch_id from the DB — the JWT may carry a
                // stale numeric ID from before the branches table migrated to UUIDs.
                if (userRecord.branchId !== undefined) {
                    decoded.branchId = userRecord.branchId;
                }
            }
        }

        req.user = decoded;
        return next();
    } catch (err) {
        const reason = err.name === 'TokenExpiredError' ? 'token_expired' : 'token_invalid';
        logger.warn(`AUTH_FAIL ${reason} ip=${clientIp} endpoint="${endpoint}"`);
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
};

/**
 * Maps API key scopes to the fine-grained permissions they are allowed to exercise.
 * This prevents an API key from calling endpoints it technically has path access to
 * but shouldn't be allowed to perform specific privileged actions on.
 */
const API_KEY_SCOPE_PERMISSIONS = {
    pos: ['CREATE_ORDER', 'VIEW_MENU', 'ACCESS_POS'],
    print: ['PRINT_RECEIPT'],
    staff: ['STAFF_VIEW', 'STAFF_ADD', 'STAFF_EDIT', 'STAFF_DELETE', 'STAFF_BULK_IMPORT', 'STAFF_RESET'],
    menu: ['MENU_VIEW', 'MENU_ADD_ITEM', 'MENU_EDIT_ITEM', 'MENU_DELETE_ITEM',
           'MENU_BULK_IMPORT', 'MENU_MANAGE_CATEGORIES'],
    consumer: ['CONSUMER_VIEW', 'CONSUMER_ADD', 'CONSUMER_EDIT', 'CONSUMER_DELETE',
               'CONSUMER_RESET', 'CONSUMER_SETTLE_BALANCE', 'CONSUMER_EXPORT_CSV'],
    admin: ['MANAGE_BRANCHES', 'MANAGE_USERS', 'MANAGE_ROLES', 'VIEW_AUDIT_LOGS',
            'MANAGE_AUDIT_LOGS', 'EXPORT_REPORTS', 'VIEW_REPORTS'],
    // Read-only: view-only permissions for dashboard, staff, consumers, transactions
    // (incl. consumption/item-sales reports), menu, and ledger/account statements.
    // Deliberately excludes every *_ADD / *_EDIT / *_DELETE / ACCESS_POS permission.
    reports: ['VIEW_REPORTS', 'VIEW_ITEM_SALES_REPORT', 'STAFF_VIEW', 'CONSUMER_VIEW',
              'CONSUMER_EXPORT_CSV', 'TRANSACTION_VIEW', 'EXPORT_REPORTS', 'MENU_VIEW'],
    // Single external-integration scope: everything 'reports' grants, plus full
    // read/write on staff and consumers. Transactions/menu/dashboard/ledger stay
    // view-only here because there's no external-facing write flow for them (order
    // creation, menu edits, etc. are separate concerns from this integration).
    full: ['VIEW_REPORTS', 'VIEW_ITEM_SALES_REPORT', 'TRANSACTION_VIEW', 'EXPORT_REPORTS', 'MENU_VIEW',
           'STAFF_VIEW', 'STAFF_ADD', 'STAFF_EDIT', 'STAFF_DELETE', 'STAFF_BULK_IMPORT', 'STAFF_RESET',
           'CONSUMER_VIEW', 'CONSUMER_ADD', 'CONSUMER_EDIT', 'CONSUMER_DELETE', 'CONSUMER_RESET',
           'CONSUMER_SETTLE_BALANCE', 'CONSUMER_EXPORT_CSV'],
};

/**
 * Permission Middleware - Checks if the user has the required permission.
 * Uses permissions already embedded in the JWT payload — no DB query needed.
 * @param {string} permission - The permission string to check.
 */
const checkPermission = (permission) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Admin bypass only
        if (req.user.role && req.user.role.toLowerCase() === ROLES.ADMIN) {
            return next();
        }

        // API keys: enforce fine-grained permission check based on scope.
        // Path-level enforcement already happened in authMiddleware; here we
        // additionally verify the required permission is in the scope's allowed set.
        if (req.user.role === ROLES.API) {
            const scope = req.user.api_scope;
            const required = Array.isArray(permission) ? permission : [permission];
            if (scope) {
                const scopes = scope.split(',').map(s => s.trim().toLowerCase());
                const allowedPerms = scopes.flatMap(s => API_KEY_SCOPE_PERMISSIONS[s] || []);
                if (required.some(p => allowedPerms.includes(p))) {
                    return next();
                }
            }
            logger.warn(`AUTH_FAIL api_key_permission_denied scope=${scope} required=${required.join('|')} endpoint="${req.method} ${req.path}"`);
            return res.status(403).json({ error: `API key scope '${scope}' does not have permission: ${required[0]}` });
        }

        const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
        if (perms.includes('*')) return next();

        // Accept an array of permissions (OR logic — any one is sufficient)
        const required = Array.isArray(permission) ? permission : [permission];
        if (required.some(p => perms.includes(p))) {
            return next();
        }

        // F7.1: Human permission denials are security-relevant events — audit
        // mutating-method denials fire-and-forget. GET/HEAD/OPTIONS denials are
        // skipped to prevent log floods from read probing; CSRF-block denials
        // never reach this middleware (blocked earlier in index.cjs).
        const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
        if (MUTATING_METHODS.includes(req.method.toUpperCase())) {
            logAction(
                req.user.id || null,
                req.user.username || `role:${req.user.role}`,
                'PERMISSION_DENIED',
                `Denied ${req.method} ${req.originalUrl || req.path} — required permission: ${required[0]}`,
                req.user.branchId || null
            ).catch(() => {});
        }

        return res.status(403).json({
            error: `Forbidden: Required permission ${required[0]} missing`
        });
    };
};

/**
 * Invalidates the Redis role cache for a specific user.
 * Call this whenever a user's role is changed or the account is deleted,
 * so the next request picks up the new role from the DB without waiting for
 * the 60-second cache TTL to expire.
 * @param {string} userId
 */
const invalidateUserRoleCache = (userId) => {
    if (!userId) return;
    cacheDel(`user_role_cache:${userId}`).catch(() => {});
};

module.exports = {
    authMiddleware,
    checkPermission,
    invalidateUserRoleCache
};
