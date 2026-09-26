const { ROLES } = require('../../utils/roleHierarchy.cjs');
const { pool } = require('../../config/db.cjs');
const { logAction } = require('../../utils/actions.cjs');
const { cacheInvalidatePattern, cacheIncr } = require('../../redis.cjs');
const { emitEvent } = require('../../socket.cjs');
const logger = require('../../utils/logger.cjs');
const { logFinancialEntry } = require('../../utils/ledger.cjs');
const { getIdempotentResponse, setIdempotentResponse } = require('./shared.cjs');

const createTransaction = async (req, res) => {
    logger.debug('createTransaction: Received body', req.body);

    // IDEMPOTENCY: Return cached response for duplicate submissions
    const idempotencyKey = req.headers['idempotency-key'];
    if (idempotencyKey) {
        const cached = await getIdempotentResponse(idempotencyKey);
        if (cached) {
            // Conflict marker: same key is still in flight — the client MUST
            // NOT treat this as a successful sale (cart clear / success toast).
            if (cached.__idempotencyConflict) {
                logger.warn('createTransaction: idempotency conflict (original still in flight)', { key: idempotencyKey });
                return res.status(409).json({ error: 'Request already in progress' });
            }
            logger.info('createTransaction: Returning idempotent cached response', { key: idempotencyKey });
            return res.json(cached);
        }
    }

    let { staffId, consumerId, totalAmount, items, branchId, staffName, paymentMethod } = req.body;

    // Helper to check if a string is a valid UUID
    const isValidUUID = (id) => {
        if (!id || typeof id !== 'string') return false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(id);
    };

    // Enforce branch isolation for non-admins
    const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
    const userBranchId = req.user?.branchId;

    const finalBranchId = (!isAdmin && userBranchId) ? userBranchId : (isValidUUID(branchId) ? branchId : userBranchId);
    // Consumer IDs are integers (serial), not UUIDs — only validate format, not type
    const finalConsumerId = (consumerId && (isValidUUID(consumerId) || /^\d+$/.test(String(consumerId)))) ? consumerId : null;
    const finalStaffId = staffId; // Can be 'POS-N' or actual UUID

    // Coupons have been removed; historical 'COUPON_<n>' IDs must not be reused for new sales
    if (staffId && staffId.toString().startsWith('COUPON_')) {
        return res.status(400).json({ error: 'Coupon redemption is no longer supported' });
    }

    // Determine order source
    let orderSource = 'POS';
    if (staffId === 'POS-N') {
        orderSource = 'POS-N';
        if (!staffName) staffName = 'Standard Customer';
    }

    // Validate Payment Method for the branch
    if (paymentMethod) {
        // Built-in methods that skip DB validation
        const builtinMethods = ['CREDIT'];

        if (!builtinMethods.includes(paymentMethod.toUpperCase())) {
            try {
                // Check if paymentMethod is a name or an ID
                const methodCheck = await pool.query(
                    "SELECT id, name FROM payment_methods WHERE (name = $1 OR id::text = $1) AND is_active = true AND (branch_id IS NULL OR branch_id = $2)",
                    [paymentMethod, finalBranchId]
                );
                if (methodCheck.rows.length === 0) {
                    const branchCtx = finalBranchId ? `branch ${finalBranchId}` : 'global';
                    return res.status(400).json({ error: `Invalid payment method '${paymentMethod}' for ${branchCtx}.` });
                }
                // Always store the name in the transaction for consistent reporting, 
                // but we accepted either name or ID for convenience.
                paymentMethod = methodCheck.rows[0].name;
            } catch (err) {
                logger.error('Payment method validation error', err);
                return res.status(500).json({ error: 'Failed to validate payment method' });
            }
        } else {
            // Noramlize builtin name
            paymentMethod = paymentMethod.toUpperCase();
        }
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        let txnResult;

        if (finalConsumerId) {
            // DB-H7: SELECT current balance BEFORE the UPDATE (with FOR UPDATE to prevent concurrent races)
            const beforeRes = await client.query(
                'SELECT current_balance FROM consumers WHERE id = $1 FOR UPDATE',
                [finalConsumerId]
            );
            if (!beforeRes.rows[0]) throw new Error(`Consumer ${finalConsumerId} not found`);
            const balanceBefore = parseFloat(beforeRes.rows[0].current_balance);

            txnResult = await client.query(
                'INSERT INTO transactions (id, consumer_id, staff_id, total_amount, items, branch_id, recipient_name, payment_method, order_source, user_id) VALUES (gen_random_uuid(), $1, NULL, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                [finalConsumerId, totalAmount, JSON.stringify(items), finalBranchId, staffName, paymentMethod, orderSource, req.user?.id]
            );
            const balanceRes = await client.query('UPDATE consumers SET current_balance = current_balance - $1 WHERE id = $2 RETURNING current_balance', [totalAmount, finalConsumerId]);
            if (!balanceRes.rows[0]) throw new Error(`Consumer ${finalConsumerId} not found during balance update`);
            const newBalance = parseFloat(balanceRes.rows[0].current_balance);

            await logFinancialEntry({
                entityType: 'CONSUMER',
                entityId: finalConsumerId.toString(),
                amount: totalAmount,
                type: 'DEBIT',
                balanceBefore,  // DB-H7: use pre-UPDATE value, not newBalance + amount
                balanceAfter: newBalance,
                branchId: finalBranchId,
                referenceId: txnResult.rows[0].id,
                reason: 'Purchase',
                createdBy: req.user?.id || null  // DB-H3: populate created_by
            }, client);
        } else {
            txnResult = await client.query(
                'INSERT INTO transactions (id, staff_id, consumer_id, total_amount, items, branch_id, recipient_name, payment_method, order_source, user_id) VALUES (gen_random_uuid(), $1, NULL, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                [finalStaffId, totalAmount, JSON.stringify(items), finalBranchId, staffName, paymentMethod, orderSource, req.user?.id]
            );

            // Only update balance if it's a real staff member (not POS-N)
            if (finalStaffId && finalStaffId !== 'POS-N') {
                // DB-H7: SELECT current balance BEFORE the UPDATE (with FOR UPDATE)
                const beforeRes = await client.query(
                    'SELECT current_balance FROM staff WHERE id = $1 FOR UPDATE',
                    [finalStaffId]
                );
                if (!beforeRes.rows[0]) throw new Error(`Staff ${finalStaffId} not found`);
                const balanceBefore = parseFloat(beforeRes.rows[0].current_balance);

                const balanceRes = await client.query('UPDATE staff SET current_balance = current_balance - $1 WHERE id = $2 RETURNING current_balance', [totalAmount, finalStaffId]);
                if (!balanceRes.rows[0]) throw new Error(`Staff ${finalStaffId} not found during balance update`);
                const newBalance = parseFloat(balanceRes.rows[0].current_balance);

                await logFinancialEntry({
                    entityType: 'STAFF',
                    entityId: finalStaffId,
                    amount: totalAmount,
                    type: 'DEBIT',
                    balanceBefore,  // DB-H7: use pre-UPDATE value, not newBalance + amount
                    balanceAfter: newBalance,
                    branchId: finalBranchId,
                    referenceId: txnResult.rows[0].id,
                    reason: 'Purchase',
                    createdBy: req.user?.id || null  // DB-H3: populate created_by
                }, client);
            }
        }

        await client.query('COMMIT');
        let entityName = finalConsumerId ? 'Consumer' : 'Staff';
        if (finalStaffId === 'POS-N') entityName = 'Normal POS';

        logAction(req.user?.id, req.user?.username, 'CREATE_TRANSACTION', `New transaction Rs.${totalAmount} for ${entityName} ${finalConsumerId || finalStaffId}`, req.user?.branchId);

        if (consumerId) {
            await cacheInvalidatePattern('consumers:*');
        } else {
            await cacheInvalidatePattern('staff:*');
        }

        // Invalidate dashboard stats so the next fetch gets real-time data
        await cacheInvalidatePattern('dashboard:*');
        await cacheInvalidatePattern('report:item_sales:*');

        // Emit real-time event
        emitEvent('transaction:created', { branchId, consumerId, staffId, totalAmount }, branchId);
        emitEvent('data:updated', { type: 'transaction' }, null); // null = broadcast to all so admin/Main Branch view also refreshes

        // Emit a global staff update so the Staff Manager re-fetches balances
        // regardless of which branch room the viewer is in.
        if (finalStaffId && finalStaffId !== 'POS-N') {
            emitEvent('data:updated', { type: 'staff' }, null);
        }

        const responseBody = { id: txnResult.rows[0].id };
        await setIdempotentResponse(idempotencyKey, responseBody);
        res.json(responseBody);
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Create transaction error', err);
        res.status(500).json({ error: 'Transaction failed' });
    } finally {
        client.release();
    }
};

