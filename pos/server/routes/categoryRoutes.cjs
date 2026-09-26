const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

router.get('/', checkPermission('MENU_VIEW'), menuController.getCategories);
router.post('/', checkPermission('MENU_MANAGE_CATEGORIES'), menuController.createCategory);
router.delete('/:id', checkPermission('MENU_MANAGE_CATEGORIES'), menuController.deleteCategory);

module.exports = router;
