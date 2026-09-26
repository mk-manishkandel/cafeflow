const express = require('express');
const multer = require('multer');
const router = express.Router();
const uploadController = require('../controllers/uploadController.cjs');
const { authMiddleware, checkPermission } = require('../middleware/auth.cjs');
const logger = require('../utils/logger.cjs');

// Catch multer errors (file too large, wrong type) and return a clean JSON response.
// Without this, Express's default error handler would send an HTML 500.
const handleUpload = (uploadMiddleware) => (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File too large. Images must be under 5MB.' });
            }
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        // fileFilter rejection (wrong MIME / extension)
        if (err.message) {
            return res.status(400).json({ error: err.message });
        }
        logger.error('Unexpected upload error', err);
        return res.status(500).json({ error: 'Upload failed' });
    });
};

// Upload is protected, only authenticated users can upload images
router.post('/menu', authMiddleware, checkPermission('MENU_ADD_ITEM'), handleUpload(uploadController.upload), uploadController.uploadMenuImage);

module.exports = router;