const refundTransaction = async (req, res) => {
    const { txnId, refundMethod } = req.body;

    // Input validation
    if (!txnId || typeof txnId !== 'string' || txnId.trim() === '') {
        return res.status(400).json({ error: 'Invalid transaction ID' });
    }
    if (!refundMethod || typeof refundMethod !== 'string' || refundMethod.trim() === '') {
        return res.status(400).json({ error: 'Refund method is required' });
    }
    const sanitizedRefundMethod = refundMethod.trim().substring(0, 100);

    // IDEMPOTENCY: Return cached response for duplicate refund submissions
    const idempotencyKey = req.headers['idempotency-key'];
    if (idempotencyKey) {
        const cached = await getIdempotentResponse(idempotencyKey);
        if (cached) {
            // Conflict marker: same key is still in flight — never replay as
            // a successful refund.
            if (cached.__idempotencyConflict) {
                logger.warn('refundTransaction: idempotency conflict (original still in flight)', { key: idempotencyKey });
                return res.status(409).json({ error: 'Request already in progress' });
            }
            logger.info('refundTransaction: Returning idempotent cached response', { key: idempotencyKey });
            return res.json(cached);
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        // SECURITY FIX: Use SELECT FOR UPDATE to prevent race conditions
        // This locks the row until transaction commits, preventing concurrent refunds
        // ARCH-M3: Select only needed columns instead of SELECT * to avoid fetching large JSONB items field unnecessarily in the lock query.
        const txnRes = await client.query(
            'SELECT id, consumer_id, staff_id, total_amount, branch_id, status, date, refund_method, items FROM transactions WHERE id = $1 FOR UPDATE',
            [txnId]
        );
        if (txnRes.rows.length === 0) throw new Error('Transaction not found');
        const txn = txnRes.rows[0];

        // Enforce branch isolation
        const isAdmin = req.user.role?.toLowerCase() === ROLES.ADMIN;
        if (!isAdmin && txn.branch_id !== req.user.branchId) {
            // Track IDOR attempts per user in Redis with a 1-hour sliding window
            const idorKey = `idor_attempts:${req.user.id}`;
            const idorCount = await cacheIncr(idorKey, 3600);
            logger.warn(`IDOR Attempt: User ${req.user.username} tried to refund transaction ${txnId} from another branch (attempt ${idorCount})`);
            if (idorCount !== null && idorCount > 10) {
                // Escalate: write a SECURITY_ALERT audit entry and return 403 immediately
                logAction(
                    req.user.id,
                    req.user.username,
                    'SECURITY_ALERT',
                    `IDOR threshold exceeded: ${idorCount} cross-branch refund attempts in 1 hour`,
                    req.user.branchId
                );
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Access denied: repeated cross-branch access attempts detected' });
            }
            throw new Error('Access denied: Transaction belongs to another branch');
        }

        if (txn.status === 'REFUNDED') {
            await client.query('ROLLBACK');
            return res.json({ message: 'Already refunded' });
        }

        // H2: only COMPLETED transactions are refundable — blocks PENDING (e.g. awaiting
        // webhook confirmation) transactions from being refunded
        if (txn.status !== 'COMPLETED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Cannot refund transaction in ${txn.status} state` });
        }

        // Check if transaction is within 6 hours refund window
        const txnTime = new Date(txn.date).getTime();
        const now = Date.now();
        const sixHoursMs = 6 * 60 * 60 * 1000;
        if (now - txnTime > sixHoursMs) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Refund window expired. Transactions can only be refunded within 6 hours.' });
        }

        await client.query("UPDATE transactions SET status = 'REFUNDED', refund_method = $2 WHERE id = $1", [txnId, sanitizedRefundMethod]);

        // Resolve refund method type server-side — never trust client for balance decisions
        let resolvedMethodType = 'external'; // safe default: no balance credit
        if (sanitizedRefundMethod === 'Credit to Account') {
            resolvedMethodType = 'credit';
        } else {
            const pmRes = await client.query(
                'SELECT type FROM payment_methods WHERE LOWER(name) = LOWER($1) AND is_active = true LIMIT 1',
                [sanitizedRefundMethod]
            );
            if (pmRes.rows.length > 0) resolvedMethodType = pmRes.rows[0].type;
        }
        const shouldCreditBalance = resolvedMethodType === 'credit';
        let isSettlement = false;
        // Check if items is an array or string and has Balance Settlement
        let items = [];
        try { items = (typeof txn.items === 'string') ? JSON.parse(txn.items) : txn.items; } catch (e) { logger.warn('Failed to parse items in refund', { txnId, error: e.message }); }
        if (Array.isArray(items) && items.some(i => i.name && i.name.includes('Balance Settlement'))) {
            isSettlement = true;
        }

        if (isSettlement) {
            // Settlement added to balance, so refund should subtract
            if (txn.consumer_id) {
                const balRes = await client.query('UPDATE consumers SET current_balance = current_balance - $1 WHERE id = $2 RETURNING current_balance', [txn.total_amount, txn.consumer_id]);
                const afterBal = parseFloat(balRes.rows[0].current_balance);
                await logFinancialEntry({
                    entityType: 'CONSUMER',
                    entityId: txn.consumer_id.toString(),
                    amount: parseFloat(txn.total_amount),
                    type: 'DEBIT',
                    balanceBefore: afterBal + parseFloat(txn.total_amount),
                    balanceAfter: afterBal,
                    branchId: txn.branch_id,
                    referenceId: txnId,
                    reason: 'Settlement Refund'
                }, client);
            }
        } else if (shouldCreditBalance) {
            // Credit-type refund: add amount back to consumer/staff internal balance
            if (txn.consumer_id) {
                const balRes = await client.query('UPDATE consumers SET current_balance = current_balance + $1 WHERE id = $2 RETURNING current_balance', [txn.total_amount, txn.consumer_id]);
                const afterBal = parseFloat(balRes.rows[0].current_balance);
                await logFinancialEntry({
                    entityType: 'CONSUMER',
                    entityId: txn.consumer_id.toString(),
                    amount: parseFloat(txn.total_amount),
                    type: 'CREDIT',
                    balanceBefore: afterBal - parseFloat(txn.total_amount),
                    balanceAfter: afterBal,
                    branchId: txn.branch_id,
                    referenceId: txnId,
                    reason: `Refund via ${sanitizedRefundMethod}`
                }, client);
            } else if (txn.staff_id && txn.staff_id !== 'POS-N' && !txn.staff_id.startsWith('COUPON_')) {
                const balRes = await client.query('UPDATE staff SET current_balance = current_balance + $1 WHERE id = $2 RETURNING current_balance', [txn.total_amount, txn.staff_id]);
                const afterBal = parseFloat(balRes.rows[0].current_balance);
                await logFinancialEntry({
                    entityType: 'STAFF',
                    entityId: txn.staff_id,
                    amount: parseFloat(txn.total_amount),
                    type: 'CREDIT',
                    balanceBefore: afterBal - parseFloat(txn.total_amount),
                    balanceAfter: afterBal,
                    branchId: txn.branch_id,
                    referenceId: txnId,
                    reason: `Refund via ${sanitizedRefundMethod}`
                }, client);
            }
        } else {
            // Cash/digital refund: money returned physically, no internal balance change
            // Still log a ledger entry for audit trail
            const entityType = txn.consumer_id ? 'CONSUMER' : (txn.staff_id && txn.staff_id !== 'POS-N' && !txn.staff_id.startsWith('COUPON_') ? 'STAFF' : null);
            const entityId = txn.consumer_id ? txn.consumer_id.toString() : txn.staff_id;
            if (entityType && entityId) {
                const balRes = entityType === 'CONSUMER'
                    ? await client.query('SELECT current_balance FROM consumers WHERE id = $1', [txn.consumer_id])
                    : await client.query('SELECT current_balance FROM staff WHERE id = $1', [txn.staff_id]);
                const currentBal = balRes.rows[0] ? parseFloat(balRes.rows[0].current_balance) : 0;
                await logFinancialEntry({
                    entityType,
                    entityId,
                    amount: parseFloat(txn.total_amount),
                    type: 'REFUND',
                    balanceBefore: currentBal,
                    balanceAfter: currentBal,
                    branchId: txn.branch_id,
                    referenceId: txnId,
                    reason: `Refund via ${sanitizedRefundMethod} (no balance change)`
                }, client);
            }
        }

        await client.query('COMMIT');
        logAction(req.user?.id, req.user?.username, 'REFUND_TRANSACTION', `Refunded transaction ${txnId} for Rs.${txn.total_amount} via ${sanitizedRefundMethod}`, req.user?.branchId);

        if (txn.consumer_id) {
            await cacheInvalidatePattern('consumers:*');
        } else {
            await cacheInvalidatePattern('staff:*');
        }
        await cacheInvalidatePattern('dashboard:*');
        await cacheInvalidatePattern('report:item_sales:*');
        emitEvent('data:updated', { type: 'transaction' }, null);
        emitEvent('transaction:refunded', { id: txnId }, req.user?.branchId);
        if (!txn.consumer_id) {
            emitEvent('data:updated', { type: 'staff' }, null);
        }

        const refundResponse = { success: true };
        await setIdempotentResponse(idempotencyKey, refundResponse);
        res.json(refundResponse);
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Refund transaction error', err);
        res.status(500).json({ error: 'Refund failed' });
    } finally {
        client.release();
    }
};

