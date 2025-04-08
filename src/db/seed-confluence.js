const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

// Import the ConfluenceData model
const ConfluenceData = require('../models/ConfluenceData');

// Confluence API configuration
const confluenceConfig = {
  baseUrl: process.env.CONFLUENCE_HOST,
  username: process.env.CONFLUENCE_USERNAME,
  apiToken: process.env.CONFLUENCE_API_TOKEN
};

// Basic auth for Confluence API
const auth = {
  username: confluenceConfig.username,
  password: confluenceConfig.apiToken
};

// Function to fetch a Confluence page by URL
async function fetchConfluencePage(pageUrl) {
  try {
    // Extract page ID from URL
    const pageId = pageUrl.split('pageId=')[1] || 
                  pageUrl.split('pages/')[1]?.split('/')[0] || 
                  pageUrl.split('title=')[1];
    
    if (!pageId) {
      console.error('Could not extract page ID from URL:', pageUrl);
      return null;
    }

    console.log(`Fetching page with ID: ${pageId}`);
    
    // Get page content
    const response = await axios.get(
      `${confluenceConfig.baseUrl}/rest/api/content/${pageId}?expand=body.storage,children.page`,
      { auth }
    );

    const page = response.data;
    
    return {
      title: page.title,
      content: page.body.storage.value,
      url: pageUrl,
      pageId: page.id,
      children: page.children?.page?.results || []
    };
  } catch (error) {
    console.error('Error fetching Confluence page:', error.message);
    return null;
  }
}

// Function to store a page in the database
async function storePage(page, addedBy = 'System') {
  try {
    // Check if the page already exists
    const existingPage = await ConfluenceData.findOne({ url: page.url });
    
    if (existingPage) {
      console.log(`Page "${page.title}" already exists in the database. Updating...`);
      existingPage.title = page.title;
      existingPage.content = page.content;
      await existingPage.save();
      return existingPage;
    } else {
      console.log(`Storing page "${page.title}" in the database...`);
      const newPage = new ConfluenceData({
        title: page.title,
        content: page.content,
        url: page.url,
        addedBy,
        tags: ['AVOS', 'CI', 'Jenkins']
      });
      
      await newPage.save();
      return newPage;
    }
  } catch (error) {
    console.error('Error storing page in database:', error);
    return null;
  }
}

// Function to recursively fetch and store pages
async function fetchAndStoreRecursively(pageUrl, depth = 0, maxDepth = 2) {
  if (depth > maxDepth) {
    console.log(`Maximum depth (${maxDepth}) reached. Stopping recursion.`);
    return;
  }
  
  console.log(`Fetching page at depth ${depth}: ${pageUrl}`);
  const page = await fetchConfluencePage(pageUrl);
  
  if (!page) {
    console.log(`Could not fetch page: ${pageUrl}`);
    return;
  }
  
  await storePage(page);
  
  // Process child pages
  if (page.children && page.children.length > 0) {
    console.log(`Found ${page.children.length} child pages for "${page.title}"`);
    
    for (const child of page.children) {
      const childUrl = `${confluenceConfig.baseUrl}/pages/viewpage.action?pageId=${child.id}`;
      await fetchAndStoreRecursively(childUrl, depth + 1, maxDepth);
    }
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
    
    // The target Confluence page
    const targetUrl = 'https://confluence.nvidia.com/pages/viewpage.action?spaceKey=DSW&title=AVOS+CI+-+End-to-End+Jenkins+Pipeline';
    
    // Fetch and store the page and its children
    await fetchAndStoreRecursively(targetUrl);
    
    console.log('Finished processing Confluence pages');
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the script
main(); 