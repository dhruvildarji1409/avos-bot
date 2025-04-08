const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// Import the ConfluenceData model and services
const ConfluenceData = require('../models/ConfluenceData');
const ConfluenceService = require('../services/confluenceService');
const { getEmbedding } = require('../services/embeddingService');

// Confluence API configuration
const confluenceConfig = {
  baseUrl: process.env.CONFLUENCE_HOST,
  username: process.env.CONFLUENCE_USERNAME,
  apiToken: process.env.CONFLUENCE_API_TOKEN
};

// Create Confluence service instance
const confluenceService = new ConfluenceService(
  confluenceConfig.baseUrl,
  confluenceConfig.username,
  confluenceConfig.apiToken
);

// Function to extract and store a Confluence page with all related data
async function processConfluencePage(pageUrl, options = {}) {
  try {
    console.log(`Processing Confluence page: ${pageUrl}`);
    
    // Use the enhanced method for structured processing
    const page = await confluenceService.processPageStructured(pageUrl, {
      extractSections: true,
      maxDepth: options.maxDepth || 2,
      processChildren: options.processChildren || true,
      includeMetadata: true
    });
    
    if (!page) {
      console.error(`Failed to process page: ${pageUrl}`);
      return null;
    }
    
    // Store the page with embeddings
    const storedPage = await confluenceService.storePageWithEmbeddings(
      ConfluenceData,
      page,
      options.addedBy || 'System'
    );
    
    console.log(`Successfully stored page: ${page.title}`);
    
    // Process children if available
    if (page.processedChildren && page.processedChildren.length > 0) {
      console.log(`Processing ${page.processedChildren.length} child pages for: ${page.title}`);
      
      for (const childPage of page.processedChildren) {
        // Store each child page
        await confluenceService.storePageWithEmbeddings(
          ConfluenceData,
          childPage,
          options.addedBy || 'System'
        );
      }
    }
    
    return storedPage;
  } catch (error) {
    console.error(`Error processing Confluence page: ${error.message}`);
    return null;
  }
}

// Function to process a space or collection of pages
async function processConfluenceSpace(spaceKey, options = {}) {
  try {
    console.log(`Processing Confluence space: ${spaceKey}`);
    
    // Get space information
    const response = await axios.get(
      `${confluenceConfig.baseUrl}/rest/api/space/${spaceKey}?expand=description.plain`,
      {
        auth: {
          username: confluenceConfig.username,
          password: confluenceConfig.apiToken
        }
      }
    );
    
    if (!response.data) {
      throw new Error(`Could not fetch space: ${spaceKey}`);
    }
    
    const space = response.data;
    console.log(`Processing space: ${space.name} (${space.key})`);
    
    // Get space homepage
    if (space.homepage) {
      const homepageUrl = `${confluenceConfig.baseUrl}/pages/viewpage.action?pageId=${space.homepage.id}`;
      await processConfluencePage(homepageUrl, {
        ...options,
        maxDepth: 1 // Limit depth for space homepage
      });
    }
    
    // Get popular pages in the space
    const pagesResponse = await axios.get(
      `${confluenceConfig.baseUrl}/rest/api/content?spaceKey=${spaceKey}&expand=version&limit=50`,
      {
        auth: {
          username: confluenceConfig.username,
          password: confluenceConfig.apiToken
        }
      }
    );
    
    if (pagesResponse.data && pagesResponse.data.results) {
      const pages = pagesResponse.data.results;
      console.log(`Found ${pages.length} pages in space ${spaceKey}`);
      
      for (const page of pages) {
        const pageUrl = `${confluenceConfig.baseUrl}/pages/viewpage.action?pageId=${page.id}`;
        await processConfluencePage(pageUrl, options);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error processing Confluence space: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
    
    // Process specific pages
    const targetPages = [
      // Add important Confluence pages here
      'https://confluence.nvidia.com/display/DSW/AVOS+CI+-+End-to-End+Jenkins+Pipeline',
      'https://confluence.nvidia.com/display/DSW/HOW+TO%3A+Generate+Hyp8.1+DDU+image+locally'
    ];
    
    for (const pageUrl of targetPages) {
      await processConfluencePage(pageUrl, {
        maxDepth: 2,
        processChildren: true,
        addedBy: 'System'
      });
    }
    
    // Process specific spaces
    const targetSpaces = [
      // Add important Confluence spaces here
      'DSW'
    ];
    
    for (const spaceKey of targetSpaces) {
      await processConfluenceSpace(spaceKey, {
        maxDepth: 1,
        processChildren: true,
        addedBy: 'System'
      });
    }
    
    console.log('Finished processing Confluence content');
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
}

// If this file is run directly, execute the main function
if (require.main === module) {
  main();
}

// Export functions for use in other scripts
module.exports = {
  processConfluencePage,
  processConfluenceSpace
}; 