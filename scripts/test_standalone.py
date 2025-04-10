#!/usr/bin/env python3
"""
Test script for the standalone Confluence approach
"""
import os
import sys
import json
import argparse
from dotenv import load_dotenv

# Add the current directory to the Python path
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(script_dir)

# Import the standalone modules
try:
    from standalone_confluence_client import search_confluence, get_page_content, get_page_children
    from standalone_content_extractor import search_and_extract_content, generate_answer
    from avos_search_handler import handle_search_query
except ImportError as e:
    print(f"Error importing standalone modules: {e}")
    sys.exit(1)

# Load environment variables
load_dotenv()

def test_search():
    """Test basic search functionality."""
    print("\n== Testing basic search functionality ==")
    query = "AVOS architecture"
    print(f"Searching for: '{query}'")
    
    results = search_confluence(query, limit=5)
    if results:
        print(f"Search successful! Found {len(results)} results.")
        
        # Print first result for verification
        if results:
            first = results[0]
            print(f"First result: {first.get('title')} (ID: {first.get('id')})")
            print(f"URL: {first.get('url')}")
        
        # Return first result ID for further testing
        return results[0].get('id') if results else None
    else:
        print("Search failed or returned no results.")
        return None

def test_page_content(page_id):
    """Test page content retrieval."""
    print(f"\n== Testing page content retrieval for ID: {page_id} ==")
    
    page = get_page_content(page_id)
    if page:
        print(f"Successfully retrieved page: {page.get('title')}")
        
        # Print metadata for verification
        if 'metadata' in page:
            print("Metadata:")
            for key, value in page.get('metadata', {}).items():
                print(f"  {key}: {value}")
        
        # Print content preview
        content = page.get('content', '')
        preview = content[:200] + "..." if len(content) > 200 else content
        print(f"Content preview: {preview}")
        
        return True
    else:
        print("Failed to retrieve page content.")
        return False

def test_page_children(parent_id):
    """Test page children retrieval."""
    print(f"\n== Testing page children retrieval for parent ID: {parent_id} ==")
    
    children = get_page_children(parent_id, limit=5)
    if children:
        print(f"Successfully retrieved {len(children)} child pages.")
        
        # Print children for verification
        for i, child in enumerate(children[:3], 1):  # Show only first 3
            print(f"{i}. {child.get('title')} (ID: {child.get('id')})")
        
        return True
    else:
        print("Failed to retrieve child pages or none exist.")
        return False

def test_content_extraction():
    """Test content extraction functionality."""
    print("\n== Testing content extraction ==")
    query = "What is AVOS architecture?"
    print(f"Extracting content for query: '{query}'")
    
    content_results = search_and_extract_content(query, limit=3)
    if content_results:
        print(f"Successfully extracted content from {len(content_results)} pages.")
        
        # Generate an answer
        answer = generate_answer(query, content_results)
        
        # Print answer preview
        print("\nAnswer preview:")
        preview = answer.get('answer', '')[:300] + "..." if len(answer.get('answer', '')) > 300 else answer.get('answer', '')
        print(preview)
        
        # Print sources
        sources = answer.get('sources', [])
        if sources:
            print("\nSources:")
            for i, source in enumerate(sources, 1):
                print(f"{i}. {source.get('title')} - {source.get('url')}")
        
        return True
    else:
        print("Content extraction failed or returned no results.")
        return False

def test_search_handler():
    """Test the AVOS search handler."""
    print("\n== Testing AVOS search handler ==")
    query = "Go Search AVOS components"
    print(f"Processing query: '{query}'")
    
    result = handle_search_query(query)
    if result.get('handled'):
        print("Query was successfully handled.")
        
        # Print response preview
        response = result.get('response', '')
        preview = response[:300] + "..." if len(response) > 300 else response
        print(f"Response preview: {preview}")
        
        return True
    else:
        print("Query was not handled successfully.")
        return False

def main():
    parser = argparse.ArgumentParser(description="Test script for standalone Confluence approach")
    parser.add_argument("--all", action="store_true", help="Run all tests")
    parser.add_argument("--search", action="store_true", help="Test search functionality")
    parser.add_argument("--page", action="store_true", help="Test page content retrieval")
    parser.add_argument("--children", action="store_true", help="Test page children retrieval")
    parser.add_argument("--extraction", action="store_true", help="Test content extraction")
    parser.add_argument("--handler", action="store_true", help="Test search handler")
    
    args = parser.parse_args()
    
    # Default to running all tests if none specified
    run_all = args.all or not (args.search or args.page or args.children or args.extraction or args.handler)
    
    successful_tests = 0
    total_tests = 0
    
    # Test basic search
    if run_all or args.search:
        total_tests += 1
        page_id = test_search()
        if page_id:
            successful_tests += 1
        
        # If we have a page ID and need to test page content/children
        if page_id and (run_all or args.page):
            total_tests += 1
            if test_page_content(page_id):
                successful_tests += 1
        
        if page_id and (run_all or args.children):
            total_tests += 1
            if test_page_children(page_id):
                successful_tests += 1
    
    # Test content extraction
    if run_all or args.extraction:
        total_tests += 1
        if test_content_extraction():
            successful_tests += 1
    
    # Test search handler
    if run_all or args.handler:
        total_tests += 1
        if test_search_handler():
            successful_tests += 1
    
    print(f"\n== Test summary: {successful_tests}/{total_tests} tests passed ==")
    if successful_tests == total_tests:
        print("All tests passed!")
    else:
        print(f"Warning: {total_tests - successful_tests} tests failed.")

if __name__ == "__main__":
    main() 