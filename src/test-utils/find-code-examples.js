require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db/db');
const ConfluenceData = require('./models/ConfluenceData');
const cheerio = require('cheerio');

// Define the function to find code blocks in Confluence content
const findCodeExamples = async (spaceKey, title) => {
  try {
    // Connect to the database
    await connectDB();
    
    console.log('Connected to MongoDB. Looking for code blocks...');
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
    
    console.log(`\nFound page: ${page.title} (ID: ${page._id})`);
    console.log(`Content length: ${page.content.length} characters`);
    
    // Load the HTML content with cheerio
    const $ = cheerio.load(page.content);
    
    console.log('\n=== Detecting Code Blocks ===');
    
    // Method 1: Standard <pre> tags
    const preTags = $('pre');
    console.log(`\n1. <pre> tags: ${preTags.length} found`);
    
    if (preTags.length > 0) {
      preTags.each((i, el) => {
        if (i < 3) { // Show first 3 examples
          console.log(`\n<pre> tag ${i + 1}:`);
          console.log('------------------');
          console.log($(el).text().trim().substring(0, 200));
        }
      });
    }
    
    // Method 2: Confluence code macros
    console.log('\n2. Looking for Confluence code macros:');
    
    // The page likely contains the raw XML for the macro
    const macroMatches = page.content.match(/<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/g) || [];
    const codeMacros = macroMatches.filter(m => m.includes('ac:name="code"'));
    
    console.log(`Found ${codeMacros.length} code macros`);
    
    if (codeMacros.length > 0) {
      codeMacros.forEach((macro, i) => {
        if (i < 3) {
          console.log(`\nCode Macro ${i + 1}:`);
          console.log('------------------');
          
          // Extract language
          const langMatch = macro.match(/<ac:parameter ac:name="language">(.*?)<\/ac:parameter>/);
          const language = langMatch ? langMatch[1] : 'unknown';
          
          // Extract code content
          const contentMatch = macro.match(/<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/);
          const content = contentMatch ? contentMatch[1] : '';
          
          console.log(`Language: ${language}`);
          console.log(content.substring(0, 300));
          console.log('------------------');
        }
      });
    }
    
    // Method 3: Text-based pattern detection (look for shell commands)
    console.log('\n3. Text-based pattern detection:');
    
    // Extract all text
    const allText = $('body').text();
    
    // Look for the specific environment setup block as shown in the query
    const setupEnvRegex = /setup environment[\s\S]*?cd[\s\S]*?source[\s\S]*?export[\s\S]*?SERVICE_WRK_DIR/i;
    const setupEnvMatch = allText.match(setupEnvRegex);
    
    if (setupEnvMatch) {
      console.log('\nFound environment setup code block:');
      console.log('------------------');
      console.log(setupEnvMatch[0]);
      console.log('------------------');
    } else {
      console.log('\nCould not find the exact environment setup code block.');
    }
    
    // Look for common shell commands
    const shellCmdRegex = /(export\s+\w+\s*=|cd\s+[\w\/\.\-_]+|source\s+[\w\/\.\-_]+)/g;
    const shellCmds = allText.match(shellCmdRegex) || [];
    
    console.log(`\nFound ${shellCmds.length} shell commands`);
    if (shellCmds.length > 0) {
      console.log('Sample commands:');
      shellCmds.slice(0, 10).forEach(cmd => {
        console.log(`- ${cmd}`);
      });
    }
    
    // Method 4: Raw HTML analysis for other code formatting
    console.log('\n4. Raw HTML analysis:');
    
    // Look for code-related class attributes
    const codeClassRegex = /class="[^"]*code[^"]*"/g;
    const codeClasses = page.content.match(codeClassRegex) || [];
    
    console.log(`Found ${codeClasses.length} elements with code-related classes`);
    
    // Extract the original Confluence page content in raw form
    console.log('\n=== Raw Content Sample ===');
    console.log(page.content.substring(0, 500) + '...');
    
    // Process the page content and look for specific blocks around the environment variables
    console.log('\n=== Searching for Environment Setup in ProcessedContent ===');
    
    // Examine processedContent which might be cleaner
    if (page.processedContent) {
      const processedText = page.processedContent;
      console.log(`ProcessedContent length: ${processedText.length} characters`);
      
      // Look for export commands in the processed content
      const exportCmds = processedText.match(/export\s+\w+\s*=.*/g) || [];
      
      if (exportCmds.length > 0) {
        console.log(`\nFound ${exportCmds.length} export commands in processed content:`);
        exportCmds.forEach(cmd => console.log(`- ${cmd}`));
        
        // Try to find the surrounding context
        const exportIndex = processedText.indexOf(exportCmds[0]);
        if (exportIndex > 0) {
          const contextStart = Math.max(0, exportIndex - 100);
          const contextEnd = Math.min(processedText.length, exportIndex + 300);
          const context = processedText.substring(contextStart, contextEnd);
          
          console.log('\nContext around first export command:');
          console.log('------------------');
          console.log(context);
          console.log('------------------');
        }
      } else {
        console.log('No export commands found in processed content');
      }
    } else {
      console.log('No processed content available');
    }
    
    // Close the connection
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed');
  } catch (error) {
    console.error('Error finding code examples:', error);
    
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch (closeError) {
      console.error('Error closing MongoDB connection:', closeError);
    }
    
    process.exit(1);
  }
};

// Parameters for the page to check
const spaceKey = 'DSW';
const title = 'HOW TO: Generate Hyp8.1 DDU image locally';

// Run the function
findCodeExamples(spaceKey, title); 