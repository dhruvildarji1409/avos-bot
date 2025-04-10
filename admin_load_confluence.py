#!/usr/bin/env python3
"""
Admin Utility for Loading Confluence Pages

This script provides a command-line interface for administrators to load 
Confluence pages into the MongoDB database with proper chunking and embedding.
"""

import os
import sys
import argparse
from pathlib import Path
import dotenv

# Load environment variables
dotenv.load_dotenv()

# Import from the project
from confluence_loader import ConfluenceLoader, HeaderBasedChunker, ConfluenceMongoDB
from src.openai_auth import create_client, DEPENDENCIES_INSTALLED

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Load Confluence pages into MongoDB.')
    
    # Main commands
    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    
    # Add URL command
    add_parser = subparsers.add_parser('add', help='Add Confluence URLs to database')
    add_parser.add_argument('urls', nargs='+', help='Confluence URLs to process')
    add_parser.add_argument('--recursive', '-r', action='store_true', 
                          help='Process all linked pages recursively')
    add_parser.add_argument('--depth', '-d', type=int, default=3,
                          help='Maximum recursion depth (default: 3)')
    
    # Add from file command
    file_parser = subparsers.add_parser('file', help='Add Confluence URLs from a file')
    file_parser.add_argument('file', help='File containing Confluence URLs (one per line)')
    file_parser.add_argument('--recursive', '-r', action='store_true',
                           help='Process all linked pages recursively')
    file_parser.add_argument('--depth', '-d', type=int, default=3,
                           help='Maximum recursion depth (default: 3)')
    
    # Set credentials
    credentials_parser = subparsers.add_parser('credentials', help='Set Confluence credentials')
    credentials_parser.add_argument('--username', '-u', help='Confluence username')
    credentials_parser.add_argument('--password', '-p', help='Confluence password or token')
    credentials_parser.add_argument('--url', help='Confluence URL')
    
    # Search command
    search_parser = subparsers.add_parser('search', help='Search the database')
    search_parser.add_argument('query', help='Query text to search for')
    search_parser.add_argument('--limit', '-l', type=int, default=5,
                             help='Maximum number of results to return')
    
    return parser.parse_args()

def process_urls(urls, recursive=False, max_depth=3):
    """Process Confluence URLs and store in MongoDB."""
    # Get OpenAI client
    openai_client, model_name = create_client("text-embedding-ada-002")
    
    if not DEPENDENCIES_INSTALLED or not openai_client:
        print("Error: OpenAI dependencies not installed or authentication failed.")
        return False
    
    # Basic Confluence credentials
    username = os.getenv("CONFLUENCE_USERNAME", "")
    password = os.getenv("CONFLUENCE_PASSWORD", "")
    confluence_url = os.getenv("CONFLUENCE_URL", "https://confluence.nvidia.com")
    
    if not username or not password:
        print("Error: Confluence credentials not set. Use the 'credentials' command.")
        return False
    
    # Initialize components
    try:
        loader = ConfluenceLoader(
            confluence_url=confluence_url,
            username=username,
            password=password
        )
        chunker = HeaderBasedChunker()
        mongo_db = ConfluenceMongoDB(
            host=os.getenv("MONGODB_HOST", "localhost"),
            port=int(os.getenv("MONGODB_PORT", "27017")),
            db_name=os.getenv("MONGODB_DB", "confluence_db"),
            collection_name=os.getenv("MONGODB_COLLECTION", "page_chunks")
        )
        
        print("Initialized Confluence loader, chunker, and MongoDB client.")
    except Exception as e:
        print(f"Error initializing components: {e}")
        return False
    
    # Process URLs
    processed_pages = {}
    processed_urls = set()
    
    for url in urls:
        try:
            print(f"\nProcessing: {url}")
            
            # Set recursion depth based on command line argument
            process_depth = max_depth if recursive else 0
            
            # Get page content with or without recursion
            pages = loader.process_page_recursive(
                url=url, 
                current_depth=0, 
                max_depth=process_depth
            )
            
            if not pages:
                print(f"Warning: No content found for {url}")
                continue
                
            for page in pages:
                if page['id'] not in processed_pages:
                    processed_pages[page['id']] = page
                    processed_urls.add(page['id'])
                    
                    # Chunk by headers
                    chunks = chunker.chunk_content(page["content"], page['id'])
                    
                    if not chunks:
                        print(f"Warning: No headers found in '{page['title']}'")
                        continue
                    
                    print(f"Found {len(chunks)} chunks in '{page['title']}'")
                    
                    # Process chunks
                    for i, chunk in enumerate(chunks):
                        chunk_id = f"{page['id']}-chunk-{i}"
                        
                        # Generate embedding with OpenAI
                        try:
                            embedding_response = openai_client.embeddings.create(
                                model="text-embedding-ada-002",
                                input=chunk["full_context"],
                                dimensions=1536
                            )
                            embedding_vector = embedding_response.data[0].embedding
                        except Exception as e:
                            print(f"Error generating embedding: {e}")
                            continue
                        
                        # Extract references
                        chunk_references = loader._extract_confluence_links(
                            chunk.get('content', '')
                        )
                        
                        # Store in MongoDB
                        mongo_db.add_confluence_chunk(
                            chunk_id=chunk_id,
                            page_id=page['id'],
                            page_title=page['title'],
                            header=chunk['header'],
                            level=chunk['level'],
                            content=chunk.get('content', ''),
                            full_context=chunk.get('full_context', ''),
                            embedding=embedding_vector,
                            references=[ref for ref in chunk_references if ref in processed_urls],
                            parent_chunk_id=chunk.get('parent_chunk_id'),
                            children=chunk.get('children', []),
                            header_path=chunk.get('header_path', []),
                            depth=chunk.get('depth', 0)
                        )
                    
                    print(f"Successfully processed {len(chunks)} sections from: {page['title']}")
        
        except Exception as e:
            print(f"Error processing {url}: {e}")
    
    # Establish cross-references
    print("\nEstablishing cross-page references...")
    for page_id, page in processed_pages.items():
        try:
            # Find chunks for this page
            page_chunks = list(mongo_db.collection.find({"page_id": page_id}))
            
            for chunk in page_chunks:
                # Extract references
                references = chunk.get('references', [])
                
                # Create graph links
                for ref in references:
                    ref_page_id = None
                    for pid, p in processed_pages.items():
                        if p.get('url') == ref:
                            ref_page_id = pid
                            break
                    
                    if ref_page_id:
                        mongo_db.collection.update_one(
                            {"_id": chunk["_id"]},
                            {"$addToSet": {"outgoing_links": {
                                "type": "references",
                                "target_page_id": ref_page_id
                            }}}
                        )
        except Exception as e:
            print(f"Error establishing references for page {page_id}: {e}")
    
    print(f"\nDone! Processed {len(processed_pages)} pages with {sum(len(mongo_db.collection.find({'page_id': pid})) for pid in processed_pages)} total chunks.")
    return True

