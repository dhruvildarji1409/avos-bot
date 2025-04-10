#!/usr/bin/env python3
"""
AVOS Bot - Confluence Content Extractor

This script extracts and processes content from Confluence pages 
to provide answers to user queries about AVOS.
"""
import os
import sys
import json
import re
import argparse
import requests
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Add parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.confluence_mcp_client import search_confluence, get_page_content, fallback_search_confluence, fallback_get_page_content

# Load environment variables
load_dotenv()

# Confluence configuration
CONFLUENCE_URL = os.getenv("CONFLUENCE_HOST", "https://confluence.nvidia.com")
CONFLUENCE_USERNAME = os.getenv("CONFLUENCE_USERNAME")
CONFLUENCE_TOKEN = os.getenv("CONFLUENCE_PERSONAL_TOKEN")

# MCP configuration
USE_MCP = os.getenv("USE_MCP", "true").lower() == "true"

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

def search_and_extract_content(query, limit=5, use_mcp=None):
    """
    Search Confluence and extract content from the top results.
    
    Args:
        query (str): Search query
        limit (int): Maximum number of results to process
        use_mcp (bool): Whether to use MCP or direct API. Defaults to global USE_MCP
        
    Returns:
        list: List of structured content from relevant pages
    """
    # Use the specified method or fall back to global setting
    if use_mcp is None:
        use_mcp = USE_MCP
        
    # Search Confluence using either MCP or direct API
    if use_mcp:
        search_results = search_confluence(query, limit)
    else:
        results_data = fallback_search_confluence(query, limit)
        search_results = results_data.get("results", [])
    
    if not search_results:
        return []
    
    content_results = []
    
    # Process each search result
    for result in search_results:
        page_id = result.get('id')
        if not page_id:
            continue
        
        # Get full page content using either MCP or direct API
        if use_mcp:
            page = get_page_content(page_id)
        else:
            page = fallback_get_page_content(page_id)
            
        if not page:
            continue
        
        # Extract structured content
        structured_content = extract_structured_content(page)
        
        # Add metadata
        structured_content['id'] = page_id
        structured_content['url'] = page.get('url', f"{CONFLUENCE_URL}/pages/viewpage.action?pageId={page_id}")
        
        # Handle different metadata structures between MCP and direct API
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

def check_mcp_server():
    """Check if MCP server is running and accessible."""
    try:
        import requests
        mcp_port = os.getenv("MCP_API_PORT", "6277")
        response = requests.get(f"http://localhost:{mcp_port}/inspector", timeout=1)
        return response.status_code == 200
    except Exception:
        return False

def main():
    parser = argparse.ArgumentParser(description="AVOS Bot - Confluence Content Extractor")
    parser.add_argument("query", help="The query to search for")
    parser.add_argument("--limit", "-l", type=int, default=5, help="Maximum number of search results to process")
    parser.add_argument("--format", choices=["text", "json"], default="text", help="Output format")
    parser.add_argument("--direct", action="store_true", help="Use direct Confluence API instead of MCP")
    
    args = parser.parse_args()
    
    # Decide whether to use MCP or direct API
    use_mcp = not args.direct
    
    # If trying to use MCP but it's not available, fall back to direct API
    if use_mcp and not check_mcp_server():
        print("Warning: MCP server not available. Falling back to direct API.")
        use_mcp = False
    
    # Search and extract content
    content_results = search_and_extract_content(args.query, args.limit, use_mcp)
    
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