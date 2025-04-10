/**
 * Confluence MCP Configuration
 * 
 * This file contains configuration settings for the Confluence MCP integration.
 */

module.exports = {
  // MCP Confluence server configuration
  mcp: {
    // Whether to use the external MCP Confluence service (set to true if the service is started separately)
    useExternalService: true,
    // Path to the mcp-confluence directory
    mcpConfluencePath: process.env.MCP_CONFLUENCE_PATH || '/home/nvidia/dhruvil/git/mcp-confluence',
    // API port for the MCP Confluence service
    apiPort: parseInt(process.env.MCP_API_PORT || '6277', 10),
    // Inspector port for the MCP Confluence service UI
    inspectorPort: parseInt(process.env.MCP_INSPECTOR_PORT || '6274', 10)
  },
  
  // Confluence credentials (can be overridden by environment variables)
  confluence: {
    // Confluence URL
    url: process.env.CONFLUENCE_HOST || 'https://confluence.nvidia.com',
    // Confluence username
    username: process.env.CONFLUENCE_USERNAME,
    // Confluence API token
    apiToken: process.env.CONFLUENCE_API_TOKEN,
    // Confluence personal token (for Server/Data Center)
    personalToken: process.env.CONFLUENCE_PERSONAL_TOKEN
  },
  
  // LLM integration settings
  llm: {
    // Maximum context length for LLM
    maxContextLength: parseInt(process.env.MAX_CONTEXT_LENGTH || '4000', 10),
    // Maximum number of search results to include in context
    maxSearchResults: parseInt(process.env.MAX_SEARCH_RESULTS || '3', 10),
    // Minimum similarity score for semantic search results
    minSimilarityScore: parseFloat(process.env.MIN_SIMILARITY_SCORE || '0.6')
  },
  
  // Function to detect if a query is AVOS-related or a "Go Search" command
  isConfluenceSearchQuery: (query) => {
    if (!query) return false;
    
    const lowerQuery = query.toLowerCase();
    
    // Check for "Go Search" command
    if (lowerQuery.includes('go search')) {
      return true;
    }
    
    // Check if it's an AVOS-related query
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
    
    return avosKeywords.some(keyword => lowerQuery.includes(keyword));
  }
}; 