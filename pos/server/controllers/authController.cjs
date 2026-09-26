const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db.cjs');
const { logAction } = require('../utils/actions.cjs');
const logger = require('../utils/logger.cjs');
const { passwordSchema } = require('../middleware/validation.cjs');
const { cacheGet, cacheSet, cacheDel } = require('../redis.cjs');

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

// Token lifetimes (audit #15): env-driven with safe defaults.
// Configure via .env: JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN
// (values use jsonwebtoken/ms format: '15m', '7d', '30d', ...)
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// DB stores SHA-256 hash of refresh tokens, not the raw token (security_hardening_refresh_tokens migration)
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Once any user exists, setup is permanently done — cache forever
let _setupDone = false;

// SECURITY: Validate that refresh token secret is different from access token secret
if (!REFRESH_TOKEN_SECRET) {
    throw new Error('FATAL: REFRESH_TOKEN_SECRET must be set in environment variables');
}

if (JWT_SECRET === REFRESH_TOKEN_SECRET) {
    throw new Error('FATAL: JWT_SECRET and REFRESH_TOKEN_SECRET must be different for security');
}

// Helper
const generateTokens = (user, permissions) => {
    const payload = {
        id: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branch_id,
        permissions
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refreshToken = jwt.sign({ id: user.id }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

    return { accessToken, refreshToken };
};


// SEC-M3: Failed-login counter key helpers (TTL = 15 minutes)
const LOGIN_FAIL_TTL = 15 * 60; // seconds
const MAX_LOGIN_ATTEMPTS = 5;
const loginFailKey = (username) => `login:fails:${username}`;
const loginLockKey = (username) => `login:locked:${username}`;

const login = async (req, res) => {
    const { username, password } = req.body;
    try {
        // SEC-M3: Check for account lockout before doing any DB work
        const isLocked = await cacheGet(loginLockKey(username));
        if (isLocked) {
            logger.warn(`Login blocked — account locked: ${username}`);
            return res.status(429).json({ error: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.' });
        }

        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            logAction(null, username, 'LOGIN_FAILED', 'Invalid username', null);
            // SEC-M3: Count failed attempts even for unknown usernames (prevents user enumeration timing difference)
            const fails = ((await cacheGet(loginFailKey(username))) || 0) + 1;
            await cacheSet(loginFailKey(username), fails, LOGIN_FAIL_TTL);
            if (fails >= MAX_LOGIN_ATTEMPTS) {
                await cacheSet(loginLockKey(username), true, LOGIN_FAIL_TTL);
                logger.warn(`Account locked after ${fails} failed attempts: ${username}`);
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const [validPassword, roleRes] = await Promise.all([
            bcrypt.compare(password, user.password_hash),
            pool.query('SELECT permissions FROM roles WHERE name = $1', [user.role])
        ]);
        if (!validPassword) {
            logAction(user.id, user.username, 'LOGIN_FAILED', 'Invalid password', user.branch_id);
            // SEC-M3: Increment failed login counter
            const fails = ((await cacheGet(loginFailKey(username))) || 0) + 1;
            await cacheSet(loginFailKey(username), fails, LOGIN_FAIL_TTL);
            if (fails >= MAX_LOGIN_ATTEMPTS) {
                await cacheSet(loginLockKey(username), true, LOGIN_FAIL_TTL);
                logger.warn(`Account locked after ${fails} failed attempts: ${username}`);
                return res.status(429).json({ error: 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.' });
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (user.is_active === false) {
            logAction(user.id, user.username, 'LOGIN_FAILED', 'Account disabled', user.branch_id);
            return res.status(403).json({ error: 'This account has been disabled. Contact an administrator.' });
        }

        const permissions = roleRes.rows.length > 0 ? roleRes.rows[0].permissions : [];

        const { accessToken, refreshToken } = generateTokens(user, permissions);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [user.id, hashToken(refreshToken), expiresAt]);

        // SEC-M3: Clear failed-attempt counters on successful login
        await Promise.allSettled([
            cacheDel(loginFailKey(username)),
            cacheDel(loginLockKey(username)),
        ]);

        logAction(user.id, user.username, 'LOGIN', 'User logged in successfully', user.branch_id);

        // SECURITY FIX: Simplified cookie security - trust proxy configuration
        // Nginx handles HTTPS termination and sets X-Forwarded-Proto
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction, // Trust that production always uses HTTPS
            sameSite: isProduction ? 'strict' : 'lax',
        };

        // Generate CSRF Token pair (Double Submit Cookie)
        const csrfSecret = crypto.randomBytes(32).toString('hex');
        const csrfToken = crypto.createHmac('sha256', JWT_SECRET).update(csrfSecret).digest('hex');

        // Set Access Token Cookie (15m)
        res.cookie('token', accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000 // 15 minutes
        });

        // Set Refresh Token Cookie (7d)
        res.cookie('refreshToken', refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Set CSRF Secret in HttpOnly cookie
        res.cookie('_csrf_secret', csrfSecret, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000 // Tied to access token lifespan
        });

        res.json({
            user: { id: user.id, username: user.username, role: user.role, branchId: user.branch_id, permissions },
            branchId: user.branch_id,
            csrfToken // Send public hash to client to be attached as x-csrf-token header
        });
    } catch (err) {
        logger.error('Login error', err);
        res.status(500).json({ error: 'Server error' });
    }
};

const refresh = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    try {
        // 1. Verify JWT signature synchronously — no I/O, fast rejection of tampered tokens.
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
        } catch (err) {
            return res.status(403).json({ error: 'Invalid refresh token' });
        }

        // 2. Atomically consume the token. This is the sole race-condition gate:
        //    only one concurrent request can successfully DELETE a given token row.
        //    Including expires_at > NOW() here eliminates the separate SELECT check.
        const deleteRes = await pool.query(
            'DELETE FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW() RETURNING id',
            [hashToken(refreshToken)]
        );
        if (deleteRes.rows.length === 0) {
            return res.status(403).json({ error: 'Refresh token invalid, expired, or already used' });
        }

        // 3. Fetch user and role (token is already consumed — no rollback needed on failure,
        //    the client will be asked to log in again which is the safe degradation).
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        const user = userRes.rows[0];

        const roleRes = await pool.query('SELECT permissions FROM roles WHERE name = $1', [user.role]);
        const permissions = roleRes.rows.length > 0 ? roleRes.rows[0].permissions : [];

        // 4. Issue new token pair and store the new refresh token.
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user, permissions);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, hashToken(newRefreshToken), expiresAt]
        );

        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax'
        };

        const csrfSecret = crypto.randomBytes(32).toString('hex');
        const csrfToken = crypto.createHmac('sha256', JWT_SECRET).update(csrfSecret).digest('hex');

        res.cookie('token', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.cookie('refreshToken', newRefreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.cookie('_csrf_secret', csrfSecret, { ...cookieOptions, maxAge: 15 * 60 * 1000 });

        res.json({
            success: true,
            csrfToken,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                branchId: user.branch_id,
                permissions
            }
        });
    } catch (err) {
        logger.error('Refresh token error', err);
        if (!res.headersSent) res.status(500).json({ error: 'Server error' });
    }
};

const logout = async (req, res) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (refreshToken) {
        try {
            await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)]);
        } catch (err) {
            logger.error('Logout error', err);
        }
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/'
    };

    // Clear cookies
    res.clearCookie('token', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('_csrf_secret', cookieOptions);

    res.json({ success: true });
};