const deleteTransaction = async (req, res) => {
    const { txnId } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        // SECURITY FIX: Use SELECT FOR UPDATE to prevent race conditions
        // ARCH-M3: Select only needed columns instead of SELECT * to avoid fetching large JSONB unnecessarily.
        const txnRes = await client.query(
            'SELECT id, consumer_id, staff_id, total_amount, branch_id, status, items FROM transactions WHERE id = $1 FOR UPDATE',
            [txnId]
        );
        if (txnRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Transaction not found' });
        }
        const txn = txnRes.rows[0];

        // Enforce branch isolation
        const isAdmin = req.user.role?.toLowerCase() === ROLES.ADMIN;
        if (!isAdmin && txn.branch_id !== req.user.branchId) {
            logger.warn(`IDOR Attempt: User ${req.user.username} tried to delete transaction ${txnId} from another branch`);
            throw new Error('Access denied: Transaction belongs to another branch');
        }

        if (txn.status !== 'REFUNDED') {
            let isSettlement = false;
            let items = [];
            try { items = (typeof txn.items === 'string') ? JSON.parse(txn.items) : txn.items; } catch (e) { logger.warn('Failed to parse items in delete', { txnId, error: e.message }); }
            if (Array.isArray(items) && items.some(i => i.name && i.name.includes('Balance Settlement'))) {
                isSettlement = true;
            }

            if (isSettlement) {
                // Settlement added to balance, so delete should subtract
                if (txn.consumer_id) {
                    const balRes = await client.query('UPDATE consumers SET current_balance = current_balance - $1 WHERE id = $2 RETURNING current_balance', [txn.total_amount, txn.consumer_id]);
                    const afterBal = parseFloat(balRes.rows[0].current_balance);
                    await logFinancialEntry({
                        entityType: 'CONSUMER',
                        entityId: txn.consumer_id.toString(),
                        amount: parseFloat(txn.total_amount),
                        type: 'DEBIT',
                        balanceBefore: afterBal + parseFloat(txn.total_amount),
                        balanceAfter: afterBal,
                        branchId: txn.branch_id,
                        referenceId: txnId,
                        reason: 'Settlement Deleted'
                    }, client);
                }
            } else {
                // Purchase reduced balance, so delete should add back
                if (txn.consumer_id) {
                    const balRes = await client.query('UPDATE consumers SET current_balance = current_balance + $1 WHERE id = $2 RETURNING current_balance', [txn.total_amount, txn.consumer_id]);
                    const afterBal = parseFloat(balRes.rows[0].current_balance);
                    await logFinancialEntry({
                        entityType: 'CONSUMER',
                        entityId: txn.consumer_id.toString(),
                        amount: parseFloat(txn.total_amount),
                        type: 'CREDIT',
                        balanceBefore: afterBal - parseFloat(txn.total_amount),
                        balanceAfter: afterBal,
                        branchId: txn.branch_id,
                        referenceId: txnId,
                        reason: 'Transaction Deleted'
                    }, client);
                } else if (txn.staff_id && !txn.staff_id.startsWith('COUPON_')) {
                    const balRes = await client.query('UPDATE staff SET current_balance = current_balance + $1 WHERE id = $2 RETURNING current_balance', [txn.total_amount, txn.staff_id]);
                    const afterBal = parseFloat(balRes.rows[0].current_balance);
                    await logFinancialEntry({
                        entityType: 'STAFF',
                        entityId: txn.staff_id,
                        amount: parseFloat(txn.total_amount),
                        type: 'CREDIT',
                        balanceBefore: afterBal - parseFloat(txn.total_amount),
                        balanceAfter: afterBal,
                        branchId: txn.branch_id,
                        referenceId: txnId,
                        reason: 'Transaction Deleted'
                    }, client);
                }
            }
        }

        await client.query('DELETE FROM transactions WHERE id = $1', [txnId]);
        await client.query('COMMIT');
        logAction(req.user?.id, req.user?.username, 'DELETE_TRANSACTION', `Deleted transaction ${txnId}`, req.user?.branchId);

        if (txn.consumer_id) {
            await cacheInvalidatePattern('consumers:*');
        } else {
            await cacheInvalidatePattern('staff:*');
        }
        await cacheInvalidatePattern('dashboard:*');
        await cacheInvalidatePattern('report:item_sales:*');
        emitEvent('data:updated', { type: 'transaction' }, null);
        emitEvent('transaction:deleted', { id: txnId }, req.user?.branchId);
        if (!txn.consumer_id) {
            emitEvent('data:updated', { type: 'staff' }, null);
        }

        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Delete transaction error', err);
        res.status(500).json({ error: 'Delete failed' });
    } finally {
        client.release();
    }
};

