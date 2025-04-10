/**
 * Test script for MCP-Confluence integration
 * 
 * This script tests the integration with the mcp-confluence client
 * by performing a search and retrieving a page.
 */

// Initialize MCP client
const mcpClient = require('./utils/mcpClient');

// Initialize the client if not already initialized
if (!global.mcpClient) {
  global.mcpClient = mcpClient;
  mcpClient.initialize();
}

// Test search functionality
async function testSearch() {
  console.log('=== Testing Confluence Search ===');
  try {
    const searchResults = await global.mcpClient.call('mcp_confluence_confluence_search', {
      query: 'AVOS',
      limit: 5
    });
    
    console.log(`Found ${searchResults.results ? searchResults.results.length : 0} results`);
    
    if (searchResults.results && searchResults.results.length > 0) {
      console.log('First result:');
      console.log(`- Title: ${searchResults.results[0].title}`);
      console.log(`- ID: ${searchResults.results[0].id}`);
      console.log(`- URL: ${searchResults.results[0].url || searchResults.results[0]._links?.webui}`);
      
      // Return the first result ID for use in get page test
      return searchResults.results[0].id;
    } else {
      console.log('No search results found');
      return null;
    }
  } catch (error) {
    console.error('Error testing search:', error);
    return null;
  }
}

// Test get page functionality
async function testGetPage(pageId) {
  if (!pageId) {
    console.log('No page ID provided for test, using a default one');
    // Use a default page ID from your Confluence
    pageId = '3123456789'; // Replace with a known page ID
  }
  
  console.log(`\n=== Testing Get Page (ID: ${pageId}) ===`);
  try {
    const page = await global.mcpClient.call('mcp_confluence_confluence_get_page', {
      page_id: pageId,
      include_metadata: true
    });
    
    if (page) {
      console.log(`Retrieved page: "${page.title}"`);
      console.log(`- ID: ${page.id}`);
      console.log(`- Space: ${page.metadata?.spaceKey || 'Unknown'}`);
      console.log(`- Last Updated: ${page.metadata?.lastUpdated || 'Unknown'}`);
      
      // Check for content
      if (page.content) {
        const contentLength = page.content.length;
        console.log(`- Content length: ${contentLength} characters`);
        console.log(`- Content preview: ${page.content.substring(0, 150)}...`);
        
        // Check for code blocks if the service processed them
        if (page.codeBlocks && page.codeBlocks.length > 0) {
          console.log(`- Code blocks found: ${page.codeBlocks.length}`);
          console.log('  First code block:');
          console.log(`  - Language: ${page.codeBlocks[0].language}`);
          console.log(`  - Preview: ${page.codeBlocks[0].code.substring(0, 50)}...`);
        }
      } else {
        console.log('- No content available');
      }
      
      return true;
    } else {
      console.log('No page data returned');
      return false;
    }
  } catch (error) {
    console.error('Error testing get page:', error);
    return false;
  }
}

// Main test function
async function runTests() {
  try {
    console.log('Starting MCP-Confluence integration tests...');
    
    // First test search
    const pageId = await testSearch();
    
    // Then test get page
    await testGetPage(pageId);
    
    console.log('\nTests completed');
  } catch (error) {
    console.error('Error running tests:', error);
  } finally {
    // Clean up
    if (global.mcpClient && typeof global.mcpClient.cleanup === 'function') {
      global.mcpClient.cleanup();
    }
    
    // Exit process after a delay to allow cleanup
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Run the tests
runTests(); 