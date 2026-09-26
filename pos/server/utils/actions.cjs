const { pool } = require('../config/db.cjs');
// ARCH-C2: emitEvent removed — audit log writes do not need real-time Socket.IO broadcast (ARCH-M4).
// Broadcasting on every logAction call caused excessive socket traffic (78+ fire-and-forget call sites).
const logger = require('./logger.cjs');

// F7.3/F2.6: Audit writes are swallowed by design (fire-and-forget contract),
// but total silence hides systemic DB problems. Track consecutive failures and
// surface them loudly: an error on failure #1, then a warn at most once per
// 60s while the outage continues. A successful write resets the state.
const AUDIT_FAIL_WARN_INTERVAL_MS = 60 * 1000;
let consecutiveAuditFailures = 0;
let lastAuditFailWarnAt = 0;

/**
 * Standard audit log function.
 * Fire-and-forget safe: errors are caught internally and never propagate to callers.
 *
 * DB-M2: Application-level FK enforcement for user_id.
 * PostgreSQL does not support FK constraints on partitioned tables (audit_logs is
 * partitioned by timestamp — see schema.sql §DB-M2). New partitions are created
 * dynamically, so adding a FK to each child table is not practical. Instead we
 * verify the user_id exists in the users table via a sub-select inside the INSERT,
 * which is a single round-trip and avoids a race condition between a SELECT and
 * the INSERT. If userId is null/undefined we skip the check (system-generated
 * entries that have no associated user are still valid).
 */
const logAction = async (userId, username, action, details, branchId) => {
    try {
        if (userId != null) {
            // DB-M2: Enforce referential integrity at the application level.
            // The INSERT only proceeds when the user_id actually exists in users.
            // This mirrors a FK check without relying on PostgreSQL partition FK support.
            await pool.query(
                `INSERT INTO audit_logs (user_id, user_name, action, details, branch_id)
                 SELECT $1, $2, $3, $4, $5
                 WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)`,
                [userId, username, action, details, branchId]
            );
        } else {
            // No userId — system-generated event; skip FK check.
            await pool.query(
                'INSERT INTO audit_logs (user_id, user_name, action, details, branch_id) VALUES ($1, $2, $3, $4, $5)',
                [null, username, action, details, branchId]
            );
        }
    } catch (err) {
        // ARCH-C2: Do NOT rethrow — audit failures must never crash callers.
        consecutiveAuditFailures++;
        const now = Date.now();
        if (consecutiveAuditFailures === 1) {
            logger.error('AUDIT WRITE FAILURE — audit trail write failed (subsequent failures throttled to 1 warn/60s)', { message: err.message, consecutiveFailures: consecutiveAuditFailures });
            lastAuditFailWarnAt = now;
        } else if (now - lastAuditFailWarnAt >= AUDIT_FAIL_WARN_INTERVAL_MS) {
            logger.warn('AUDIT WRITE FAILURES ONGOING', { message: err.message, consecutiveFailures: consecutiveAuditFailures });
            lastAuditFailWarnAt = now;
        }
        return;
    }
    // Success — reset the failure tracker so the next incident re-alerts at #1.
    if (consecutiveAuditFailures > 0) {
        logger.info('Audit log writes recovered', { failedAttemptsDuringOutage: consecutiveAuditFailures });
        consecutiveAuditFailures = 0;
        lastAuditFailWarnAt = 0;
    }
};

module.exports = {
    logAction
};
