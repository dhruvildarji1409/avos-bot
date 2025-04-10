/**
 * API Routes Index
 * 
 * Main entry point for all API routes.
 */

const express = require('express');
const searchRoutes = require('./routes/searchRoutes');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount API routes
router.use('/search', searchRoutes);

// Catch-all 404 route
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.originalUrl}`
  });
});

module.exports = router; 