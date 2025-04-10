#!/usr/bin/env python3
"""
AVOS Bot - MCP Confluence Client

This script provides a client for connecting to the running MCP Confluence service.
It allows for searching and retrieving Confluence content through the MCP service.
"""
import os
import sys
import json
import argparse
import requests
from urllib.parse import urljoin
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get MCP configuration from environment variables
MCP_API_PORT = int(os.getenv("MCP_API_PORT", "6277"))
MCP_INSPECTOR_PORT = int(os.getenv("MCP_INSPECTOR_PORT", "6274"))
MCP_BASE_URL = f"http://localhost:{MCP_API_PORT}"

# Confluence configuration
CONFLUENCE_URL = os.getenv("CONFLUENCE_HOST", "https://confluence.nvidia.com")
CONFLUENCE_USERNAME = os.getenv("CONFLUENCE_USERNAME")
CONFLUENCE_TOKEN = os.getenv("CONFLUENCE_PERSONAL_TOKEN")

# Check if MCP server is running
def is_mcp_server_running():
    """Check if the MCP server is running."""
    try:
        response = requests.get(f"{MCP_BASE_URL}/inspector", timeout=1)
        return response.status_code == 200
    except requests.exceptions.RequestException:
        return False

# Call MCP function
def call_mcp_function(function_name, params=None):
    """
    Call an MCP function with the given parameters.
    
    Args:
        function_name (str): The name of the MCP function to call
        params (dict): Parameters to pass to the function
        
    Returns:
        dict: The result of the MCP function call
    """
    if params is None:
        params = {}
    
    # Check if MCP server is running
    if not is_mcp_server_running():
        print("Error: MCP server is not running. Please start it first.", file=sys.stderr)
        print(f"To start the MCP server, run: cd /home/nvidia/dhruvil/git/mcp-confluence && npx @modelcontextprotocol/inspector uv run mcp-confluence --confluence-url={CONFLUENCE_URL} --confluence-username={CONFLUENCE_USERNAME} --confluence-personal-token={CONFLUENCE_TOKEN}", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Try direct tool execution first
        url = f"{MCP_BASE_URL}/api/v1/tools/{function_name}"
        response = requests.post(url, json=params)
        
        if response.status_code != 200:
            # Fall back to execution API method
            print(f"Direct tool call failed. Falling back to execution API...", file=sys.stderr)
            
            # Register execution
            exec_response = requests.post(f"{MCP_BASE_URL}/api/v1/execute", json={
                "conversation_id": f"avos-bot-{os.urandom(4).hex()}",
                "conversation_history": [{
                    "role": "user",
                    "content": f"Execute the {function_name} tool"
                }]
            })
            
            if exec_response.status_code != 200:
                raise Exception(f"Failed to start MCP execution: {exec_response.status_code}")
            
            execution_id = exec_response.json()["execution_id"]
            
            # Execute the tool
            exec_call_response = requests.post(f"{MCP_BASE_URL}/api/v1/tools/execute", json={
                "execution_id": execution_id,
                "tool_name": function_name,
                "tool_parameters": params
            })
            
            if exec_call_response.status_code != 200:
                raise Exception(f"MCP tool execution failed: {exec_call_response.status_code}")
            
            return exec_call_response.json()["result"]
        
        return response.json()
    except Exception as e:
        print(f"Error calling MCP function {function_name}: {str(e)}", file=sys.stderr)
        
        # If MCP fails, try calling Confluence API directly as fallback
        if function_name == "mcp_confluence_confluence_search":
            return fallback_search_confluence(params.get("query", ""), params.get("limit", 10))
        elif function_name == "mcp_confluence_confluence_get_page":
            return fallback_get_page_content(params.get("page_id", ""))
        
        return None

# Search Confluence
def search_confluence(query, limit=10):
    """
    Search Confluence with the given query.
    
    Args:
        query (str): The search query
        limit (int): Maximum number of results to return
        
    Returns:
        list: List of search results
    """
    print(f"Searching Confluence for: '{query}'")
    
    # Call the MCP function - make sure to use the exact function name from the MCP tools
    results = call_mcp_function("mcp_confluence_confluence_search", {
        "query": query,
        "limit": limit
    })
    
    if not results or "results" not in results:
        print("No results found or an error occurred.")
        return []
    
    items = results.get("results", [])
    print(f"Found {len(items)} results")
    
    return items

# Get page content
def get_page_content(page_id, include_metadata=True):
    """
    Get content of a specific Confluence page.
    
    Args:
        page_id (str): The ID of the page to retrieve
        include_metadata (bool): Whether to include page metadata
        
    Returns:
        dict: Page content and metadata
    """
    print(f"Getting content for page ID: {page_id}")
    
    # Call the MCP function - make sure to use the exact function name from the MCP tools
    result = call_mcp_function("mcp_confluence_confluence_get_page", {
        "page_id": page_id,
        "include_metadata": include_metadata
    })
    
    if not result:
        print("Failed to retrieve page content or page not found.")
        return None
    
    return result

# Fallback: Direct Confluence API call for search if MCP fails
def fallback_search_confluence(query, limit=10):
    """Search Confluence directly via REST API (fallback method)."""
    print(f"Falling back to direct Confluence API for search: '{query}'")
    
    if not all([CONFLUENCE_URL, CONFLUENCE_USERNAME, CONFLUENCE_TOKEN]):
        print("Error: Missing Confluence credentials for fallback method.")
        return {"results": []}
    
    # Check if this is a simple search term or CQL
    if not any(x in query for x in ["=", "~", ">", "<", " AND ", " OR "]):
        # Convert simple search to CQL
        cql = f'text ~ "{query}"'
    else:
        cql = query
    
    # Make the search request
    url = urljoin(CONFLUENCE_URL, "rest/api/content/search")
    auth = (CONFLUENCE_USERNAME, CONFLUENCE_TOKEN)
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    params = {
        "cql": cql,
        "limit": limit,
        "expand": "space,metadata.properties.title,body.view,version"
    }
    
    try:
        response = requests.get(url, auth=auth, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        
        # Format the results to match the MCP response structure
        results = []
        for item in data.get("results", []):
            title = item.get("title", "Untitled")
            id = item.get("id", "Unknown ID")
            space = item.get("space", {}).get("name", "Unknown Space")
            space_key = item.get("space", {}).get("key", "")
            link = f"{CONFLUENCE_URL}/pages/viewpage.action?pageId={id}"
            
            results.append({
                "id": id,
                "title": title,
                "url": link,
                "spaceKey": space_key,
                "space": {"name": space}
            })
        
        return {"results": results}
    except requests.exceptions.RequestException as e:
        print(f"Error in fallback search: {str(e)}", file=sys.stderr)
        return {"results": []}

# Fallback: Direct Confluence API call for getting page content if MCP fails
def fallback_get_page_content(page_id):
    """Get page content directly via REST API (fallback method)."""
    print(f"Falling back to direct Confluence API for page content: '{page_id}'")
    
    if not all([CONFLUENCE_URL, CONFLUENCE_USERNAME, CONFLUENCE_TOKEN]):
        print("Error: Missing Confluence credentials for fallback method.")
        return None
    
    url = urljoin(CONFLUENCE_URL, f"rest/api/content/{page_id}")
    auth = (CONFLUENCE_USERNAME, CONFLUENCE_TOKEN)
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    params = {
        "expand": "body.view,space,version"
    }
    
    try:
        response = requests.get(url, auth=auth, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        
        title = data.get("title", "Untitled")
        space = data.get("space", {}).get("name", "Unknown Space")
        space_key = data.get("space", {}).get("key", "")
        content = data.get("body", {}).get("view", {}).get("value", "No content available")
        link = f"{CONFLUENCE_URL}/pages/viewpage.action?pageId={page_id}"
        
        # Format the result to match the MCP response structure
        return {
            "id": page_id,
            "title": title,
            "content": content,
            "url": link,
            "metadata": {
                "spaceKey": space_key,
                "created": data.get("created", ""),
                "lastUpdated": data.get("version", {}).get("when", ""),
                "version": data.get("version", {}).get("number", 0)
            }
        }
    except requests.exceptions.RequestException as e:
        print(f"Error in fallback page retrieval: {str(e)}", file=sys.stderr)
        return None

# Print search results
def print_search_results(results):
    """Print search results in a readable format."""
    for idx, item in enumerate(results, 1):
        title = item.get("title", "Untitled")
        page_id = item.get("id", "Unknown ID")
        link = item.get("url", "")
        space = item.get("spaceKey", "Unknown Space")
        
        print(f"{idx}. {title}")
        print(f"   ID: {page_id}")
        print(f"   Space: {space}")
        print(f"   URL: {link}")
        print()

# Print page content
def print_page_content(page):
    """Print page content in a readable format."""
    title = page.get("title", "Untitled")
    page_id = page.get("id", "Unknown ID")
    link = page.get("url", "")
    content = page.get("content", "No content available")
    
    # Print page information
    print(f"Title: {title}")
    print(f"ID: {page_id}")
    print(f"URL: {link}")
    
    # Print metadata if available
    if "metadata" in page:
        metadata = page["metadata"]
        print("Metadata:")
        for key, value in metadata.items():
            if key in ["spaceKey", "createdBy", "created", "lastUpdated", "version", "labels"]:
                print(f"   {key}: {value}")
    
    # Print content preview
    print("\nContent Preview:")
    print("=" * 80)
    if len(content) > 1000:
        print(content[:1000] + "...\n(Content truncated)")
    else:
        print(content)
    print("=" * 80)

def main():
    parser = argparse.ArgumentParser(description="AVOS Bot - Confluence MCP Client")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Search command
    search_parser = subparsers.add_parser("search", help="Search Confluence")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("-l", "--limit", type=int, default=10, help="Maximum number of results (default: 10)")
    
    # Get page command
    page_parser = subparsers.add_parser("get-page", help="Get Confluence page content")
    page_parser.add_argument("page_id", help="Confluence page ID")
    
    # Add argument for direct API vs MCP method
    parser.add_argument("--direct", action="store_true", help="Use direct Confluence API instead of MCP")
    
    args = parser.parse_args()
    
    if args.command == "search":
        if getattr(args, 'direct', False):
            results = fallback_search_confluence(args.query, args.limit).get("results", [])
        else:
            results = search_confluence(args.query, args.limit)
        if results:
            print_search_results(results)
    elif args.command == "get-page":
        if getattr(args, 'direct', False):
            page = fallback_get_page_content(args.page_id)
        else:
            page = get_page_content(args.page_id)
        if page:
            print_page_content(page)
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 