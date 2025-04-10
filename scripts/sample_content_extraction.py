#!/usr/bin/env python3
"""
Sample Content Extraction Script

This script demonstrates how to use the Confluence content extractor
to answer questions about AVOS from Confluence content.
"""
import sys
import os
import json
import argparse
from confluence_content_extractor import search_and_extract_content, generate_answer, check_mcp_server

# Example queries to try
EXAMPLE_QUERIES = [
    "What is AVOS?",
    "How does the AVOS architecture work?",
    "What are the main components of AVOS?",
    "How to integrate with AVOS?",
    "Explain NVIDIA Drive software stack",
]

def print_result(result):
    """Print the result in a formatted way."""
    print("\n" + "=" * 80)
    print(f"QUERY: {result['query']}")
    print("=" * 80)
    print(result['answer'])
    
    if 'sources' in result and result['sources']:
        print("\nSOURCES:")
        for i, source in enumerate(result['sources'], 1):
            print(f"{i}. {source['title']} - {source['url']}")
    
    print("=" * 80 + "\n")

def main():
    parser = argparse.ArgumentParser(description="Sample Confluence Content Extraction")
    parser.add_argument("query", nargs="?", help="The query to search for (optional)")
    parser.add_argument("--limit", "-l", type=int, default=5, help="Maximum number of search results to process")
    parser.add_argument("--direct", action="store_true", help="Use direct Confluence API instead of MCP")
    parser.add_argument("--examples", "-e", action="store_true", help="Run through example queries")
    
    args = parser.parse_args()
    
    # Decide whether to use MCP or direct API
    use_mcp = not args.direct
    
    # If trying to use MCP but it's not available, fall back to direct API
    if use_mcp and not check_mcp_server():
        print("Warning: MCP server not available. Falling back to direct API.")
        use_mcp = False
    
    # Print API mode
    api_mode = "direct Confluence API" if not use_mcp else "MCP"
    print(f"Using {api_mode} for content extraction")
    
    if args.query:
        # Use query from command line argument
        query = args.query
        print(f"Processing query: '{query}'")
        
        # Extract content from Confluence
        content_results = search_and_extract_content(query, args.limit, use_mcp)
        
        # Generate an answer
        result = generate_answer(query, content_results)
        
        # Print the result
        print_result(result)
    elif args.examples or not args.query:
        # Run through example queries
        print("Running example queries...")
        
        for query in EXAMPLE_QUERIES:
            print(f"Processing example query: '{query}'")
            
            # Extract content from Confluence
            content_results = search_and_extract_content(query, args.limit, use_mcp)
            
            # Generate an answer
            result = generate_answer(query, content_results)
            
            # Print the result
            print_result(result)
            
            # Ask if user wants to continue
            if query != EXAMPLE_QUERIES[-1]:
                response = input("Press Enter to continue with next example, or 'q' to quit: ")
                if response.lower() == 'q':
                    break

if __name__ == "__main__":
    # Check if MCP server is running
    mcp_available = check_mcp_server()
    if not mcp_available:
        print("Note: MCP server is not running. Will use direct Confluence API.")
    
    main() 