const crypto = require('crypto');
const logger = require('./logger.cjs');

// The ENCRYPTION_KEY should be a 32-byte (256-bit) string in hex or base64.
// If it's not provided, we fall back to a derivation to ensure the app doesn't crash, 
// though for a real production environment, this MUST be a stable secret.
const ALGORITHM = 'aes-256-gcm';
const SECRET = process.env.DB_ENCRYPTION_SECRET;

if (!SECRET) {
    throw new Error('FATAL: DB_ENCRYPTION_SECRET environment variable is required for data security');
}

// DB_ENCRYPTION_SALT must be explicitly set — the SHA-256-of-secret fallback is weak
// because it ties the salt to the secret, reducing the independence of the two inputs.
if (!process.env.DB_ENCRYPTION_SALT) {
    logger.warn('WARNING: DB_ENCRYPTION_SALT is not set. Falling back to a SHA-256 derivation from DB_ENCRYPTION_SECRET. Set DB_ENCRYPTION_SALT to a random 32-char hex string for production.');
}
const SALT = process.env.DB_ENCRYPTION_SALT || crypto.createHash('sha256').update(SECRET).digest('hex').slice(0, 16);
const KEY = crypto.scryptSync(SECRET, SALT, 32);

/**
 * Encrypts a string using AES-256-GCM.
 * Returns a colon-separated string of hex-encoded IV, Tag, and Ciphertext.
 */
function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypts a colon-separated string from hex to plaintext.
 */
function decrypt(text) {
    if (!text) return null;
    try {
        const [ivHex, tagHex, encryptedHex] = text.split(':');
        if (!ivHex || !tagHex || !encryptedHex) return text; // Return as-is if not in encrypted format (legacy)

        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        logger.error('Decryption failed — the DB_ENCRYPTION_SECRET may have changed since this value was encrypted. Please re-save the credential via the UI.', error.message);
        return null;
    }
}

module.exports = { encrypt, decrypt };
