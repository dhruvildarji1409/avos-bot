from flask import Flask, request, jsonify
import os
import json
import datetime
from typing import List, Dict, Optional
from openai import OpenAI
import threading

from confluence_loader import ConfluenceLoader, HeaderBasedChunker, ConfluenceMongoDB

app = Flask(__name__)

# Global variables
config = {
    "confluence_url": os.getenv("CONFLUENCE_URL", "https://confluence.nvidia.com"),
    "username": os.getenv("CONFLUENCE_USERNAME", "ddarji"),
    "password": os.getenv("CONFLUENCE_PASSWORD", "ArPfLkLoQxBbUjHESYdU7rfL8o61Itp07eOoqH"),
    "manifest_path": os.getenv("MANIFEST_PATH", "manifest.txt"),
    "openai_api_key": os.getenv("OPENAI_API_KEY", "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")
}

# Initialize the OpenAI client
openai_client = OpenAI(api_key=config["openai_api_key"])

# Initialize our components
loader = ConfluenceLoader(
    confluence_url=config["confluence_url"],
    username=config["username"],
    password=config["password"]
)
chunker = HeaderBasedChunker()
mongo_db = ConfluenceMongoDB(
    host="localhost",
    port=27017,
    db_name="confluence_db",
    collection_name="page_chunks"
)

# Status tracking for background jobs
background_jobs = {
    "current_job": None,
    "status": "idle",
    "progress": 0,
    "total": 0,
    "message": "",
    "started_at": None,
    "completed_at": None
}

