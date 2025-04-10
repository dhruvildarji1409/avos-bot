/**
 * Content Extractor Service
 * 
 * This service integrates the Python Confluence content extractor
 * with the Node.js application to provide detailed answers from Confluence content.
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');
const searchService = require('./searchService');

/**
 * Extract content from Confluence and generate an answer
 * 
 * @param {string} query - The query to process
 * @param {number} limit - Maximum number of search results to process
 * @param {boolean} forceDirect - Force using direct API instead of MCP
 * @returns {Promise<object>} - The answer with relevant content
 */
async function extractContentAndAnswer(query, limit = 5, forceDirect = false) {
  try {
    return await executeContentExtractor(query, limit, forceDirect);
  } catch (error) {
    logger.error(`Error extracting content: ${error.message}`);
    
    // If we failed with MCP, try fallback to direct API
    if (!forceDirect && !error.message.includes('direct API')) {
      try {
        logger.info('Retrying with direct Confluence API...');
        return await executeContentExtractor(query, limit, true);
      } catch (directError) {
        logger.error(`Direct API also failed: ${directError.message}`);
      }
    }
    
    // Fallback to basic search if content extraction fails
    try {
      logger.info('Falling back to basic search service...');
      const isSearchable = await searchService.isSearchQuery(query);
      
      if (isSearchable) {
        const searchResult = await searchService.processSearchQuery(query);
        return {
          query,
          answer: searchResult.response || 'Sorry, I could not find any relevant information.',
          sources: searchResult.sources || [],
          fallback: true
        };
      }
    } catch (fallbackError) {
      logger.error(`Fallback search also failed: ${fallbackError.message}`);
    }
    
    return {
      query,
      answer: `Sorry, I couldn't extract content for your query about "${query}". The content extraction service is unavailable.`,
      sources: [],
      error: error.message
    };
  }
}

/**
 * Execute the content extractor Python script
 * 
 * @param {string} query - The query to process
 * @param {number} limit - Maximum number of search results to process
 * @param {boolean} useDirect - Use direct API instead of MCP
 * @returns {Promise<object>} - The answer with relevant content
 */
async function executeContentExtractor(query, limit = 5, useDirect = false) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../scripts/confluence_content_extractor.py');
    
    logger.info(`Executing content extractor for query: ${query}${useDirect ? ' (direct API)' : ' (MCP)'}`);
    
    // Find the Python executable to use
    const pythonCommand = process.env.PYTHON_EXECUTABLE || 'python3';
    
    // Prepare arguments
    const args = [
      scriptPath,
      query,
      '--limit', limit.toString(),
      '--format', 'json'
    ];
    
    // Add direct API flag if needed
    if (useDirect) {
      args.push('--direct');
    }
    
    // Spawn the Python process
    const pythonProcess = spawn(pythonCommand, args, {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1', // Ensure Python output is not buffered
        USE_MCP: useDirect ? 'false' : 'true'
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
      logger.warn(`Content extractor stderr: ${data.toString()}`);
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Content extractor exited with code ${code}`);
        logger.error(`stderr: ${stderrData}`);
        reject(new Error(`Content extractor exited with code ${code} using ${useDirect ? 'direct API' : 'MCP'}: ${stderrData}`));
        return;
      }
      
      // Try to parse the JSON output
      try {
        const result = JSON.parse(stdoutData);
        resolve(result);
      } catch (error) {
        logger.error(`Failed to parse JSON output: ${error.message}`);
        logger.error(`stdout: ${stdoutData}`);
        reject(new Error(`Failed to parse JSON output from ${useDirect ? 'direct API' : 'MCP'}: ${error.message}`));
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (error) => {
      logger.error(`Failed to start content extractor process: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Check if a query would benefit from content extraction
 * 
 * @param {string} query - The query to check
 * @returns {Promise<boolean>} - True if the query is suitable for content extraction
 */
async function shouldExtractContent(query) {
  if (!query) return false;
  
  // Check if it's a search query first
  const isSearchable = await searchService.isSearchQuery(query);
  if (!isSearchable) return false;
  
  const lowerQuery = query.toLowerCase();
  
  // If it contains certain question indicators, it's likely to benefit from content extraction
  const questionIndicators = [
    ' how ', ' what ', ' why ', ' when ', ' where ', ' which ', ' who ',
    'explain', 'describe', 'details', 'steps', 'guide', 'tutorial',
    'example', 'documentation', 'help', 'information'
  ];
  
  return questionIndicators.some(indicator => lowerQuery.includes(indicator));
}

/**
 * Check if MCP server is running and accessible
 * 
 * @returns {Promise<boolean>} - True if MCP server is running
 */
async function isMcpServerRunning() {
  try {
    const axios = require('axios');
    const mcpPort = process.env.MCP_API_PORT || 6277;
    await axios.get(`http://localhost:${mcpPort}/inspector`, { timeout: 1000 });
    return true;
  } catch (error) {
    logger.warn('MCP server check failed - will use direct API');
    return false;
  }
}

/**
 * Process a query, determining whether to use content extraction or regular search
 * 
 * @param {string} query - The query to process
 * @returns {Promise<object>} - The answer with relevant content
 */
async function processQuery(query) {
  try {
    // Check if we should use content extraction
    const shouldExtract = await shouldExtractContent(query);
    
    // Check if MCP is available
    const mcpAvailable = await isMcpServerRunning();
    
    if (shouldExtract) {
      logger.info(`Using content extraction for query: ${query}`);
      return await extractContentAndAnswer(query, 5, !mcpAvailable);
    } else {
      logger.info(`Using regular search for query: ${query}`);
      const searchResult = await searchService.processSearchQuery(query);
      
      // Format for consistency with content extractor response
      return {
        query,
        answer: searchResult.response || 'Sorry, I could not find any relevant information.',
        sources: searchResult.sources || [],
        basic_search: true
      };
    }
  } catch (error) {
    logger.error(`Error processing query: ${error.message}`);
    return {
      query,
      answer: `Sorry, I couldn't process your query about "${query}". ${error.message}`,
      sources: [],
      error: error.message
    };
  }
}

module.exports = {
  extractContentAndAnswer,
  shouldExtractContent,
  processQuery,
  isMcpServerRunning
}; 