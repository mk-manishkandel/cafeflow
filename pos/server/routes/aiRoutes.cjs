const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');
const { configLimiter } = require('../middleware/rateLimit.cjs');

router.post('/generate', configLimiter, checkPermission('AI_ACCESS'), aiController.generateCategory);

module.exports = router;
