#!/usr/bin/env python3
"""
Standalone Confluence Client

This script provides direct access to Confluence API without dependencies on MCP.
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

# Get Confluence credentials from environment variables
CONFLUENCE_URL = os.getenv("CONFLUENCE_URL", os.getenv("CONFLUENCE_HOST", "https://confluence.nvidia.com"))
CONFLUENCE_USERNAME = os.getenv("CONFLUENCE_USERNAME")
CONFLUENCE_TOKEN = os.getenv("CONFLUENCE_PERSONAL_TOKEN")

# Validate configuration
if not all([CONFLUENCE_URL, CONFLUENCE_USERNAME, CONFLUENCE_TOKEN]):
    print("Error: Missing Confluence configuration. Please check your .env file.")
    print("Required: CONFLUENCE_URL (or CONFLUENCE_HOST), CONFLUENCE_USERNAME, CONFLUENCE_PERSONAL_TOKEN")
    sys.exit(1)

def make_confluence_request(endpoint, method="GET", params=None, data=None):
    """Make a request to the Confluence API."""
    url = urljoin(CONFLUENCE_URL, endpoint)
    
    # Create auth and headers
    auth = (CONFLUENCE_USERNAME, CONFLUENCE_TOKEN)
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, auth=auth, headers=headers, params=params)
        elif method.upper() == "POST":
            response = requests.post(url, auth=auth, headers=headers, params=params, json=data)
        elif method.upper() == "PUT":
            response = requests.put(url, auth=auth, headers=headers, params=params, json=data)
        elif method.upper() == "DELETE":
            response = requests.delete(url, auth=auth, headers=headers, params=params)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
        
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error calling Confluence API: {str(e)}", file=sys.stderr)
        if hasattr(e, "response") and e.response:
            print(f"Response: {e.response.text}", file=sys.stderr)
        return None

def search_confluence(query, limit=10):
    """
    Search Confluence with query.
    
    Args:
        query (str): Search query
        limit (int): Maximum number of results
        
    Returns:
        list: List of search results
    """
    print(f"Searching Confluence for: '{query}'")
    
    # Check if this is a simple search term or CQL
    if not any(x in query for x in ["=", "~", ">", "<", " AND ", " OR "]):
        # Convert simple search to CQL
        cql = f'text ~ "{query}"'
    else:
        cql = query
    
    # Make the search request
    endpoint = "rest/api/content/search"
    params = {
        "cql": cql,
        "limit": limit,
        "expand": "space,metadata.properties.title,body.view,version"
    }
    
    results = make_confluence_request(endpoint, params=params)
    
    if not results or "results" not in results:
        print("No results found or an error occurred.")
        return []
    
    items = results.get("results", [])
    print(f"Found {len(items)} results")
    
    # Format results to match MCP format
    formatted_results = []
    for item in items:
        formatted_result = {
            "id": item.get("id", "Unknown ID"),
            "title": item.get("title", "Untitled"),
            "url": f"{CONFLUENCE_URL}/pages/viewpage.action?pageId={item.get('id')}",
            "spaceKey": item.get("space", {}).get("key", "Unknown")
        }
        formatted_results.append(formatted_result)
    
    return formatted_results

def get_page_content(page_id, include_metadata=True):
    """
    Get content of a specific Confluence page.
    
    Args:
        page_id (str): The ID of the page to retrieve
        include_metadata (bool): Whether to include metadata
        
    Returns:
        dict: Page content and metadata
    """
    print(f"Getting content for page ID: {page_id}")
    
    # Make the request to get page content
    endpoint = f"rest/api/content/{page_id}"
    params = {
        "expand": "body.view,space,version,metadata"
    }
    
    result = make_confluence_request(endpoint, params=params)
    
    if not result:
        print("Failed to retrieve page content or page not found.")
        return None
    
    # Format result to match MCP format
    formatted_result = {
        "id": result.get("id", "Unknown ID"),
        "title": result.get("title", "Untitled"),
        "url": f"{CONFLUENCE_URL}/pages/viewpage.action?pageId={page_id}",
        "content": result.get("body", {}).get("view", {}).get("value", "No content available")
    }
    
    if include_metadata:
        formatted_result["metadata"] = {
            "spaceKey": result.get("space", {}).get("key", "Unknown"),
            "created": result.get("created", "Unknown date"),
            "lastUpdated": result.get("version", {}).get("when", "Unknown date"),
            "version": result.get("version", {}).get("number", 0)
        }
    
    return formatted_result

def get_page_children(parent_id, include_content=False, limit=25):
    """
    Get child pages of a Confluence page.
    
    Args:
        parent_id (str): The ID of the parent page
        include_content (bool): Whether to include content in the results
        limit (int): Maximum number of results
        
    Returns:
        list: List of child pages
    """
    print(f"Getting children for page ID: {parent_id}")
    
    # Make the request to get child pages
    endpoint = f"rest/api/content/{parent_id}/child/page"
    params = {
        "limit": limit
    }
    
    if include_content:
        params["expand"] = "body.view"
    
    result = make_confluence_request(endpoint, params=params)
    
    if not result or "results" not in result:
        print("No children found or an error occurred.")
        return []
    
    items = result.get("results", [])
    print(f"Found {len(items)} child pages")
    
    # Format results to match MCP format
    formatted_results = []
    for item in items:
        formatted_result = {
            "id": item.get("id", "Unknown ID"),
            "title": item.get("title", "Untitled"),
            "url": f"{CONFLUENCE_URL}/pages/viewpage.action?pageId={item.get('id')}"
        }
        
        if include_content:
            formatted_result["content"] = item.get("body", {}).get("view", {}).get("value", "No content available")
        
        formatted_results.append(formatted_result)
    
    return formatted_results

def add_comment(page_id, comment):
    """
    Add a comment to a Confluence page.
    
    Args:
        page_id (str): The ID of the page to comment on
        comment (str): The comment text in Markdown format
        
    Returns:
        dict: Result of the comment creation
    """
    print(f"Adding comment to page ID: {page_id}")
    
    # Make the request to add a comment
    endpoint = f"rest/api/content/{page_id}/child/comment"
    data = {
        "type": "comment",
        "container": {
            "id": page_id,
            "type": "page"
        },
        "body": {
            "storage": {
                "value": comment,
                "representation": "wiki"
            }
        }
    }
    
    result = make_confluence_request(endpoint, method="POST", data=data)
    
    if not result:
        print("Failed to add comment or page not found.")
        return None
    
    # Format result to match MCP format
    formatted_result = {
        "id": result.get("id", "Unknown ID"),
        "page_id": page_id,
        "created": result.get("created", "Unknown date"),
        "author": result.get("author", {}).get("displayName", "Unknown")
    }
    
    return formatted_result

def get_comments(page_id):
    """
    Get comments on a Confluence page.
    
    Args:
        page_id (str): The ID of the page
        
    Returns:
        list: List of comments
    """
    print(f"Getting comments for page ID: {page_id}")
    
    # Make the request to get comments
    endpoint = f"rest/api/content/{page_id}/child/comment"
    params = {
        "expand": "body.view,author"
    }
    
    result = make_confluence_request(endpoint, params=params)
    
    if not result or "results" not in result:
        print("No comments found or an error occurred.")
        return []
    
    items = result.get("results", [])
    print(f"Found {len(items)} comments")
    
    # Format results to match MCP format
    formatted_results = []
    for item in items:
        formatted_result = {
            "id": item.get("id", "Unknown ID"),
            "author": {
                "displayName": item.get("author", {}).get("displayName", "Unknown")
            },
            "created": item.get("created", "Unknown date"),
            "body": {
                "view": {
                    "value": item.get("body", {}).get("view", {}).get("value", "No content available")
                }
            }
        }
        
        formatted_results.append(formatted_result)
    
    return formatted_results

def create_page(space_key, title, content, parent_id=None):
    """
    Create a new Confluence page.
    
    Args:
        space_key (str): The key of the space to create the page in
        title (str): The title of the page
        content (str): The content of the page in Markdown format
        parent_id (str, optional): ID of the parent page
        
    Returns:
        dict: Result of the page creation
    """
    print(f"Creating new page: '{title}' in space: {space_key}")
    
    # Make the request to create a page
    endpoint = "rest/api/content"
    data = {
        "type": "page",
        "title": title,
        "space": {
            "key": space_key
        },
        "body": {
            "storage": {
                "value": content,
                "representation": "wiki"
            }
        }
    }
    
    if parent_id:
        data["ancestors"] = [{"id": parent_id}]
    
    result = make_confluence_request(endpoint, method="POST", data=data)
    
    if not result:
        print("Failed to create page.")
        return None
    
    # Format result to match MCP format
    formatted_result = {
        "id": result.get("id", "Unknown ID"),
        "title": result.get("title", "Untitled"),
        "url": f"{CONFLUENCE_URL}/pages/viewpage.action?pageId={result.get('id')}",
        "space_key": space_key
    }
    
    if parent_id:
        formatted_result["parent_id"] = parent_id
    
    return formatted_result

def update_page(page_id, title, content, version_comment="", is_minor_edit=False):
    """
    Update an existing Confluence page.
    
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
    
    # First get the current version
    current_page = get_page_content(page_id)
    if not current_page:
        print("Failed to retrieve current page version.")
        return None
    
    version = current_page.get("metadata", {}).get("version", 0)
    
    # Make the request to update the page
    endpoint = f"rest/api/content/{page_id}"
    data = {
        "type": "page",
        "title": title,
        "version": {
            "number": version + 1,
            "minorEdit": is_minor_edit
        },
        "body": {
            "storage": {
                "value": content,
                "representation": "wiki"
            }
        }
    }
    
    if version_comment:
        data["version"]["message"] = version_comment
    
    result = make_confluence_request(endpoint, method="PUT", data=data)
    
    if not result:
        print("Failed to update page.")
        return None
    
    # Format result to match MCP format
    formatted_result = {
        "id": result.get("id", "Unknown ID"),
        "title": result.get("title", "Untitled"),
        "url": f"{CONFLUENCE_URL}/pages/viewpage.action?pageId={page_id}",
        "version": {
            "number": result.get("version", {}).get("number", 0),
            "comment": version_comment,
            "minorEdit": is_minor_edit
        }
    }
    
    return formatted_result

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
    parser = argparse.ArgumentParser(description="Standalone Confluence Client")
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
                content = comment.get("body", {}).get("view", {}).get("value", "No content available")
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
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 