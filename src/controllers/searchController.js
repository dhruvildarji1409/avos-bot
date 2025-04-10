/**
 * Search Controller
 * 
 * Handles API endpoints for searching Confluence and NVBugs
 */
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');
const standaloneContentExtractorService = require('../services/standaloneContentExtractorService');

/**
 * Executes the AVOS search handler Python script
 * 
 * @param {string} query - The query to search for
 * @returns {Promise<object>} - Search results
 */
async function executeSearchHandler(query) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../scripts/avos_search_handler.py');
    
    logger.info(`Executing search handler for query: ${query}`);
    
    // Find the Python executable to use
    const pythonCommand = process.env.PYTHON_EXECUTABLE || 'python3';
    
    // Spawn the Python process
    const pythonProcess = spawn(pythonCommand, [
      scriptPath,
      query,
      '--format', 'json'
    ], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1' // Ensure Python output is not buffered
      }
    });
    
    let stdoutData = '';
    let stderrData = '';
    
    // Collect stdout data
    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    // Collect stderr data
    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      logger.warn(`Search handler stderr: ${data.toString()}`);
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Search handler exited with code ${code}`);
        logger.error(`stderr: ${stderrData}`);
        reject(new Error(`Search handler exited with code ${code}: ${stderrData}`));
        return;
      }
      
      // Try to parse the JSON output
      try {
        // Look for JSON-like content in the output
        const jsonContent = stdoutData.match(/(\{.*\})/s);
        if (jsonContent) {
          const result = JSON.parse(jsonContent[0]);
          resolve(result);
        } else {
          logger.error("No JSON content found in output");
          logger.error(`stdout: ${stdoutData}`);
          // Just return the raw stdout in case of parsing error
          resolve({ handled: false, response: stdoutData.trim() });
        }
      } catch (error) {
        logger.error(`Failed to parse JSON output: ${error.message}`);
        logger.error(`stdout: ${stdoutData}`);
        // Just return the raw stdout in case of parsing error
        resolve({ handled: false, response: stdoutData.trim() });
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (error) => {
      logger.error(`Failed to start search handler process: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Process a search query
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function search(req, res) {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }
    
    logger.info(`Processing search query: ${query}`);
    
    // Check if this is a "Go Search" command or bug search
    if (query.toLowerCase().startsWith('go search') || /\bbug\s+\d{7}\b/i.test(query)) {
      const result = await executeSearchHandler(query);
      
      return res.json({
        success: true,
        query,
        handled: result.handled,
        answer: result.response,
        source: 'search_handler'
      });
    }
    
    // Handle as a normal content-rich query using standalone content extractor
    const extractorResult = await standaloneContentExtractorService.processQuery(query);
    
    return res.json({
      success: true,
      query,
      handled: true,
      answer: extractorResult.answer,
      sources: extractorResult.sources || [],
      source: 'standalone_content_extractor'
    });
  } catch (error) {
    logger.error(`Error processing search: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to process search query',
      message: error.message
    });
  }
}

/**
 * Enhanced search with content extraction
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function enhancedSearch(req, res) {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query is required'
      });
    }
    
    logger.info(`Processing enhanced search request: ${query}`);
    
    const result = await standaloneContentExtractorService.processQuery(query);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`Error in enhanced search controller: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your enhanced search request',
      error: error.message
    });
  }
}

/**
 * Get details for a specific Confluence page
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function getConfluencePage(req, res) {
  try {
    const { pageId } = req.params;
    
    if (!pageId) {
      return res.status(400).json({
        success: false,
        message: 'Page ID is required'
      });
    }
    
    logger.info(`Getting Confluence page: ${pageId}`);
    
    const result = await standaloneContentExtractorService.getConfluencePage(pageId);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`Error in getConfluencePage controller: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the Confluence page',
      error: error.message
    });
  }
}

/**
 * Get details for a specific NVBug
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function getNVBug(req, res) {
  try {
    const { bugId } = req.params;
    
    if (!bugId) {
      return res.status(400).json({
        success: false,
        message: 'Bug ID is required'
      });
    }
    
    logger.info(`Getting NVBug: ${bugId}`);
    
    const result = await standaloneContentExtractorService.getNVBugDetails(bugId);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`Error in getNVBug controller: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the NVBug',
      error: error.message
    });
  }
}

/**
 * Detect if a query is a search query
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function detectSearchQuery(req, res) {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query is required'
      });
    }
    
    const isSearchQuery = await standaloneContentExtractorService.isSearchQuery(query);
    const shouldExtractContent = await standaloneContentExtractorService.shouldExtractContent(query);
    
    return res.json({
      success: true,
      data: {
        query,
        isSearchQuery,
        shouldExtractContent
      }
    });
  } catch (error) {
    logger.error(`Error in detectSearchQuery controller: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while detecting search query',
      error: error.message
    });
  }
}

module.exports = {
  search,
  enhancedSearch,
  getConfluencePage,
  getNVBug,
  detectSearchQuery
}; 