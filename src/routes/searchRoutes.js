/**
 * Search Routes
 * 
 * Provides API endpoints for searching content from various sources.
 */

const express = require('express');
const router = express.Router();
const { searchConfluenceContent } = require('../utils/confluence_integration');

/**
 * @route   POST /api/search/confluence
 * @desc    Search Confluence content
 * @access  Public
 */
router.post('/confluence', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Query must be a non-empty string' 
      });
    }
    
    const result = await searchConfluenceContent(query, parseInt(limit, 10));
    
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    console.error('Error in /api/search/confluence:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while searching Confluence content',
      error: error.message
    });
  }
});

module.exports = router; 