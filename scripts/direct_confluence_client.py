#!/usr/bin/env python3
"""
AVOS Bot - Direct Confluence Client

This script provides a client for connecting directly to Confluence using the mcp_bridge.py
script, which imports the mcp-confluence module directly rather than using the MCP service.
"""
import os
import sys
import json
import argparse
import subprocess
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Confluence configuration
CONFLUENCE_URL = os.getenv("CONFLUENCE_HOST", "https://confluence.nvidia.com")
CONFLUENCE_USERNAME = os.getenv("CONFLUENCE_USERNAME")
CONFLUENCE_TOKEN = os.getenv("CONFLUENCE_PERSONAL_TOKEN")

# Bridge configuration
MCP_BRIDGE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_bridge.py")

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
    
    # Validate bridge script exists
    if not os.path.exists(MCP_BRIDGE_PATH):
        raise FileNotFoundError(f"MCP bridge script not found at {MCP_BRIDGE_PATH}")
    
    # Convert parameters to JSON
    params_json = json.dumps(params)
    
    try:
        # Call the bridge script
        result = subprocess.run(
            ["python", MCP_BRIDGE_PATH, function_name, params_json],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Parse the JSON response
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error calling bridge function {function_name}: {e.stderr}", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"Error parsing bridge response: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Unexpected error: {str(e)}", file=sys.stderr)
        return None

def search_confluence(query, limit=10):
    """
    Search Confluence with the given query via the bridge.
    
    Args:
        query (str): The search query
        limit (int): Maximum number of results to return
        
    Returns:
        list: List of search results
    """
    print(f"Searching Confluence for: '{query}'")
    
    # Call the bridge function
    results = call_bridge_function("mcp_confluence_confluence_search", {
        "query": query,
        "limit": limit
    })
    
    if not results or not isinstance(results, list):
        print("No results found or an error occurred.")
        return []
    
    print(f"Found {len(results)} results")
    return results

def get_page_content(page_id, include_metadata=True):
    """
    Get content of a specific Confluence page via the bridge.
    
    Args:
        page_id (str): The ID of the page to retrieve
        include_metadata (bool): Whether to include page metadata
        
    Returns:
        dict: Page content and metadata
    """
    print(f"Getting content for page ID: {page_id}")
    
    # Call the bridge function
    result = call_bridge_function("mcp_confluence_confluence_get_page", {
        "page_id": page_id,
        "include_metadata": include_metadata
    })
    
    if not result:
        print("Failed to retrieve page content or page not found.")
        return None
    
    return result

def get_page_children(parent_id, include_content=False, limit=25):
    """
    Get child pages of a Confluence page via the bridge.
    
    Args:
        parent_id (str): The ID of the parent page
        include_content (bool): Whether to include content in the results
        limit (int): Maximum number of results to return
        
    Returns:
        list: List of child pages
    """
    print(f"Getting children for page ID: {parent_id}")
    
    # Call the bridge function
    results = call_bridge_function("mcp_confluence_confluence_get_page_children", {
        "parent_id": parent_id,
        "include_content": include_content,
        "limit": limit
    })
    
    if not results or not isinstance(results, list):
        print("No children found or an error occurred.")
        return []
    
    return results

def add_comment(page_id, comment):
    """
    Add a comment to a Confluence page via the bridge.
    
    Args:
        page_id (str): The ID of the page to comment on
        comment (str): The comment text in Markdown format
        
    Returns:
        dict: Result of the comment creation
    """
    print(f"Adding comment to page ID: {page_id}")
    
    # Call the bridge function
    result = call_bridge_function("mcp_confluence_confluence_add_comment", {
        "page_id": page_id,
        "comment": comment
    })
    
    return result

def get_comments(page_id):
    """
    Get comments on a Confluence page via the bridge.
    
    Args:
        page_id (str): The ID of the page
        
    Returns:
        list: List of comments
    """
    print(f"Getting comments for page ID: {page_id}")
    
    # Call the bridge function
    results = call_bridge_function("mcp_confluence_confluence_get_comments", {
        "page_id": page_id
    })
    
    if not results or not isinstance(results, list):
        print("No comments found or an error occurred.")
        return []
    
    return results

def create_page(space_key, title, content, parent_id=None):
    """
    Create a new Confluence page via the bridge.
    
    Args:
        space_key (str): The key of the space to create the page in
        title (str): The title of the page
        content (str): The content of the page in Markdown format
        parent_id (str, optional): ID of the parent page
        
    Returns:
        dict: Result of the page creation
    """
    print(f"Creating new page: '{title}' in space: {space_key}")
    
    params = {
        "space_key": space_key,
        "title": title,
        "content": content
    }
    
    if parent_id:
        params["parent_id"] = parent_id
    
    # Call the bridge function
    result = call_bridge_function("mcp_confluence_confluence_create_page", params)
    
    return result

def update_page(page_id, title, content, version_comment="", is_minor_edit=False):
    """
    Update an existing Confluence page via the bridge.
    
    Args:
        page_id (str): The ID of the page to update
        title (str): The new title of the page
        content (str): The new content of the page in Markdown format
        version_comment (str): Optional comment for this version
        is_minor_edit (bool): Whether this is a minor edit
        
    Returns:
        dict: Result of the page update
    """
    print(f"Updating page ID: {page_id}")
    
    # Call the bridge function
    result = call_bridge_function("mcp_confluence_confluence_update_page", {
        "page_id": page_id,
        "title": title,
        "content": content,
        "version_comment": version_comment,
        "is_minor_edit": is_minor_edit
    })
    
    return result

def download_page(page_id_or_url, output_dir=".", download_children=True, 
                  download_links=False, export_json=True, max_depth=3):
    """
    Download a page and its children to local files via the bridge.
    
    Args:
        page_id_or_url (str): Page ID or URL
        output_dir (str): Directory to save files to
        download_children (bool): Whether to download child pages
        download_links (bool): Whether to download linked pages
        export_json (bool): Whether to export JSON metadata
        max_depth (int): Maximum recursion depth
        
    Returns:
        dict: Result of the download operation
    """
    print(f"Downloading page: {page_id_or_url}")
    
    # Call the bridge function
    result = call_bridge_function("mcp_confluence_confluence_download_page", {
        "page_id_or_url": page_id_or_url,
        "output_dir": output_dir,
        "download_children": download_children,
        "download_links": download_links,
        "export_json": export_json,
        "max_depth": max_depth
    })
    
    return result

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
    if "metadata" in page and isinstance(page["metadata"], dict):
        metadata = page["metadata"]
        print("Metadata:")
        for key, value in metadata.items():
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
    parser = argparse.ArgumentParser(description="AVOS Bot - Direct Confluence Client")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Search command
    search_parser = subparsers.add_parser("search", help="Search Confluence")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("-l", "--limit", type=int, default=10, help="Maximum number of results (default: 10)")
    
    # Get page command
    page_parser = subparsers.add_parser("get-page", help="Get Confluence page content")
    page_parser.add_argument("page_id", help="Confluence page ID")
    
    # Get children command
    children_parser = subparsers.add_parser("get-children", help="Get Confluence page children")
    children_parser.add_argument("parent_id", help="Parent page ID")
    children_parser.add_argument("--include-content", action="store_true", help="Include content in results")
    children_parser.add_argument("-l", "--limit", type=int, default=25, help="Maximum number of results (default: 25)")
    
    # Add comment command
    comment_parser = subparsers.add_parser("add-comment", help="Add comment to Confluence page")
    comment_parser.add_argument("page_id", help="Confluence page ID")
    comment_parser.add_argument("comment", help="Comment text in Markdown format")
    
    # Get comments command
    get_comments_parser = subparsers.add_parser("get-comments", help="Get comments from Confluence page")
    get_comments_parser.add_argument("page_id", help="Confluence page ID")
    
    # Create page command
    create_parser = subparsers.add_parser("create-page", help="Create new Confluence page")
    create_parser.add_argument("space_key", help="Space key (e.g., 'DEV', 'TEAM')")
    create_parser.add_argument("title", help="Page title")
    create_parser.add_argument("content", help="Page content in Markdown format")
    create_parser.add_argument("--parent-id", help="Optional parent page ID")
    
    # Update page command
    update_parser = subparsers.add_parser("update-page", help="Update existing Confluence page")
    update_parser.add_argument("page_id", help="Confluence page ID")
    update_parser.add_argument("title", help="New page title")
    update_parser.add_argument("content", help="New page content in Markdown format")
    update_parser.add_argument("--comment", help="Version comment", default="")
    update_parser.add_argument("--minor", action="store_true", help="Mark as minor edit")
    
    # Download page command
    download_parser = subparsers.add_parser("download-page", help="Download Confluence page and children")
    download_parser.add_argument("page_id_or_url", help="Page ID or URL")
    download_parser.add_argument("--output-dir", default=".", help="Output directory (default: current directory)")
    download_parser.add_argument("--no-children", action="store_true", help="Don't download child pages")
    download_parser.add_argument("--download-links", action="store_true", help="Download linked pages")
    download_parser.add_argument("--no-json", action="store_true", help="Don't export JSON metadata")
    download_parser.add_argument("--max-depth", type=int, default=3, help="Maximum recursion depth (default: 3)")
    
    args = parser.parse_args()
    
    if args.command == "search":
        results = search_confluence(args.query, args.limit)
        if results:
            print_search_results(results)
    
    elif args.command == "get-page":
        page = get_page_content(args.page_id)
        if page:
            print_page_content(page)
    
    elif args.command == "get-children":
        children = get_page_children(args.parent_id, args.include_content, args.limit)
        if children:
            print(f"Found {len(children)} child pages:")
            for i, child in enumerate(children, 1):
                title = child.get("title", "Untitled")
                page_id = child.get("id", "Unknown ID")
                print(f"{i}. {title} (ID: {page_id})")
    
    elif args.command == "add-comment":
        result = add_comment(args.page_id, args.comment)
        if result:
            print("Comment added successfully.")
            print(f"Comment ID: {result.get('id')}")
    
    elif args.command == "get-comments":
        comments = get_comments(args.page_id)
        if comments:
            print(f"Found {len(comments)} comments:")
            for i, comment in enumerate(comments, 1):
                author = comment.get("author", {}).get("displayName", "Unknown")
                date = comment.get("created", "Unknown date")
                content = comment.get("body", {}).get("view", {}).get("value", "No content")
                if len(content) > 100:
                    content = content[:100] + "..."
                print(f"{i}. By {author} on {date}")
                print(f"   {content}")
                print()
    
    elif args.command == "create-page":
        result = create_page(args.space_key, args.title, args.content, args.parent_id)
        if result:
            print("Page created successfully.")
            print(f"Page ID: {result.get('id')}")
            print(f"URL: {result.get('url')}")
    
    elif args.command == "update-page":
        result = update_page(args.page_id, args.title, args.content, args.comment, args.minor)
        if result:
            print("Page updated successfully.")
            print(f"Page ID: {result.get('id')}")
            print(f"Version: {result.get('version', {}).get('number')}")
    
    elif args.command == "download-page":
        result = download_page(
            args.page_id_or_url,
            args.output_dir,
            not args.no_children,
            args.download_links,
            not args.no_json,
            args.max_depth
        )
        if result:
            print("Page downloaded successfully.")
            print(f"Files saved to: {args.output_dir}")
            if "files" in result and isinstance(result["files"], list):
                print(f"Downloaded {len(result['files'])} files:")
                for f in result["files"]:
                    print(f"- {f}")
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 