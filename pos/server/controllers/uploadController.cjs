const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../utils/logger.cjs');
const { sendError } = require('../utils/errorResponse.cjs');

// Constants
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Paths
const BASE_UPLOAD_DIR = path.join(__dirname, '../public/uploads');
const MENU_UPLOAD_DIR = path.join(BASE_UPLOAD_DIR, 'menu');
const TMP_DIR = path.join(__dirname, '../uploads/tmp');

/**
 * Ensure directories exist
 */
const ensureDirs = () => {
    [BASE_UPLOAD_DIR, MENU_UPLOAD_DIR, TMP_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

// Configure Multer for temporary storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        ensureDirs();
        cb(null, TMP_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `upload-${uniqueSuffix}${ALLOWED_EXTS.includes(ext) ? ext : '.tmp'}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const mime = file.mimetype.toLowerCase();
        const ext = path.extname(file.originalname).toLowerCase();

        if (ALLOWED_MIMES.includes(mime) && ALLOWED_EXTS.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPG, PNG and WebP are allowed.'));
        }
    }
});

/**
 * Process and save an image using Sharp
 */
const processImage = async (inputPath, filename) => {
    ensureDirs();
    const outputPath = path.join(MENU_UPLOAD_DIR, `${filename}.webp`);

    try {
        await sharp(inputPath)
            .resize(800, 800, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })
            .toFile(outputPath);

        // Clean up temporary file
        try { await fs.promises.unlink(inputPath); } catch (unlinkErr) { logger.warn('Failed to delete temp file', { path: inputPath, error: unlinkErr.message }); }

        return `/uploads/menu/${filename}.webp`;
    } catch (err) {
        logger.error('Sharp processing failed', { error: err.message, inputPath });
        throw err;
    }
};

/**
 * Controller for menu image uploads
 */
const uploadMenuImage = async (req, res, next) => {
    if (!req.file) {
        return sendError(res, 400, 'No image file provided');
    }

    const tempPath = req.file.path;

    try {
        const uniqueId = crypto.randomUUID();
        const relativePath = await processImage(tempPath, uniqueId);

        logger.info('Image uploaded and processed successfully', { path: relativePath });

        res.json({
            success: true,
            url: relativePath
        });
    } catch (err) {
        logger.error('Upload handler failed', { error: err.message });

        // Cleanup temp file on failure
        try { await fs.promises.unlink(tempPath); } catch (unlinkErr) { logger.warn('Failed to delete temp file', { path: tempPath, error: unlinkErr.message }); }

        return next(err);
    }
};

module.exports = {
    upload: upload.single('image'),
    uploadMenuImage
};
