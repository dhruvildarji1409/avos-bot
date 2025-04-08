import os
from openai import OpenAI
import openai

from atlassian import Confluence
from bs4 import BeautifulSoup
from pymongo import MongoClient
import re
from typing import List, Dict, Tuple, Optional
from urllib.parse import urlparse, parse_qs, unquote
import pymongo
import datetime

#######################################
# 1) ConfluenceLoader
#######################################
class ConfluenceLoader:
    def __init__(self, confluence_url: str, username: str, password: str):
        """Initialize the Confluence loader with credentials."""
        self.confluence = Confluence(
            url=confluence_url,
            username=username,
            password=password
        )
        self.processed_urls = set()
        self.base_url = confluence_url.rstrip('/')  # Remove trailing slash
        
        # Filter BeautifulSoup warnings
        from bs4 import MarkupResemblesLocatorWarning
        import warnings
        warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)

    def _clean_url(self, url: str) -> str:
        """Clean and normalize Confluence URLs."""
        # Remove anchor fragments
        url = url.split('#')[0]
        
        # Handle viewpage.action URLs
        if 'viewpage.action' in url:
            params = parse_qs(urlparse(url).query)
            if 'pageId' in params:
                return f"{self.base_url}/pages/viewpage.action?pageId={params['pageId'][0]}"
        
        return url

    def _extract_confluence_links(self, html_content: str) -> List[str]:
        """Extract and clean Confluence page links from HTML content."""
        soup = BeautifulSoup(html_content, 'html.parser')
        links = set()
        
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Handle relative URLs
            if href.startswith('/'):
                href = f"{self.base_url}{href}"
            
            # Only process Confluence page URLs
            if self.base_url in href and any(x in href for x in ['/display/', '/pages/', '/spaces/']):
                cleaned_url = self._clean_url(href)
                if cleaned_url:
                    links.add(cleaned_url)
                    
        return list(links)

    def process_page_recursive(self, url: str, current_depth: int = 0, max_depth: int = 2) -> List[Dict]:
        """Recursively process a Confluence page and its references."""
        if current_depth > max_depth:
            return []
        
        # Clean the URL first
        url = self._clean_url(url)
        
        if url in self.processed_urls:
            return []
            
        self.processed_urls.add(url)
        processed_pages = []
        
        try:
            # Get current page content
            page = self.get_page_content(url)
            if not page:
                print(f"Info: Skipping {url} - Page not found or access denied")
                return []
                
            processed_pages.append(page)
            
            # Extract and process referenced pages
            if current_depth < max_depth:
                referenced_urls = self._extract_confluence_links(page['content'])
                
                for ref_url in referenced_urls:
                    try:
                        sub_pages = self.process_page_recursive(
                            ref_url,
                            current_depth + 1,
                            max_depth
                        )
                        processed_pages.extend(sub_pages)
                    except Exception as e:
                        print(f"Info: Skipping referenced page {ref_url} - {str(e)}")
                        continue
            
            return processed_pages
            
        except Exception as e:
            print(f"Info: Could not process {url} - {str(e)}")
            return processed_pages

    def get_page_content(self, url: str) -> Optional[Dict]:
        """Get page content with better error handling."""
        try:
            space, title = self._extract_page_info(url)
            
            # Try by space and title first
            page = self.confluence.get_page_by_title(
                space=space,
                title=title,
                expand='body.storage'
            )
            
            # If not found, try by pageId
            if not page and 'pageId=' in url:
                page_id = parse_qs(urlparse(url).query).get('pageId', [None])[0]
                if page_id:
                    try:
                        page = self.confluence.get_page_by_id(
                            page_id,
                            expand='body.storage'
                        )
                    except:
                        pass

            if not page:
                return None

            return {
                'id': page['id'],
                'title': page['title'],
                'content': page['body']['storage']['value']
            }
            
        except Exception as e:
            return None

    def _extract_page_info(self, url: str) -> Tuple[str, str]:
        """
        Parse various Confluence URL formats to extract space and title.
        Handles multiple URL patterns including:
        - /display/SPACE/Title
        - /pages/viewpage.action?spaceKey=SPACE&title=Title
        - /spaces/SPACE/pages/Title
        - /wiki/spaces/SPACE/pages/Title
        """
        parsed_url = urlparse(url)
        print("parsed_url", parsed_url)
        path_parts = [p for p in parsed_url.path.split('/') if p]
        query_params = parse_qs(parsed_url.query)
        
        # Initialize variables
        space = None
        title = None
        
        # Case 1: viewpage.action format
        if 'viewpage.action' in parsed_url.path:
            space = query_params.get('spaceKey', [None])[0]
            title = query_params.get('title', [None])[0]
            if title:
                title = unquote(title).replace('+', ' ')

        # Case 2: display format
        elif 'display' in path_parts:
            try:
                display_index = path_parts.index('display')
                if len(path_parts) > display_index + 1:
                    space = path_parts[display_index + 1]
                    title = unquote(path_parts[-1])
            except (ValueError, IndexError):
                pass

        # Case 3: spaces format
        elif 'spaces' in path_parts:
            try:
                spaces_index = path_parts.index('spaces')
                if len(path_parts) > spaces_index + 1:
                    space = path_parts[spaces_index + 1]
                    title = unquote(path_parts[-1])
            except (ValueError, IndexError):
                pass

        # Case 4: Simple format (last resort)
        else:
            # Try to get space and title from the last two components
            if len(path_parts) >= 2:
                space = path_parts[-2]
                title = unquote(path_parts[-1])

        # Validate and clean up
        if not space or not title:
            raise ValueError(f"Could not extract space and title from URL: {url}")

        # Clean up the title
        title = self._clean_title(title)
        
        return space, title
    
    def _clean_title(self, title: str) -> str:
        """Clean up the page title."""
        # Remove file extensions
        title = re.sub(r'\.(html|htm)$', '', title)
        # Replace URL encodings and common separators
        title = title.replace('+', ' ').replace('-', ' ')
        # Remove multiple spaces
        title = ' '.join(title.split())
        return title

