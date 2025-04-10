require('dotenv').config();
const confluenceMcpService = require('./services/confluenceMcpService');
const llmService = require('./services/llmService');

// Test URLs - update these with actual Confluence page IDs that contain code blocks
const TEST_PAGE_IDS = [
  process.env.TEST_PAGE_ID || '123456',  // Replace with actual page ID
];

/**
 * Test extracting code blocks from a Confluence page
 */
async function testCodeBlockExtraction() {
  console.log('=== Testing Code Block Extraction from Confluence ===');
  
  try {
    // For each test page
    for (const pageId of TEST_PAGE_IDS) {
      console.log(`\n--- Testing extraction from page ID: ${pageId} ---`);
      
      // Get page content
      const pageData = await confluenceMcpService.getPage(pageId);
      
      if (!pageData) {
        console.error(`Failed to retrieve page ${pageId}`);
        continue;
      }
      
      console.log(`Successfully retrieved page: ${pageData.title}`);
      
      // Check for extracted code blocks
      if (pageData.codeBlocks && pageData.codeBlocks.length > 0) {
        console.log(`\nFound ${pageData.codeBlocks.length} code blocks:`);
        
        // Display each code block
        pageData.codeBlocks.forEach((block, index) => {
          console.log(`\n[Block ${index + 1}] Language: ${block.language || 'text'}`);
          console.log('--- CODE START ---');
          console.log(block.code.substring(0, 500) + (block.code.length > 500 ? '...' : ''));
          console.log('--- CODE END ---');
        });
        
        // Test if code blocks are properly formatted in LLM context
        console.log('\n--- Testing code blocks in LLM context ---');
        
        // Create sample context with code blocks
        let context = 'The following code examples were extracted from Confluence:\n\n';
        pageData.codeBlocks.forEach((block, index) => {
          context += `Example ${index + 1}:\n\`\`\`${block.language || 'text'}\n${block.code}\n\`\`\`\n\n`;
        });
        
        // Test LLM response with code blocks
        const testPrompt = 'Show me the code examples and explain what they do';
        console.log('Getting test LLM response with code blocks...');
        
        const llmResponse = await llmService.getLLMResponse(testPrompt, context);
        
        console.log('\nLLM Response:');
        console.log(llmResponse.response.substring(0, 1000) + (llmResponse.response.length > 1000 ? '...' : ''));
        
        // Check if code blocks are preserved in the response
        if (llmResponse.response.includes('```')) {
          console.log('\nSuccess: Code blocks are preserved in the LLM response');
        } else {
          console.log('\nWarning: Code blocks might not be properly preserved in the LLM response');
        }
      } else {
        console.log('No code blocks found in the page content');
      }
    }
    
    console.log('\n=== Test completed ===');
  } catch (error) {
    console.error('\n=== Test failed ===');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
  }
}

// Initialize global.mcpClient stub for testing if needed
if (!global.mcpClient) {
  console.log('No MCP client found, initializing test stub');
  global.mcpClient = {
    call: async (functionName, params) => {
      console.log(`Test stub called: ${functionName} with params:`, params);
      
      // If this is a get_page call, return mock data
      if (functionName === 'mcp_confluence_confluence_get_page') {
        return {
          id: params.page_id,
          title: 'Test Confluence Page',
          content: `
            <h1>Test Page</h1>
            <p>This is a test page with some code blocks</p>
            
            <h2>Example 1: Python</h2>
            <pre class="language-python">def hello_world():
    print("Hello, World!")
    
hello_world()</pre>
            
            <h2>Example 2: JavaScript</h2>
            <pre class="language-javascript">function helloWorld() {
    console.log("Hello, World!");
}

helloWorld();</pre>

            <h2>Example 3: Macro</h2>
            <ac:structured-macro ac:name="code">
              <ac:parameter ac:name="language">java</ac:parameter>
              <ac:plain-text-body>public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}</ac:plain-text-body>
            </ac:structured-macro>
          `
        };
      }
      
      return null;
    }
  };
}

// Run the test
testCodeBlockExtraction().catch(err => {
  console.error('Unhandled error:', err);
});
