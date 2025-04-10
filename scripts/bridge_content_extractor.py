#!/usr/bin/env python3
"""
AVOS Bot - Bridge-based Confluence Content Extractor

This script extracts and processes content from Confluence pages using the mcp_bridge.py script,
which directly imports the mcp-confluence module instead of using MCP HTTP service.
"""
import os
import sys
import json
import re
import argparse
import subprocess
from pathlib import Path
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Confluence configuration
CONFLUENCE_URL = os.getenv("CONFLUENCE_HOST", "https://confluence.nvidia.com")
CONFLUENCE_USERNAME = os.getenv("CONFLUENCE_USERNAME")
CONFLUENCE_TOKEN = os.getenv("CONFLUENCE_PERSONAL_TOKEN")

# Bridge configuration
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
    
    # Validate bridge script exists
    if not os.path.exists(BRIDGE_PATH):
        raise FileNotFoundError(f"MCP bridge script not found at {BRIDGE_PATH}")
    
    # Convert parameters to JSON
    params_json = json.dumps(params)
    
    try:
        # Call the bridge script
        result = subprocess.run(
            ["python", BRIDGE_PATH, function_name, params_json],
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

def extract_content_from_html(html_content):
    """
    Extract clean text content from HTML.
    
    Args:
        html_content (str): HTML content from Confluence
        
    Returns:
        str: Cleaned text content
    """
    if not html_content:
        return ""
    
    # Parse the HTML
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Remove script and style elements
    for script_or_style in soup(["script", "style"]):
        script_or_style.extract()
    
    # Get text
    text = soup.get_text()
    
    # Break into lines and remove leading and trailing space on each
    lines = (line.strip() for line in text.splitlines())
    
    # Break multi-headlines into a line each
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    
    # Remove blank lines
    text = '\n'.join(chunk for chunk in chunks if chunk)
    
    return text

def extract_code_blocks(html_content):
    """
    Extract code blocks from HTML content.
    
    Args:
        html_content (str): HTML content from Confluence
        
    Returns:
        list: List of dictionaries with code blocks and their language
    """
    if not html_content:
        return []
    
    # Parse the HTML
    soup = BeautifulSoup(html_content, 'html.parser')
    
    code_blocks = []
    
    # Find all code blocks
    for pre in soup.find_all('pre'):
        # Try to get the language
        code_elem = pre.find('code')
        language = "text"
        
        if code_elem and 'class' in code_elem.attrs:
            for cls in code_elem.attrs['class']:
                if cls.startswith('language-'):
                    language = cls.replace('language-', '')
                    break
        
        # Get the code content
        code_content = pre.get_text().strip()
        
        if code_content:
            code_blocks.append({
                'language': language,
                'code': code_content
            })
    
    return code_blocks

def extract_structured_content(page):
    """
    Extract structured content from a Confluence page.
    
    Args:
        page (dict): Confluence page data
        
    Returns:
        dict: Structured content with sections, text, and code blocks
    """
    if not page or 'content' not in page:
        return {
            'title': page.get('title', 'Unknown'),
            'text': '',
            'sections': [],
            'code_blocks': []
        }
    
    # Get HTML content
    html_content = page['content']
    
    # Parse the HTML
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Extract title
    title = page.get('title', 'Unknown')
    
    # Extract code blocks
    code_blocks = extract_code_blocks(html_content)
    
    # Extract sections
    sections = []
    current_section = {'heading': title, 'content': '', 'level': 0}
    
    # Get all headings and paragraphs
    for elem in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'p']):
        tag_name = elem.name
        
        # If it's a heading, start a new section
        if tag_name.startswith('h'):
            # Save the current section if it has content
            if current_section['content'].strip():
                sections.append(current_section)
            
            # Start a new section
            level = int(tag_name[1])
            current_section = {
                'heading': elem.get_text().strip(),
                'content': '',
                'level': level
            }
        # If it's a paragraph, add to the current section
        elif tag_name == 'p':
            current_section['content'] += elem.get_text().strip() + '\n\n'
    
    # Add the last section
    if current_section['content'].strip():
        sections.append(current_section)
    
    # Extract full text content
    text = extract_content_from_html(html_content)
    
    return {
        'title': title,
        'text': text,
        'sections': sections,
        'code_blocks': code_blocks
    }

def search_and_extract_content(query, limit=5):
    """
    Search Confluence and extract content from the top results.
    
    Args:
        query (str): Search query
        limit (int): Maximum number of results to process
        
    Returns:
        list: List of structured content from relevant pages
    """
    # Search Confluence using the bridge
    search_results = search_confluence(query, limit)
    
    if not search_results:
        return []
    
    content_results = []
    
    # Process each search result
    for result in search_results:
        page_id = result.get('id')
        if not page_id:
            continue
        
        # Get full page content using the bridge
        page = get_page_content(page_id)
            
        if not page:
            continue
        
        # Extract structured content
        structured_content = extract_structured_content(page)
        
        # Add metadata
        structured_content['id'] = page_id
        structured_content['url'] = page.get('url', f"{CONFLUENCE_URL}/pages/viewpage.action?pageId={page_id}")
        
        # Handle metadata
        if 'metadata' in page and isinstance(page['metadata'], dict):
            structured_content['space'] = page['metadata'].get('spaceKey', 'Unknown')
        else:
            structured_content['space'] = page.get('space', {}).get('key', 'Unknown')
        
        content_results.append(structured_content)
    
    return content_results