const changeStaff = async (req, res) => {
    const { txnId, newStaffId } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        // SECURITY FIX: Use SELECT FOR UPDATE to prevent race conditions
        // ARCH-M3: Select only needed columns instead of SELECT * to avoid fetching large JSONB unnecessarily.
        const txnRes = await client.query(
            'SELECT id, consumer_id, staff_id, total_amount, branch_id, status FROM transactions WHERE id = $1 FOR UPDATE',
            [txnId]
        );
        if (txnRes.rows.length === 0) throw new Error('Transaction not found');
        const txn = txnRes.rows[0];

        // Enforce branch isolation
        const isAdmin = req.user.role?.toLowerCase() === ROLES.ADMIN;
        if (!isAdmin && txn.branch_id !== req.user.branchId) {
            logger.warn(`IDOR Attempt: User ${req.user.username} tried to change staff for transaction ${txnId} from another branch`);
            throw new Error('Access denied: Transaction belongs to another branch');
        }

        if (txn.status === 'REFUNDED') throw new Error('Cannot change staff of refunded transaction');
        if (txn.consumer_id) throw new Error('Cannot change staff of consumer transaction');

        const oldStaffId = txn.staff_id;
        if (oldStaffId == newStaffId) {
            await client.query('COMMIT');
            return res.json({ success: true });
        }

        if (oldStaffId && !oldStaffId.startsWith('COUPON_')) {
            const balRes = await client.query('UPDATE staff SET current_balance = current_balance + $1 WHERE id = $2 RETURNING current_balance', [txn.total_amount, oldStaffId]);
            const afterBal = parseFloat(balRes.rows[0].current_balance);
            await logFinancialEntry({
                entityType: 'STAFF',
                entityId: oldStaffId,
                amount: parseFloat(txn.total_amount),
                type: 'CREDIT',
                balanceBefore: afterBal - parseFloat(txn.total_amount),
                balanceAfter: afterBal,
                branchId: txn.branch_id,
                referenceId: txnId,
                reason: 'Staff Reassigned (Charge Removed)'
            }, client);
        }
        if (newStaffId && !newStaffId.startsWith('COUPON_')) {
            const balRes = await client.query('UPDATE staff SET current_balance = current_balance - $1 WHERE id = $2 RETURNING current_balance', [txn.total_amount, newStaffId]);
            const afterBal = parseFloat(balRes.rows[0].current_balance);
            await logFinancialEntry({
                entityType: 'STAFF',
                entityId: newStaffId,
                amount: parseFloat(txn.total_amount),
                type: 'DEBIT',
                balanceBefore: afterBal + parseFloat(txn.total_amount),
                balanceAfter: afterBal,
                branchId: txn.branch_id,
                referenceId: txnId,
                reason: 'Staff Reassigned (Charge Applied)'
            }, client);
        }

        await client.query('UPDATE transactions SET staff_id = $1 WHERE id = $2', [newStaffId, txnId]);
        await client.query('COMMIT');
        logAction(req.user?.id, req.user?.username, 'CHANGE_TXN_STAFF', `Changed staff for txn ${txnId} from ${oldStaffId} to ${newStaffId}`, req.user?.branchId);
        await cacheInvalidatePattern('staff:*');
        await cacheInvalidatePattern('report:item_sales:*');
        await cacheInvalidatePattern('dashboard:*');
        emitEvent('data:updated', { type: 'transaction' }, null);
        emitEvent('data:updated', { type: 'staff' }, null);
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Change staff error', err);
        res.status(500).json({ error: 'Change staff failed' });
    } finally {
        client.release();
    }
};
module.exports = { createTransaction, refundTransaction, deleteTransaction, changeStaff };
