const { ROLES } = require('./utils/roleHierarchy.cjs');
/**
 * Socket.IO Singleton Module
 * Provides a centralized way to emit WebSocket events from anywhere in the application.
 */
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger.cjs');
const { cacheSet } = require('./redis.cjs');
const pool = require('./config/db.cjs').pool;

const AUTH_CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds

let io = null;

/**
 * Initialize Socket.IO with the HTTP server
 * @param {http.Server} server - The HTTP server instance
 * @param {Object} corsOptions - CORS configuration
 */
const initSocket = async (server, corsOptions) => {
    io = new Server(server, {
        cors: corsOptions,
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // SEC-C1: Verify JWT at handshake time — reject unauthenticated connections.
    // JWT is stored in an httpOnly cookie ('token') so it cannot be read by JS.
    // The WebSocket upgrade is an HTTP request, so the browser sends cookies
    // automatically — parse the cookie here instead of requiring auth.token.
    io.use((socket, next) => {
        let token = socket.handshake.auth?.token;
        if (!token) {
            const rawCookie = socket.handshake.headers.cookie || '';
            const match = rawCookie.match(/(?:^|;\s*)token=([^;]+)/);
            token = match ? decodeURIComponent(match[1]) : null;
        }
        if (!token) return next(new Error('Unauthorized'));
        try {
            socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
            next();
        } catch { next(new Error('Unauthorized')); }
    });

    if (process.env.REDIS_URL) {
        try {
            const pubClient = createClient({ url: process.env.REDIS_URL });
            const subClient = pubClient.duplicate();
            pubClient.on('error', (err) => logger.error('[Socket.IO] Redis pubClient error', { message: err.message, code: err.code }));
            subClient.on('error', (err) => logger.error('[Socket.IO] Redis subClient error', { message: err.message, code: err.code }));
            await Promise.all([pubClient.connect(), subClient.connect()]);
            io.adapter(createAdapter(pubClient, subClient));
            logger.info('[Socket.IO] Redis adapter enabled for cluster mode');
        } catch (err) {
            logger.error('[Socket.IO] Redis adapter failed to connect', err);
        }
    }

    io.on('connection', (socket) => {
        logger.info(`[Socket.IO] Client connected: ${socket.id}`);

        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        // SEC-C1: Periodic re-validation — detect token expiry or role revocation mid-session
        const authCheckInterval = setInterval(async () => {
            try {
                const user = socket.data.user;
                if (!user) {
                    socket.emit('auth:revoked', { reason: 'no_user' });
                    socket.disconnect(true);
                    return;
                }

                // SEC-C1 periodic re-validation against the SOURCE OF TRUTH.
                // BUGFIX: previously a Redis cache miss (60s TTL expiry on an
                // idle terminal) or an expired short-lived access token was
                // treated as "session revoked" and disconnected healthy
                // sockets, causing reconnect storms. Revocation is instead
                // determined by DB state (user active + live refresh tokens),
                // which still catches logout, deactivation, deletion and
                // role changes.
                if (user.id) {
                    try {
                        const res = await pool.query(
                            `SELECT u.role,
                                    EXISTS(SELECT 1 FROM refresh_tokens rt
                                           WHERE rt.user_id = u.id AND rt.expires_at > NOW()) AS has_session
                             FROM users u WHERE u.id = $1`,
                            [user.id]
                        );
                        const dbUser = res.rows[0];

                        // User deleted, or no live session (logged out / tokens
                        // revoked before account removal) => disconnect.
                        if (!dbUser || !dbUser.has_session) {
                            logger.info(`[Socket.IO] Session no longer valid for user ${user.id} (socket ${socket.id}), disconnecting`);                            socket.emit('auth:revoked', { reason: 'session_revoked' });
                            socket.disconnect(true);
                            return;
                        }

                        if (dbUser.role !== user.role) {
                            logger.warn(`[Socket.IO] Role changed for user ${user.id} (socket ${socket.id}), disconnecting`);
                            socket.emit('auth:revoked', { reason: 'role_changed' });
                            socket.disconnect(true);
                            return;
                        }

                        // Keep the shared role cache warm so REST-side checks
                        // benefit from it too (best-effort).
                        cacheSet(`user_role_cache:${user.id}`, { role: dbUser.role, exists: true }, 120)
                            .catch(() => { /* non-fatal */ });
                    } catch (dbErr) {
                        // DB unavailable — fail open for this cycle; revocation
                        // is enforced on the next successful check instead of
                        // mass-disconnecting clients during transient outages.
                        logger.warn(`[Socket.IO] Auth recheck DB error for socket ${socket.id}`, { error: dbErr.message });
                    }
                }
            } catch (err) {
                logger.error(`[Socket.IO] Auth recheck error for socket ${socket.id}`, err);
            }
        }, AUTH_CHECK_INTERVAL_MS);

        // Allow clients to join a room based on branchId for targeted updates
        // SEC-C1: Enforce that users can only join their own branch room (admins can join any)
        socket.on('join:branch', (branchId) => {
            if (!branchId || !UUID_RE.test(String(branchId))) {
                logger.warn(`[Socket.IO] join:branch rejected — invalid UUID: socket=${socket.id} value=${branchId}`);
                return;
            }
            const user = socket.data.user;
            const isAdmin = user?.role?.toLowerCase() === ROLES.ADMIN;
            if (!isAdmin && String(user?.branchId) !== String(branchId)) {
                logger.warn(`[Socket.IO] Unauthorized join:branch attempt: socket=${socket.id} claimed=${branchId} actual=${user?.branchId}`);
                return;
            }
            socket.join(`branch:${branchId}`);
            logger.info(`[Socket.IO] Socket ${socket.id} joined room branch:${branchId}`);
        });

        // Allow clients to join their own user room for targeted session events
        // SEC-C1: Enforce that users can only join their own user room
        socket.on('join:user', (userId) => {
            if (!userId || !UUID_RE.test(String(userId))) {
                logger.warn(`[Socket.IO] join:user rejected — invalid UUID: socket=${socket.id} value=${userId}`);
                return;
            }
            const user = socket.data.user;
            if (String(user?.id) !== String(userId)) {
                logger.warn(`[Socket.IO] Unauthorized join:user attempt: socket=${socket.id} claimed=${userId} actual=${user?.id}`);
                return;
            }
            socket.join(`user:${userId}`);
            logger.info(`[Socket.IO] Socket ${socket.id} joined room user:${userId}`);
        });

        socket.on('disconnect', (reason) => {
            clearInterval(authCheckInterval);
            logger.info(`[Socket.IO] Client disconnected: ${socket.id}, reason: ${reason}`);
        });
    });

    logger.info('[Socket.IO] Initialized successfully');
    return io;
};

/**
 * Get the Socket.IO instance
 * @returns {Server|null} The Socket.IO server instance
 */
const getIO = () => {
    if (!io) {
        logger.warn('[Socket.IO] getIO called before initialization');
    }
    return io;
};

/**
 * Emit an event to all connected clients or a specific branch room
 * @param {string} event - Event name
 * @param {Object} data - Event data
 * @param {string} [branchId] - Optional branchId to target a specific room
 */
const emitEvent = (event, data, branchId = null) => {
    if (!io) {
        logger.warn(`[Socket.IO] Cannot emit "${event}" - not initialized`);
        return;
    }

    if (branchId) {
        io.to(`branch:${branchId}`).emit(event, data);
        logger.debug(`[Socket.IO] Emitted "${event}" to branch:${branchId}`);
    } else {
        io.emit(event, data);
        logger.debug(`[Socket.IO] Emitted "${event}" to all clients`);
    }
};

/**
 * Emit an event to a specific user's socket room
 * @param {string} userId - Target user ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToUser = (userId, event, data) => {
    if (!io || !userId) return;
    io.to(`user:${userId}`).emit(event, data);
    logger.debug(`[Socket.IO] Emitted "${event}" to user:${userId}`);
};

module.exports = {
    initSocket,
    getIO,
    emitEvent,
    emitToUser,
};
