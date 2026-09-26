const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool } = require('../config/db.cjs');
const { logAction } = require('../utils/actions.cjs');
const { logFinancialEntry, logFinancialEntries } = require('../utils/ledger.cjs');
const { cacheGet, cacheSet, cacheInvalidatePattern, CACHE_TTL } = require('../redis.cjs');
const { emitEvent } = require('../socket.cjs');
const { getSafeTimezone } = require('../utils/timezone.cjs');
const { generateReportBuffer } = require('../utils/reportGenerator.cjs');
const { sendEmail, getEmailConfig } = require('../email.cjs');
const { getParsedTemplate } = require('./setupController.cjs');
const { replacePlaceholders } = require('../utils/template.cjs');
const { sendError } = require('../utils/errorResponse.cjs');
const logger = require('../utils/logger.cjs');


// Student ID and remarks only apply to the 'Student' category; any other category stores NULL.
// Returns { error } on invalid input, otherwise { studentId, remarks }.
const parseStudentFields = (category, studentId, remarks) => {
    if (category !== 'Student') return { studentId: null, remarks: null };
    const sid = String(studentId ?? '').trim();
    if (!sid) return { error: 'Student ID is required for students' };
    if (sid.length > 50) return { error: 'Student ID must be 50 characters or fewer' };
    const rmk = String(remarks ?? '').trim();
    return { studentId: sid, remarks: rmk || null };
};

