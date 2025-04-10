require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db/db');
const ConfluenceData = require('./models/ConfluenceData');
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

// Define the function to add a Confluence page
const addConfluencePage = async (pageUrl) => {
  try {
    // Connect to the database
    await connectDB();
    
    console.log('Connected to MongoDB. Preparing to add Confluence page...');
    console.log(`Page URL: ${pageUrl}`);
    
    // Extract the page ID from the URL
    const url = new URL(pageUrl);
    const params = new URLSearchParams(url.search);
    const spaceKey = params.get('spaceKey');
    const title = params.get('title');
    
    console.log(`Space Key: ${spaceKey}`);
    console.log(`Title: ${title}`);
    
    // First try to search for the page in Confluence
    console.log('Searching for the page in Confluence...');
    const searchResults = await confluenceMcpService.searchConfluence(`spaceKey=${spaceKey} AND title="${title.replace(/\+/g, ' ')}"`);
    
    if (!searchResults || searchResults.length === 0) {
      console.log('Page not found in search results. Will try to download by URL directly.');
    } else {
      console.log(`Found ${searchResults.length} search results.`);
      console.log('First result:', searchResults[0]);
    }
    
    // Get the page ID - either from search results or try to download by URL
    let pageId;
    if (searchResults && searchResults.length > 0 && searchResults[0].id) {
      pageId = searchResults[0].id;
      console.log(`Using page ID from search results: ${pageId}`);
    } else {
      console.log('Downloading page by URL...');
      const downloadResult = await confluenceMcpService.downloadPage(pageUrl);
      if (downloadResult && downloadResult.id) {
        pageId = downloadResult.id;
        console.log(`Using page ID from download: ${pageId}`);
      } else {
        throw new Error('Could not determine page ID from URL or search results');
      }
    }
    
    // Get the page content
    console.log(`Fetching page content for ID: ${pageId}`);
    const pageData = await confluenceMcpService.getPage(pageId);
    
    if (!pageData) {
      throw new Error(`Failed to retrieve page data for ID: ${pageId}`);
    }
    
    console.log(`Successfully retrieved page: ${pageData.title}`);
    
    // Check for code blocks
    if (pageData.codeBlocks && pageData.codeBlocks.length > 0) {
      console.log(`Found ${pageData.codeBlocks.length} code blocks in the page.`);
      
      // Log the first few code blocks
      pageData.codeBlocks.slice(0, 3).forEach((block, index) => {
        console.log(`\nCode Block ${index + 1} (${block.language || 'text'}):`);
        console.log(block.code.substring(0, 200) + (block.code.length > 200 ? '...' : ''));
      });
    } else {
      console.log('No code blocks found in the page.');
    }
    
    // Create a new document in the database
    console.log('Creating new document in the database...');
    
    // Create URL for the page
    const pageUrl = `${process.env.CONFLUENCE_HOST}/pages/viewpage.action?pageId=${pageId}`;
    
    // Create a new ConfluenceData object
    const newPage = new ConfluenceData({
      title: pageData.title,
      content: pageData.content,
      processedContent: pageData.content, // This would normally be processed by cleanHtmlContent
      url: pageUrl,
      pageId: pageId,
      spaceKey: spaceKey,
      addedBy: 'Manual Script',
      formatVersion: 2,
      tags: ['confluence', spaceKey].filter(Boolean)
    });
    
    // Save the document
    await newPage.save();
    
    console.log(`Successfully added page "${pageData.title}" to the database.`);
    console.log(`Document ID: ${newPage._id}`);
    
    // Verify the document was added
    const count = await ConfluenceData.countDocuments();
    console.log(`Current document count in ConfluenceData collection: ${count}`);
    
    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    
    return newPage;
  } catch (error) {
    console.error('Error adding Confluence page:', error);
    
    // Try to close the connection even if there was an error
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch (closeError) {
      console.error('Error closing MongoDB connection:', closeError);
    }
    
    process.exit(1);
  }
};

// URL to add
const pageUrl = 'https://confluence.nvidia.com/pages/viewpage.action?spaceKey=DSW&title=HOW+TO%3A+Generate+Hyp8.1+DDU+image+locally';

// Run the function
addConfluencePage(pageUrl); 