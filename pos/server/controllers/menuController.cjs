const { ROLES } = require('../utils/roleHierarchy.cjs');
const crypto = require('crypto');
const { pool } = require('../config/db.cjs');
const { logAction } = require('../utils/actions.cjs');
const { cacheGet, cacheSet, cacheInvalidatePattern } = require('../redis.cjs');
const { emitEvent } = require('../socket.cjs');
const logger = require('../utils/logger.cjs');
const path = require('path');
const fs = require('fs');
const { generateReportBuffer } = require('../utils/reportGenerator.cjs');
const { toTitleCase } = require('../utils/text.cjs');

/**
 * Utility to delete an uploaded image if it's local.
 * Uses async fs.promises.unlink to avoid blocking the event loop.
 */
const deleteLocalImage = async (imageUrl) => {
    if (imageUrl && imageUrl.startsWith('/uploads/menu/')) {
        const filePath = path.join(__dirname, '../public', imageUrl);
        try {
            await fs.promises.unlink(filePath);
            logger.info(`Deleted old menu image: ${imageUrl}`);
        } catch (err) {
            // ENOENT means the file was already gone — not an error worth logging loudly
            if (err.code !== 'ENOENT') {
                logger.error(`Failed to delete local image: ${imageUrl}`, { error: err.message });
            }
        }
    }
};

const CACHE_TTL = {
    MENU: 300,
    CATEGORIES: 3600
};

