# AVOS Bot - MCP Integration Scripts

This directory contains scripts that integrate the AVOS bot with Confluence and NVBugs through different methods:

1. Model Context Protocol (MCP) HTTP service
2. Direct MCP module import using mcp_bridge.py
3. Direct Confluence REST API for fallback

## Prerequisites

1. Python 3.6+ with the following packages:
   - `requests`
   - `dotenv`
   - `beautifulsoup4`

2. For MCP HTTP approach: Running MCP server for Confluence
   ```bash
   cd /home/nvidia/dhruvil/git/mcp-confluence && npx @modelcontextprotocol/inspector uv run mcp-confluence --confluence-url=https://confluence.nvidia.com --confluence-username=YOUR_USERNAME --confluence-personal-token=YOUR_TOKEN
   ```

3. For MCP Bridge approach: Properly installed mcp-confluence module
   ```bash
   # Set in your .env file:
   MCP_CONFLUENCE_PATH=/path/to/mcp-confluence
   ```

## Configuration

These scripts use environment variables from your main `.env` file. The following variables are required:

```
# Confluence API Configuration
CONFLUENCE_HOST=https://confluence.nvidia.com
CONFLUENCE_USERNAME=your_username
CONFLUENCE_PERSONAL_TOKEN=your_personal_token

# MCP Configuration
MCP_API_PORT=6277
MCP_INSPECTOR_PORT=6274
USE_MCP=true
MCP_CONFLUENCE_PATH=/path/to/mcp-confluence
```

## Integration Approaches

The scripts can work with multiple API approaches:

1. **MCP Bridge approach**: Directly imports the mcp-confluence module
   - Advantages: No need for running MCP server, more reliable, better performance
   - Requires properly installed mcp-confluence module at MCP_CONFLUENCE_PATH

2. **MCP HTTP approach**: Connects to a running MCP server to access Confluence data
   - Advantages: Consistent with MCP standards, centralized credentials
   - Requires the MCP server to be running

3. **Direct API approach**: Makes HTTP requests directly to Confluence REST API
   - Advantages: No dependency on MCP, more reliable as a fallback
   - Uses the same credentials from your `.env` file

The system will automatically use MCP Bridge if available, then try MCP HTTP if the server is running, and fall back to direct API if:
- The MCP bridge and server are not available
- The `--direct` flag is specified
- The `USE_MCP` environment variable is set to `false`

## Available Scripts

### Bridge Scripts

- `mcp_bridge.py`: Core bridge script that directly connects to the mcp-confluence module
- `direct_confluence_client.py`: Client that uses the bridge to interact with Confluence
- `bridge_content_extractor.py`: Extract content using the bridge approach
- `test_bridge.py`: Test script to verify that the bridge is working properly

### MCP Service Scripts

- `confluence_mcp_client.py`: Low-level client for MCP Confluence API via HTTP
- `confluence_content_extractor.py`: Extract content using MCP HTTP or direct API

### Main Entry Point

- `avos_search_handler.py`: Main script to handle both Confluence and NVBugs searches

```bash
# Basic usage
python avos_search_handler.py "Your search query"

# Force direct API (no MCP)
python avos_search_handler.py "Your search query" --direct

# Examples
python avos_search_handler.py "Go Search AVOS architecture"
python avos_search_handler.py "Bug 1234567"

# Output as JSON
python avos_search_handler.py "AVOS components" --format json
```

### Content Extraction

Use one of these content extractors depending on your preferred approach:

```bash
# Using the bridge approach (recommended)
python bridge_content_extractor.py "What is AVOS?"

# Using MCP HTTP or direct API
python confluence_content_extractor.py "What is AVOS?"

# Force direct API (no MCP)
python confluence_content_extractor.py "What is AVOS?" --direct

# Limit search results 
python bridge_content_extractor.py "AVOS architecture" --limit 10
```

### Using the Bridge Client

```bash
# Search Confluence
python direct_confluence_client.py search "AVOS architecture"

# Get specific page content
python direct_confluence_client.py get-page 123456789

# Get child pages
python direct_confluence_client.py get-children 123456789

# Add a comment to a page
python direct_confluence_client.py add-comment 123456789 "This is a test comment"

# Get comments on a page
python direct_confluence_client.py get-comments 123456789

# Create a new page
python direct_confluence_client.py create-page DEV "Test Page" "# Test Content" --parent-id 123456789

# Update a page
python direct_confluence_client.py update-page 123456789 "Updated Title" "# Updated Content"

# Download a page and its children
python direct_confluence_client.py download-page 123456789 --output-dir ./downloads
```

### Testing the Bridge

```bash
# Run all tests
python test_bridge.py
```

## REST API Endpoints

The scripts work with the following Confluence REST API endpoints:

1. **Search endpoint**:
   - `rest/api/content/search`
   - Parameters: `cql`, `limit`, `expand`

2. **Get page content endpoint**:
   - `rest/api/content/{pageId}`
   - Parameters: `expand`

## MCP Function Names

The scripts use the following MCP function names:

1. **Search function**:
   - `mcp_confluence_confluence_search`
   - Parameters: `query`, `limit`

2. **Get page function**:
   - `mcp_confluence_confluence_get_page`
   - Parameters: `page_id`, `include_metadata`

3. **Get page children function**:
   - `mcp_confluence_confluence_get_page_children`
   - Parameters: `parent_id`, `include_content`, `limit`

4. **Add comment function**:
   - `mcp_confluence_confluence_add_comment`
   - Parameters: `page_id`, `comment`

5. **Get comments function**:
   - `mcp_confluence_confluence_get_comments`
   - Parameters: `page_id`

6. **Create page function**:
   - `mcp_confluence_confluence_create_page`
   - Parameters: `space_key`, `title`, `content`, `parent_id`

7. **Update page function**:
   - `mcp_confluence_confluence_update_page`
   - Parameters: `page_id`, `title`, `content`, `version_comment`, `is_minor_edit`

8. **Download page function**:
   - `mcp_confluence_confluence_download_page`
   - Parameters: `page_id_or_url`, `output_dir`, `download_children`, `download_links`, `export_json`, `max_depth`

## Integration with AVOS Bot

These scripts are designed to be imported and used by the main AVOS bot system. Example integration:

```javascript
// Using the bridge approach (recommended)
const bridgeContentExtractorService = require('./services/bridgeContentExtractorService');

// Process a query
const result = await bridgeContentExtractorService.processQuery("What is AVOS?");

// Or using the fallback approaches
const contentExtractorService = require('./services/contentExtractorService');
const result = await contentExtractorService.processQuery("What is AVOS?");
```

## Debugging

If you encounter issues:

1. Check that the mcp-confluence module is installed correctly:
   - Verify your MCP_CONFLUENCE_PATH environment variable
   - Run the test script: `python test_bridge.py`

2. If the bridge approach fails:
   - Check if the MCP server is running with `curl http://localhost:6277/inspector`
   - Try running with the `--direct` flag to bypass MCP requirements

3. Run with the `-v` or `--verbose` flag for more detailed logs 