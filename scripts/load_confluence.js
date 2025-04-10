#!/usr/bin/env node

/**
 * Command-line script to load Confluence pages into the database
 * 
 * Usage: node scripts/load_confluence.js <url1> <url2> ...
 * Options:
 *   --no-recursive    Don't process pages recursively
 *   --depth <depth>   Maximum recursion depth (default: 3)
 */

require('dotenv').config();
const { connectDB } = require('../src/db/mongoose');
const { loadConfluencePages } = require('../src/utils/confluence_integration');

// Parse command line arguments
const args = process.argv.slice(2);
const urls = [];
const options = {
  recursive: true,
  depth: 3
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--no-recursive') {
    options.recursive = false;
  } else if (arg === '--depth' && i + 1 < args.length) {
    options.depth = parseInt(args[++i], 10);
  } else if (arg.startsWith('--')) {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  } else {
    urls.push(arg);
  }
}

// Check if URLs were provided
if (urls.length === 0) {
  console.error('Error: No URLs provided');
  console.log('Usage: node scripts/load_confluence.js <url1> <url2> ...');
  console.log('Options:');
  console.log('  --no-recursive    Don\'t process pages recursively');
  console.log('  --depth <depth>   Maximum recursion depth (default: 3)');
  process.exit(1);
}

// Connect to MongoDB and load pages
async function main() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    console.log(`Loading ${urls.length} Confluence pages...`);
    console.log(`Recursive: ${options.recursive ? 'Yes' : 'No'}, Depth: ${options.depth}`);
    
    const result = await loadConfluencePages(urls, options);
    
    if (result.success) {
      console.log('Successfully loaded Confluence pages.');
      if (result.details) {
        console.log('\nDetails:');
        console.log(result.details);
      }
    } else {
      console.error('Failed to load Confluence pages:', result.message);
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 