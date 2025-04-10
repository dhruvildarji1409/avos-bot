/**
 * Direct Confluence Service
 * 
 * This service provides direct access to Confluence via the mcp_bridge.py script
 * which imports the mcp-confluence module directly rather than using the MCP HTTP service.
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Call a function via the mcp_bridge.py script
 * 
 * @param {string} functionName - The name of the MCP function to call
 * @param {object} params - Parameters to pass to the function
 * @returns {Promise<any>} - The result of the function call
 */
async function callBridgeFunction(functionName, params = {}) {
  return new Promise((resolve, reject) => {
    const bridgePath = path.join(__dirname, '../../scripts/mcp_bridge.py');
    
    // Convert parameters to JSON
    const paramsJson = JSON.stringify(params);
    
    logger.info(`Calling bridge function: ${functionName}`);
    
    // Find the Python executable to use
    const pythonCommand = process.env.PYTHON_EXECUTABLE || 'python3';
    
    // Spawn the Python process
    const pythonProcess = spawn(pythonCommand, [
      bridgePath,
      functionName,
      paramsJson
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
      logger.warn(`Bridge stderr: ${data.toString()}`);
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Bridge exited with code ${code}`);
        logger.error(`stderr: ${stderrData}`);
        reject(new Error(`Bridge exited with code ${code}: ${stderrData}`));
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
      logger.error(`Failed to start bridge process: ${error.message}`);
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
    
    const results = await callBridgeFunction('mcp_confluence_confluence_search', {
      query,
      limit
    });
    
    return results || [];
  } catch (error) {
    logger.error(`Error searching Confluence: ${error.message}`);
    return [];
  }
}

/**
 * Get content of a specific Confluence page
 * 
 * @param {string} pageId - The page ID to retrieve
 * @param {boolean} includeMetadata - Whether to include metadata
 * @returns {Promise<object>} - Page content and metadata
 */
async function getPageContent(pageId, includeMetadata = true) {
  try {
    logger.info(`Getting page content for: ${pageId}`);
    
    const result = await callBridgeFunction('mcp_confluence_confluence_get_page', {
      page_id: pageId,
      include_metadata: includeMetadata
    });
    
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
    
    const results = await callBridgeFunction('mcp_confluence_confluence_get_page_children', {
      parent_id: parentId,
      include_content: includeContent,
      limit
    });
    
    return results || [];
  } catch (error) {
    logger.error(`Error getting page children: ${error.message}`);
    return [];
  }
}

/**
 * Add a comment to a Confluence page
 * 
 * @param {string} pageId - The page ID to comment on
 * @param {string} comment - The comment text in Markdown
 * @returns {Promise<object>} - Result of comment creation
 */
async function addComment(pageId, comment) {
  try {
    logger.info(`Adding comment to page: ${pageId}`);
    
    const result = await callBridgeFunction('mcp_confluence_confluence_add_comment', {
      page_id: pageId,
      comment
    });
    
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
    
    const results = await callBridgeFunction('mcp_confluence_confluence_get_comments', {
      page_id: pageId
    });
    
    return results || [];
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
 * @param {string} content - Page content in Markdown
 * @param {string} parentId - Optional parent page ID
 * @returns {Promise<object>} - Result of page creation
 */
async function createPage(spaceKey, title, content, parentId = null) {
  try {
    logger.info(`Creating page "${title}" in space ${spaceKey}`);
    
    const params = {
      space_key: spaceKey,
      title,
      content
    };
    
    if (parentId) {
      params.parent_id = parentId;
    }
    
    const result = await callBridgeFunction('mcp_confluence_confluence_create_page', params);
    
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
 * @param {string} content - New page content in Markdown
 * @param {string} versionComment - Optional comment
 * @param {boolean} isMinorEdit - Whether this is a minor edit
 * @returns {Promise<object>} - Result of page update
 */
async function updatePage(pageId, title, content, versionComment = "", isMinorEdit = false) {
  try {
    logger.info(`Updating page ${pageId}`);
    
    const result = await callBridgeFunction('mcp_confluence_confluence_update_page', {
      page_id: pageId,
      title,
      content,
      version_comment: versionComment,
      is_minor_edit: isMinorEdit
    });
    
    return result;
  } catch (error) {
    logger.error(`Error updating page: ${error.message}`);
    return null;
  }
}

/**
 * Download a Confluence page and its children
 * 
 * @param {string} pageIdOrUrl - Page ID or URL
 * @param {string} outputDir - Directory to save files
 * @param {boolean} downloadChildren - Whether to download child pages
 * @param {boolean} downloadLinks - Whether to download linked pages
 * @param {boolean} exportJson - Whether to export JSON metadata
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Promise<object>} - Result of download operation
 */
async function downloadPage(
  pageIdOrUrl,
  outputDir = ".",
  downloadChildren = true,
  downloadLinks = false,
  exportJson = true,
  maxDepth = 3
) {
  try {
    logger.info(`Downloading page ${pageIdOrUrl}`);
    
    const result = await callBridgeFunction('mcp_confluence_confluence_download_page', {
      page_id_or_url: pageIdOrUrl,
      output_dir: outputDir,
      download_children: downloadChildren,
      download_links: downloadLinks,
      export_json: exportJson,
      max_depth: maxDepth
    });
    
    return result;
  } catch (error) {
    logger.error(`Error downloading page: ${error.message}`);
    return null;
  }
}

/**
 * Check if bridge is working correctly
 * 
 * @returns {Promise<boolean>} - True if bridge is working
 */
async function isBridgeWorking() {
  try {
    // Try a simple search to check if the bridge is working
    const results = await searchConfluence("Test", 1);
    return Array.isArray(results);
  } catch (error) {
    logger.error(`Bridge check failed: ${error.message}`);
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
  downloadPage,
  isBridgeWorking
}; 