const verify = (req, res) => {
    // Read token from cookies, fallback to Authorization header
    const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];

    if (!token) return res.status(401).json({ valid: false });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            logger.warn('Verify failed -> JWT Verification Error');
            return res.status(403).json({ valid: false });
        }

        // JWT payload already contains all user info — no DB queries needed.
        // Tokens expire in 15m; stale role/permission changes take effect on next refresh.
        const user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            branchId: decoded.branchId,
            permissions: decoded.permissions
        };

        // Reissue a fresh CSRF token pair so the in-memory client variable is
        // restored after every page reload (in-memory storage is wiped on reload).
        const isProduction = process.env.NODE_ENV === 'production';
        const csrfSecret = crypto.randomBytes(32).toString('hex');
        const csrfToken = crypto.createHmac('sha256', JWT_SECRET).update(csrfSecret).digest('hex');
        res.cookie('_csrf_secret', csrfSecret, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax',
            maxAge: 15 * 60 * 1000
        });

        res.json({ valid: true, user, csrfToken });
    });
};

const changePassword = async (req, res) => {
    const { id, username, branch_id } = req.user;
    const { currentPassword, newPassword } = req.body;

    try {
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        const user = userRes.rows[0];

        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Current password is incorrect' });

        const pwCheck = passwordSchema.safeParse(newPassword);
        if (!pwCheck.success) {
            return res.status(400).json({ error: pwCheck.error.errors[0].message });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, id]);

        // Revoke all existing sessions (refresh tokens) for security
        await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);

        logAction(id, username, 'CHANGE_PASSWORD', 'User changed their password and their previous sessions were revoked', branch_id);
        
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax',
            path: '/'
        };

        // SECURITY: Clear cookies to force re-login after password change
        res.clearCookie('token', cookieOptions);
        res.clearCookie('refreshToken', cookieOptions);
        res.clearCookie('_csrf_secret', cookieOptions);

        res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
    } catch (dbErr) {
        logger.error('Change password error', dbErr);
        res.status(500).json({ error: 'Database error' });
    }
};

