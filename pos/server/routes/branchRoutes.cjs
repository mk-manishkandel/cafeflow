const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

router.get('/', branchController.getBranches); // All authenticated users need the branch list (BranchContext)
router.post('/', checkPermission('MANAGE_BRANCHES'), branchController.createBranch);
router.put('/:id', checkPermission('MANAGE_BRANCHES'), branchController.updateBranch);
router.delete('/:id', checkPermission('MANAGE_BRANCHES'), branchController.deleteBranch);

module.exports = router;
