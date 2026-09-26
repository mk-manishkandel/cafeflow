const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController.cjs');
const { validate, schemas } = require('../middleware/validation.cjs');
const { authLimiter, refreshLimiter, logoutLimiter } = require('../middleware/rateLimit.cjs');
const rateLimit = require('express-rate-limit');

// SEC-H2: Strict rate limiter for setup-admin (5 attempts per 15 minutes per IP)
const setupAdminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: true },
    message: { error: 'Too many setup attempts, please try again later' }
});

router.post('/login', authLimiter, validate(schemas.login), authController.login);
// SEC-H1: Changed from GET to POST — refresh is a state-mutating operation
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', logoutLimiter, authController.logout);
router.get('/verify', authController.verify);
router.post('/change-password', authLimiter, validate(schemas.changePassword), authController.changePassword);

router.get('/setup-status', authController.getSetupStatus);
router.post('/setup-admin', setupAdminLimiter, authController.setupFirstAdmin);

module.exports = router;
