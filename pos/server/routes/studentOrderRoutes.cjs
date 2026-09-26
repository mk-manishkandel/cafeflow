const express = require('express');
const router = express.Router();
const { checkPermission } = require('../middleware/auth.cjs');
const studentOrderController = require('../controllers/studentOrderController.cjs');

// GET /api/student-orders/:orderId — cashier looks up an order before loading
router.get('/:orderId', checkPermission('ACCESS_POS'), studentOrderController.getStudentOrderForPOS);

// POST /api/student-orders/:orderId/load — cashier confirms order loaded into cart
router.post('/:orderId/load', checkPermission('ACCESS_POS'), studentOrderController.markStudentOrderLoaded);

// POST /api/student-orders/:orderId/complete — marks order completed after POS checkout
router.post('/:orderId/complete', checkPermission('ACCESS_POS'), studentOrderController.markStudentOrderCompleted);

module.exports = router;
