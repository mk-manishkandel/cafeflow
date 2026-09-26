const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

router.get('/', checkPermission('MENU_VIEW'), menuController.getMenu);
router.post('/', checkPermission('MENU_ADD_ITEM'), menuController.createMenuItem);
router.post('/today-selection', checkPermission('MENU_EDIT_ITEM'), menuController.updateTodaySelection);
router.post('/bulk-import', checkPermission('MENU_BULK_IMPORT'), menuController.bulkImport);
router.put('/:id', checkPermission('MENU_EDIT_ITEM'), menuController.updateMenuItem);
router.delete('/:id', checkPermission('MENU_DELETE_ITEM'), menuController.deleteMenuItem);

// Categories
router.get('/categories', checkPermission('MENU_VIEW'), menuController.getCategories);
router.post('/categories', checkPermission('MENU_MANAGE_CATEGORIES'), menuController.createCategory);
router.delete('/categories/:id', checkPermission('MENU_MANAGE_CATEGORIES'), menuController.deleteCategory);
router.get('/export', checkPermission('MENU_VIEW'), menuController.exportMenu);

module.exports = router;