const getConsumers = async (req, res) => {
    try {
        const { page, limit, search, sortBy, sortOrder, status } = req.query;

        if (page) {
            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 200);
            const offset = (pageNum - 1) * limitNum;
            const params = [];
            let conditions = [];

            // Granular Cache Key
            const statusKey = status ? status.toUpperCase() : 'ACTIVE';
            const cacheKey = `consumers:paginated:${search || 'none'}:${sortBy || 'default'}:${sortOrder || 'asc'}:${pageNum}:${limitNum}:${statusKey}`;
            const cached = await cacheGet(cacheKey);
            if (cached) return res.json(cached);

            // Filter by is_active: ALL = no filter, INACTIVE = false, default = active only
            if (!status || status.toUpperCase() !== 'ALL') {
                const isActive = !status || status.toUpperCase() === 'ACTIVE';
                params.push(isActive);
                conditions.push(`is_active = $${params.length}`);
            }

            if (search) {
                params.push(`%${search}%`);
                const i = params.length;
                conditions.push(`(
                    name ILIKE $${i} OR
                    email ILIKE $${i} OR
                    mobile_number ILIKE $${i} OR
                    category ILIKE $${i} OR
                    student_id ILIKE $${i}
                )`);
            }

            const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
            const countRes = await pool.query(`SELECT COUNT(*) FROM consumers${whereClause}`, params);

            let sortClause = 'ORDER BY id ASC';
            if (sortBy) {
                const direction = (sortOrder && sortOrder.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
                const sortMap = {
                    'name': 'name',
                    'email': 'email',
                    'category': 'category',
                    'monthlyAllowance': 'monthly_allowance',
                    'currentBalance': 'current_balance',
                    'spent': 'spent',
                    'payable': 'payable'
                };
                const dbCol = sortMap[sortBy];

                if (sortBy === 'spent') {
                    sortClause = `ORDER BY ((COALESCE(opening_balance, 0) + COALESCE(monthly_allowance, 0)) - current_balance) ${direction}`;
                } else if (sortBy === 'payable') {
                    sortClause = `ORDER BY CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END ${direction}`;
                } else if (dbCol) {
                    sortClause = `ORDER BY ${dbCol} ${direction}`;
                }
            }

            const query = `SELECT * FROM consumers${whereClause} ${sortClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            const finalParams = [...params, limitNum, offset];

            const result = await pool.query(query, finalParams);

            const consumerList = result.rows.map(row => {
                const monthlyAllowance = parseFloat(row.monthly_allowance || 0);
                const openingBalance = parseFloat(row.opening_balance || 0);
                const currentBalance = parseFloat(row.current_balance);
                const spent = (openingBalance || monthlyAllowance) - currentBalance;
                const payable = currentBalance < 0 ? Math.abs(currentBalance) : 0;
                return {
                    id: row.id.toString(),
                    name: row.name,
                    email: row.email,
                    mobileNumber: row.mobile_number,
                    category: row.category || 'Part-time',
                    studentId: row.student_id || null,
                    remarks: row.remarks || null,
                    branchId: row.branch_id || null,
                    monthlyAllowance,
                    openingBalance,
                    currentBalance,
                    spent,
                    payable,
                    avatar: row.avatar
                };
            });

            const responseData = {
                data: consumerList,
                pagination: {
                    total: parseInt(countRes.rows[0].count),
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(parseInt(countRes.rows[0].count) / limitNum)
                }
            };

            await cacheSet(cacheKey, responseData, CACHE_TTL.STAFF || 120);
            return res.json(responseData);
        }

        const cacheKey = 'consumers:all';
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        // DB-H8: add LIMIT guard to prevent unbounded full-table scan
        const result = await pool.query('SELECT * FROM consumers WHERE is_active = true ORDER BY id LIMIT 1000');
        const consumers = result.rows.map(row => {
            const monthlyAllowance = parseFloat(row.monthly_allowance || 0);
            const openingBalance = parseFloat(row.opening_balance || 0);
            const currentBalance = parseFloat(row.current_balance);
            const spent = (openingBalance || monthlyAllowance) - currentBalance;
            const payable = currentBalance < 0 ? Math.abs(currentBalance) : 0;

            return {
                id: row.id.toString(),
                name: row.name,
                email: row.email,
                mobileNumber: row.mobile_number,
                category: row.category || 'Part-time',
                studentId: row.student_id || null,
                remarks: row.remarks || null,
                branchId: row.branch_id || null,
                monthlyAllowance,
                openingBalance,
                currentBalance,
                spent,
                payable,
                avatar: row.avatar
            };
        });
        await cacheSet(cacheKey, consumers, CACHE_TTL.STAFF);
        res.json(consumers);
    } catch (err) {
        logger.error('Get consumers error', err);
        return sendError(res, 500, 'Internal server error');
    }
};

const createConsumer = async (req, res) => {
    const { name, email, mobileNumber, category, openingBalance, branchId: requestedBranchId } = req.body;
    // NOT NULL in Postgres does not reject empty strings — enforce non-blank here explicitly.
    if (!name || !String(name).trim() || !email || !String(email).trim()) {
        return sendError(res, 400, 'Name and email are required');
    }
    const student = parseStudentFields(category, req.body.studentId, req.body.remarks);
    if (student.error) return sendError(res, 400, student.error);
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
    // Branch isolation: non-admins (including API keys) always create within their own
    // branch, ignoring any client-supplied branchId. Admins may target any branch, or
    // omit branchId for a global (branch_id = NULL) record.
    const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
    const effectiveBranchId = isAdmin ? (requestedBranchId ?? null) : (req.user?.branchId ?? null);

    try {
        const result = await pool.query(
            'INSERT INTO consumers (name, email, mobile_number, category, opening_balance, current_balance, avatar, branch_id, student_id, remarks) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9) RETURNING *',
            [
                name,
                email,
                mobileNumber || null,
                category || 'Part-time',
                openingBalance || 0,
                avatar || null,
                effectiveBranchId,
                student.studentId,
                student.remarks
            ]
        );
        const row = result.rows[0];
        await cacheInvalidatePattern('consumers:*');
        res.json({
            id: row.id.toString(),
            name: row.name,
            email: row.email,
            mobileNumber: row.mobile_number,
            category: row.category,
            studentId: row.student_id,
            remarks: row.remarks,
            openingBalance: parseFloat(row.opening_balance),
            currentBalance: parseFloat(row.current_balance),
            avatar: row.avatar,
            branchId: row.branch_id
        });
        logAction(req.user?.id, req.user?.username, 'CREATE_CONSUMER', `Created consumer ${name} (${email})`, req.user?.branchId);
    } catch (err) {
        logger.error('Create consumer error', err);
        if (err.code === '23505') {
            return sendError(res, 400, 'Email already exists');
        }
        return sendError(res, 500, 'Internal server error');
    }
};

const updateConsumer = async (req, res) => {
    const { id } = req.params;
    const { name, email, mobileNumber, category, openingBalance } = req.body;
    if (!name || !String(name).trim() || !email || !String(email).trim()) {
        return sendError(res, 400, 'Name and email are required');
    }
    const student = parseStudentFields(category, req.body.studentId, req.body.remarks);
    if (student.error) return sendError(res, 400, student.error);

    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
    const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
    const actingBranchId = req.user?.branchId ?? null;

    try {
        let result;
        if (isAdmin) {
            result = await pool.query(
                'UPDATE consumers SET name = $1, email = $2, mobile_number = $3, category = $4, opening_balance = $5, avatar = $6, student_id = $7, remarks = $8 WHERE id = $9',
                [name, email, mobileNumber || null, category || 'Part-time', openingBalance ?? 0, avatar || null, student.studentId, student.remarks, id]
            );
        } else {
            // M-05: scope update to the acting user's branch — prevent cross-branch edits
            result = await pool.query(
                'UPDATE consumers SET name = $1, email = $2, mobile_number = $3, category = $4, opening_balance = $5, avatar = $6, student_id = $7, remarks = $8 WHERE id = $9 AND (branch_id = $10 OR branch_id IS NULL)',
                [name, email, mobileNumber || null, category || 'Part-time', openingBalance ?? 0, avatar || null, student.studentId, student.remarks, id, actingBranchId]
            );
        }
        if (result.rowCount === 0) return sendError(res, 404, 'Consumer not found');

        logAction(req.user?.id, req.user?.username, 'UPDATE_CONSUMER', `Updated consumer ${name} (ID: ${id})`, req.user?.branchId);
        await cacheInvalidatePattern('consumers:*');
        res.json({ success: true });
    } catch (err) {
        logger.error('Update consumer error', err);
        if (err.code === '23505') {
            return sendError(res, 400, 'Email already exists');
        }
        return sendError(res, 500, 'Internal server error');
    }
};

const deleteConsumer = async (req, res) => {
    const { id } = req.params;
    const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
    const actingBranchId = req.user?.branchId ?? null;
    try {
        // DB-C7: check balance before soft-deleting to protect financial history
        // M-05: scope lookup to acting user's branch for non-admins
        let selectQuery = 'SELECT current_balance FROM consumers WHERE id = $1 AND is_active IS NOT FALSE';
        const selectParams = [id];
        if (!isAdmin && actingBranchId) {
            selectQuery += ' AND (branch_id = $2 OR branch_id IS NULL)';
            selectParams.push(actingBranchId);
        }
        const consumer = await pool.query(selectQuery, selectParams);
        if (!consumer.rows.length) {
            return sendError(res, 404, 'Consumer not found');
        }
        if (parseFloat(consumer.rows[0].current_balance) !== 0) {
            return sendError(res, 400, 'Cannot delete consumer with non-zero balance');
        }
        // DB-C7: soft delete — preserves transaction history integrity
        await pool.query('UPDATE consumers SET is_active = false WHERE id = $1', [id]);
        logAction(req.user?.id, req.user?.username, 'DELETE_CONSUMER', `Soft-deleted consumer ID ${id}`, req.user?.branchId);
        await cacheInvalidatePattern('consumers:*');
        res.json({ success: true });
    } catch (err) {
        logger.error('Delete consumer error', err);
        return sendError(res, 500, 'Internal server error');
    }
};

const resetAllowances = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // RBAC-M6: scope the reset to the acting user's branch when branch_id is
        // populated on the consumers table (migration: add_consumers_branch_id.sql).
        // Admins (branchId === null) always reset globally — branch filter is skipped.
        // If branch_id column exists but hasn't been backfilled yet, we fall back to
        // global reset with a warning to avoid silently resetting zero consumers.
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const actingBranchId = req.user?.branchId ?? null;

        let branchFilter = '';
        const branchParams = [];

        if (!isAdmin && actingBranchId) {
            // Check backfill status: if the column is present but empty, warn and fall through
            const backfillCheck = await client.query(
                'SELECT COUNT(*) AS total, COUNT(branch_id) AS with_branch FROM consumers WHERE is_active = true'
            );
            const total = parseInt(backfillCheck.rows[0].total, 10);
            const withBranch = parseInt(backfillCheck.rows[0].with_branch, 10);

            if (total > 0 && withBranch === 0) {
                logger.warn(
                    `RBAC-M6 degraded mode: consumers.branch_id column exists but no rows are populated. ` +
                    `resetAllowances by user ${req.user?.username} (branch: ${actingBranchId}) ` +
                    `will reset ALL active consumers until backfill completes.`
                );
            } else {
                branchFilter = ' AND branch_id = $1';
                branchParams.push(actingBranchId);
            }
        } else if (!isAdmin) {
            logger.warn(`resetAllowances: non-admin user ${req.user?.username} (branch: ${req.user?.branchId}) performed global consumer reset — verify route guard`);
        }

        const currentConsumers = await client.query(
            `SELECT id, name, email, mobile_number, category, opening_balance, current_balance, avatar FROM consumers WHERE is_active = true${branchFilter}`,
            branchParams
        );

        await client.query(
            `UPDATE consumers SET current_balance = opening_balance WHERE is_active = true${branchFilter}`,
            branchParams
        );

        const ledgerEntries = [];
        for (const consumer of currentConsumers.rows) {
            const oldBalance = parseFloat(consumer.current_balance);
            const newBalance = parseFloat(consumer.opening_balance);
            if (oldBalance === newBalance) continue;
            ledgerEntries.push({
                entityType: 'CONSUMER',
                entityId: consumer.id.toString(),
                amount: Math.abs(newBalance - oldBalance),
                type: newBalance > oldBalance ? 'CREDIT' : 'DEBIT',
                balanceBefore: oldBalance,
                balanceAfter: newBalance,
                branchId: req.user?.branchId,
                reason: 'Monthly Allowance Reset'
            });
        }
        await logFinancialEntries(ledgerEntries, client);

        await client.query('COMMIT');
        await cacheInvalidatePattern('consumers:*');

        logAction(req.user?.id, req.user?.username, 'RESET_ALLOWANCES', `Reset allowances for ${currentConsumers.rows.length} consumers`, req.user?.branchId);

        // Build response from pre-UPDATE snapshot — after reset, currentBalance = openingBalance
        const consumers = currentConsumers.rows.map(row => ({
            id: row.id.toString(),
            name: row.name,
            email: row.email,
            mobileNumber: row.mobile_number,
            category: row.category,
            openingBalance: parseFloat(row.opening_balance),
            currentBalance: parseFloat(row.opening_balance),
            avatar: row.avatar
        }));

        // Notify System Admin
        const config = await getEmailConfig();
        if (config.systemAdminRecipient && config.host) {
            const template = await getParsedTemplate('email_template_consumer_reset');
            const data = {
                month: new Date().toLocaleString('en-US', { month: 'long' }),
                year: new Date().getFullYear(),
                username: req.user?.username || 'Unknown',
                totalConsumers: currentConsumers.rows.length,  // DB-C4: was `result.rows.length` (undefined variable)
                resetAmount: 'Dynamic',
                resetDate: new Date().toLocaleDateString(),
                date: new Date().toLocaleString('en-US', { timeZone: process.env.TZ || 'UTC' })
            };

            const subject = replacePlaceholders(template.subject, data);
            const html = replacePlaceholders(template.body, data);
            sendEmail(config.systemAdminRecipient, subject, html).catch(err => logger.error('Failed to send consumer reset allowances email', err));
        }

        res.json(consumers);
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Reset allowances error', err);
        return sendError(res, 500, 'Internal server error');
    } finally {
        client.release();
    }
};

const settleBalance = async (req, res) => {
    const { id } = req.params;
    const { paymentAmount, remarks, paymentMethod } = req.body;

    if (paymentAmount === undefined || isNaN(parseFloat(paymentAmount))) {
        return sendError(res, 400, 'Valid payment amount is required');
    }

    const amount = parseFloat(paymentAmount);
    if (amount <= 0 || amount > 999999999) {
        return sendError(res, 400, 'Payment amount must be between 0 and 999,999,999');
    }

    // Always derive branchId from the authenticated user — never trust client-supplied branchId
    // to prevent non-admin users from booking settlements against other branches.
    const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
    const actingBranchId = req.user?.branchId ?? null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // RBAC-M7: Non-admin users may only settle balances for consumers that
        // belong to their own branch. The branch_id column is added by migration
        // add_consumers_branch_id.sql (nullable during backfill transition).
        // When branch_id IS NULL on a consumer row (pre-backfill), the row is
        // accessible to any authenticated user — this is the safe fallback during
        // the migration window. Once backfill is complete and NOT NULL is enforced,
        // the guard becomes fully effective.
        let consumerQuery = 'SELECT name, current_balance, branch_id FROM consumers WHERE id = $1 AND is_active IS NOT FALSE';
        const consumerQueryParams = [id];

        if (!isAdmin && actingBranchId) {
            // Allow access if branch_id matches OR if branch_id is still NULL (legacy row)
            consumerQuery += ' AND (branch_id = $2 OR branch_id IS NULL)';
            consumerQueryParams.push(actingBranchId);
        }

        consumerQuery += ' FOR UPDATE';

        const consumerRes = await client.query(consumerQuery, consumerQueryParams);
        if (consumerRes.rows.length === 0) {
            throw new Error('Consumer not found');
        }

        const consumer = consumerRes.rows[0];
        const currentBalance = parseFloat(consumer.current_balance);
        const amountToPay = parseFloat(paymentAmount);

        const newBalance = currentBalance + amountToPay;
        // Admins may pass a branchId in the request body to record the settlement
        // at a specific branch. If none passed or invalid, fall back to consumer's branchId or acting user's branch.
        // Non-admin users are always scoped to their own branch.
        let targetBranchId = (isAdmin && req.body?.branchId) ? req.body.branchId : (req.user?.branchId || consumer.branch_id);

        if (!targetBranchId) {
            throw new Error('Please select an operational branch to record the settlement.');
        }

        const branchRes = await client.query('SELECT id, name FROM branches WHERE id = $1 AND is_active = true', [targetBranchId]);
        if (branchRes.rows.length === 0) {
            throw new Error('Specified branch does not exist or is inactive.');
        }
        if (branchRes.rows[0].name === 'Main Branch') {
            throw new Error('Settlements cannot be recorded at Global/Main Branch. Please select an operational branch.');
        }

        const balanceUpdateRes = await client.query('UPDATE consumers SET current_balance = $1 WHERE id = $2 RETURNING current_balance', [newBalance, id]);
        const confirmedBalance = parseFloat(balanceUpdateRes.rows[0].current_balance);

        const items = [{
            name: `Balance Settlement (${paymentMethod || 'CASH'})`,
            quantity: 1,
            price: amountToPay,
            remarks: remarks || "Manual Settlement"
        }];

        const txnSaveRes = await client.query(
            'INSERT INTO transactions (id, staff_id, consumer_id, total_amount, items, branch_id, recipient_name, status, payment_method, order_source, user_id) VALUES (gen_random_uuid(), NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
            [id, amountToPay, JSON.stringify(items), targetBranchId, consumer.name, 'COMPLETED', paymentMethod || 'CASH', 'SETTLEMENT', req.user?.id]
        );

        await logFinancialEntry({
            entityType: 'CONSUMER',
            entityId: id.toString(),
            amount: amountToPay,
            type: 'CREDIT',
            balanceBefore: currentBalance,
            balanceAfter: confirmedBalance,
            branchId: targetBranchId,
            referenceId: txnSaveRes.rows[0].id,
            reason: `Settlement via ${paymentMethod || 'CASH'}`
        }, client);

        await client.query('COMMIT');
        logAction(req.user?.id, req.user?.username, 'SETTLE_BALANCE', `Settled Rs.${amountToPay} for ${consumer.name} via ${paymentMethod || 'CASH'} at branch ${targetBranchId}. Remarks: ${remarks}`, targetBranchId);
        await cacheInvalidatePattern('consumers:*');
        await cacheInvalidatePattern('dashboard:*');
        await cacheInvalidatePattern('report:item_sales:*');

        emitEvent('consumer:updated', { consumerId: id, newBalance }, null);
        emitEvent('data:updated', { type: 'consumer' }, null);
        emitEvent('data:updated', { type: 'transaction' }, null);

        res.json({ success: true, message: 'Balance settled successfully', newBalance });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '40001') {
            // Serialization failure — concurrent modification detected
            return res.status(409).json({ error: 'Concurrent modification detected, please retry' });
        }
        logger.error('Settle balance error', err);
        return sendError(res, 500, 'Internal server error');
    } finally {
        client.release();
    }
};

const exportConsumers = async (req, res) => {
    try {
                const systemTz = getSafeTimezone();

        const result = await pool.query(`
            SELECT id, name, email, mobile_number, category, student_id, remarks,
                   COALESCE(opening_balance, 0) AS opening_balance,
                   COALESCE(monthly_allowance, 0) AS monthly_allowance,
                   COALESCE(current_balance, 0) AS current_balance,
                   created_at
            FROM consumers
            WHERE is_active IS NOT FALSE
            ORDER BY name DESC
        `);

        const data = result.rows.map(c => {
            const mallow = parseFloat(c.monthly_allowance || 0);
            const opbal = parseFloat(c.opening_balance || 0);
            const curbal = parseFloat(c.current_balance || 0);
            const spent = (opbal || mallow) - curbal;
            const payable = curbal < 0 ? Math.abs(curbal) : 0;
            return {
                'ID': c.id,
                'Name': c.name,
                'Email': c.email,
                'Mobile': c.mobile_number || '',
                'Type': c.category || 'Part-time',
                'Category': c.category || 'Part-time',
                'Student ID': c.student_id || '',
                'Remarks': c.remarks || '',
                'Monthly Allowance (Rs)': mallow,
                'Current Balance (Rs)': curbal,
                'Total Spent (Rs)': spent,
                'Account Payable (Rs)': payable,
                'Active Subscriptions': 0,
                'Joined Date': new Date(c.created_at).toLocaleDateString('en-US', { timeZone: systemTz })
            };
        });

        const buffer = await generateReportBuffer('CONSUMER_LIST', data, {
            username: req.user?.username,
            moduleName: 'Consumer Management'
        });

        logAction(req.user?.id, req.user?.username, 'EXPORT_CONSUMERS', `Exported Consumers List`, req.user?.branchId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="consumers_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        logger.error('Error exporting consumers:', err);
        return sendError(res, 500, 'Internal server error');
    }
};

module.exports = {
    getConsumers, createConsumer, updateConsumer, deleteConsumer,
    resetAllowances, settleBalance,
    exportConsumers
};
