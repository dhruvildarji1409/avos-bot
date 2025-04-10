/**
 * Standalone Confluence Service
 * 
 * This service provides direct access to Confluence via the standalone_confluence_client.py script
 * which makes direct REST API calls to Confluence without depending on MCP.
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Call a function via the standalone_confluence_client.py script
 * 
 * @param {string} command - The command to run
 * @param {Array} args - Arguments to pass to the command
 * @returns {Promise<any>} - The result of the function call
 */
async function callStandaloneClient(command, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../scripts/standalone_confluence_client.py');
    
    logger.info(`Calling standalone client command: ${command} with args: ${args.join(', ')}`);
    
    // Find the Python executable to use
    const pythonCommand = process.env.PYTHON_EXECUTABLE || 'python3';
    
    // Combine command and arguments
    const fullArgs = [scriptPath, command, ...args];
    
    // Spawn the Python process
    const pythonProcess = spawn(pythonCommand, fullArgs, {
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
      logger.warn(`Standalone client stderr: ${data.toString()}`);
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Standalone client exited with code ${code}`);
        logger.error(`stderr: ${stderrData}`);
        reject(new Error(`Standalone client exited with code ${code}: ${stderrData}`));
        return;
      }
      
      // Extract result from stdout
      try {
        // Look for JSON-like content in the output
        const jsonContent = stdoutData.match(/(\[.*\]|\{.*\})/s);
        if (jsonContent) {
          const result = JSON.parse(jsonContent[0]);
          resolve(result);
        } else {
          // No JSON found, just return the raw output
          resolve(stdoutData);
        }
      } catch (error) {
        logger.error(`Failed to parse stdout: ${error.message}`);
        logger.error(`stdout: ${stdoutData}`);
        // Just return the raw output in case of parsing error
        resolve(stdoutData);
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (error) => {
      logger.error(`Failed to start standalone client process: ${error.message}`);
      reject(error);
    });
  });
}

/**
 * Search Confluence for the given query
 * 
 * @param {string} query - The search query
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} - Search results
 */
async function searchConfluence(query, limit = 10) {
  try {
    logger.info(`Searching Confluence for: ${query}`);
    
    const results = await callStandaloneClient('search', [
      query,
      '-l', limit.toString()
    ]);
    
    return Array.isArray(results) ? results : [];
  } catch (error) {
    logger.error(`Error searching Confluence: ${error.message}`);
    return [];
  }
}

/**
 * Get content of a specific Confluence page
 * 
 * @param {string} pageId - The page ID to retrieve
 * @returns {Promise<object>} - Page content and metadata
 */
async function getPageContent(pageId) {
  try {
    logger.info(`Getting page content for: ${pageId}`);
    
    const result = await callStandaloneClient('get-page', [pageId]);
    
    return result;
  } catch (error) {
    logger.error(`Error getting page content: ${error.message}`);
    return null;
  }
}

/**
 * Get child pages of a Confluence page
 * 
 * @param {string} parentId - The parent page ID
 * @param {boolean} includeContent - Whether to include content
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} - Child pages
 */
async function getPageChildren(parentId, includeContent = false, limit = 25) {
  try {
    logger.info(`Getting child pages for: ${parentId}`);
    
    const args = [parentId, '-l', limit.toString()];
    if (includeContent) {
      args.push('--include-content');
    }
    
    const results = await callStandaloneClient('get-children', args);
    
    return Array.isArray(results) ? results : [];
  } catch (error) {
    logger.error(`Error getting page children: ${error.message}`);
    return [];
  }
}

/**
 * Add a comment to a Confluence page
 * 
 * @param {string} pageId - The page ID to comment on
 * @param {string} comment - The comment text in Markdown format
 * @returns {Promise<object>} - Result of comment creation
 */
async function addComment(pageId, comment) {
  try {
    logger.info(`Adding comment to page: ${pageId}`);
    
    const result = await callStandaloneClient('add-comment', [pageId, comment]);
    
    return result;
  } catch (error) {
    logger.error(`Error adding comment: ${error.message}`);
    return null;
  }
}

/**
 * Get comments on a Confluence page
 * 
 * @param {string} pageId - The page ID
 * @returns {Promise<Array>} - Comments
 */
async function getComments(pageId) {
  try {
    logger.info(`Getting comments for page: ${pageId}`);
    
    const results = await callStandaloneClient('get-comments', [pageId]);
    
    return Array.isArray(results) ? results : [];
  } catch (error) {
    logger.error(`Error getting comments: ${error.message}`);
    return [];
  }
}

/**
 * Create a new Confluence page
 * 
 * @param {string} spaceKey - Space key
 * @param {string} title - Page title
 * @param {string} content - Page content in Markdown format
 * @param {string} parentId - Optional parent page ID
 * @returns {Promise<object>} - Result of page creation
 */
async function createPage(spaceKey, title, content, parentId = null) {
  try {
    logger.info(`Creating page "${title}" in space ${spaceKey}`);
    
    const args = [spaceKey, title, content];
    if (parentId) {
      args.push('--parent-id', parentId);
    }
    
    const result = await callStandaloneClient('create-page', args);
    
    return result;
  } catch (error) {
    logger.error(`Error creating page: ${error.message}`);
    return null;
  }
}

/**
 * Update an existing Confluence page
 * 
 * @param {string} pageId - Page ID to update
 * @param {string} title - New page title
 * @param {string} content - New page content in Markdown format
 * @param {string} versionComment - Optional comment
 * @param {boolean} isMinorEdit - Whether this is a minor edit
 * @returns {Promise<object>} - Result of page update
 */
async function updatePage(pageId, title, content, versionComment = "", isMinorEdit = false) {
  try {
    logger.info(`Updating page ${pageId}`);
    
    const args = [pageId, title, content];
    if (versionComment) {
      args.push('--comment', versionComment);
    }
    if (isMinorEdit) {
      args.push('--minor');
    }
    
    const result = await callStandaloneClient('update-page', args);
    
    return result;
  } catch (error) {
    logger.error(`Error updating page: ${error.message}`);
    return null;
  }
}

/**
 * Check if the standalone client is working correctly
 * 
 * @returns {Promise<boolean>} - True if the client is working
 */
async function isClientWorking() {
  try {
    // Try a simple search to check if the client is working
    const results = await searchConfluence("Test", 1);
    return Array.isArray(results);
  } catch (error) {
    logger.error(`Standalone client check failed: ${error.message}`);
    return false;
  }
}

module.exports = {
  searchConfluence,
  getPageContent,
  getPageChildren,
  addComment,
  getComments,
  createPage,
  updatePage,
  isClientWorking
}; 