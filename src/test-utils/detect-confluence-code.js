require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db/db');
const ConfluenceData = require('./models/ConfluenceData');
const cheerio = require('cheerio');

// Define the function to find code blocks in Confluence content
const detectConfluenceCode = async (spaceKey, title) => {
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
    
    // Load the HTML content with cheerio
    const $ = cheerio.load(page.content);
    
    console.log('\n=== Detecting Code Blocks Using Multiple Methods ===');
    
    // Method 1: Standard <pre> tags
    const preTags = $('pre');
    console.log(`\nMethod 1 - <pre> tags: ${preTags.length} found`);
    
    if (preTags.length > 0) {
      preTags.each((i, el) => {
        if (i < 3) { // Show first 3 examples
          console.log(`\nPre Tag ${i + 1}:`);
          console.log('------------------');
          const text = $(el).text().trim();
          console.log(text.substring(0, 200) + (text.length > 200 ? '...' : ''));
        }
      });
    }
    
    // Method 2: Confluence code macros
    const codeMacros = $('ac\\:structured-macro[ac\\:name="code"]');
    console.log(`\nMethod 2 - Code macros: ${codeMacros.length} found`);
    
    if (codeMacros.length > 0) {
      codeMacros.each((i, el) => {
        if (i < 3) {
          console.log(`\nCode Macro ${i + 1}:`);
          console.log('------------------');
          const language = $(el).find('ac\\:parameter[ac\\:name="language"]').text();
          const codeBody = $(el).find('ac\\:plain-text-body').text();
          console.log(`Language: ${language || 'not specified'}`);
          console.log(codeBody.substring(0, 200) + (codeBody.length > 200 ? '...' : ''));
        }
      });
    }
    
    // Method 3: Code blocks with specific CSS classes
    const codeClasses = $('.code, .codeContent, .code-block, .syntaxhighlighter, .brush:');
    console.log(`\nMethod 3 - Elements with code CSS classes: ${codeClasses.length} found`);
    
    if (codeClasses.length > 0) {
      codeClasses.each((i, el) => {
        if (i < 3) {
          console.log(`\nCode Class Element ${i + 1}:`);
          console.log('------------------');
          console.log(`Class: ${$(el).attr('class')}`);
          const text = $(el).text().trim();
          console.log(text.substring(0, 200) + (text.length > 200 ? '...' : ''));
        }
      });
    }
    
    // Method 4: Code blocks in div with specific formatting
    const codeBlocks = $('div.code, div.preformatted, div.codeBlock, div.codeContent');
    console.log(`\nMethod 4 - Code block divs: ${codeBlocks.length} found`);
    
    if (codeBlocks.length > 0) {
      codeBlocks.each((i, el) => {
        if (i < 3) {
          console.log(`\nCode Block Div ${i + 1}:`);
          console.log('------------------');
          const text = $(el).text().trim();
          console.log(text.substring(0, 200) + (text.length > 200 ? '...' : ''));
        }
      });
    }
    
    // Method 5: Content in monospace font or formatted as code
    const monospace = $('code, tt, kbd, samp, var');
    console.log(`\nMethod 5 - Monospace/code elements: ${monospace.length} found`);
    
    if (monospace.length > 0) {
      monospace.each((i, el) => {
        if (i < 3) {
          console.log(`\nMonospace Element ${i + 1}:`);
          console.log('------------------');
          const text = $(el).text().trim();
          if (text.length > 10) { // Only show if it's substantial
            console.log(text.substring(0, 200) + (text.length > 200 ? '...' : ''));
          }
        }
      });
    }
    
    // Method 6: Look for patterns that often indicate code blocks
    // Common command line patterns (bash, shell)
    const patterns = [
      { name: 'cd command', regex: /\bcd\s+[\w\/\.\-_]+/ },
      { name: 'export', regex: /\bexport\s+\w+=/},
      { name: 'source command', regex: /\bsource\s+[\w\/\.\-_]+/ },
      { name: 'bash script', regex: /#!/ },
      { name: 'package import', regex: /\bimport\s+[\w\.\-_]+/ },
      { name: 'function definition', regex: /\bfunction\s+\w+\s*\(/ },
      { name: 'variable assignment', regex: /\b\w+\s*=\s*/ }
    ];
    
    console.log('\nMethod 6 - Text pattern detection:');
    console.log('--------------------------------');
    
    const contentText = $('body').text();
    const contentLines = contentText.split('\n');
    
    // Potential code blocks (consecutive lines that match patterns)
    let codeBlockStart = -1;
    let inCodeBlock = false;
    let detectedCodeBlocks = [];
    
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i].trim();
      
      // Check if line looks like code
      const isCodeLine = patterns.some(pattern => pattern.regex.test(line));
      
      if (isCodeLine && !inCodeBlock) {
        // Start of a new code block
        inCodeBlock = true;
        codeBlockStart = i;
      } else if (!isCodeLine && inCodeBlock) {
        // End of code block
        if (i - codeBlockStart > 2) { // At least 3 lines of code
          detectedCodeBlocks.push({
            start: codeBlockStart,
            end: i - 1,
            content: contentLines.slice(codeBlockStart, i).join('\n')
          });
        }
        inCodeBlock = false;
      }
    }
    
    // Check if we ended while still in a code block
    if (inCodeBlock && contentLines.length - codeBlockStart > 2) {
      detectedCodeBlocks.push({
        start: codeBlockStart,
        end: contentLines.length - 1,
        content: contentLines.slice(codeBlockStart).join('\n')
      });
    }
    
    console.log(`Detected ${detectedCodeBlocks.length} potential code blocks based on text patterns`);
    
    // Show some examples of detected code blocks
    detectedCodeBlocks.slice(0, 3).forEach((block, i) => {
      console.log(`\nDetected Code Block ${i + 1} (lines ${block.start+1}-${block.end+1}):`);
      console.log('------------------------------');
      console.log(block.content.substring(0, 400) + (block.content.length > 400 ? '...' : ''));
    });
    
    // Try to find the specific environment setup block from the query
    const setupEnvMatch = contentText.match(/setup environment[\s\S]*?export[\s\S]*?SERVICE_WRK_DIR/);
    if (setupEnvMatch) {
      console.log('\nFound the environment setup code block:');
      console.log('-------------------------------------');
      console.log(setupEnvMatch[0]);
    } else {
      console.log('\nCould not find the exact environment setup code block.');
    }
    
    console.log('\n=== Detection Complete ===');
    
    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error detecting code blocks:', error);
    
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
detectConfluenceCode(spaceKey, title); 