def process_url_with_graph_rag(url: str, max_depth: int = 2):
    """Process a single URL with the graph-based RAG approach."""
    try:
        # Get all pages (including referenced pages)
        pages = loader.process_page_recursive(url, current_depth=0, max_depth=max_depth)
        processed_urls = set()
        chunk_id_map = {}  # Map URLs to chunk IDs for building relationships

        for page in pages:
            if page['id'] not in processed_urls:
                processed_urls.add(page['id'])
                
                # Chunk content by headers
                chunks = chunker.chunk_content(page["content"])
                
                if not chunks:
                    print(f"Warning: No headers found in '{page['title']}'")
                    continue
                
                # Track header paths for hierarchy
                header_stack = []
                
                # Process each chunk
                for i, chunk in enumerate(chunks):
                    chunk_id = f"{page['id']}-chunk-{i}"
                    
                    # Update header stack to maintain hierarchy
                    current_level = chunk['level']
                    
                    # Pop headers from stack if we've moved up in the hierarchy
                    while header_stack and header_stack[-1][1] >= current_level:
                        header_stack.pop()
                    
                    # Determine parent chunk ID (if any)
                    parent_chunk_id = None
                    if header_stack:
                        parent_chunk_id = header_stack[-1][0]
                    
                    # Add current header to stack
                    header_stack.append((chunk_id, current_level))
                    
                    # Build header path
                    header_path = [h[0] for h in header_stack]
                    
                    # Extract references for graph relationships
                    chunk_references = loader._extract_confluence_links(
                        chunk['content']
                    )
                    
                    # Extract outgoing links with context
                    outgoing_links = []
                    for ref in chunk_references:
                        if ref in processed_urls:
                            # If we already processed this URL, add its chunk IDs
                            target_chunks = chunk_id_map.get(ref, [])
                            for target_id in target_chunks:
                                outgoing_links.append({
                                    "target_id": target_id,
                                    "link_type": "explicit_reference",
                                    "context": "Link found in content"
                                })
                    
                    # Generate embedding
                    embedding_response = openai_client.embeddings.create(
                        model="text-embedding-ada-002",
                        input=chunk["full_context"]
                    )
                    embedding_vector = embedding_response.data[0].embedding
                    
                    # Track this chunk ID for the page URL
                    if url not in chunk_id_map:
                        chunk_id_map[url] = []
                    chunk_id_map[url].append(chunk_id)
                    
                    # Store in MongoDB with enhanced graph data
                    mongo_db.add_confluence_chunk(
                        chunk_id=chunk_id,
                        page_id=page['id'],
                        page_title=page['title'],
                        header=chunk['header'],
                        level=chunk['level'],
                        content=chunk['content'],
                        full_context=chunk['full_context'],
                        embedding=embedding_vector,
                        references=[ref for ref in chunk_references if ref in processed_urls],
                        parent_chunk_id=parent_chunk_id,
                        header_path=header_path,
                        outgoing_links=outgoing_links
                    )
        
        return {
            "success": True,
            "processed_pages": len(processed_urls),
            "total_chunks": sum(len(chunks) for chunks in chunk_id_map.values())
        }
    
    except Exception as e:
        print(f"Error processing {url}: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

def process_all_urls_background():
    """Background job to process all URLs in the manifest."""
    global background_jobs
    
    try:
        # Read URLs from manifest.txt
        with open(config["manifest_path"], 'r') as f:
            urls = [line.strip() for line in f if line.strip()]
        
        background_jobs["total"] = len(urls)
        background_jobs["progress"] = 0
        
        for i, url in enumerate(urls):
            background_jobs["message"] = f"Processing {url}"
            result = process_url_with_graph_rag(url)
            background_jobs["progress"] = i + 1
        
        background_jobs["status"] = "completed"
        background_jobs["message"] = f"Successfully processed {len(urls)} URLs"
        background_jobs["completed_at"] = datetime.datetime.now()
    
    except Exception as e:
        background_jobs["status"] = "failed"
        background_jobs["message"] = f"Error: {str(e)}"
        background_jobs["completed_at"] = datetime.datetime.now()

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get the status of any running background jobs."""
    return jsonify(background_jobs)

@app.route('/api/add_url', methods=['POST'])
def add_url():
    """Add a new Confluence URL to the manifest and process it."""
    data = request.get_json()
    
    if not data or 'url' not in data:
        return jsonify({"error": "URL is required"}), 400
    
    url = data['url'].strip()
    process_now = data.get('process_now', True)
    
    # Validate URL format
    if not url.startswith(config["confluence_url"]):
        return jsonify({"error": "Invalid Confluence URL"}), 400
    
    try:
        # Add to manifest.txt
        with open(config["manifest_path"], 'a+') as f:
            f.seek(0)
            existing_urls = set(line.strip() for line in f)
            
            if url not in existing_urls:
                f.seek(0, 2)  # Move to end of file
                f.write(f"{url}\n")
                
        # Process the URL if requested
        if process_now:
            result = process_url_with_graph_rag(url)
            return jsonify({
                "message": "URL added and processed",
                "url": url,
                "processing_result": result
            })
        else:
            return jsonify({
                "message": "URL added to manifest",
                "url": url
            })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/reload_all', methods=['POST'])
def reload_all():
    """Reload all Confluence pages with the graph-based approach."""
    global background_jobs
    
    # Check if a job is already running
    if background_jobs["status"] == "running":
        return jsonify({
            "error": "A job is already running",
            "current_job": background_jobs
        }), 409
    
    # Start background processing
    background_jobs = {
        "current_job": "reload_all",
        "status": "running",
        "progress": 0,
        "total": 0,
        "message": "Starting reload of all Confluence pages",
        "started_at": datetime.datetime.now(),
        "completed_at": None
    }
    
    thread = threading.Thread(target=process_all_urls_background)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        "message": "Started reloading all Confluence pages",
        "job": background_jobs
    })

@app.route('/api/query', methods=['POST'])
def query_graph():
    """Query the knowledge graph using the graph RAG approach."""
    data = request.get_json()
    
    if not data or 'query' not in data:
        return jsonify({"error": "Query is required"}), 400
    
    query_text = data['query']
    max_results = data.get('max_results', 5)
    depth = data.get('depth', 2)
    similarity_threshold = data.get('similarity_threshold', 0.7)
    
    try:
        # Generate embedding for the query
        embedding_response = openai_client.embeddings.create(
            model="text-embedding-ada-002",
            input=query_text
        )
        query_embedding = embedding_response.data[0].embedding
        
        # Perform graph-based retrieval
        results = mongo_db.graph_based_retrieve(
            query=query_text,
            embedding=query_embedding,
            max_results=max_results,
            depth=depth,
            similarity_threshold=similarity_threshold
        )
        
        # Format results for API response
        formatted_results = []
        for result in results:
            formatted_results.append({
                "page_title": result["page_title"],
                "header": result["header"],
                "content": result["content"],
                "similarity_score": result["similarity_score"],
                "chunk_id": result["_id"]
            })
        
        return jsonify({
            "query": query_text,
            "results": formatted_results
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Initialize database indexes if needed
    app.run(debug=True, host='0.0.0.0', port=5050) 