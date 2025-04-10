/**
 * Standalone Content Extractor Service
 * 
 * This service integrates the Standalone Confluence content extractor
 * with the Node.js application to provide detailed answers from Confluence content.
 * It uses the standalone_content_extractor.py script that makes direct API calls to Confluence.
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');
const standaloneConfluenceService = require('./standaloneConfluenceService');

/**
 * Extract content from Confluence and generate an answer
 * 
 * @param {string} query - The query to process
 * @param {number} limit - Maximum number of search results to process
 * @returns {Promise<object>} - The answer with relevant content
 */
async function extractContentAndAnswer(query, limit = 5) {
  try {
    return await executeStandaloneContentExtractor(query, limit);
  } catch (error) {
    logger.error(`Error extracting content: ${error.message}`);
    
    // Fallback to basic search if content extraction fails
    try {
      logger.info('Falling back to standalone Confluence service...');
      
      const searchResults = await standaloneConfluenceService.searchConfluence(query, limit);
      
      if (!searchResults || searchResults.length === 0) {
        return {
          query,
          answer: `Sorry, I couldn't find any information about "${query}" in Confluence.`,
          sources: [],
          fallback: true
        };
      }
      
      // Format the basic search results
      const formattedResults = [
        `Here are some Confluence pages that might help with your query about "${query}":\n`
      ];
      
      const sources = [];
      
      for (let i = 0; i < Math.min(searchResults.length, 5); i++) {
        const result = searchResults[i];
        formattedResults.push(`### ${result.title}`);
        formattedResults.push(`[View in Confluence](${result.url})\n`);
        
        sources.push({
          title: result.title,
          url: result.url,
          id: result.id
        });
      }
      
      return {
        query,
        answer: formattedResults.join('\n'),
        sources,
        fallback: true
      };
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
 * Execute the standalone content extractor Python script
 * 
 * @param {string} query - The query to process
 * @param {number} limit - Maximum number of search results to process
 * @returns {Promise<object>} - The answer with relevant content
 */
async function executeStandaloneContentExtractor(query, limit = 5) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../scripts/standalone_content_extractor.py');
    
    logger.info(`Executing standalone content extractor for query: ${query}`);
    
    // Find the Python executable to use
    const pythonCommand = process.env.PYTHON_EXECUTABLE || 'python3';
    
    // Spawn the Python process
    const pythonProcess = spawn(pythonCommand, [
      scriptPath,
      query,
      '--limit', limit.toString(),
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
      logger.warn(`Standalone content extractor stderr: ${data.toString()}`);
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Standalone content extractor exited with code ${code}`);
        logger.error(`stderr: ${stderrData}`);
        reject(new Error(`Standalone content extractor exited with code ${code}: ${stderrData}`));
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
          reject(new Error("No JSON content found in output"));
        }
      } catch (error) {
        logger.error(`Failed to parse JSON output: ${error.message}`);
        logger.error(`stdout: ${stdoutData}`);
        reject(new Error(`Failed to parse JSON output: ${error.message}`));
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (error) => {
      logger.error(`Failed to start standalone content extractor process: ${error.message}`);
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
 * Check if standalone content extractor script is working correctly
 * 
 * @returns {Promise<boolean>} - True if script is working
 */
async function isExtractorWorking() {
  try {
    // Check if the standalone Confluence service is working first
    const isConfluenceWorking = await standaloneConfluenceService.isClientWorking();
    if (!isConfluenceWorking) {
      return false;
    }
    
    // Try to execute the script with a simple query to check if it's working
    await executeStandaloneContentExtractor("Test", 1);
    return true;
  } catch (error) {
    logger.error(`Standalone content extractor check failed: ${error.message}`);
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
    
    // Check if standalone content extractor is available
    const extractorAvailable = await isExtractorWorking();
    
    if (shouldExtract && extractorAvailable) {
      logger.info(`Using standalone content extraction for query: ${query}`);
      return await extractContentAndAnswer(query);
    } else {
      logger.info(`Using standalone Confluence service for query: ${query}`);
      
      const searchResults = await standaloneConfluenceService.searchConfluence(query, 5);
      
      if (!searchResults || searchResults.length === 0) {
        return {
          query,
          answer: `Sorry, I couldn't find any information about "${query}" in Confluence.`,
          sources: [],
          direct_search: true
        };
      }
      
      // Format the direct search results
      const formattedResults = [
        `Here are some Confluence pages that might help with your query about "${query}":\n`
      ];
      
      const sources = [];
      
      for (let i = 0; i < Math.min(searchResults.length, 5); i++) {
        const result = searchResults[i];
        formattedResults.push(`### ${result.title}`);
        formattedResults.push(`[View in Confluence](${result.url})\n`);
        
        sources.push({
          title: result.title,
          url: result.url,
          id: result.id
        });
      }
      
      return {
        query,
        answer: formattedResults.join('\n'),
        sources,
        direct_search: true
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
  isExtractorWorking
}; 