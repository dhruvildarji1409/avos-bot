#!/usr/bin/env python3
"""
MCP Confluence Bridge Script
This script provides a simple bridge between Node.js and the mcp-confluence package.
"""
import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add the local mcp-confluence directory to the Python path for testing
LOCAL_MCP_CONFLUENCE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_confluence")
if os.path.exists(LOCAL_MCP_CONFLUENCE_PATH):
    sys.path.insert(0, LOCAL_MCP_CONFLUENCE_PATH)

# Add the configured mcp-confluence directory to the Python path
MCP_CONFLUENCE_PATH = os.getenv("MCP_CONFLUENCE_PATH", "/home/nvidia/dhruvil/git/mcp-confluence")
if os.path.exists(MCP_CONFLUENCE_PATH):
    sys.path.insert(0, MCP_CONFLUENCE_PATH)

# Check paths
sys.stderr.write(f"Python path: {sys.path}\n")

try:
    # Try to import from the local test module first
    try:
        sys.stderr.write("Trying import from local test module...\n")
        from src.mcp_confluence.api import ConfluenceAPI
        from src.mcp_confluence.tools import (
            confluence_search,
            confluence_get_page,
            confluence_get_page_children,
            confluence_add_comment,
            confluence_create_page,
            confluence_update_page,
            confluence_get_comments,
            confluence_download_page
        )
        sys.stderr.write("Successfully imported from local test module\n")
    # Then try the configured mcp-confluence module
    except ImportError as e:
        sys.stderr.write(f"Local import failed: {str(e)}\n")
        sys.stderr.write("Trying import from configured MCP_CONFLUENCE_PATH...\n")
        
        try:
            from src.mcp_confluence.api import ConfluenceAPI
            from src.mcp_confluence.tools import (
                confluence_search,
                confluence_get_page,
                confluence_get_page_children,
                confluence_add_comment,
                confluence_create_page,
                confluence_update_page,
                confluence_get_comments,
                confluence_download_page
            )
            sys.stderr.write("Successfully imported from src.mcp_confluence\n")
        except ImportError:
            from mcp_confluence.api import ConfluenceAPI
            from mcp_confluence.tools import (
                confluence_search,
                confluence_get_page,
                confluence_get_page_children,
                confluence_add_comment,
                confluence_create_page,
                confluence_update_page,
                confluence_get_comments,
                confluence_download_page
            )
            sys.stderr.write("Successfully imported from mcp_confluence\n")
except ImportError as e:
    sys.stderr.write(f"Error importing mcp_confluence module: {str(e)}\n")
    sys.stderr.write(f"Python path: {sys.path}\n")
    sys.stderr.write("Make sure MCP_CONFLUENCE_PATH is set correctly in your .env file.\n")
    sys.exit(1)

# Create Confluence API client using credentials from environment
try:
    confluence_api = ConfluenceAPI(
        url=os.getenv("CONFLUENCE_HOST", "https://confluence.nvidia.com"),
        username=os.getenv("CONFLUENCE_USERNAME"),
        token=os.getenv("CONFLUENCE_PERSONAL_TOKEN"),
    )
except Exception as e:
    sys.stderr.write(f"Error creating ConfluenceAPI client: {str(e)}\n")
    sys.exit(1)

# Function mapping for MCP function names to actual implementation functions
function_map = {
    "mcp_confluence_confluence_search": confluence_search,
    "mcp_confluence_confluence_get_page": confluence_get_page,
    "mcp_confluence_confluence_get_page_children": confluence_get_page_children,
    "mcp_confluence_confluence_add_comment": confluence_add_comment,
    "mcp_confluence_confluence_create_page": confluence_create_page,
    "mcp_confluence_confluence_update_page": confluence_update_page,
    "mcp_confluence_confluence_get_comments": confluence_get_comments,
    "mcp_confluence_confluence_download_page": confluence_download_page
}

def main():
    """Main function to handle command-line arguments and execute MCP functions."""
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: python mcp_bridge.py <function_name> <params_json>\n")
        sys.exit(1)
    
    function_name = sys.argv[1]
    params_json = sys.argv[2]
    
    try:
        params = json.loads(params_json)
    except json.JSONDecodeError:
        sys.stderr.write("Error: Parameters must be valid JSON.\n")
        sys.exit(1)
    
    if function_name not in function_map:
        sys.stderr.write(f"Error: Unknown function '{function_name}'.\n")
        sys.stderr.write(f"Available functions: {', '.join(function_map.keys())}\n")
        sys.exit(1)
    
    try:
        # Call the appropriate function with the parameters
        result = function_map[function_name](confluence_api, **params)
        
        # Convert the result to JSON and print to stdout
        print(json.dumps(result))
    except Exception as e:
        sys.stderr.write(f"Error executing function: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    main() 