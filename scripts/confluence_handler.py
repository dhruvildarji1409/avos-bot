#!/usr/bin/env python3
"""
AVOS Bot - Confluence Handler

This script integrates the MCP Confluence client with the AVOS bot,
providing handlers for "Go Search" commands and AVOS-related queries.
"""
import os
import sys
import json
import re
from dotenv import load_dotenv

# Import the Confluence MCP client
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.confluence_mcp_client import search_confluence, get_page_content

# Load environment variables
load_dotenv()

# AVOS keywords for detecting AVOS-related queries
AVOS_KEYWORDS = [
    'avos', 
    'autonomous vehicle', 
    'nvidia drive', 
    'driveos', 
    'ddu', 
    'ndas', 
    'hyperion',
    'orin',
    'drive agx'
]

def is_confluence_search_query(query):
    """
    Check if a query is AVOS-related or a "Go Search" command.
    
    Args:
        query (str): The query to check
        
    Returns:
        bool: True if the query is AVOS-related or a "Go Search" command
    """
    if not query:
        return False
    
    query_lower = query.lower()
    
    # Check for "Go Search" command
    if "go search" in query_lower:
        return True
    
    # Check for AVOS-related keywords
    for keyword in AVOS_KEYWORDS:
        if keyword in query_lower:
            return True
    
    return False

def extract_search_query(query):
    """
    Extract the search query from a "Go Search" command.
    
    Args:
        query (str): The original query
        
    Returns:
        str: The extracted search query
    """
    query_lower = query.lower()
    
    # If it's a "Go Search" command, extract the search terms
    if "go search" in query_lower:
        # Remove "go search" and trim whitespace
        search_pattern = re.compile(r'go\s+search\s+', re.IGNORECASE)
        search_query = search_pattern.sub('', query).strip()
        
        # If there's nothing left after removing "go search", use the original query
        if not search_query:
            search_query = query
            
        return search_query
    
    # Otherwise, use the original query
    return query

def search_and_format_results(query, limit=5):
    """
    Search Confluence for the given query and format the results.
    
    Args:
        query (str): The search query
        limit (int): Maximum number of results to return
        
    Returns:
        str: Formatted search results
    """
    # Extract the actual search query if it's a "Go Search" command
    search_query = extract_search_query(query)
    
    # Search Confluence
    results = search_confluence(search_query, limit)
    
    if not results:
        return "No Confluence results found for your query."
    
    # Format the results
    formatted_results = [
        "## Confluence Search Results\n",
        f"Here are the top {len(results)} results from Confluence for '{search_query}':\n"
    ]
    
    for i, result in enumerate(results, 1):
        title = result.get("title", "Untitled")
        page_id = result.get("id", "Unknown ID")
        space = result.get("spaceKey", "Unknown Space")
        link = result.get("url", "")
        
        formatted_results.append(f"{i}. **[{title}]({link})**")
        formatted_results.append(f"   - Space: {space}")
        formatted_results.append(f"   - ID: {page_id}")
        formatted_results.append("")
    
    return "\n".join(formatted_results)

def get_page_content_formatted(page_id):
    """
    Get the content of a Confluence page and format it.
    
    Args:
        page_id (str): The ID of the page to retrieve
        
    Returns:
        str: Formatted page content
    """
    # Get the page content
    page = get_page_content(page_id)
    
    if not page:
        return "Could not retrieve the Confluence page."
    
    title = page.get("title", "Untitled")
    content = page.get("content", "No content available")
    link = page.get("url", "")
    
    # Format the content
    formatted_content = [
        f"## {title}\n",
        f"[View in Confluence]({link})\n",
        "### Content Preview\n"
    ]
    
    # Add a truncated version of the content if it's too long
    if len(content) > 2000:
        formatted_content.append(content[:2000] + "...\n\n(Content truncated)")
    else:
        formatted_content.append(content)
    
    return "\n".join(formatted_content)

def handle_query(query):
    """
    Handle a user query that might be Confluence-related.
    
    Args:
        query (str): The user query
        
    Returns:
        dict: Response data with search results or message
    """
    if is_confluence_search_query(query):
        response = search_and_format_results(query)
        return {
            "source": "confluence",
            "response": response,
            "query": query
        }
    else:
        return {
            "source": "other",
            "message": "Not a Confluence search query"
        }

if __name__ == "__main__":
    # Test the handler
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python confluence_handler.py <query>")
        sys.exit(1)
    
    query = " ".join(sys.argv[1:])
    result = handle_query(query)
    
    print(json.dumps(result, indent=2)) 