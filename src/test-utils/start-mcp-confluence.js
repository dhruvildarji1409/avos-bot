/**
 * MCP Confluence Service Starter
 * 
 * This script starts the MCP Confluence service using the MCP Inspector.
 * Run this script before starting the main application if you want to 
 * run the MCP service separately.
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configure Confluence credentials
const confluenceUrl = process.env.CONFLUENCE_HOST || 'https://confluence.nvidia.com';
const confluenceUsername = process.env.CONFLUENCE_USERNAME;
const confluenceToken = process.env.CONFLUENCE_API_TOKEN;

if (!confluenceUsername || !confluenceToken) {
  console.error('Missing Confluence credentials. Check your .env file.');
  process.exit(1);
}

// Define path to mcp-confluence directory - use the path that we know is working
const mcpConfluencePath = '/home/nvidia/dhruvil/git/mcp-confluence';

// Check if the directory exists
if (!fs.existsSync(mcpConfluencePath)) {
  console.error(`MCP Confluence directory not found at: ${mcpConfluencePath}`);
  console.error('Please ensure the mcp-confluence directory is present.');
  process.exit(1);
}

console.log(`Starting MCP Confluence service with URL: ${confluenceUrl}`);
console.log(`Username: ${confluenceUsername}`);
console.log(`Using mcp-confluence from: ${mcpConfluencePath}`);

// Start the MCP inspector with mcp-confluence - using the exact working command
const mcpInspectorProcess = spawn('npx', [
  '@modelcontextprotocol/inspector',
  'uv',
  'run',
  'mcp-confluence',
  '--confluence-url', confluenceUrl,
  '--confluence-username', confluenceUsername,
  '--confluence-personal-token', confluenceToken
], {
  cwd: mcpConfluencePath, // This is crucial - run from the working directory
  stdio: 'inherit'
});

// Handle process events
mcpInspectorProcess.on('close', (code) => {
  console.log(`MCP Confluence process exited with code ${code}`);
  process.exit(code);
});

// Handle termination signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down MCP Confluence service...`);
    mcpInspectorProcess.kill();
  });
});

console.log('MCP Confluence service started. Press Ctrl+C to stop.'); 