def find_relevant_sections(content_results, query):
    """
    Find sections in the content that are most relevant to the query.
    
    Args:
        content_results (list): List of structured content from pages
        query (str): The user's query
        
    Returns:
        list: List of relevant sections with their source
    """
    relevant_sections = []
    query_terms = set(query.lower().split())
    
    for page in content_results:
        # Process each section in the page
        for section in page['sections']:
            section_content = section['content'].lower()
            
            # Count how many query terms appear in this section
            term_matches = sum(1 for term in query_terms if term in section_content)
            
            if term_matches > 0:
                relevant_sections.append({
                    'page_title': page['title'],
                    'page_id': page['id'],
                    'page_url': page['url'],
                    'heading': section['heading'],
                    'content': section['content'],
                    'level': section['level'],
                    'relevance_score': term_matches
                })
    
    # Sort sections by relevance score (higher is better)
    relevant_sections.sort(key=lambda x: x['relevance_score'], reverse=True)
    
    return relevant_sections

def find_relevant_code_examples(content_results, query):
    """
    Find code examples in the content that are relevant to the query.
    
    Args:
        content_results (list): List of structured content from pages
        query (str): The user's query
        
    Returns:
        list: List of relevant code examples with their source
    """
    relevant_code = []
    query_terms = set(query.lower().split())
    
    for page in content_results:
        # Process each code block in the page
        for code_block in page['code_blocks']:
            code_content = code_block['code'].lower()
            
            # Count how many query terms appear in this code block
            term_matches = sum(1 for term in query_terms if term in code_content)
            
            if term_matches > 0:
                relevant_code.append({
                    'page_title': page['title'],
                    'page_id': page['id'],
                    'page_url': page['url'],
                    'language': code_block['language'],
                    'code': code_block['code'],
                    'relevance_score': term_matches
                })
    
    # Sort code examples by relevance score (higher is better)
    relevant_code.sort(key=lambda x: x['relevance_score'], reverse=True)
    
    return relevant_code

def generate_answer(query, content_results):
    """
    Generate an answer to the user's query based on the content.
    
    Args:
        query (str): The user's query
        content_results (list): List of structured content from pages
        
    Returns:
        dict: Answer with relevant information
    """
    if not content_results:
        return {
            'query': query,
            'answer': f"Sorry, I couldn't find any information about '{query}' in Confluence.",
            'sources': []
        }
    
    # Find relevant sections and code examples
    relevant_sections = find_relevant_sections(content_results, query)
    relevant_code = find_relevant_code_examples(content_results, query)
    
    # Prepare the answer
    answer_parts = []
    
    # Include content from top relevant sections (up to 3)
    if relevant_sections:
        answer_parts.append(f"Here's what I found about '{query}':\n")
        
        for section in relevant_sections[:3]:
            answer_parts.append(f"### {section['heading']}\n")
            
            # Truncate content if it's too long
            content = section['content']
            if len(content) > 1000:
                content = content[:1000] + "...\n\n(Content truncated)"
                
            answer_parts.append(content)
            answer_parts.append("")
    
    # Include relevant code examples (up to 2)
    if relevant_code:
        answer_parts.append("### Relevant Code Examples\n")
        
        for code_example in relevant_code[:2]:
            answer_parts.append(f"**From:** {code_example['page_title']}")
            answer_parts.append(f"**Language:** {code_example['language']}")
            answer_parts.append("```" + code_example['language'])
            
            # Truncate code if it's too long
            code = code_example['code']
            if len(code) > 500:
                code = code[:500] + "\n...\n\n(Code truncated)"
                
            answer_parts.append(code)
            answer_parts.append("```\n")
    
    # Prepare sources
    sources = []
    seen_pages = set()
    
    # Add sources from relevant sections
    for section in relevant_sections:
        if section['page_id'] not in seen_pages:
            sources.append({
                'title': section['page_title'],
                'url': section['page_url'],
                'id': section['page_id']
            })
            seen_pages.add(section['page_id'])
    
    # Add sources from relevant code examples
    for code_example in relevant_code:
        if code_example['page_id'] not in seen_pages:
            sources.append({
                'title': code_example['page_title'],
                'url': code_example['page_url'],
                'id': code_example['page_id']
            })
            seen_pages.add(code_example['page_id'])
    
    return {
        'query': query,
        'answer': '\n'.join(answer_parts),
        'sources': sources[:5]  # Limit to 5 sources
    }

def check_bridge_script():
    """Check if the bridge script exists and is accessible."""
    if not os.path.exists(BRIDGE_PATH):
        print(f"Error: Bridge script not found at {BRIDGE_PATH}", file=sys.stderr)
        return False
    
    # Try a simple function call to check if the bridge is working
    try:
        result = call_bridge_function("mcp_confluence_confluence_search", {
            "query": "Test",
            "limit": 1
        })
        return isinstance(result, list)
    except Exception as e:
        print(f"Error checking bridge script: {str(e)}", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(description="AVOS Bot - Bridge-based Confluence Content Extractor")
    parser.add_argument("query", help="The query to search for")
    parser.add_argument("--limit", "-l", type=int, default=5, help="Maximum number of search results to process")
    parser.add_argument("--format", choices=["text", "json"], default="text", help="Output format")
    
    args = parser.parse_args()
    
    # Check if the bridge script is working
    if not check_bridge_script():
        print("Error: Bridge script is not working correctly. Make sure it exists and can access mcp-confluence.", file=sys.stderr)
        sys.exit(1)
    
    # Search and extract content
    content_results = search_and_extract_content(args.query, args.limit)
    
    # Generate answer
    result = generate_answer(args.query, content_results)
    
    # Output the result
    if args.format == "json":
        print(json.dumps(result, indent=2))
    else:
        print(f"Query: {result['query']}\n")
        print(result['answer'])
        
        if result['sources']:
            print("\nSources:")
            for i, source in enumerate(result['sources'], 1):
                print(f"{i}. {source['title']} - {source['url']}")

if __name__ == "__main__":
    main() 