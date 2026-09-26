const express = require('express');
const router = express.Router();
const { validate, schemas } = require('../middleware/validation.cjs');
const { studentOrderLimiter, publicMenuLimiter } = require('../middleware/rateLimit.cjs');
const rateLimit = require('express-rate-limit');

// Strict per-IP rate limiter for unauthenticated FnB self-service endpoints
const selfServiceLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

const publicMenuController = require('../controllers/publicMenuController.cjs');
const studentOrderController = require('../controllers/studentOrderController.cjs');
const logger = require('../utils/logger.cjs');

// SEC-M5: Shared-secret validation for the student app.
// The student app must send x-cafeflow-client: <STUDENT_CLIENT_SECRET> on every request.
// This filters naive scripts that send a correct Origin but not the shared secret.
const studentClientSecretGuard = (req, res, next) => {
    const secret = process.env.STUDENT_CLIENT_SECRET;
    if (!secret) {
        // Guard not configured — allow through so existing deployments aren't broken,
        // but emit a warning so ops teams are aware.
        logger.warn('[StudentOrder] STUDENT_CLIENT_SECRET not set — shared-secret guard is inactive');
        return next();
    }
    const header = req.headers['x-cafeflow-client'];
    if (!header || header !== secret) {
        logger.warn(`[StudentOrder] Blocked request — missing or invalid x-cafeflow-client header from ${req.ip}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Guard: only allow requests from STUDENT_ORDER_ALLOWED_ORIGIN.
// Reads the env var at request time so it picks up changes without a code deploy.
const studentOriginGuard = (req, res, next) => {
    const allowed = process.env.STUDENT_ORDER_ALLOWED_ORIGIN;
    if (!allowed) {
        // Guard not configured — deny by default to avoid accidental open access.
        logger.warn('[StudentOrder] STUDENT_ORDER_ALLOWED_ORIGIN not set — blocking request');
        return res.status(403).json({ error: 'Forbidden' });
    }

    const origin = req.headers.origin;
    if (!origin || origin !== allowed) {
        logger.warn(`[StudentOrder] Blocked request from origin "${origin ?? '(none)'}"`);
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};


// Public branch list (student ordering app)
router.get('/branches', publicMenuLimiter, publicMenuController.getPublicBranches);

// Student ordering routes — restricted to STUDENT_ORDER_ALLOWED_ORIGIN + shared-secret header.
// SEC-M5: Both guards are required: origin allowlist (anti-CSRF) and shared secret (anti-script).
router.get('/student-menu', studentOriginGuard, studentClientSecretGuard, publicMenuController.getStudentTodayMenu);
router.post('/student-orders', studentOriginGuard, studentClientSecretGuard, studentOrderLimiter, validate(schemas.studentOrder), studentOrderController.createStudentOrder);

// FnB Activity Logging (Public) — rate limited to prevent abuse
const selfServiceController = require('../controllers/selfServiceController.cjs');
router.post('/self-service/session', selfServiceLimiter, selfServiceController.createFnBSession);
router.post('/self-service/log', selfServiceLimiter, selfServiceController.logFnBActivity);

module.exports = router;

