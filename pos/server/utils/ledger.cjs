const { pool } = require('../config/db.cjs');
const logger = require('./logger.cjs');

/**
 * Log a financial entry to the ledger.
 * @param {Object} entry - Ledger entry details
 * @param {('STAFF'|'CONSUMER')} entry.entityType
 * @param {string} entry.entityId
 * @param {number} entry.amount - Absolute amount change
 * @param {('CREDIT'|'DEBIT')} entry.type
 * @param {number} entry.balanceBefore
 * @param {number} entry.balanceAfter
 * @param {string} entry.branchId - Mandatory branch context
 * @param {string} [entry.referenceId] - e.g. Transaction UUID
 * @param {string} [entry.reason]
 * @param {string} [entry.createdBy] - UUID of the user who initiated the change (DB-H3)
 * @param {Object} [client] - Optional database client for transactional operations
 */
const logFinancialEntry = async (entry, client = pool) => {
    try {
        // DB-H3: include created_by so financial_ledger.created_by is not always NULL
        await client.query(
            `INSERT INTO financial_ledger
            (entity_type, entity_id, amount, type, balance_before, balance_after, branch_id, reference_id, reason, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                entry.entityType,
                entry.entityId,
                entry.amount,
                entry.type,
                entry.balanceBefore,
                entry.balanceAfter,
                entry.branchId,
                entry.referenceId || null,
                entry.reason || null,
                entry.createdBy || null
            ]
        );
    } catch (err) {
        logger.error('Failed to log financial entry', { entry, error: err.message });
        // Don't throw for fire-and-forget logging, but in transactions we might want to?
        // Actually, for integrity, we should probably throw if this fails during a transaction.
        if (client !== pool) throw err;
    }
};

/**
 * Batch-insert multiple financial ledger entries in a single query.
 * Significantly faster than calling logFinancialEntry() in a loop.
 * @param {Object[]} entries - Array of entry objects (same shape as logFinancialEntry)
 * @param {Object} [client] - Optional DB client for transactional use
 */
const logFinancialEntries = async (entries, client = pool) => {
    if (!entries || entries.length === 0) return;
    const values = [];
    // DB-H3: include created_by column (10 fields per entry, was 9)
    const placeholders = entries.map((e, i) => {
        const base = i * 10;
        values.push(
            e.entityType,
            e.entityId,
            e.amount,
            e.type,
            e.balanceBefore,
            e.balanceAfter,
            e.branchId,
            e.referenceId || null,
            e.reason || null,
            e.createdBy || null
        );
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10})`;
    });
    try {
        await client.query(
            `INSERT INTO financial_ledger (entity_type, entity_id, amount, type, balance_before, balance_after, branch_id, reference_id, reason, created_by) VALUES ${placeholders.join(',')}`,
            values
        );
    } catch (err) {
        logger.error('Failed to batch-log financial entries', { count: entries.length, error: err.message });
        if (client !== pool) throw err;
    }
};

module.exports = {
    logFinancialEntry,
    logFinancialEntries
};
