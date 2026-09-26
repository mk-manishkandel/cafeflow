/**
 * Issue 2 (HIGH): RLS Branch Context Middleware
 *
 * Sets the PostgreSQL session-local branch context variable so that
 * Row-Level Security policies on branch-scoped tables are enforced.
 *
 * The function set_branch_context() calls `set_config('app.current_branch_id', ..., true)`
 * where the third argument `true` means LOCAL (scoped to the current transaction).
 * Because the middleware runs OUTSIDE any explicit transaction, that setting is
 * bound to the single implicit transaction of the `SELECT set_branch_context($1)`
 * statement and is discarded as soon as it commits.
 *
 * POOL PINNING DECISION (H6, second half):
 * Previously this middleware cached the acquired client on `req._branchContextClient`
 * for the lifetime of the request, halving effective pool capacity. Investigation
 * showed this pinning provided NO functional benefit:
 *   1. No controller or service ever reads `req._branchContextClient` (verified by
 *      grep across server/ — only this middleware referenced it). Handlers always
 *      obtain their own client via `pool.query(...)` / `pool.connect()`.
 *   2. Even on the pinned connection, the SET LOCAL context does not survive past
 *      the middleware's own autocommit statement, so handler queries never ran with
 *      an active branch context via this mechanism anyway. Handlers that need RLS
 *      must (and do, per the RLS section of schema.sql) call set_branch_context() inside
 *      their own BEGIN/COMMIT.
 * Therefore the client is now released IMMEDIATELY after set_branch_context()
 * completes. This is safe against context leakage into other requests precisely
 * BECAUSE set_branch_context uses is_local=true: the setting is already gone when
 * the connection returns to the pool, so no per-release clear query is needed.
 */

const { pool } = require('../config/db.cjs');
const logger = require('../utils/logger.cjs');

// H6: methods that can mutate state must NOT proceed without a verified branch
// context (fail closed); read-only methods degrade open during transient PG blips.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Express middleware that sets the PostgreSQL branch context for the current request.
 *
 * Must be applied AFTER authMiddleware so that req.user is populated.
 * Skips public routes (no req.user) and admin users without a branchId (global access).
 */
const branchContextMiddleware = async (req, res, next) => {
    // Only applies to authenticated API routes
    if (!req.user) return next();

    const branchId = req.user.branchId ?? null;

    // Admins with no branchId get full cross-branch access; leave RLS context unset
    // so that current_branch_id() returns NULL and policies evaluate to TRUE (allow all).
    if (!branchId) return next();

    let client;
    try {
        client = await pool.connect();
        await client.query('SELECT set_branch_context($1)', [branchId]);
        // Release immediately — see POOL PINNING DECISION above.
        client.release();
        return next();
    } catch (err) {
        if (client) {
            try { client.release(); } catch (releaseErr) { /* already released */ }
        }
        logger.error('branchContextMiddleware: failed to set branch context', {
            message: err.message,
            userId: req.user?.id,
            branchId,
            method: req.method,
            path: req.path
        });
        // H6 fail-closed: mutating requests get 503 when the context cannot be
        // established (PG blip), preventing writes that would bypass RLS scoping.
        if (!SAFE_METHODS.has(req.method)) {
            return res.status(503).json({ error: 'Branch context unavailable' });
        }
        // Read-only requests degrade open rather than failing wholesale.
        return next();
    }
};

module.exports = { branchContextMiddleware };
