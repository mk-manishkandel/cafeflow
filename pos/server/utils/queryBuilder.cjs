const { ROLES } = require('./roleHierarchy.cjs');
/**
 * Builds the WHERE clause and parameters for transaction queries.
 */
function buildTransactionFilters(query, user) {
    const { staffId, consumerId, branchId, startDate, endDate, status, search, userType, reportType } = query;
    const conditions = [];
    const params = [];

    const addCondition = (cond, val) => {
        params.push(val);
        conditions.push(cond.replace('?', `$${params.length}`));
    };

    if (branchId) {
        addCondition('t.branch_id = ?::uuid', branchId);
    } else if (user?.role?.toLowerCase() !== ROLES.ADMIN && user?.branchId) {
        addCondition('t.branch_id = ?::uuid', user.branchId);
    }

    // SECURITY FIX: Use session-level timezone instead of query-level interpolation
    // Timezone is set per connection in db.cjs (pool.on('connect')), so we use timestamptz directly
    // This eliminates SQL injection risk from string interpolation

    if (startDate) {
        params.push(startDate);
        // Use timestamptz - timezone already set at connection level
        conditions.push(`t.date >= $${params.length}::timestamptz`);
    }
    if (endDate) {
        params.push(endDate);
        // Add 1 day to endDate for inclusive range
        conditions.push(`t.date < ($${params.length}::date + INTERVAL '1 day')::timestamptz`);
    }
    if (status) {
        addCondition('t.status = ?', status);
    }
    if (staffId) {
        addCondition('t.staff_id = ?', staffId);
    }
    if (consumerId) {
        addCondition('t.consumer_id = ?', consumerId);
    }

    if (reportType === 'consumption') {
        conditions.push(`t.status != 'REFUNDED'`);
        conditions.push(`(t.order_source != 'SETTLEMENT' AND t.items::text NOT ILIKE '%Balance Settlement%')`);
    }

    if (userType && userType !== 'all') {
        const types = userType.split(',');
        const typeConditions = [];
        if (types.includes('staff')) {
            // Exclude POS-N and historical COUPON_/TABLE_ORDER rows (removed features) from staff
            typeConditions.push(`(t.consumer_id IS NULL AND t.staff_id != 'POS-N' AND t.staff_id NOT LIKE 'COUPON_%' AND t.staff_id != 'TABLE_ORDER')`);
        }
        if (types.includes('consumer')) {
            typeConditions.push(`(t.consumer_id IS NOT NULL)`);
        }
        if (types.includes('pos-n')) {
            typeConditions.push(`(t.staff_id = 'POS-N')`);
        }
        if (typeConditions.length > 0) {
            conditions.push(`(${typeConditions.join(' OR ')})`);
        }
    }

    if (reportType === 'item_sales') {
        conditions.push(`t.status != 'REFUNDED'`);
        conditions.push(`item->>'name' NOT ILIKE '%Balance Settlement%'`);
    }

    if (search) {
        params.push(`%${search}%`);
        const i = params.length;
        conditions.push(`(
            t.id::text ILIKE $${i} OR 
            COALESCE(s.name, t.recipient_name) ILIKE $${i} OR 
            c.name ILIKE $${i} OR 
            t.items::text ILIKE $${i} OR
            t.staff_id ILIKE $${i}
        )`);
    }

    return {
        whereClause: conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '',
        params
    };
}

module.exports = {
    buildTransactionFilters
};
