# MCP Confluence Integration Guide

This guide explains how to use the MCP Confluence integration in the AVOS Bot project.

## What is MCP Confluence?

MCP (Model Context Protocol) Confluence is a tool that allows you to interact with Confluence pages and spaces programmatically. It provides a standardized interface for searching Confluence, retrieving page content, and performing other operations.

## Setup

### Prerequisites

- Node.js and npm installed
- Python 3.10+ installed
- Access to Confluence with appropriate credentials

### Environment Variables

The integration requires the following environment variables to be set in your `.env` file:

```
CONFLUENCE_HOST=https://confluence.nvidia.com
CONFLUENCE_USERNAME=your_username
CONFLUENCE_API_TOKEN=your_api_token
```

Replace `your_username` and `your_api_token` with your actual Confluence credentials.

## Running the MCP Confluence Service

You can run the MCP Confluence service in two ways:

### Option 1: Standalone Mode

Start the MCP Confluence service separately:

```bash
npm run start-mcp-confluence
```

This will start the MCP service in a separate process. The service will continue running until you stop it (Ctrl+C).

### Option 2: Integrated Mode

The MCP service will be automatically started when needed if it's not already running. This happens when you call any Confluence-related functions in the application.

## Using the Integration

The integration provides several functions for interacting with Confluence:

### Search Confluence

```javascript
const mcpClient = require('./utils/mcpClient');

// Search Confluence
const searchResults = await mcpClient.call('mcp_confluence_confluence_search', {
  query: 'search term',
  limit: 10
});

console.log(`Found ${searchResults.results.length} results`);
```

### Get Page Content

```javascript
const mcpClient = require('./utils/mcpClient');

// Get a specific page by ID
const page = await mcpClient.call('mcp_confluence_confluence_get_page', {
  page_id: '123456789',
  include_metadata: true
});

console.log(`Retrieved page: ${page.title}`);
```

### Other Available Functions

- `mcp_confluence_confluence_get_page_children` - Get child pages
- `mcp_confluence_confluence_add_comment` - Add a comment to a page
- `mcp_confluence_confluence_create_page` - Create a new page
- `mcp_confluence_confluence_update_page` - Update an existing page
- `mcp_confluence_confluence_get_comments` - Get comments for a page
- `mcp_confluence_confluence_download_page` - Download a page and its children

## Testing the Integration

You can test the integration by running:

```bash
npm run test-mcp-confluence
```

This will perform a test search and page retrieval to verify that the integration is working correctly.

## Troubleshooting

### Mock Mode

If the integration fails to connect to the MCP service or Confluence, it will fall back to "mock mode" which returns placeholder data. This is useful for development and testing without an actual Confluence connection.

### Common Issues

1. **Missing Credentials**: Ensure your `.env` file contains the required environment variables.
2. **Connection Issues**: Check that you can access Confluence directly in your browser.
3. **Port Conflicts**: The MCP service uses port 6277 by default. Make sure this port is available.

### Logs

Check the console output for detailed logs about what's happening. The integration provides verbose logging to help diagnose issues. 