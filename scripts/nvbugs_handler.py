#!/usr/bin/env python3
"""
AVOS Bot - NVBugs Handler

This script provides integration with the NVBugs API through MCP,
allowing searching for bug information and details.
"""
import os
import sys
import json
import re
from dotenv import load_dotenv

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.confluence_mcp_client import call_mcp_function

# Load environment variables
load_dotenv()

def is_nvbugs_query(query):
    """
    Check if a query is NVBugs-related.
    
    Args:
        query (str): The query to check
        
    Returns:
        bool: True if the query is NVBugs-related
    """
    if not query:
        return False
    
    query_lower = query.lower()
    
    # Check for NVBugs-related keywords
    nvbugs_patterns = [
        r'\bnvbug\b',
        r'\bnvbugs\b',
        r'\bbug\s+\d+\b',
        r'\bbug[#-]?\d+\b',
        r'\b\d{7,}\b',  # Typical NVBug IDs are 7+ digits
        r'go\s+search\s+.*\b(bug|nvbug)\b'
    ]
    
    for pattern in nvbugs_patterns:
        if re.search(pattern, query_lower):
            return True
    
    return False

def extract_bug_id(query):
    """
    Extract a bug ID from a query if present.
    
    Args:
        query (str): The query to extract from
        
    Returns:
        str or None: The extracted bug ID, or None if not found
    """
    # Try to extract a 7+ digit bug ID
    bug_id_match = re.search(r'\b(\d{7,})\b', query)
    if bug_id_match:
        return bug_id_match.group(1)
    
    # Try to extract a bug ID from "bug #123456" pattern
    bug_ref_match = re.search(r'\bbug\s*[#-]?\s*(\d+)\b', query, re.IGNORECASE)
    if bug_ref_match:
        return bug_ref_match.group(1)
    
    return None

def fetch_nvbug_details(bug_id):
    """
    Fetch details for a specific NVBug.
    
    Args:
        bug_id (str): The bug ID to fetch
        
    Returns:
        dict: Bug details or None if not found
    """
    print(f"Fetching details for NVBug: {bug_id}")
    
    try:
        # Call the MCP function to fetch bug details
        result = call_mcp_function("mcp_NVBugs_glimpse_v1_fetch_nvbug_details", {
            "bug_id": bug_id
        })
        
        return result
    except Exception as e:
        print(f"Error fetching NVBug details: {str(e)}", file=sys.stderr)
        return None

def search_nvbugs(query):
    """
    Search NVBugs using AI search.
    
    Args:
        query (str): The search query
        
    Returns:
        dict: Search results or None if error occurred
    """
    print(f"Searching NVBugs for: {query}")
    
    try:
        # Call the MCP function to search bugs
        result = call_mcp_function("mcp_NVBugs_glimpse_v1_fetch_nvbug_ai_search_details", {
            "query": query
        })
        
        return result
    except Exception as e:
        print(f"Error searching NVBugs: {str(e)}", file=sys.stderr)
        return None

def format_bug_details(bug_details):
    """
    Format bug details for display.
    
    Args:
        bug_details (dict): The bug details to format
        
    Returns:
        str: Formatted bug details
    """
    if not bug_details or "error" in bug_details:
        error_msg = bug_details.get("error", "Unknown error") if bug_details else "No bug details found"
        return f"Error retrieving bug details: {error_msg}"
    
    # Format the bug details
    formatted_bug = ["## NVBug Details\n"]
    
    # Basic info
    bug_id = bug_details.get("id", "Unknown")
    synopsis = bug_details.get("synopsis", "No synopsis available")
    status = bug_details.get("status", "Unknown")
    severity = bug_details.get("severity", "Unknown")
    component = bug_details.get("component", "Unknown")
    
    formatted_bug.append(f"**Bug ID:** {bug_id}")
    formatted_bug.append(f"**Synopsis:** {synopsis}")
    formatted_bug.append(f"**Status:** {status}")
    formatted_bug.append(f"**Severity:** {severity}")
    formatted_bug.append(f"**Component:** {component}")
    
    # Add description if available
    description = bug_details.get("description")
    if description:
        formatted_bug.append("\n### Description\n")
        
        # Truncate if too long
        if len(description) > 1000:
            formatted_bug.append(description[:1000] + "...\n\n(Description truncated)")
        else:
            formatted_bug.append(description)
    
    # Add comments if available
    comments = bug_details.get("comments", [])
    if comments:
        formatted_bug.append("\n### Latest Comments\n")
        
        # Show only the most recent 3 comments
        for i, comment in enumerate(comments[:3]):
            author = comment.get("author", "Unknown")
            date = comment.get("date", "Unknown date")
            text = comment.get("text", "No text")
            
            formatted_bug.append(f"**Comment by {author} on {date}:**")
            
            # Truncate if too long
            if len(text) > 500:
                formatted_bug.append(text[:500] + "...\n(Comment truncated)")
            else:
                formatted_bug.append(text)
            
            formatted_bug.append("")
    
    return "\n".join(formatted_bug)

def format_search_results(search_results):
    """
    Format search results for display.
    
    Args:
        search_results (dict): The search results to format
        
    Returns:
        str: Formatted search results
    """
    if not search_results or "error" in search_results:
        error_msg = search_results.get("error", "Unknown error") if search_results else "No search results"
        return f"Error searching NVBugs: {error_msg}"
    
    # Extract the bugs from the search results
    bugs = search_results.get("bugs", [])
    if not bugs:
        return "No bugs found matching your search criteria."
    
    # Format the search results
    formatted_results = [
        "## NVBugs Search Results\n",
        f"Found {len(bugs)} bugs matching your search:\n"
    ]
    
    for i, bug in enumerate(bugs[:5], 1):  # Show only the top 5 bugs
        bug_id = bug.get("id", "Unknown")
        synopsis = bug.get("synopsis", "No synopsis available")
        status = bug.get("status", "Unknown")
        severity = bug.get("severity", "Unknown")
        
        formatted_results.append(f"{i}. **Bug {bug_id}: {synopsis}**")
        formatted_results.append(f"   - Status: {status}")
        formatted_results.append(f"   - Severity: {severity}")
        formatted_results.append("")
    
    if len(bugs) > 5:
        formatted_results.append(f"... and {len(bugs) - 5} more bugs.")
    
    return "\n".join(formatted_results)

def handle_nvbugs_query(query):
    """
    Handle an NVBugs-related query.
    
    Args:
        query (str): The user query
        
    Returns:
        dict: Response data with bug details or search results
    """
    # Check if it's an NVBugs-related query
    if not is_nvbugs_query(query):
        return {
            "source": "other",
            "message": "Not an NVBugs query"
        }
    
    # Try to extract a bug ID
    bug_id = extract_bug_id(query)
    
    if bug_id:
        # Fetch bug details
        bug_details = fetch_nvbug_details(bug_id)
        formatted_response = format_bug_details(bug_details)
        
        return {
            "source": "nvbugs",
            "response": formatted_response,
            "query": query,
            "bug_id": bug_id
        }
    else:
        # Search for bugs
        search_results = search_nvbugs(query)
        formatted_response = format_search_results(search_results)
        
        return {
            "source": "nvbugs",
            "response": formatted_response,
            "query": query
        }

if __name__ == "__main__":
    # Test the handler
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python nvbugs_handler.py <query>")
        sys.exit(1)
    
    query = " ".join(sys.argv[1:])
    result = handle_nvbugs_query(query)
    
    print(json.dumps(result, indent=2)) 