#!/usr/bin/env python3
from pymongo import MongoClient
from bs4 import BeautifulSoup
import sys
import os
from tqdm import tqdm
import datetime

# MongoDB connection settings
MONGODB_URI = "mongodb://localhost:27017"
DB_NAME = "confluence_db"
COLLECTION_NAME = "page_chunks"

def rebuild_graph_structure():
    """Rebuild the graph structure for existing Confluence data."""
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    
    # Step 1: Group chunks by page_id
    page_ids = collection.distinct("page_id")
    print(f"Found {len(page_ids)} unique pages in the database")
    
    # Step 2: For each page, rebuild the hierarchical structure
    processed_pages = 0
    total_pages = len(page_ids)
    
    for page_id in tqdm(page_ids, desc="Rebuilding page structures"):
        # Get all chunks for this page
        chunks = list(collection.find({"page_id": page_id}))
        
        if not chunks:
            continue
            
        # Sort chunks by their existing _id to maintain original order
        chunks.sort(key=lambda x: x["_id"])
        
        page_title = chunks[0]["page_title"]
        
        # Step 3: Build header hierarchy
        current_headers = [None] * 6  # h1 to h6
        
        for i, chunk in enumerate(chunks):
            chunk_id = chunk["_id"]
            level = chunk.get("level", 0)
            
            if level == 0:  # Skip chunks without level
                continue
                
            header_level = level - 1  # 0-based index (h1 -> 0)
            
            # Update header stack at this level and clear all lower levels
            current_headers[header_level] = {
                'text': chunk["header"],
                'chunk_id': chunk_id
            }
            
            for j in range(header_level + 1, 6):
                current_headers[j] = None
            
            # Determine parent chunk
            parent_chunk_id = None
            parent_header_text = None
            for j in range(header_level - 1, -1, -1):
                if current_headers[j] is not None:
                    parent_chunk_id = current_headers[j]['chunk_id']
                    parent_header_text = current_headers[j]['text']
                    break
            
            # Build header path
            header_path = []
            for j in range(header_level):
                if current_headers[j] is not None:
                    header_path.append({
                        'level': j + 1,
                        'text': current_headers[j]['text'],
                        'chunk_id': current_headers[j]['chunk_id']
                    })
            
            # Update the chunk with parent reference
            collection.update_one(
                {"_id": chunk_id},
                {"$set": {
                    "parent_chunk_id": parent_chunk_id,
                    "parent_header": parent_header_text,
                    "header_path": header_path,
                    "depth": header_level,
                    "graph_updated": datetime.datetime.now()
                }}
            )
        
        # Step 4: Update children arrays
        for chunk in chunks:
            if "parent_chunk_id" in chunk and chunk["parent_chunk_id"]:
                collection.update_one(
                    {"_id": chunk["parent_chunk_id"]},
                    {"$addToSet": {"children": chunk["_id"]}}
                )
        
        processed_pages += 1
        
    print(f"\nRebuilt graph structure for {processed_pages} pages")
    
    # Step 5: Validate the graph structure
    parent_child_count = 0
    for page_id in page_ids:
        chunks = list(collection.find({"page_id": page_id}))
        for chunk in chunks:
            if "parent_chunk_id" in chunk and chunk["parent_chunk_id"]:
                parent_child_count += 1
    
    print(f"Created {parent_child_count} parent-child relationships")
    
    return processed_pages, parent_child_count

if __name__ == "__main__":
    rebuild_graph_structure() 