/**
 * Confluence Integration Utility
 * 
 * This file provides functions to integrate with the Confluence loader
 * for admin pages to add and manage Confluence content.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);
const existsAsync = promisify(fs.exists);

/**
 * Load Confluence pages into the database
 * 
 * @param {Array<string>} urls - Array of Confluence URLs to load
 * @param {Object} options - Options for loading
 * @param {boolean} options.recursive - Whether to load pages recursively
 * @param {number} options.depth - Maximum recursion depth
 * @param {boolean} options.updateCredentials - Whether this is just updating credentials
 * @param {Object} options.credentials - Confluence credentials to update
 * @returns {Promise<Object>} - Result of the operation
 */
async function loadConfluencePages(urls, options = {}) {
  try {
    // Handle credential updates
    if (options.updateCredentials && options.credentials) {
      return await updateConfluenceCredentials(options.credentials);
    }
    
    // Default options
    const { recursive = true, depth = 3 } = options;
    
    // Create temporary file with URLs
    const tempFile = path.join(__dirname, '..', '..', 'temp_urls.txt');
    await writeFileAsync(tempFile, urls.join('\n'));
    
    // Build command arguments
    const args = ['admin_load_confluence.py', 'file', tempFile];
    
    if (recursive) {
      args.push('--recursive');
    }
    
    if (depth) {
      args.push('--depth', depth.toString());
    }
    
    // Run the Python script
    const result = await runPythonScript(args);
    
    // Clean up temporary file
    if (await existsAsync(tempFile)) {
      await unlinkAsync(tempFile);
    }
    
    return {
      success: true,
      message: 'Confluence pages loaded successfully',
      details: result
    };
  } catch (error) {
    console.error('Error loading Confluence pages:', error);
    return {
      success: false,
      message: 'Failed to load Confluence pages',
      error: error.message
    };
  }
}

/**
 * Search Confluence content in the database
 * 
 * @param {string} query - Query string to search for
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<Object>} - Search results
 */
async function searchConfluenceContent(query, limit = 5) {
  try {
    // Build command arguments
    const args = ['admin_load_confluence.py', 'search', query, '--limit', limit.toString()];
    
    // Run the Python script
    const result = await runPythonScript(args);
    
    // Parse the result - try to extract JSON
    try {
      // The output might contain non-JSON text, try to find JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const searchResults = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          results: searchResults.results || [],
          total: searchResults.total || 0
        };
      }
    } catch (parseError) {
      console.error('Error parsing search results:', parseError);
    }
    
    // If JSON parsing failed or no JSON found, process results manually
    const lines = result.split('\n');
    let results = [];
    
    // Extract result sections
    let currentResult = null;
    for (const line of lines) {
      if (line.startsWith('Result ')) {
        // Start a new result
        if (currentResult) {
          results.push(currentResult);
        }
        const titleMatch = line.match(/Result \d+: (.*?) - (.*)/);
        if (titleMatch) {
          currentResult = {
            page_title: titleMatch[1],
            header: titleMatch[2],
            content: '',
            similarity_score: 0
          };
        }
      } else if (line.startsWith('Score: ') && currentResult) {
        // Add score to current result
        const scoreMatch = line.match(/Score: ([\d.]+)/);
        if (scoreMatch) {
          currentResult.similarity_score = parseFloat(scoreMatch[1]);
        }
      } else if (currentResult && line.trim() && !line.startsWith('-')) {
        // Add non-empty, non-separator lines to current result content
        currentResult.content += line + '\n';
      }
    }
    
    // Add the last result if it exists
    if (currentResult) {
      results.push(currentResult);
    }
    
    return {
      success: true,
      results,
      total: results.length,
      rawOutput: result
    };
  } catch (error) {
    console.error('Error searching Confluence content:', error);
    return {
      success: false,
      message: 'Failed to search Confluence content',
      error: error.message
    };
  }
}

/**
 * Update Confluence credentials
 * 
 * @param {Object} credentials - Confluence credentials
 * @param {string} credentials.username - Confluence username
 * @param {string} credentials.password - Confluence password or token
 * @param {string} credentials.url - Confluence URL
 * @returns {Promise<Object>} - Result of the operation
 */
async function updateConfluenceCredentials(credentials) {
  try {
    const { username, password, url } = credentials;
    
    // Build command arguments
    const args = ['admin_load_confluence.py', 'credentials'];
    
    if (username) {
      args.push('--username', username);
    }
    
    if (password) {
      args.push('--password', password);
    }
    
    if (url) {
      args.push('--url', url);
    }
    
    // Run the Python script
    const result = await runPythonScript(args);
    
    return {
      success: true,
      message: 'Confluence credentials updated successfully',
      details: result
    };
  } catch (error) {
    console.error('Error updating Confluence credentials:', error);
    return {
      success: false,
      message: 'Failed to update Confluence credentials',
      error: error.message
    };
  }
}

/**
 * Run a Python script and return the output
 * 
 * @param {Array<string>} args - Command line arguments
 * @returns {Promise<string>} - Output of the script
 */
function runPythonScript(args) {
  return new Promise((resolve, reject) => {
    // Use python3 or python depending on the environment
    const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    
    const pythonProcess = spawn(pythonExecutable, args, {
      cwd: path.join(__dirname, '..', '..') // Project root
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = {
  loadConfluencePages,
  searchConfluenceContent,
  updateConfluenceCredentials
}; 