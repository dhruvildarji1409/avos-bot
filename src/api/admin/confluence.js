/**
 * Admin API Routes for Confluence Content Management
 * 
 * This file defines REST endpoints for administrators to manage Confluence content.
 */

const express = require('express');
const router = express.Router();
const confluenceController = require('../../controllers/confluenceController');
const auth = require('../../middlewares/auth');
const adminAuth = require('../../middlewares/admin-auth');

// Add authentication middleware
router.use(auth);
router.use(adminAuth);

/**
 * @route   POST /api/admin/confluence/load
 * @desc    Load Confluence pages into the database
 * @access  Admin
 */
router.post('/load', async (req, res) => {
  try {
    const { urls, recursive = true, depth = 3 } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'URLs must be a non-empty array' 
      });
    }
    
    // Validate URLs format
    const validUrls = urls.filter(url => {
      try {
        new URL(url);
        return true;
      } catch (e) {
        return false;
      }
    });
    
    if (validUrls.length !== urls.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'One or more URLs are invalid' 
      });
    }
    
    // Load the Confluence pages using controller
    const result = await confluenceController.loadPages(validUrls, { 
      recursive: Boolean(recursive), 
      depth: parseInt(depth, 10) 
    });
    
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    console.error('Error in /api/admin/confluence/load:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while loading Confluence pages',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/admin/confluence/search
 * @desc    Search Confluence content in the database
 * @access  Admin
 */
router.post('/search', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Query must be a non-empty string' 
      });
    }
    
    // Search the Confluence content using controller
    const result = await confluenceController.searchContent(query, parseInt(limit, 10));
    
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    console.error('Error in /api/admin/confluence/search:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while searching Confluence content',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/admin/confluence/credentials
 * @desc    Update Confluence credentials
 * @access  Admin
 */
router.post('/credentials', async (req, res) => {
  try {
    const { username, password, url } = req.body;
    
    if ((!username && !password && !url) || 
        (username && typeof username !== 'string') ||
        (password && typeof password !== 'string') ||
        (url && typeof url !== 'string')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credentials format' 
      });
    }
    
    // Update the credentials using utilities
    const result = await confluenceController.loadPages([], { updateCredentials: true, credentials: { username, password, url } });
    
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    console.error('Error in /api/admin/confluence/credentials:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating Confluence credentials',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/admin/confluence/status
 * @desc    Get the status of the Confluence integration
 * @access  Admin
 */
router.get('/status', async (req, res) => {
  try {
    // Get statistics about the Confluence database
    const stats = await confluenceController.getStatistics();
    
    return res.status(200).json({
      success: true,
      status: {
        connected: true,
        lastSync: stats.statistics.lastUpdate,
        totalPages: stats.statistics.uniquePages,
        totalChunks: stats.statistics.totalChunks
      }
    });
  } catch (error) {
    console.error('Error in /api/admin/confluence/status:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while getting Confluence status',
      error: error.message
    });
  }
});

module.exports = router; 