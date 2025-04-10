require('dotenv').config();
const confluenceMcpService = require('./services/confluenceMcpService');

// Initialize MCP client if needed
if (global.mcpClient) {
  console.log('MCP client already initialized');
} else {
  console.log('Initializing MCP client');
  const mcpClient = require('./utils/mcpClient');
  global.mcpClient = mcpClient;
  mcpClient.initialize();
}

// Function to check for code blocks
const checkCodeBlocks = async (pageId) => {
  try {
    console.log(`Checking code blocks for page ID: ${pageId}`);
    
    // Get page content
    const pageData = await confluenceMcpService.getPage(pageId);
    
    if (!pageData) {
      console.error(`Failed to retrieve page data for ID: ${pageId}`);
      return;
    }
    
    console.log(`Retrieved page: ${pageData.title}`);
    
    // Look for code blocks in content using extractCodeBlocks method
    console.log('\nExtracting code blocks...');
    
    // Check if the method exists and use it
    if (typeof confluenceMcpService.extractCodeBlocks === 'function') {
      const codeBlocks = confluenceMcpService.extractCodeBlocks(pageData.content);
      
      if (codeBlocks && codeBlocks.length > 0) {
        console.log(`Found ${codeBlocks.length} code blocks.`);
        
        // Print some information about each code block
        codeBlocks.forEach((block, index) => {
          console.log(`\nCode Block ${index + 1}:`);
          console.log(`Language: ${block.language || 'text'}`);
          console.log(`Preview: ${block.code.substring(0, 150)}...`);
          console.log(`Length: ${block.code.length} characters`);
        });
      } else {
        console.log('No code blocks found using the extractCodeBlocks method.');
      }
    } else {
      console.log('The extractCodeBlocks method is not available.');
    }
    
    // Check if the page has codeBlocks property (already extracted)
    if (pageData.codeBlocks && pageData.codeBlocks.length > 0) {
      console.log(`\nPage already has ${pageData.codeBlocks.length} extracted code blocks.`);
      
      pageData.codeBlocks.forEach((block, index) => {
        console.log(`\nCode Block ${index + 1}:`);
        console.log(`Language: ${block.language || 'text'}`);
        console.log(`Preview: ${block.code.substring(0, 150)}...`);
        console.log(`Length: ${block.code.length} characters`);
      });
    } else if (pageData.formattedCodeBlocks && pageData.formattedCodeBlocks.length > 0) {
      console.log(`\nPage has ${pageData.formattedCodeBlocks.length} formatted code blocks.`);
      
      pageData.formattedCodeBlocks.forEach((block, index) => {
        console.log(`\nCode Block ${index + 1}:`);
        console.log(`ID: ${block.id}`);
        console.log(`Language: ${block.language}`);
        console.log(`Preview: ${block.code.substring(0, 150)}...`);
        console.log(`Length: ${block.code.length} characters`);
      });
    } else {
      console.log('\nNo pre-extracted code blocks found in the page data.');
      
      // Manual check for code patterns in content
      console.log('\nPerforming manual content check for code patterns...');
      
      // Check for <pre> tags (standard code blocks)
      const preMatches = pageData.content.match(/<pre[\s\S]*?<\/pre>/g) || [];
      console.log(`Found ${preMatches.length} <pre> tags.`);
      
      // Check for Confluence macros
      const macroMatches = pageData.content.match(/<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/g) || [];
      const codeMacros = macroMatches.filter(m => m.includes('ac:name="code"'));
      console.log(`Found ${codeMacros.length} code macros.`);
      
      // Check for code within specific containers
      const codeContainers = pageData.content.match(/class="code[\s\S]*?<\/div>/g) || [];
      console.log(`Found ${codeContainers.length} code containers.`);
      
      // Print examples of what was found
      if (preMatches.length > 0) {
        console.log('\nExample of <pre> tag content:');
        console.log(preMatches[0].substring(0, 200) + '...');
      }
      
      if (codeMacros.length > 0) {
        console.log('\nExample of code macro content:');
        console.log(codeMacros[0].substring(0, 200) + '...');
      }
      
      if (codeContainers.length > 0) {
        console.log('\nExample of code container content:');
        console.log(codeContainers[0].substring(0, 200) + '...');
      }
    }
    
    console.log('\nCheck completed.');
  } catch (error) {
    console.error('Error checking code blocks:', error);
  }
};

// Page ID to check (from the verification output)
const pageId = '1132706289';

// Run the function
checkCodeBlocks(pageId); 