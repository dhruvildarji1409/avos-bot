#!/usr/bin/env python3
"""
Test script for mcp_bridge.py

This script tests the functionality of the mcp_bridge.py script
by calling various Confluence functions.
"""
import os
import sys
import json
import subprocess
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Path to the mcp_bridge.py script
BRIDGE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_bridge.py")

def call_bridge_function(function_name, params=None):
    """
    Call a function via the mcp_bridge.py script.
    
    Args:
        function_name (str): The name of the MCP function to call
        params (dict): Parameters to pass to the function
        
    Returns:
        dict: The result of the function call
    """
    if params is None:
        params = {}
    BRIDGE_PATH = "/home/nvidia/dhruvil/git/mcp-confluence/mcp_bridge.py"
    print(f"Bridge path: {BRIDGE_PATH}")
    # Validate bridge   script exists
    if not os.path.exists(BRIDGE_PATH):
        print(f"Error: Bridge script not found at {BRIDGE_PATH}", file=sys.stderr)
        sys.exit(1)
    
    # Convert parameters to JSON
    params_json = json.dumps(params)
    
    print(f"Calling bridge function: {function_name}")
    print(f"Params: {params_json}")
    
    try:
        # Call the bridge script
        result = subprocess.run(
            ["python", BRIDGE_PATH, function_name, params_json],
            capture_output=True,
            text=True,
            check=True
        )
        
        print(f"Bridge stdout: {result.stdout[:200]}..." if len(result.stdout) > 200 else result.stdout)
        
        # Parse the JSON response
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error calling bridge function {function_name}: {e.stderr}", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"Error parsing bridge response: {e}", file=sys.stderr)
        print(f"Raw output: {result.stdout}")
        return None

def test_search():
    """Test the search function."""
    print("\n== Testing search function ==")
    # Check if this is a simple search term or CQL
    query = "How to build container AVOS?"

    results = call_bridge_function("mcp_confluence_confluence_search", {
        "query": query,
        "limit": 10
    })
    
    if results and isinstance(results, list):
        print(f"Success! Found {len(results)} results")
        for i, item in enumerate(results, 1):
            title = item.get("title", "Untitled")
            page_id = item.get("id", "Unknown ID")
            print(f"{i}. {title} (ID: {page_id})")
        
        # Return the first result ID for get_page test
        if results:
            return results[0].get("id")
    else:
        print("Failed to get search results")
    
    return None

def test_get_page(page_id):
    """Test the get_page function."""
    print(f"\n== Testing get_page function with ID: {page_id} ==")
    page = call_bridge_function("mcp_confluence_confluence_get_page", {
        "page_id": page_id,
        "include_metadata": True
    })
    
    if page:
        print(f"Success! Got page: {page.get('title', 'Untitled')}")
        
        # Print metadata if available
        if "metadata" in page and isinstance(page["metadata"], dict):
            print("Metadata:")
            for key, value in page["metadata"].items():
                print(f"  {key}: {value}")
        
        # Print content preview
        content = page.get("content", "")
        if content:
            preview = content[:200] + "..." if len(content) > 200 else content
            print(f"Content preview: {preview}")
    else:
        print("Failed to get page")

def test_get_children(parent_id):
    """Test the get_children function."""
    print(f"\n== Testing get_children function with parent ID: {parent_id} ==")
    children = call_bridge_function("mcp_confluence_confluence_get_page_children", {
        "parent_id": parent_id,
        "include_content": False,
        "limit": 5
    })
    
    if children and isinstance(children, list):
        print(f"Success! Found {len(children)} child pages")
        for i, child in enumerate(children, 1):
            title = child.get("title", "Untitled")
            page_id = child.get("id", "Unknown ID")
            print(f"{i}. {title} (ID: {page_id})")
    else:
        print("Failed to get child pages or none exist")

def run_tests():
    """Run all tests."""
    print("Starting tests for mcp_bridge.py")
    
    # Test search
    page_id = test_search()
    
    if page_id:
        # Test get page
        test_get_page(page_id)
        
        # Test get children
        test_get_children(page_id)
    
    print("\nTests completed")

if __name__ == "__main__":
    # Check if the bridge script exists
    if not os.path.exists(BRIDGE_PATH):
        print(f"Error: Bridge script not found at {BRIDGE_PATH}", file=sys.stderr)
        print("Please make sure you have created the mcp_bridge.py script in the same directory.")
        sys.exit(1)
    
    # Check for MCP_CONFLUENCE_PATH
    mcp_path = os.getenv("MCP_CONFLUENCE_PATH")
    if not mcp_path:
        print("Warning: MCP_CONFLUENCE_PATH environment variable not set.")
        print("Using default path: /home/nvidia/dhruvil/git/mcp-confluence")
    else:
        print(f"Using MCP_CONFLUENCE_PATH: {mcp_path}")
    
    # Run the tests
    run_tests() 