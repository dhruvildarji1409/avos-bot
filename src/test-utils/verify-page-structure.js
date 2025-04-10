require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db/db');
const ConfluenceData = require('./models/ConfluenceData');
const { getEmbedding } = require('./services/embeddingService');

// Define the function to verify a specific page
const verifyPageStructure = async (spaceKey, title) => {
  try {
    // Connect to the database
    await connectDB();
    
    console.log('Connected to MongoDB. Verifying page structure...');
    console.log(`Looking for page with Space Key: ${spaceKey}, Title: ${title}`);
    
    // Find the page in the database
    const page = await ConfluenceData.findOne({ 
      spaceKey: spaceKey,
      title: { $regex: new RegExp(title, 'i') } // Case-insensitive match
    });
    
    if (!page) {
      console.log('Page not found in database. Make sure you have added it through the admin interface.');
      await mongoose.connection.close();
      return;
    }
    
    console.log('\n=== Page Information ===');
    console.log(`ID: ${page._id}`);
    console.log(`Title: ${page.title}`);
    console.log(`Page ID: ${page.pageId}`);
    console.log(`Space Key: ${page.spaceKey}`);
    console.log(`URL: ${page.url}`);
    console.log(`Format Version: ${page.formatVersion}`);
    console.log(`Added By: ${page.addedBy}`);
    console.log(`Last Updated: ${page.lastUpdated}`);
    console.log(`Tags: ${page.tags ? page.tags.join(', ') : 'None'}`);
    
    // Check for embedding
    if (page.embedding && page.embedding.length > 0) {
      console.log(`\nEmbedding: Present (${page.embedding.length} dimensions)`);
    } else {
      console.log('\nEmbedding: Missing');
    }
    
    // Check if the content is properly processed
    if (page.content) {
      console.log(`\nContent: Present (${page.content.length} characters)`);
      // Check for HTML tags indicating proper content
      if (page.content.includes('<html') || page.content.includes('<body')) {
        console.log('Content appears to be HTML formatted');
      }
    } else {
      console.log('\nContent: Missing');
    }
    
    if (page.processedContent) {
      console.log(`\nProcessed Content: Present (${page.processedContent.length} characters)`);
    } else {
      console.log('\nProcessed Content: Missing');
    }
    
    // Check for sections
    if (page.sections && page.sections.length > 0) {
      console.log(`\n=== Sections (${page.sections.length}) ===`);
      page.sections.forEach((section, index) => {
        console.log(`\nSection ${index + 1}:`);
        console.log(`Heading: ${section.heading}`);
        console.log(`Level: ${section.level}`);
        console.log(`Order: ${section.order}`);
        console.log(`Content Preview: ${section.content ? section.content.substring(0, 100) + '...' : 'None'}`);
        console.log(`Embedding: ${section.embedding && section.embedding.length > 0 ? 'Present' : 'Missing'}`);
      });
    } else {
      console.log('\nSections: None found');
    }
    
    // Look for code blocks in content
    const codeBlockMatches = page.content.match(/<pre class=".*?">[\s\S]*?<\/pre>/g) || [];
    const macroMatches = page.content.match(/<ac:structured-macro ac:name="code">[\s\S]*?<\/ac:structured-macro>/g) || [];
    
    console.log(`\n=== Code Blocks ===`);
    console.log(`HTML <pre> tags: ${codeBlockMatches.length}`);
    console.log(`Confluence macros: ${macroMatches.length}`);
    
    // Display first few code blocks if present
    if (codeBlockMatches.length > 0 || macroMatches.length > 0) {
      console.log('\nSample of code blocks:');
      
      // HTML pre tags
      codeBlockMatches.slice(0, 2).forEach((match, index) => {
        const content = match.replace(/<pre.*?>/g, '').replace(/<\/pre>/g, '');
        console.log(`\nHTML Code Block ${index + 1}:`);
        console.log(content.substring(0, 150) + (content.length > 150 ? '...' : ''));
      });
      
      // Confluence macros
      macroMatches.slice(0, 2).forEach((match, index) => {
        const langMatch = match.match(/<ac:parameter ac:name="language">(.*?)<\/ac:parameter>/);
        const language = langMatch ? langMatch[1] : 'unknown';
        
        const contentMatch = match.match(/<ac:plain-text-body>([\s\S]*?)<\/ac:plain-text-body>/);
        const content = contentMatch ? contentMatch[1] : '';
        
        console.log(`\nMacro Code Block ${index + 1} (${language}):`);
        console.log(content.substring(0, 150) + (content.length > 150 ? '...' : ''));
      });
    }
    
    console.log('\n=== Verification Complete ===');
    
    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error verifying page structure:', error);
    
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

// Parameters for the page to verify
const spaceKey = 'DSW';
const title = 'HOW TO: Generate Hyp8.1 DDU image locally';

// Run the function
verifyPageStructure(spaceKey, title); 