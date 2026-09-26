// SPA fallback route (extracted from index.cjs — audit item #13)
// Handle client-side routing by returning index.html for all non-API paths
// This ensures that deep links like /menu or /staff work with BrowserRouter
const express = require('express');
const path = require('path');

const router = express.Router();

router.get(/^(?!\/api|\/health).+$/, (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

module.exports = router;