def set_credentials(args):
    """Set Confluence credentials in .env file."""
    # Load existing .env
    env_path = Path('.env')
    env_vars = {}
    
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    env_vars[key] = value
    
    # Update with new values
    if args.username:
        env_vars['CONFLUENCE_USERNAME'] = args.username
    if args.password:
        env_vars['CONFLUENCE_PASSWORD'] = args.password
    if args.url:
        env_vars['CONFLUENCE_URL'] = args.url
    
    # Write back to .env
    with open(env_path, 'w') as f:
        for key, value in env_vars.items():
            f.write(f"{key}={value}\n")
    
    print("Credentials updated.")
    return True

def search_database(query, limit=5):
    """Search the database for the given query."""
    # Get OpenAI client for embeddings
    openai_client, _ = create_client("text-embedding-ada-002")
    
    if not DEPENDENCIES_INSTALLED or not openai_client:
        print("Error: OpenAI dependencies not installed or authentication failed.")
        return False
    
    # Initialize MongoDB connection
    try:
        mongo_db = ConfluenceMongoDB(
            host=os.getenv("MONGODB_HOST", "localhost"),
            port=int(os.getenv("MONGODB_PORT", "27017")),
            db_name=os.getenv("MONGODB_DB", "confluence_db"),
            collection_name=os.getenv("MONGODB_COLLECTION", "page_chunks")
        )
    except Exception as e:
        print(f"Error connecting to MongoDB: {e}")
        return False
    
    # Perform search
    results = mongo_db.search_by_query(query, openai_client, limit)
    
    if not results:
        print(f"No results found for query: {query}")
        return True
    
    # Display results
    print(f"\nFound {len(results)} results for query: {query}\n")
    
    for i, result in enumerate(results):
        print(f"Result {i+1}: {result['page_title']} - {result['header']}")
        print(f"Score: {result['similarity_score']:.4f} | Found by: {result['found_by']}")
        print("-" * 80)
        print(result['content'][:300] + "..." if len(result['content']) > 300 else result['content'])
        print("\n")
    
    return True

def main():
    """Main function to handle command line interface."""
    args = parse_arguments()
    
    if args.command == 'add':
        process_urls(args.urls, args.recursive, args.depth)
    
    elif args.command == 'file':
        try:
            with open(args.file, 'r') as f:
                urls = [line.strip() for line in f if line.strip()]
                
            if not urls:
                print(f"Error: No URLs found in {args.file}")
                return
                
            process_urls(urls, args.recursive, args.depth)
            
        except FileNotFoundError:
            print(f"Error: File {args.file} not found.")
    
    elif args.command == 'credentials':
        set_credentials(args)
    
    elif args.command == 'search':
        search_database(args.query, args.limit)
    
    else:
        print("Please specify a command. Use --help for more information.")

if __name__ == "__main__":
    main() 