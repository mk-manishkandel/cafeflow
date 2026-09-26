const { z } = require('zod');
const logger = require('../utils/logger.cjs');

/**
 * Middleware to validate request data against a Zod schema.
 * @param {Object} schemas - Schema object containing body, query, or params schemas.
 */
const validate = (schemas) => (req, res, next) => {
    try {
        if (schemas.body) {
            req.body = schemas.body.parse(req.body);
        }
        if (schemas.query) {
            req.query = schemas.query.parse(req.query);
        }
        if (schemas.params) {
            req.params = schemas.params.parse(req.params);
        }
        next();
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
            }));
            return res.status(400).json({
                error: 'Validation failed',
                details: errorMessages
            });
        }
        logger.error('Validation error', error);
        return res.status(500).json({ error: 'Internal server error during validation' });
    }
};

// --- Shared Schemas ---

const passwordSchema = z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const loginSchema = z.object({
    body: z.object({
        username: z.string().min(3, "Username must be at least 3 characters").max(50),
        password: z.string().min(1, "Password is required") // Login doesn't need complexity check, just existence
    })
});

const changePasswordSchema = z.object({
    body: z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: passwordSchema
    })
});

const userSchema = z.object({
    body: z.object({
        username: z.string().min(3).max(50),
        password: passwordSchema.optional(), // Use strong password schema
        role: z.string(),
        branchId: z.string().uuid().nullable()
    })
});

const studentOrderSchema = z.object({
    body: z.object({
        sessionId: z.string().uuid(),
        branchId: z.string().uuid(),
        studentEmail: z.string().email().max(255),
        items: z.array(z.object({
            id: z.string().min(1).max(100),
            name: z.string().min(1).max(255),
            price: z.number().positive().max(99999),
            category: z.string().max(100).optional().default(''),
            quantity: z.number().int().min(1).max(99)
        })).min(1).max(50),
        totalAmount: z.number().positive()
    })
});

module.exports = {
    validate,
    passwordSchema,
    schemas: {
        login: loginSchema,
        changePassword: changePasswordSchema,
        user: userSchema,
        studentOrder: studentOrderSchema,
    }
};