const getSetupStatus = async (req, res) => {
    if (_setupDone) return res.json({ needsSetup: false });
    try {
        const result = await pool.query('SELECT EXISTS(SELECT 1 FROM users LIMIT 1)');
        const exists = result.rows[0].exists;
        if (exists) _setupDone = true;
        res.json({ needsSetup: !exists });
    } catch (err) {
        logger.error('Get setup status error', err);
        res.status(500).json({ error: 'Server error' });
    }
};

const setupFirstAdmin = async (req, res) => {
    const { username, password } = req.body;
    try {
        const countRes = await pool.query('SELECT COUNT(*) FROM users');
        if (parseInt(countRes.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Setup already completed' });
        }

        // Define wildcard permission for Admin for total access
        const fullPermissions = ['*'];

        // Ensure Admin role exists
        await pool.query(
            "INSERT INTO roles (name, permissions) VALUES ('Admin', $1) ON CONFLICT (name) DO UPDATE SET permissions = $1",
            [JSON.stringify(fullPermissions)]
        );

        // Ensure Main Branch exists and use it as the anchor for the first admin
        let branchId;
        const mainBranchRes = await pool.query("SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1");

        if (mainBranchRes.rows.length === 0) {
            const newBranch = await pool.query(
                "INSERT INTO branches (name, address) VALUES ('Main Branch', 'System Management Branch') RETURNING id"
            );
            branchId = newBranch.rows[0].id;
        } else {
            branchId = mainBranchRes.rows[0].id;
        }

        const pwCheck = passwordSchema.safeParse(password);
        if (!pwCheck.success) {
            return res.status(400).json({ error: pwCheck.error.errors[0].message });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const userRes = await pool.query(
            "INSERT INTO users (username, password_hash, role, branch_id) VALUES ($1, $2, 'Admin', $3) RETURNING id, username",
            [username, hashedPassword, branchId]
        );

        const newUser = userRes.rows[0];
        _setupDone = true;
        logAction(newUser.id, newUser.username, 'INITIAL_SETUP', 'First admin user created during setup and linked to Main Branch', branchId);

        res.json({ success: true, message: 'Admin account created successfully' });
    } catch (err) {
        logger.error('Setup first admin error', err);
        // Expose the real error message during setup — no auth exists yet so it's safe,
        // and it's critical for diagnosing fresh-install failures.
        res.status(500).json({ error: err.message || 'Server error' });
    }
};

module.exports = {
    login,
    refresh,
    logout,
    verify,
    changePassword,
    getSetupStatus,
    setupFirstAdmin,
    logAction
};
