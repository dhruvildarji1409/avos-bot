/**
 * Search Routes
 * 
 * This file defines the API routes for search functionality.
 */
const express = require('express');
const searchController = require('../../controllers/searchController');

const router = express.Router();

/**
 * @route   GET /api/search
 * @desc    Search Confluence with basic results
 * @access  Public
 */
router.get('/', searchController.search);

/**
 * Search route - Basic search for Confluence and NVBugs
 * 
 * Query parameters:
 *   - query: The search query
 * 
 * Example: GET /api/search?query=Go%20Search%20AVOS%20architecture
 */
router.get('/search', searchController.search);

/**
 * @route   POST /api/search/enhanced
 * @desc    Enhanced search with content extraction
 * @access  Public
 */
router.post('/enhanced', searchController.enhancedSearch);

/**
 * @route   POST /api/search/detect
 * @desc    Detect if a query is a search query
 * @access  Public
 */
router.post('/detect', searchController.detectSearchQuery);

/**
 * @route   GET /api/search/confluence/:pageId
 * @desc    Get a specific Confluence page
 * @access  Public
 */
router.get('/confluence/:pageId', searchController.getConfluencePage);

/**
 * @route   GET /api/search/nvbug/:bugId
 * @desc    Get a specific NVBug
 * @access  Public
 */
router.get('/nvbug/:bugId', searchController.getNVBug);

module.exports = router; 