// CSRF Token Generation Endpoint (extracted from index.cjs — audit item #13)
// Must be mounted BEFORE the csrfProtection middleware.
const express = require('express');
const crypto = require('crypto');

const router = express.Router();

router.get('/api/public/csrf-token', (req, res) => {
    // BUGFIX: reuse the live _csrf_secret cookie when present instead of
    // rotating it. Rotation invalidates every previously issued header token
    // in the browser (other tabs, in-memory closures), producing random 403s
    // on the next mutating request. Re-deriving the token from the existing
    // secret keeps all tabs consistent; the 24h maxAge below still refreshes
    // the cookie window on each call.
    const existingSecret = req.cookies?.['_csrf_secret'];
    const csrfSecret = existingSecret || crypto.randomBytes(32).toString('hex');

    // Create the token by hashing the secret with JWT_SECRET
    const csrfToken = crypto.createHmac('sha256', process.env.JWT_SECRET).update(csrfSecret).digest('hex');

    // Set the secret as an HttpOnly cookie (prevents XSS access)
    res.cookie('_csrf_secret', csrfSecret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Only HTTPS in production
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Return the token to the client (they'll send this in x-csrf-token header)
    res.json({ csrfToken });
});

module.exports = router;
