/**
 * Search Service
 * 
 * Integrates the Python search scripts with the Node.js application to provide
 * search functionality for Confluence and NVBugs.
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Execute a Python script with the given arguments
 * 
 * @param {string} scriptName - The name of the Python script to execute
 * @param {Array<string>} args - Arguments to pass to the script
 * @returns {Promise<object>} - The JSON result from the Python script
 */
async function executePythonScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../scripts', scriptName);
    
    // Add --format json to get JSON output
    const allArgs = [...args, '--format', 'json'];
    
    logger.info(`Executing Python script: ${scriptPath} with args: ${allArgs.join(' ')}`);
    
    // Find the Python executable to use
    const pythonCommand = process.env.PYTHON_EXECUTABLE || 'python3';
    
    // Spawn the Python process
    const pythonProcess = spawn(pythonCommand, [scriptPath, ...allArgs], {
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
      logger.warn(`Python script stderr: ${data.toString()}`);
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Python script exited with code ${code}`);
        logger.error(`stderr: ${stderrData}`);
        reject(new Error(`Python script exited with code ${code}: ${stderrData}`));
        return;
      }
      
      // Try to parse the JSON output
      try {
        const result = JSON.parse(stdoutData);
        resolve(result);
      } catch (error) {
        logger.error(`Failed to parse JSON output: ${error.message}`);
        logger.error(`stdout: ${stdoutData}`);
        reject(new Error(`Failed to parse JSON output: ${error.message}`));
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (error) => {
      logger.error(`Failed to start Python process: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Process a search query with the AVOS search handler script
 * 
 * @param {string} query - The search query to process
 * @returns {Promise<object>} - The search results
 */
async function processSearchQuery(query) {
  try {
    const result = await executePythonScript('avos_search_handler.py', [query]);
    return result;
  } catch (error) {
    logger.error(`Error processing search query: ${error.message}`);
    throw error;
  }
}

/**
 * Check if a query is a search query (Confluence or NVBugs)
 * 
 * @param {string} query - The query to check
 * @returns {Promise<boolean>} - True if the query is a search query
 */
async function isSearchQuery(query) {
  if (!query) return false;
  
  // Simple checks to avoid unnecessary Python script execution
  const lowerQuery = query.toLowerCase();
  
  // Check for obvious search patterns
  if (lowerQuery.includes('go search')) {
    return true;
  }
  
  // Check for NVBugs patterns
  if (
    lowerQuery.includes('nvbug') ||
    lowerQuery.includes('bug ') ||
    /bug[#-]?\d+/.test(lowerQuery) ||
    /\b\d{7,}\b/.test(lowerQuery) // 7+ digit ID
  ) {
    return true;
  }
  
  // Check for AVOS keywords
  const avosKeywords = [
    'avos', 
    'autonomous vehicle', 
    'nvidia drive', 
    'driveos', 
    'ddu', 
    'ndas', 
    'hyperion',
    'orin',
    'drive agx'
  ];
  
  for (const keyword of avosKeywords) {
    if (lowerQuery.includes(keyword)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get Confluence page content
 * 
 * @param {string} pageId - The ID of the page to retrieve
 * @returns {Promise<object>} - The page content
 */
async function getConfluencePage(pageId) {
  try {
    const result = await executePythonScript('confluence_mcp_client.py', ['get-page', pageId]);
    return result;
  } catch (error) {
    logger.error(`Error getting Confluence page: ${error.message}`);
    throw error;
  }
}

/**
 * Search Confluence
 * 
 * @param {string} query - The search query
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<object>} - The search results
 */
async function searchConfluence(query, limit = 10) {
  try {
    const result = await executePythonScript('confluence_mcp_client.py', ['search', query, '-l', limit.toString()]);
    return result;
  } catch (error) {
    logger.error(`Error searching Confluence: ${error.message}`);
    throw error;
  }
}

/**
 * Get NVBugs details
 * 
 * @param {string} bugId - The bug ID to retrieve
 * @returns {Promise<object>} - The bug details
 */
async function getNVBugDetails(bugId) {
  try {
    const result = await executePythonScript('nvbugs_handler.py', [bugId]);
    return result;
  } catch (error) {
    logger.error(`Error getting NVBug details: ${error.message}`);
    throw error;
  }
}

module.exports = {
  processSearchQuery,
  isSearchQuery,
  getConfluencePage,
  searchConfluence,
  getNVBugDetails
}; 