const getMenu = async (req, res) => {
    let { branchId, sortBy, sortOrder, page, limit, search } = req.query;

    try {
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const userBranchId = req.user?.branchId;

        // Enforce branch isolation for non-admins
        if (!isAdmin && userBranchId) {
            if (branchId && branchId !== userBranchId) {
                logger.warn(`IDOR Attempt: User ${req.user.username} tried to access menu for branch ${branchId}`);
            }
            branchId = userBranchId;
        }

        const includeUnavailable = req.query.includeUnavailable === 'true';
        let baseQuery = `FROM menu WHERE is_deleted = false${includeUnavailable ? '' : ' AND available = true'}`;
        const params = [];
        const conditions = [];

        if (branchId) {
            params.push(branchId);
            conditions.push(`branch_id = $${params.length}::uuid`);
        }

        if (search) {
            params.push(`%${search}%`);
            conditions.push(`name ILIKE $${params.length}`);
        }

        if (conditions.length > 0) {
            baseQuery += ' AND ' + conditions.join(' AND ');
        }

        if (page) {
            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 200);
            const offset = (pageNum - 1) * limitNum;

            // Paginated Cache Key
            const cacheKey = `menu:paginated:${branchId || 'global'}:${pageNum}:${limitNum}:${search || 'none'}:${sortBy || 'default'}:${sortOrder || 'asc'}:${includeUnavailable}`;
            const cached = await cacheGet(cacheKey);
            if (cached) return res.json(cached);

            const countQuery = `SELECT COUNT(*) ${baseQuery}`;
            const countRes = await pool.query(countQuery, params);

            let sortClause = 'ORDER BY name ASC';
            const direction = (sortOrder && sortOrder.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';

            if (sortBy === 'price') sortClause = `ORDER BY price ${direction}`;
            else if (sortBy === 'category') sortClause = `ORDER BY category ${direction}`;
            else if (sortBy === 'name') sortClause = `ORDER BY name ${direction}`;
            else if (sortBy === 'available') sortClause = `ORDER BY available ${direction}, name ASC`;
            else sortClause = `ORDER BY name ${direction}`;

            const dataQuery = `SELECT * ${baseQuery} ${sortClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            const dataParams = [...params, limitNum, offset];

            const result = await pool.query(dataQuery, dataParams);

            const menu = result.rows.map(row => ({
                id: row.id.toString(),
                name: row.name,
                price: parseFloat(row.price),
                category: row.category,
                image: row.image,
                branchId: row.branch_id ? row.branch_id.toString() : null,
                isTodayMenu: row.is_today_menu,
                isSelfService: row.is_self_service,
                available: row.available
            }));

            const responseData = {
                data: menu,
                pagination: {
                    total: parseInt(countRes.rows[0].count),
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(parseInt(countRes.rows[0].count) / limitNum)
                }
            };

            await cacheSet(cacheKey, responseData, CACHE_TTL.MENU);
            return res.json(responseData);
        }

        // Legacy / No pagination (Cached)
        const cacheKey = `menu:${branchId || 'global'}:${sortBy || 'default'}:${includeUnavailable}`;
        const cached = await cacheGet(cacheKey);
        if (cached && !search) return res.json(cached); // Only use cache if no search (search results vary)

        let sortClause = 'ORDER BY name ASC'; // Default
        const fullQuery = `SELECT * ${baseQuery} ${sortClause}`;

        const result = await pool.query(fullQuery, params);
        const menu = result.rows.map(row => ({
            id: row.id.toString(),
            name: row.name,
            price: parseFloat(row.price),
            category: row.category,
            image: row.image,
            branchId: row.branch_id ? row.branch_id.toString() : null,
            isTodayMenu: row.is_today_menu,
            isSelfService: row.is_self_service,
            available: row.available
        }));

        if (!search) await cacheSet(cacheKey, menu, CACHE_TTL.MENU);
        res.json(menu);

    } catch (err) {
        logger.error('Get menu error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const createMenuItem = async (req, res) => {
    const { price, category, image, branchId } = req.body;
    const name = toTitleCase(req.body.name);
    try {
        // Enforce branch isolation: Use passed branchId only if Admin
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const targetBranchId = isAdmin ? (branchId || req.user?.branchId) : req.user?.branchId;

        if (!targetBranchId) {
            return res.status(400).json({ error: 'Branch ID is required for menu items' });
        }

        const isSelfService = req.body.isSelfService || false;
        const available = req.body.available !== false;

        const result = await pool.query(
            'INSERT INTO menu (id, name, price, category, image, branch_id, is_self_service, available) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [crypto.randomUUID(), name, price, category, image, targetBranchId, isSelfService, available]
        );
        const newItem = { ...result.rows[0], id: result.rows[0].id.toString() };

        logAction(req.user?.id, req.user?.username, 'CREATE_MENU_ITEM', `Created menu item ${name} (Rs.${price})`, targetBranchId);
        await cacheInvalidatePattern('menu:*');
        emitEvent('menu:updated', { action: 'create', item: newItem }, targetBranchId);
        emitEvent('data:updated', { type: 'menu' }, targetBranchId);
        res.json(newItem);
    } catch (err) {
        logger.error('Create menu item error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const updateTodaySelection = async (req, res) => {
    const { itemIds, isToday } = req.body;
    if (!Array.isArray(itemIds)) {
        return res.status(400).json({ error: 'Invalid input: itemIds must be an array' });
    }

    try {
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const userBranchId = req.user?.branchId;
        let query = 'UPDATE menu SET is_today_menu = $1 WHERE id::text = ANY($2)';
        const params = [isToday, itemIds];

        // Only apply branch filter when the user has a specific branch assigned.
        // Mirrors the same logic in getMenu — users with no branchId (e.g. managers)
        // can act across all branches, just like they can read across all branches.
        if (!isAdmin && userBranchId) {
            query += ' AND branch_id = $3';
            params.push(userBranchId);
        }

        const result = await pool.query(query, params);
        const todayAction = isToday ? 'Added' : 'Removed';
        logAction(req.user.id, req.user.username, 'UPDATE_TODAY_MENU', `${todayAction} ${result.rowCount} item(s) ${isToday ? 'to' : 'from'} today's menu`, userBranchId);
        await cacheInvalidatePattern('menu:*');
        // Broadcast to all clients — today-menu changes can span branches
        // (e.g. an admin on Main Branch updating items that belong to Branch A).
        // Scoping to userBranchId would leave other branches' POS instances stale.
        emitEvent('menu:updated', { action: 'today_selection', itemIds, isToday });
        emitEvent('data:updated', { type: 'menu' });
        res.json({ success: true, count: result.rowCount });
    } catch (err) {
        logger.error('Update today selection error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// Removed updateShopSelection as it is consolidated into Self-Service logic

const updateMenuItem = async (req, res) => {
    const { id } = req.params;
    const { price, category, image, branchId, updateAllBranches } = req.body;
    const name = toTitleCase(req.body.name);

    try {
        // Issue 12: Only admins may propagate changes across all branches
        if (updateAllBranches && req.user?.role?.toLowerCase() !== ROLES.ADMIN) {
            return res.status(403).json({ error: 'Forbidden: Only admins can update items across all branches.' });
        }

        if (updateAllBranches) {
            // Need the full item name since currentItem isn't predefined
            // Fetch current item details to preserve values not provided in req.body
            const nameCheck = await pool.query('SELECT name, is_self_service, available FROM menu WHERE id = $1', [id]);
            const item = nameCheck.rows[0];
            if (!item) return res.status(404).json({ error: 'Menu item not found' });

            const itemName = item.name;
            const finalIsSelfService = req.body.isSelfService !== undefined ? req.body.isSelfService : item.is_self_service;
            const finalAvailable = req.body.available !== undefined ? req.body.available : item.available;

            await pool.query('UPDATE menu SET name = $1, price = $2, category = $3, image = $4, is_self_service = $5, available = $6 WHERE name = $7',
                [name, price, category, image !== undefined ? image : item.image, finalIsSelfService, finalAvailable, itemName]);
            await cacheInvalidatePattern('menu:*');
            emitEvent('menu:updated', { action: 'update_all_branches', name }, req.user?.branchId);
            emitEvent('data:updated', { type: 'menu' }, req.user?.branchId);
            return res.json({ success: true, message: 'Updated across all branches' });
        } else {
            // Fetch current item details to preserve values not provided in req.body
            const currentItem = await pool.query('SELECT image, branch_id, is_self_service, available FROM menu WHERE id = $1', [id]);
            const item = currentItem.rows[0];

            if (!item) return res.status(404).json({ error: 'Menu item not found' });

            // Enforce branch isolation
            const isAdmin = req.user.role?.toLowerCase() === ROLES.ADMIN;
            if (!isAdmin && item.branch_id !== req.user.branchId) {
                logger.warn(`IDOR Attempt: User ${req.user.username} tried to update menu item ${id} from another branch`);
                return res.status(403).json({ error: 'Access denied: Menu item belongs to another branch' });
            }

            // Cleanup old image if it's local and being replaced
            const oldImage = item.image;
            if (oldImage && oldImage !== image && image !== undefined) {
                await deleteLocalImage(oldImage);
            }

            // Fallback to existing values if not provided
            const finalBranchId = (!isAdmin) ? item.branch_id : (branchId !== undefined ? branchId : item.branch_id);
            const finalIsSelfService = req.body.isSelfService !== undefined ? req.body.isSelfService : item.is_self_service;
            const finalAvailable = req.body.available !== undefined ? req.body.available : item.available;

            await pool.query('UPDATE menu SET name = $1, price = $2, category = $3, image = $4, branch_id = $5, is_self_service = $6, available = $7 WHERE id = $8',
                [name, price, category, image !== undefined ? image : item.image, finalBranchId, finalIsSelfService, finalAvailable, id]);

            logAction(req.user?.id, req.user?.username, 'UPDATE_MENU_ITEM', `Updated menu item ${name} (ID: ${id})`, finalBranchId || req.user?.branchId);
        }
        await cacheInvalidatePattern('menu:*');
        emitEvent('menu:updated', { action: 'update', itemId: id }, req.user?.branchId);
        emitEvent('data:updated', { type: 'menu' }, req.user?.branchId);
        res.json({ success: true });
    } catch (err) {
        logger.error('Update menu item error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const deleteMenuItem = async (req, res) => {
    const { id } = req.params;
    try {
        // Note: For soft delete, we typically keep the image. 
        // But the user requested automatic cleanup from the server.
        const itemRes = await pool.query('SELECT image, branch_id FROM menu WHERE id = $1', [id]);
        if (itemRes.rows.length === 0) return res.status(404).json({ error: 'Menu item not found' });
        const item = itemRes.rows[0];

        // Enforce branch isolation
        const isAdmin = req.user.role?.toLowerCase() === ROLES.ADMIN;
        if (!isAdmin && item.branch_id !== req.user.branchId) {
            logger.warn(`IDOR Attempt: User ${req.user.username} tried to delete menu item ${id} from another branch`);
            return res.status(403).json({ error: 'Access denied: Menu item belongs to another branch' });
        }

        if (item.image) {
            await deleteLocalImage(item.image);
        }

        await pool.query('UPDATE menu SET is_deleted = true WHERE id = $1', [id]);
        logAction(req.user?.id, req.user?.username, 'DELETE_MENU_ITEM', `Deleted menu item ID ${id}`, req.user?.branchId);
        await cacheInvalidatePattern('menu:*');
        emitEvent('menu:updated', { action: 'delete', itemId: id }, req.user?.branchId);
        emitEvent('data:updated', { type: 'menu' }, req.user?.branchId);
        res.json({ success: true });
    } catch (err) {
        logger.error('Delete menu item error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const BULK_IMPORT_MAX = 500;

const bulkImport = async (req, res) => {
    const { menuList, branchId } = req.body;
    if (!Array.isArray(menuList) || menuList.length === 0) return res.status(400).json({ error: 'No menu data provided' });
    if (menuList.length > BULK_IMPORT_MAX) return res.status(400).json({ error: `Bulk import limit is ${BULK_IMPORT_MAX} items per request` });

    const client = await pool.connect();
    let created = 0, updated = 0, errors = [];
    const importedItems = [];

    try {
        await client.query('BEGIN');
        let branchMap = {};
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;

        if (isAdmin) {
            const branchesRes = await client.query("SELECT id, name FROM branches WHERE is_active = true");
            branchesRes.rows.forEach(b => branchMap[b.name.toLowerCase()] = b.id);
        }

        // Ensure a unique constraint exists for ON CONFLICT to work
        // ALTER TABLE menu ADD CONSTRAINT menu_name_branch_unique UNIQUE (name, branch_id);

        for (const item of menuList) {
            const { price, category, image, branch, _line } = item;
            const name = toTitleCase(item.name);
            let targetBranchId = branchId;
            const lineRef = _line ? `Row ${_line}` : `Item '${name || 'unknown'}'`;

            if (!name || !name.trim() || price === undefined || isNaN(price) || !category || !category.trim()) {
                errors.push(`${lineRef}: Missing or invalid name/price/category`);
                continue;
            }

            const imageToUse = image && image.trim() ? image : '/Menu-Logo.png';

            if (isAdmin) {
                if (branch && branch.trim()) {
                    const bId = branchMap[branch.trim().toLowerCase()];
                    if (!bId) {
                        errors.push(`${lineRef}: Invalid branch '${branch}'`);
                        continue;
                    }
                    targetBranchId = bId;
                } else if (!targetBranchId) {
                    errors.push(`${lineRef}: Missing branch and no default branch provided`);
                    continue;
                }
            } else if (req.user?.branchId) {
                targetBranchId = req.user.branchId;
            } else {
                errors.push(`${lineRef}: No branch assigned to user`);
                continue;
            }

            // Optimized using ON CONFLICT (requires the unique constraint)
            const query = `
                INSERT INTO menu (id, name, price, category, image, branch_id, available)
                VALUES ($1, $2, $3, $4, $5, $6, true)
                ON CONFLICT (name, branch_id) DO UPDATE SET
                    price = EXCLUDED.price,
                    category = EXCLUDED.category,
                    image = EXCLUDED.image,
                    available = true
                RETURNING (xmax = 0) AS inserted;
            `;

            const qResult = await client.query(query, [crypto.randomUUID(), name, price, category, imageToUse, targetBranchId]);
            if (qResult.rows[0].inserted) created++;
            else updated++;
            importedItems.push({ name });
        }
        await client.query('COMMIT');
        await cacheInvalidatePattern('menu:*');
        emitEvent('menu:updated', { action: 'bulk_import', created, updated }, branchId || req.user?.branchId);
        emitEvent('data:updated', { type: 'menu' }, branchId || req.user?.branchId);
        logAction(req.user?.id, req.user?.username, 'BULK_IMPORT', `Imported menu items: ${created} created, ${updated} updated`, branchId || req.user?.branchId);
        for (const item of importedItems) {
            logAction(req.user?.id, req.user?.username, 'BULK_IMPORT_ITEM', `Imported: ${item.name}`, branchId || req.user?.branchId);
        }
        res.json({ success: true, created, updated, errors });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Menu bulk import error', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};

const getCategories = async (req, res) => {
    let { branchId } = req.query;
    if (req.user?.role?.toLowerCase() !== ROLES.ADMIN && req.user?.branchId) branchId = req.user.branchId;
    const cacheKey = `categories:${branchId || 'all'}`;

    try {
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        let query = 'SELECT * FROM categories';
        const params = [];
        if (branchId) { query += ' WHERE branch_id = $1::uuid'; params.push(branchId); }
        query += ' ORDER BY name';

        const result = await pool.query(query, params);
        await cacheSet(cacheKey, result.rows, CACHE_TTL.CATEGORIES);
        res.json(result.rows);
    } catch (err) {
        logger.error('Get categories error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const createCategory = async (req, res) => {
    let { id, name, branchId } = req.body;
    const userBranchId = req.user.branchId;
    const isAdmin = req.user.role?.toLowerCase() === ROLES.ADMIN;

    // Enforce branch isolation
    if (!isAdmin) {
        branchId = userBranchId;
    }

    if (!branchId) return res.status(400).json({ error: 'Branch ID is required' });

    try {
        await pool.query('INSERT INTO categories (id, name, branch_id) VALUES ($1, $2, $3)', [id, name, branchId]);
        await cacheInvalidatePattern('categories:*');
        // MenuManager listens to 'menu' type, and categories affect the menu view
        emitEvent('data:updated', { type: 'menu' }, branchId || req.user?.branchId);
        res.json({ success: true });
    } catch (err) {
        logger.error('Create category error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const deleteCategory = async (req, res) => {
    const { id } = req.params;
    const userBranchId = req.user.branchId;
    const isAdmin = req.user.role?.toLowerCase() === ROLES.ADMIN;

    try {
        // Enforce branch isolation
        const currentRes = await pool.query('SELECT branch_id FROM categories WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) return res.json({ success: true });
        const currentCat = currentRes.rows[0];

        if (!isAdmin && currentCat.branch_id !== userBranchId) {
            logger.warn(`IDOR Attempt: User ${req.user.username} tried to delete category ${id} from another branch`);
            return res.status(403).json({ error: 'Access denied: Category belongs to another branch' });
        }

        await pool.query('DELETE FROM categories WHERE id = $1', [id]);
        await cacheInvalidatePattern('categories:*');
        emitEvent('data:updated', { type: 'menu' }, req.user?.branchId);
        res.json({ success: true });
    } catch (err) {
        logger.error('Delete category error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const exportMenu = async (req, res) => {
    try {
        const { branchId: queryBranchId } = req.query;
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const userBranchId = req.user?.branchId;
        // Branch isolation: non-admins must always use their own branchId,
        // never a client-supplied value.
        const branchId = isAdmin ? (queryBranchId || userBranchId) : userBranchId;

        let query = `
            SELECT m.id, m.name, m.category, m.price, m.available, m.is_self_service, 
                   b.name as branch_name 
            FROM menu m 
            LEFT JOIN branches b ON m.branch_id = b.id 
            WHERE m.is_deleted = false
        `;
        const params = [];
        if (branchId) {
            params.push(branchId);
            query += ` AND m.branch_id = $1::uuid`;
        }
        query += ' ORDER BY m.category, m.name';

        const result = await pool.query(query, params);
        const data = result.rows.map(m => ({
            'ID': m.id,
            'Name': m.name,
            'Category': m.category,
            'Price (Rs)': parseFloat(m.price),
            'Available': m.available ? 'YES' : 'NO',
            'Self-Service': m.is_self_service ? 'YES' : 'NO',
            'Branch': m.branch_name || 'Global'
        }));

        const buffer = await generateReportBuffer('MENU_LIST', data, {
            username: req.user?.username,
            moduleName: 'Menu Item List'
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        logAction(req.user?.id, req.user?.username, 'EXPORT_MENU', `Exported Menu List`, req.user?.branchId);

        res.setHeader('Content-Disposition', `attachment; filename="menu_list_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        logger.error('Error exporting menu:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getMenu,
    createMenuItem,
    updateTodaySelection,
    updateMenuItem,
    deleteMenuItem,
    bulkImport,
    getCategories,
    createCategory,
    deleteCategory,
    exportMenu
};
