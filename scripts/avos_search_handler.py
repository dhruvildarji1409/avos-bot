#!/usr/bin/env python3
"""
AVOS Bot - Search Handler

This is the main entry point for handling search queries in the AVOS bot.
It detects the search type and delegates to the appropriate handler.
"""
import os
import sys
import re
import json
import argparse
from dotenv import load_dotenv

# Add the current directory to the Python path
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(script_dir)

# Import handlers
try:
    from standalone_confluence_client import search_confluence
except ImportError:
    print("Error: standalone_confluence_client.py not found.")
    sys.exit(1)

# Load environment variables
load_dotenv()

def extract_bug_number(query):
    """Extract NVBugs bug number from query."""
    # Try different patterns for bug numbers
    patterns = [
        r"(?:bug|nvbug|bug\s+id|bug\s+number)\s*#?\s*(\d{7})",  # Bug 1234567, Bug #1234567, NVBug 1234567
        r"(?:bug|nvbug|bug\s+id|bug\s+number)\s*:?\s*(\d{7})",  # Bug: 1234567, NVBug: 1234567
        r"(?:\s|^)#?(\d{7})(?:\s|$)",  # standalone 7-digit number
    ]
    
    for pattern in patterns:
        match = re.search(pattern, query, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None

def handle_confluence_search(query):
    """Handle Confluence search queries."""
    print(f"Performing Confluence search for: {query}")
    
    # Extract the actual search query
    search_query = query
    if search_query.lower().startswith("go search"):
        search_query = search_query[9:].strip()
    
    # Search Confluence using direct API calls
    search_results = search_confluence(search_query, limit=5)
    
    if not search_results:
        return {
            "handled": True,
            "response": f"I couldn't find any Confluence pages matching '{search_query}'."
        }
    
    # Format the response
    response = [f"Here are some Confluence pages that might help with '{search_query}':"]
    
    for i, result in enumerate(search_results, 1):
        title = result.get("title", "Untitled")
        url = result.get("url", "")
        response.append(f"{i}. [{title}]({url})")
    
    return {
        "handled": True,
        "response": "\n\n".join(response)
    }

def handle_bug_search(bug_number):
    """Handle NVBugs searches."""
    print(f"Searching for information about bug: {bug_number}")
    
    # For now, just return a placeholder response
    # In a real implementation, this would make an API call to NVBugs
    return {
        "handled": True,
        "response": f"I found information about NVBug {bug_number}. " + 
                   "However, direct NVBugs API integration is not implemented yet. " +
                   "Please check NVBugs directly for this bug's information."
    }

def handle_search_query(query):
    """Main handler for search queries."""
    print(f"Processing query: {query}")
    
    # Skip empty queries
    if not query.strip():
        return {
            "handled": False,
            "response": "Please provide a valid query."
        }
    
    # Check if this is a direct "Go Search" command
    if query.lower().startswith("go search"):
        return handle_confluence_search(query)
    
    # Check if this is a bug search
    bug_number = extract_bug_number(query)
    if bug_number:
        return handle_bug_search(bug_number)
    
    # If we get here, it wasn't a recognized search command
    return {
        "handled": False,
        "response": None
    }

def main():
    parser = argparse.ArgumentParser(description="AVOS Bot Search Handler")
    parser.add_argument("query", help="The search query")
    parser.add_argument("--format", choices=["text", "json"], default="text", help="Output format")
    parser.add_argument("--direct", action="store_true", help="Force direct API without MCP")
    
    args = parser.parse_args()
    
    result = handle_search_query(args.query)
    
    if args.format == "json":
        print(json.dumps(result, indent=2))
    else:
        if result["handled"]:
            print(result["response"])
        else:
            print(f"The query was not recognized as a search command: '{args.query}'")

if __name__ == "__main__":
    main() 