#######################################
# 2) HeaderBasedChunker
#######################################
class HeaderBasedChunker:
    def __init__(self):
        """Initialize the header-based content chunker that creates a hierarchical graph."""
        self.header_tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

    def _extract_text_with_code(self, element) -> str:
        """Extract text content, preserving code blocks."""
        texts = []
        for child in element.children:
            if child.name == 'pre':  # Code block
                code = child.get_text()
                texts.append(f"```\n{code}\n```")
            elif child.name == 'code':  # Inline code
                texts.append(f"`{child.get_text()}`")
            else:
                if hasattr(child, 'get_text'):
                    texts.append(child.get_text())
                else:
                    texts.append(str(child))
        return ' '.join(texts).strip()

    def chunk_content(self, html_content: str, page_id: str) -> List[Dict]:
        """
        Split HTML content into chunks based on headers while creating parent-child relationships.
        Returns a list of chunks with proper hierarchical relationships.
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        chunks = []
        
        # Find all headers
        all_elements = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'ul', 'ol', 'table'])
        
        # Track the current header stack (hierarchy)
        current_headers = [None] * 6  # h1 to h6
        current_chunk = None
        chunk_content = []
        
        for element in all_elements:
            # If this is a header, it starts a new chunk
            if element.name in self.header_tags:
                # Save the previous chunk if it exists
                if current_chunk and chunk_content:
                    current_chunk['content'] = '\n'.join(chunk_content)
                    current_chunk['full_context'] = f"{current_chunk['header']}\n{'=' * len(current_chunk['header'])}\n{current_chunk['content']}"
                    chunks.append(current_chunk)
                
                # Start a new chunk
                header_level = int(element.name[1]) - 1  # 0-based index (h1 -> 0)
                header_text = element.get_text().strip()
                
                # Update header stack at this level and clear all lower levels
                current_headers[header_level] = {
                    'text': header_text,
                    'chunk_index': len(chunks)
                }
                for i in range(header_level + 1, 6):
                    current_headers[i] = None
                
                # Determine parent chunk
                parent_chunk_id = None
                parent_header_text = None
                for i in range(header_level - 1, -1, -1):
                    if current_headers[i] is not None:
                        if len(chunks) > current_headers[i]['chunk_index']:
                            parent_chunk_id = f"{page_id}-chunk-{current_headers[i]['chunk_index']}"
                            parent_header_text = current_headers[i]['text']
                        break
                
                # Build header path - the path of headers from root to this node
                header_path = []
                for i in range(header_level):
                    if current_headers[i] is not None:
                        header_path.append({
                            'level': i + 1,
                            'text': current_headers[i]['text'],
                            'chunk_id': f"{page_id}-chunk-{current_headers[i]['chunk_index']}"
                        })
                
                # Create new chunk with graph metadata
                current_chunk = {
                    'header': header_text,
                    'level': header_level + 1,
                    'parent_chunk_id': parent_chunk_id,
                    'parent_header': parent_header_text,
                    'header_path': header_path,
                    'depth': header_level,
                    'children': []  # Will be filled in later
                }
                
                chunk_content = []
                
            # For non-header elements, add to current chunk's content
            elif current_chunk is not None:
                text = self._extract_text_with_code(element)
                if text.strip():
                    chunk_content.append(text)
        
        # Add the last chunk
        if current_chunk and chunk_content:
            current_chunk['content'] = '\n'.join(chunk_content)
            current_chunk['full_context'] = f"{current_chunk['header']}\n{'=' * len(current_chunk['header'])}\n{current_chunk['content']}"
            chunks.append(current_chunk)
        
        # Now that we have all chunks, fill in the children arrays
        chunk_map = {}
        for i, chunk in enumerate(chunks):
            chunk_id = f"{page_id}-chunk-{i}"
            chunk_map[chunk_id] = i
        
        for i, chunk in enumerate(chunks):
            if chunk.get('parent_chunk_id') and chunk['parent_chunk_id'] in chunk_map:
                parent_idx = chunk_map[chunk['parent_chunk_id']]
                chunks[parent_idx]['children'].append(f"{page_id}-chunk-{i}")
        
        return chunks

#######################################
# 3) MongoDB Class
#######################################
class ConfluenceMongoDB:
    """A MongoDB wrapper to store Confluence page chunks with graph relationships."""
    def __init__(
        self,
        host: str = "localhost",
        port: int = 27017,
        db_name: str = "confluence_db",
        collection_name: str = "page_chunks"
    ):
        self.client = MongoClient(host, port)
        self.db = self.client[db_name]
        self.collection = self.db[collection_name]
        
        # Create indexes for graph relationships and queries
        self.collection.create_index([("references", 1)])
        self.collection.create_index([("embedding", 1)])
        self.collection.create_index([("parent_chunk_id", 1)])
        self.collection.create_index([("children", 1)])
        self.collection.create_index([("page_id", 1)])
        self.collection.create_index([("header", 1)])
        self.collection.create_index([("depth", 1)])
        self.collection.create_index([("level", 1)])

    def add_confluence_chunk(
        self,
        chunk_id: str,
        page_id: str,
        page_title: str,
        header: str,
        level: int,
        content: str,
        full_context: str,
        embedding: List[float],
        references: List[str] = [],
        parent_chunk_id: str = None,
        children: List[str] = [],
        header_path: List[Dict] = [],
        depth: int = 0,
        keywords: List[str] = []
    ):
        """Insert a chunk document with hierarchical graph relationships into MongoDB."""
        doc = {
            "_id": chunk_id,
            "page_id": page_id,
            "page_title": page_title,
            "header": header,
            "level": level,
            "content": content,
            "full_context": full_context,
            "embedding": embedding,
            "references": references,
            "keywords": keywords,
            
            # Graph structure fields
            "parent_chunk_id": parent_chunk_id,
            "children": children,
            "header_path": header_path,
            "depth": depth,
            "node_type": "content_chunk",
            "timestamp": datetime.datetime.now()
        }

        try:
            # Use upsert to handle updates
            self.collection.update_one(
                {"_id": chunk_id},
                {"$set": doc},
                upsert=True
            )
        except Exception as e:
            print(f"Failed to insert/update chunk {chunk_id}: {str(e)}")
            
    def graph_based_retrieve(
        self, 
        query: str,
        embedding: List[float],
        max_results: int = 5,
        max_depth: int = 2,
        similarity_threshold: float = 0.7
    ):
        """
        Retrieve information using graph traversal in the header hierarchy.
        
        This implementation works without requiring MongoDB Atlas vector search
        by calculating similarity in Python.
        """
        # Get all documents (for a production system, you'd want to implement pagination)
        all_docs = list(self.collection.find())
        
        # Calculate similarity for all documents
        docs_with_scores = []
        for doc in all_docs:
            if "embedding" in doc:
                # Calculate cosine similarity 
                doc_vector = doc["embedding"]
                dot_product = sum(a*b for a, b in zip(embedding, doc_vector))
                magnitude1 = sum(a*a for a in embedding) ** 0.5
                magnitude2 = sum(b*b for b in doc_vector) ** 0.5
                
                if magnitude1 * magnitude2 == 0:
                    similarity = 0
                else:
                    similarity = dot_product / (magnitude1 * magnitude2)
                
                docs_with_scores.append((doc, similarity))
        
        # Sort by similarity
        docs_with_scores.sort(key=lambda x: x[1], reverse=True)
        
        # Get top vector results as seed nodes
        top_k = min(max_results, len(docs_with_scores))
        seed_nodes = [doc["_id"] for doc, score in docs_with_scores[:top_k]]
        
        # Gather all nodes to explore through graph traversal
        all_relevant_nodes = set(seed_nodes)
        
        # For each seed node, explore graph in both directions
        for node_id in seed_nodes:
            # Explore upward (parents)
            current_id = node_id
            for _ in range(max_depth):
                doc = self.collection.find_one({"_id": current_id})
                if not doc or not doc.get("parent_chunk_id"):
                    break
                    
                parent_id = doc["parent_chunk_id"]
                all_relevant_nodes.add(parent_id)
                current_id = parent_id
            
            # Explore downward (children)
            self._explore_children(node_id, all_relevant_nodes, current_depth=0, max_depth=max_depth)
            
            # Explore sibling nodes (nodes with same parent)
            doc = self.collection.find_one({"_id": node_id})
            if doc and doc.get("parent_chunk_id"):
                siblings = self.collection.find({"parent_chunk_id": doc["parent_chunk_id"]})
                for sibling in siblings:
                    all_relevant_nodes.add(sibling["_id"])
        
        # Get full documents for all relevant nodes
        graph_docs = []
        for node_id in all_relevant_nodes:
            doc = next((d for d, _ in docs_with_scores if d["_id"] == node_id), None)
            if doc:
                # Find this doc's score
                score = next((s for d, s in docs_with_scores if d["_id"] == node_id), 0)
                
                # Boost score for parents of high-scoring nodes
                is_parent_of_seed = any(
                    self.collection.find_one({"_id": seed, "parent_chunk_id": node_id})
                    for seed in seed_nodes
                )
                
                if is_parent_of_seed:
                    score *= 1.2  # Boost parent nodes
                
                graph_docs.append((doc, score))
        
        # Sort by score
        graph_docs.sort(key=lambda x: x[1], reverse=True)
        
        # Format final results
        results = []
        for doc, score in graph_docs[:max_results]:
            # Determine if this was found by graph traversal
            is_seed = doc["_id"] in seed_nodes
            
            results.append({
                "_id": doc["_id"],
                "page_title": doc["page_title"],
                "header": doc["header"],
                "content": doc["content"],
                "similarity_score": score,
                "is_seed": is_seed,
                "found_by": "vector" if is_seed else "graph",
                "parent_chunk_id": doc.get("parent_chunk_id"),
                "children": doc.get("children", []),
                "level": doc.get("level"),
                "depth": doc.get("depth")
            })
        
        return results
    
    def _explore_children(self, node_id, collected_nodes, current_depth=0, max_depth=2):
        """Recursively explore child nodes up to max_depth."""
        if current_depth >= max_depth:
            return
            
        # Find children of this node
        doc = self.collection.find_one({"_id": node_id})
        if not doc or not doc.get("children"):
            return
            
        # Add all children
        for child_id in doc["children"]:
            collected_nodes.add(child_id)
            # Recursively explore grandchildren
            self._explore_children(
                child_id, 
                collected_nodes,
                current_depth + 1,
                max_depth
            )

#######################################
# 4) MAIN
#######################################
def main():
    # Get your OpenAI API key from env or set it here directly (not recommended)
    openai.api_key = os.getenv("OPENAI_API_KEY", "your-api-key")

    # Basic Confluence credentials
    username = os.getenv("CONFLUENCE_USERNAME", "ddarji")
    password = os.getenv("CONFLUENCE_PASSWORD", "ArPfLkLoQxBbUjHESYdU7rfL8o61Itp07eOoqH")

    if not username or not password:
        print("Error: Confluence credentials not set. Check your environment variables.")
        return

    if not openai.api_key:
        print("Error: OPENAI_API_KEY not set. Please set your OpenAI API key.")
        return

    # Confluence config
    config = {
        "confluence_url": "https://confluence.nvidia.com",
        "username": username,
        "password": password
    }

    # Initialize everything
    try:
        loader = ConfluenceLoader(
            confluence_url=config["confluence_url"],
            username=config["username"],
            password=config["password"]
        )
        chunker = HeaderBasedChunker()

        # Our MongoDB connection
        mongo_db = ConfluenceMongoDB(
            host="localhost",           
            port=27017,                 
            db_name="confluence_db",    
            collection_name="page_chunks"
        )

        print("Successfully initialized Confluence loader, chunker, and MongoDB client.")
    except Exception as e:
        print(f"Error initializing components: {str(e)}")
        return

    # Read URLs from manifest.txt
    try:
        with open('manifest.txt', 'r') as f:
            urls = [line.strip() for line in f if line.strip()]

        if not urls:
            print("Error: manifest.txt is empty!")
            return

        print(f"Found {len(urls)} URLs to process.")
    except FileNotFoundError:
        print("Error: manifest.txt file not found!")
        return

    # Process each URL with recursive reference following
    processed_pages = {}
    processed_urls = set()
    
    for url in urls:
        try:
            print(f"\nProcessing: {url}")
            
            # Get all pages (including referenced pages up to 2 levels)
            pages = loader.process_page_recursive(url, current_depth=0, max_depth=2)
            
            for page in pages:
                if page['id'] not in processed_pages:
                    processed_pages[page['id']] = page
                    processed_urls.add(page['id'])
                    
                    # Chunk content by headers with graph structure
                    chunks = chunker.chunk_content(page["content"], page['id'])
                    
                    if not chunks:
                        print(f"Warning: No headers found in '{page['title']}'")
                        continue
                    
                    print(f"Found {len(chunks)} chunks with hierarchy in '{page['title']}'")
                    
                    # Process each chunk
                    for i, chunk in enumerate(chunks):
                        chunk_id = f"{page['id']}-chunk-{i}"
                        
                        # Generate embedding
                        embedding_response = openai.embeddings.create(
                            model="text-embedding-ada-002",
                            input=chunk["full_context"]
                        )
                        embedding_vector = embedding_response.data[0].embedding
                        
                        # Extract references for graph relationships
                        chunk_references = loader._extract_confluence_links(
                            chunk.get('content', '')
                        )
                        
                        # Store in MongoDB with graph data
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
            print(f"Error processing {url}: {str(e)}")

    # After all pages are processed, let's establish cross-page references
    print("\nEstablishing cross-page references...")
    for page_id, page in processed_pages.items():
        try:
            # Find all chunks for this page
            page_chunks = list(mongo_db.collection.find({"page_id": page_id}))
            
            for chunk in page_chunks:
                # Extract references to other pages
                references = chunk.get('references', [])
                
                # For each reference, create a graph link
                for ref in references:
                    # Find target page
                    ref_page_id = None
                    for pid, p in processed_pages.items():
                        if p.get('url') == ref:
                            ref_page_id = pid
                            break
                    
                    if ref_page_id:
                        # Create a "references" edge
                        mongo_db.collection.update_one(
                            {"_id": chunk["_id"]},
                            {"$addToSet": {"outgoing_links": {
                                "type": "references",
                                "target_page_id": ref_page_id
                            }}}
                        )
        except Exception as e:
            print(f"Error establishing references for page {page_id}: {str(e)}")

    print(f"\nDone! Processed {len(processed_pages)} total pages with graph-structured chunks in MongoDB.")

if __name__ == "__main__":
    main()
