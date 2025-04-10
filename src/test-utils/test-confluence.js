require('dotenv').config();
const ConfluenceService = require('./services/confluenceService');

// URL to test
const TEST_URL = 'https://confluence.nvidia.com/pages/viewpage.action?spaceKey=~kballa&title=Kedareswar+AVOS-Info';

// Create Confluence service with credentials from .env
const confluenceService = new ConfluenceService(
  process.env.CONFLUENCE_HOST,
  process.env.CONFLUENCE_USERNAME,
  process.env.CONFLUENCE_API_TOKEN
);

async function testConfluenceExtraction() {
  console.log('=== Testing Confluence Extraction with URL ===');
  console.log(`URL: ${TEST_URL}`);
  
  try {
    // Extract page info
    console.log('\n--- Extracting page info ---');
    const pageInfo = confluenceService.extractPageInfo(TEST_URL);
    console.log('Space Key:', pageInfo.spaceKey);
    console.log('Title:', pageInfo.title);
    
    // Test getting page content
    console.log('\n--- Fetching page content ---');
    const pageContent = await confluenceService.getPageContent(TEST_URL);
    
    if (pageContent) {
      console.log('Successfully retrieved page content:');
      console.log('Page ID:', pageContent.id);
      console.log('Page Title:', pageContent.title);
      console.log('Content Length:', pageContent.content.length, 'characters');
      console.log('Number of Children:', pageContent.children ? pageContent.children.length : 0);
      
      // Show first 500 characters of content
      console.log('\nContent preview:');
      console.log(pageContent.content.substring(0, 500) + '...');
    } else {
      console.error('Failed to retrieve page content');
    }
    
    // Test recursive processing (limit to depth 0 for testing)
    console.log('\n--- Testing recursive processing ---');
    const processedPages = await confluenceService.processPageRecursive(TEST_URL, 0, 0);
    console.log(`Processed ${processedPages.length} pages`);
    
    console.log('\n=== Test completed successfully ===');
  } catch (error) {
    console.error('\n=== Test failed ===');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

// Run the test
testConfluenceExtraction().catch(err => {
  console.error('Unhandled error:', err);
}); 