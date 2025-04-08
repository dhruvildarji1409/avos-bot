import os
import uuid
import numpy as np
import openai
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
import json
import asyncio
from typing import Dict, Any, List, Tuple  # Ensure Dict, Any, List, Tuple are imported
import re
import datetime


# Initialize FastAPI
app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB Connection
MONGO_HOST = "localhost"
MONGO_PORT = 27017
client = MongoClient(MONGO_HOST, MONGO_PORT)
db = client["confluence_db"]
collection = db["page_chunks"]
user_sessions = db["user_sessions"]

# OpenAI API Key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "<YOUR_OPENAI_KEY_HERE>")
openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)

# Instead, add this class directly in avosBot.py:
class EnhancedGraphRAG:
    """
    Enhanced Graph RAG implementation with multiple traversal strategies,
    hybrid ranking, and contextual understanding.
    """
    
    def __init__(
        self, 
        mongo_host: str = "localhost", 
        mongo_port: int = 27017,
        db_name: str = "confluence_db",
        collection_name: str = "page_chunks",
        openai_api_key: str = None
    ):
        """Initialize with MongoDB connection and OpenAI client."""
        # Set up MongoDB connection
        self.client = MongoClient(mongo_host, mongo_port)
        self.db = self.client[db_name]
        self.collection = self.db[collection_name]
        
        # Initialize OpenAI client
        self.openai_client = openai.OpenAI(api_key=openai_api_key or os.getenv("OPENAI_API_KEY"))
        
        # Performance tracking
        self.last_query_stats = {}
    
    def _compute_embedding(self, text: str) -> List[float]:
        """Generate embedding for the given text using OpenAI."""
        try:
            response = self.openai_client.embeddings.create(
                model="text-embedding-ada-002", 
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Error generating embedding: {e}")
            raise
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = sum(a * a for a in vec1) ** 0.5
        norm2 = sum(b * b for b in vec2) ** 0.5
        return dot_product / (norm1 * norm2) if norm1 * norm2 > 0 else 0
    
    def _score_documents(self, query_embedding: List[float], documents: List[Dict]) -> List[Tuple[Dict, float]]:
        """Score documents by similarity to query embedding."""
        scored_docs = []
        for doc in documents:
            if "embedding" not in doc or not doc["embedding"]:
                continue
            
            try:
                similarity = self._cosine_similarity(query_embedding, doc["embedding"])
                scored_docs.append((doc, similarity))
            except Exception as e:
                print(f"Error scoring document {doc.get('_id', 'unknown')}: {e}")
        
        return sorted(scored_docs, key=lambda x: x[1], reverse=True)
    
    def _extract_topics_from_query(self, query: str) -> List[str]:
        """Extract key topics from the query to guide graph traversal."""
        try:
            # Use OpenAI to extract key topics
            response = self.openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Extract the 3-5 most important technical topics or concepts from this query. Return only a comma-separated list of topics, nothing else."},
                    {"role": "user", "content": query}
                ],
                temperature=0.3,
                max_tokens=100
            )
            topics = response.choices[0].message.content.strip().split(',')
            return [topic.strip() for topic in topics if topic.strip()]
        except Exception as e:
            print(f"Error extracting topics: {e}")
            # Fallback: simple extraction
            words = query.split()
            return [w for w in words if len(w) > 4]
    
    def _get_document_by_id(self, doc_id: str) -> Dict:
        """Retrieve a document by ID from MongoDB."""
        return self.collection.find_one({"_id": doc_id})
    
    def _get_node_relevance_score(
        self, 
        node_id: str, 
        query_embedding: List[float], 
        topics: List[str],
        path: List[str] = None
    ) -> float:
        """
        Calculate a comprehensive relevance score for a node based on 
        semantic similarity, path to seed nodes, and topic match.
        """
        doc = self._get_document_by_id(node_id)
        if not doc or "embedding" not in doc:
            return 0.0
        
        # Base relevance from embedding similarity
        similarity = self._cosine_similarity(query_embedding, doc["embedding"])
        
        # Path-based boost factor
        path_boost = 1.0
        if path:
            # Nodes found through shorter paths are more relevant
            path_length = len(path)
            if path_length == 1:
                path_boost = 1.3  # Direct connection
            elif path_length == 2:
                path_boost = 1.15  # Secondary connection
            else:
                path_boost = 1.05  # More distant connection
            
            # Relationship type matters
            if "parent" in path:
                path_boost *= 1.2  # Parent nodes provide context
            if "child" in path:
                path_boost *= 1.3  # Child nodes often have details
        
        # Topic match boost
        topic_boost = 1.0
        content = doc.get("full_context", "") or doc.get("content", "")
        header = doc.get("header", "")
        
        # Check if topics appear in header or content
        topic_matches = sum(1 for topic in topics if topic.lower() in (header + " " + content).lower())
        if topic_matches > 0:
            topic_boost += (topic_matches * 0.1)  # 10% boost per topic match
        
        # Header level boost (higher-level headers often more important)
        level_boost = 1.0
        level = doc.get("level", 0)
        if level == 1:
            level_boost = 1.3  # h1 headers
        elif level == 2:
            level_boost = 1.2  # h2 headers
        
        # Combine all factors
        return similarity * path_boost * topic_boost * level_boost
    
    def _traverse_graph(
        self, 
        seed_nodes: List[str], 
        query_embedding: List[float],
        topics: List[str],
        max_nodes: int = 30,
        max_depth: int = 3
    ) -> Dict[str, Any]:
        """
        Advanced graph traversal using multiple strategies:
        1. Hierarchical (parents/children)
        2. Sibling-based
        3. Topic-guided jumps
        4. Cross-document semantic jumps
        """
        visited = set(seed_nodes)
        discovery_paths = {node: ["seed"] for node in seed_nodes}
        nodes_to_explore = [(node, 0) for node in seed_nodes]  # (node_id, depth)
        
        # Track relationships discovered
        relationship_counts = {
            "parent": 0,
            "child": 0,
            "sibling": 0,
            "semantic": 0,
            "topic": 0
        }
        
        # Get all documents ahead of time to avoid repeated DB calls
        all_docs = list(self.collection.find({}, {
            "_id": 1, 
            "parent_chunk_id": 1, 
            "children": 1,
            "header": 1,
            "page_id": 1,
            "level": 1,
            "embedding": 1
        }))
        
        # Index documents by ID for quick lookup
        doc_map = {doc["_id"]: doc for doc in all_docs}
        
        # Also create a mapping of parent to children
        parent_to_children = {}
        for doc in all_docs:
            parent_id = doc.get("parent_chunk_id")
            if parent_id:
                if parent_id not in parent_to_children:
                    parent_to_children[parent_id] = []
                parent_to_children[parent_id].append(doc["_id"])
        
        # Create page to chunks mapping
        page_to_chunks = {}
        for doc in all_docs:
            page_id = doc.get("page_id")
            if page_id:
                if page_id not in page_to_chunks:
                    page_to_chunks[page_id] = []
                page_to_chunks[page_id].append(doc["_id"])
        
        # Process nodes in breadth-first order
        while nodes_to_explore and len(visited) < max_nodes:
            current_node, depth = nodes_to_explore.pop(0)
            
            if depth >= max_depth:
                continue
            
            # Skip if node not in doc_map
            if current_node not in doc_map:
                continue
                
            doc = doc_map[current_node]
            
            # Strategy 1: Parent traversal
            parent_id = doc.get("parent_chunk_id")
            if parent_id and parent_id not in visited:
                visited.add(parent_id)
                nodes_to_explore.append((parent_id, depth + 1))
                discovery_paths[parent_id] = discovery_paths.get(current_node, []) + ["parent"]
                relationship_counts["parent"] += 1
            
            # Strategy 2: Children traversal
            children = parent_to_children.get(current_node, [])
            for child_id in children:
                if child_id not in visited:
                    visited.add(child_id)
                    nodes_to_explore.append((child_id, depth + 1))
                    discovery_paths[child_id] = discovery_paths.get(current_node, []) + ["child"]
                    relationship_counts["child"] += 1
            
            # Strategy 3: Sibling traversal (same parent)
            if parent_id:
                siblings = parent_to_children.get(parent_id, [])
                for sibling_id in siblings:
                    if sibling_id != current_node and sibling_id not in visited:
                        visited.add(sibling_id)
                        nodes_to_explore.append((sibling_id, depth + 1))
                        discovery_paths[sibling_id] = discovery_paths.get(current_node, []) + ["sibling"]
                        relationship_counts["sibling"] += 1
            
            # Strategy 4: Same page, same level
            page_id = doc.get("page_id")
            level = doc.get("level", 0)
            
            if page_id and level > 0:
                same_page_chunks = page_to_chunks.get(page_id, [])
                for chunk_id in same_page_chunks:
                    if chunk_id != current_node and chunk_id not in visited:
                        chunk_doc = doc_map.get(chunk_id)
                        if chunk_doc and chunk_doc.get("level") == level:
                            visited.add(chunk_id)
                            nodes_to_explore.append((chunk_id, depth + 1))
                            discovery_paths[chunk_id] = discovery_paths.get(current_node, []) + ["same_level"]
                            relationship_counts["semantic"] += 1
            
            # Strategy 5: Topic-guided jumps (using pre-computed embeddings)
            # Only do this occasionally to avoid too much expansion
            if len(visited) % 3 == 0 and depth < 2:
                # Find semantically similar nodes across corpus
                doc_embedding = doc.get("embedding")
                if doc_embedding:
                    semantic_neighbors = []
                    
                    for other_doc in all_docs:
                        other_id = other_doc["_id"]
                        if other_id not in visited and "embedding" in other_doc:
                            similarity = self._cosine_similarity(doc_embedding, other_doc["embedding"])
                            if similarity > 0.85:  # High similarity threshold
                                semantic_neighbors.append((other_id, similarity))
                    
                    # Take top 2 semantic neighbors
                    semantic_neighbors.sort(key=lambda x: x[1], reverse=True)
                    for neighbor_id, _ in semantic_neighbors[:2]:
                        visited.add(neighbor_id)
                        nodes_to_explore.append((neighbor_id, depth + 1))
                        discovery_paths[neighbor_id] = discovery_paths.get(current_node, []) + ["semantic"]
                        relationship_counts["topic"] += 1
        
        # Return discovered nodes with paths
        return {
            "visited_nodes": list(visited),
            "discovery_paths": discovery_paths,
            "relationship_counts": relationship_counts
        }
    
    def search(
        self, 
        query: str, 
        n_seed_results: int = 5, 
        n_total_results: int = 15,
        max_traversal_depth: int = 3
    ) -> Dict[str, Any]:
        """
        Enhanced graph-based search with hybrid ranking and traversal strategies.
        
        Args:
            query: The user query
            n_seed_results: Number of initial seed nodes from vector similarity
            n_total_results: Maximum total results to return
            max_traversal_depth: Maximum traversal depth in the graph
            
        Returns:
            Dict containing documents, scores, and graph statistics
        """
        start_time = datetime.datetime.now()
        
        try:
            # Get embedding for the query
            query_embedding = self._compute_embedding(query)
            
            # Extract key topics from query
            topics = self._extract_topics_from_query(query)
            print(f"Extracted topics: {topics}")
            
            # Get all documents
            all_docs = list(self.collection.find({"embedding": {"$exists": True}}))
            if not all_docs:
                return {
                    "documents": ["No information found in the database."],
                    "scores": [0.0],
                    "graph_stats": {"error": "No documents with embeddings found"}
                }
            
            # Score documents by similarity
            scored_docs = self._score_documents(query_embedding, all_docs)
            
            # Get seed nodes (top results by vector similarity)
            seed_docs = scored_docs[:n_seed_results]
            seed_node_ids = [doc["_id"] for doc, _ in seed_docs]
            
            print(f"Initial seed nodes: {len(seed_node_ids)}")
            
            # Traverse graph from seed nodes
            traversal_result = self._traverse_graph(
                seed_nodes=seed_node_ids,
                query_embedding=query_embedding,
                topics=topics,
                max_nodes=n_total_results * 3,  # Get more for re-ranking
                max_depth=max_traversal_depth
            )
            
            # Get all visited nodes
            all_visited_node_ids = traversal_result["visited_nodes"]
            discovery_paths = traversal_result["discovery_paths"]
            
            print(f"Graph traversal found {len(all_visited_node_ids) - len(seed_node_ids)} additional nodes")
            
            # Score all nodes with comprehensive relevance
            final_scores = []
            for node_id in all_visited_node_ids:
                relevance = self._get_node_relevance_score(
                    node_id=node_id,
                    query_embedding=query_embedding,
                    topics=topics,
                    path=discovery_paths.get(node_id)
                )
                final_scores.append((node_id, relevance))
            
            # Sort by relevance and take top results
            final_scores.sort(key=lambda x: x[1], reverse=True)
            top_node_ids = [node_id for node_id, _ in final_scores[:n_total_results]]
            
            # Retrieve full documents for top nodes
            final_docs = []
            scores = []
            
            for node_id, score in final_scores[:n_total_results]:
                doc = self._get_document_by_id(node_id)
                if doc:
                    final_docs.append(doc.get("full_context", "No context available"))
                    scores.append(score)
            
            # Capture performance statistics
            end_time = datetime.datetime.now()
            execution_time = (end_time - start_time).total_seconds()
            
            self.last_query_stats = {
                "execution_time_seconds": execution_time,
                "seed_nodes": len(seed_node_ids),
                "graph_traversed_nodes": len(all_visited_node_ids) - len(seed_node_ids),
                "total_nodes": len(all_visited_node_ids),
                "relationship_counts": traversal_result["relationship_counts"],
                "topics": topics,
                "discovery_paths": {k: v for k, v in discovery_paths.items() if k in top_node_ids}
            }
            
            return {
                "documents": final_docs,
                "scores": scores,
                "graph_stats": self.last_query_stats
            }
            
        except Exception as e:
            error_trace = traceback.format_exc()
            print(f"Error in enhanced graph search: {str(e)}\n{error_trace}")
            return {
                "documents": [f"Error searching for information: {str(e)}"],
                "scores": [0.0],
                "graph_stats": {"error": str(e)}
            }

# Initialize the enhanced graph RAG (add this after MongoDB initialization and OpenAI initialization)
enhanced_rag = EnhancedGraphRAG(
    mongo_host=MONGO_HOST,
    mongo_port=MONGO_PORT,
    db_name="confluence_db",
    collection_name="page_chunks",
    openai_api_key=OPENAI_API_KEY
)

# 📌 Function to Retrieve or Create User Session
def get_user_session(user_id: str) -> str:
    user_session = user_sessions.find_one({"user_id": user_id})
    if user_session:
        return user_session["session_id"]
    
    session_id = str(uuid.uuid4())
    user_sessions.insert_one({"user_id": user_id, "session_id": session_id, "history": []})
    return session_id


# 📌 Function to Store Messages in MongoDB
def store_message(user_id: str, role: str, content: str):
    user_sessions.update_one({"user_id": user_id}, {"$push": {"history": {"role": role, "content": content}}})




# 📌 1️⃣ Compute Query Embedding
def _compute_query_embedding(query: str) -> List[float]:
    """
    Call OpenAI to compute embedding for the user's query.
    """
    response = openai_client.embeddings.create(model="text-embedding-ada-002", input=query)
    return response.data[0].embedding


# Ensure search function is defined ABOVE stream_response()
def search(query: str, n_direct_results: int = 3, n_total_results: int = 7) -> Dict[str, Any]:
    """
    Perform a graph-enhanced semantic vector search in MongoDB.
    
    Args:
        query: The user's query string
        n_direct_results: Number of initial seed documents from vector search
        n_total_results: Maximum total documents to return after graph traversal
    """
    try:
        # Get query embedding
        query_embedding = np.array(_compute_query_embedding(query))
        
        # PHASE 1: Find initial seed documents via vector similarity
        cursor = collection.find({"embedding": {"$exists": True}}, 
                                 {"content": 1, "full_context": 1, "embedding": 1, 
                                  "page_id": 1, "header": 1, "parent_chunk_id": 1, 
                                  "children": 1, "_id": 1})
        docs = list(cursor)
        
        if not docs:
            print("Warning: No documents found in database")
            return {
                "documents": ["No information found in the database. Please try another query."],
                "scores": [0.0],
                "graph_stats": {"seed_nodes": 0, "graph_traversed_nodes": 0}
            }
        
        # Score documents by similarity
        scored_docs = []
        for d in docs:
            if "embedding" not in d or not d["embedding"]:
                continue
                
            try:
                doc_embedding = np.array(d["embedding"], dtype=float)
                score = np.dot(query_embedding, doc_embedding) / (
                    np.linalg.norm(query_embedding) * np.linalg.norm(doc_embedding))
                scored_docs.append((d, score))
            except Exception as e:
                print(f"Error computing similarity: {e}")
                continue
        
        scored_docs.sort(key=lambda x: x[1], reverse=True)
        
        # Get top N as seed nodes
        seed_docs = scored_docs[:n_direct_results]
        seed_node_ids = [d["_id"] for d, _ in seed_docs]
        found_nodes = set(seed_node_ids)
        
        print(f"Found {len(seed_docs)} seed documents via vector similarity")
        
        # PHASE 2: Graph traversal
        # Nodes to explore in the next iteration
        next_nodes = list(seed_node_ids)
        graph_docs = []
        
        # Track the discovery path for debugging
        discovery_paths = {}
        for node_id in seed_node_ids:
            discovery_paths[node_id] = ["seed"]
        
        # Perform breadth-first traversal (2 hops)
        for hop in range(2):
            current_nodes = next_nodes
            next_nodes = []
            
            for node_id in current_nodes:
                # Skip if already processed extensively
                if node_id in found_nodes and hop > 0:
                    continue
                    
                found_nodes.add(node_id)
                
                # Get the document
                doc = next((d for d, _ in scored_docs if d["_id"] == node_id), None)
                if not doc:
                    continue
                
                # RELATIONSHIP TYPE 1: Parent-child relationships
                
                # Find parent
                parent_id = doc.get("parent_chunk_id")
                if parent_id and parent_id not in found_nodes:
                    next_nodes.append(parent_id)
                    discovery_paths[parent_id] = discovery_paths.get(node_id, []) + ["parent"]
                
                # Find children
                children = doc.get("children", [])
                for child_id in children:
                    if child_id not in found_nodes:
                        next_nodes.append(child_id)
                        discovery_paths[child_id] = discovery_paths.get(node_id, []) + ["child"]
                
                # RELATIONSHIP TYPE 2: Sibling relationships
                if parent_id:
                    # Find siblings (other chunks with same parent)
                    siblings = [d["_id"] for d, _ in scored_docs 
                               if d.get("parent_chunk_id") == parent_id 
                               and d["_id"] != node_id]
                    
                    for sibling_id in siblings:
                        if sibling_id not in found_nodes:
                            next_nodes.append(sibling_id)
                            discovery_paths[sibling_id] = discovery_paths.get(node_id, []) + ["sibling"]
                
                # RELATIONSHIP TYPE 3: Same header level in same document
                page_id = doc.get("page_id")
                header_level = len(doc.get("header", "").split(".")[0]) 
                
                if page_id:
                    # Find chunks in same document with same header level
                    same_level_chunks = [d["_id"] for d, _ in scored_docs 
                                        if d.get("page_id") == page_id 
                                        and len(d.get("header", "").split(".")[0]) == header_level
                                        and d["_id"] != node_id]
                    
                    for chunk_id in same_level_chunks:
                        if chunk_id not in found_nodes:
                            next_nodes.append(chunk_id)
                            discovery_paths[chunk_id] = discovery_paths.get(node_id, []) + ["same_level"]
        
        print(f"Graph traversal found {len(found_nodes) - len(seed_node_ids)} additional nodes")
        
        # PHASE 3: Score and rank all discovered documents
        all_docs = []
        
        # First add seed docs with their original scores
        for doc, score in seed_docs:
            all_docs.append((doc, score, "seed"))
        
        # Then add graph-discovered docs and compute their scores
        for node_id in found_nodes:
            if node_id in seed_node_ids:
                continue  # Skip seed nodes already added
                
            doc = next((d for d, _ in scored_docs if d["_id"] == node_id), None)
            if not doc:
                continue
                
            # Calculate similarity score for this document
            if "embedding" in doc and doc["embedding"]:
                doc_embedding = np.array(doc["embedding"], dtype=float)
                score = np.dot(query_embedding, doc_embedding) / (
                    np.linalg.norm(query_embedding) * np.linalg.norm(doc_embedding))
                
                # Apply a boost factor based on discovery path
                # Parents and children get a bigger boost than siblings
                path = discovery_paths.get(node_id, [])
                boost = 1.0
                
                if "child" in path:
                    boost = 1.3  # Boost children (direct subtopics)
                elif "parent" in path:
                    boost = 1.2  # Boost parents (context)
                elif "sibling" in path:
                    boost = 1.1  # Boost siblings (related topics)
                
                adjusted_score = score * boost
                all_docs.append((doc, adjusted_score, "graph"))
        
        # Sort by adjusted score
        all_docs.sort(key=lambda x: x[1], reverse=True)
        
        # Take top N results
        top_results = all_docs[:n_total_results]
        
        # Format results
        return {
            "documents": [doc.get("full_context", "No context available") for doc, _, _ in top_results],
            "scores": [score for _, score, _ in top_results],
            "graph_stats": {
                "seed_nodes": len(seed_docs),
                "graph_traversed_nodes": len(found_nodes) - len(seed_node_ids),
                "total_nodes": len(found_nodes),
                "discovery_paths": discovery_paths
            }
        }
        
    except Exception as e:
        import traceback
        print(f"Graph search error: {str(e)}")
        print(traceback.format_exc())
        return {
            "documents": [f"Error searching for information: {str(e)}"],
            "scores": [0.0],
            "graph_stats": {"error": str(e)}
        }

# Update the stream_response function signature and implementation:
async def stream_response(
    user_id: str, 
    query: str, 
    n_direct_results: int = 3,
    n_total_results: int = 7
):
    """
    Streams chatbot response with graph-based retrieval.
    
    Args:
        user_id: The user's ID for session tracking
        query: The user's question
        n_direct_results: Number of initial seed documents from vector search
        n_total_results: Maximum total documents after graph traversal
    """
    try:
        yield json.dumps({"status": "info", "message": "Thinking... Fetching relevant data."}) + "\n"
        await asyncio.sleep(0.5)

        # Retrieve user session
        session_id = get_user_session(user_id)
        user_data = user_sessions.find_one({"user_id": user_id})
        chat_history = user_data.get("history", []) if user_data else []

        yield json.dumps({"status": "info", "message": "Performing graph-based search..."}) + "\n"
        
        # Use graph-based search with explicit parameters
        search_results = search(
            query, 
            n_direct_results=n_direct_results,  
            n_total_results=n_total_results
        )
        
        relevant_passages = search_results["documents"]
        graph_stats = search_results.get("graph_stats", {})
        
        # Extract Confluence links if available
        confluence_links = [doc.get("confluence_link", "") for doc in search_results.get("documents", []) if "confluence_link" in doc]
        confluence_link_text = "\n\n📌 **Reference:** " + "\n".join(confluence_links) if confluence_links else ""

        seed_count = graph_stats.get("seed_nodes", 0)
        graph_count = graph_stats.get("graph_traversed_nodes", 0)
        
        yield json.dumps({
            "status": "info", 
            "message": f"Found {len(relevant_passages)} relevant documents ({seed_count} via similarity, {graph_count} via graph connections)"
        }) + "\n"
        
        await asyncio.sleep(0.5)

        # Prepare OpenAI API call with comprehensive context
        context = "\n\n".join([f"Passage {i+1}:\n{p}" for i, p in enumerate(relevant_passages)])

        messages = [
            {
                "role": "system",
                "content": (
                    "You are an AI assistant helping answer questions from Confluence documentation. "
                    "Provide **concise, clear answers**. If the answer contains **code**, format it in markdown. "
                    "Include the **source link at the end** for reference."
                ),
            }
        ]
        messages.extend(chat_history)
        messages.append({"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"})

        try:
            yield json.dumps({"status": "info", "message": "Generating response..."}) + "\n"
            response = openai_client.chat.completions.create(
                model="gpt-4-turbo",
                messages=messages,
                temperature=0.7,
            )
        except Exception as e:
            yield json.dumps({"status": "error", "message": f"OpenAI API error: {str(e)}"}) + "\n"
            yield json.dumps({"status": "success", "answer": "I encountered an error while generating a response. Please try again later."}) + "\n"
            return

        # Process response
        answer = response.choices[0].message.content.strip()

        # Append Confluence Link
        final_answer = f"{answer}{confluence_link_text}"

        try:
            store_message(user_id, "user", query)
            store_message(user_id, "assistant", final_answer)
        except Exception as e:
            yield json.dumps({"status": "warn", "message": f"Warning: Could not store message history: {str(e)}"}) + "\n"

        # **🚀 Improved Code Block Handling**
        code_block_pattern = re.compile(r"```(.*?)```", re.DOTALL)
        parts = code_block_pattern.split(final_answer)

        is_code = False
        for part in parts:
            if is_code:
                # **Send code blocks separately**
                yield json.dumps({"status": "code", "chunk": f"```{part}```"}) + "\n"
            else:
                # **Send normal text word by word**
                words = part.split()
                for i, word in enumerate(words):
                    yield json.dumps({"status": "stream", "chunk": word}) + "\n"
                    # Only sleep every few words to reduce overall time
                    if i % 5 == 0:
                        await asyncio.sleep(0.02)
            is_code = not is_code  # Toggle code mode

        # Ensure we send a final success message
        yield json.dumps({"status": "success", "answer": final_answer}) + "\n"
        
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        error_msg = f"Streaming error: {str(e)}\n{tb}"
        yield json.dumps({"status": "error", "message": error_msg}) + "\n"
        yield json.dumps({"status": "success", "answer": "I encountered an unexpected error. Please try again later."}) + "\n"



# Then update the chat endpoint:
@app.post("/chat")
async def chat(request: Request):
    """
    API Endpoint to handle user chat with streaming responses.
    Uses graph-based RAG for better context retrieval.
    """
    try:
        data = await request.json()
        user_id = data.get("user_id")
        query = data.get("query")
        
        # Get optional parameters with defaults
        n_seed_results = data.get("n_seed_results", 3)
        n_total_results = data.get("n_total_results", 7)
        traversal_depth = data.get("traversal_depth", 2)  # Not used yet but good to have

        if not user_id or not query:
            return {"error": "Missing user_id or query"}

        print(f"Chat request received - user_id: {user_id}, query: {query}")
        print(f"Using graph RAG with {n_seed_results} seed docs, {n_total_results} total docs")
        
        # Verify MongoDB connection
        try:
            client.admin.command('ping')
            print("MongoDB connection verified")
        except Exception as e:
            print(f"MongoDB connection error: {str(e)}")
            return {"error": f"Database connection error: {str(e)}"}
        
        # Return streaming response with graph parameters
        return StreamingResponse(
            stream_response(
                user_id=user_id, 
                query=query,
                n_direct_results=n_seed_results,
                n_total_results=n_total_results
            ), 
            media_type="application/json"
        )

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"Error in /chat: {str(e)}\n{tb}")
        return {"error": str(e), "traceback": tb}

@app.post("/chat_simple")
async def chat_simple(request: Request):
    """
    Non-streaming version with graph-based retrieval
    """
    try:
        data = await request.json()
        user_id = data.get("user_id")
        query = data.get("query")
        
        # Get optional parameters
        n_seed_results = data.get("n_seed_results", 3)
        n_total_results = data.get("n_total_results", 7)

        if not user_id or not query:
            return {"error": "Missing user_id or query"}

        # Log the received request
        print(f"Request received - user_id: {user_id}, query: {query}")
        print(f"Using graph RAG with {n_seed_results} seed docs, {n_total_results} total docs")
        
        # Get or create user session
        session_id = get_user_session(user_id)
        
        # Perform graph-based search with explicit parameters
        print("Performing graph-based search...")
        search_results = search(
            query, 
            n_direct_results=n_seed_results,
            n_total_results=n_total_results
        )
        
        relevant_passages = search_results.get("documents", [])
        graph_stats = search_results.get("graph_stats", {})
        
        print(f"Found {len(relevant_passages)} relevant passages")
        print(f"Graph stats: Seeds: {graph_stats.get('seed_nodes', 0)}, " +
              f"Graph nodes: {graph_stats.get('graph_traversed_nodes', 0)}")
        
        # Format context
        context = "\n\n".join([f"Passage {i+1}:\n{p[:300]}..." for i, p in enumerate(relevant_passages)])
        
        # Call OpenAI
        try:
            messages = [
                {"role": "system", "content": "You are an AI assistant helping with Confluence docs."},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"}
            ]
            
            print("Calling OpenAI API...")
            response = openai_client.chat.completions.create(
                model="gpt-4-turbo",
                messages=messages,
                temperature=0.7,
            )
            
            answer = response.choices[0].message.content
            
            # Store in history
            store_message(user_id, "user", query)
            store_message(user_id, "assistant", answer)
            
            return {
                "status": "success",
                "answer": answer,
                "passages_count": len(relevant_passages),
                "graph_stats": graph_stats
            }
            
        except Exception as e:
            print(f"OpenAI API error: {str(e)}")
            return {"status": "error", "message": f"OpenAI API error: {str(e)}"}
        
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"Error in /chat_simple: {str(e)}\n{tb}")
        return {"status": "error", "message": str(e), "traceback": tb}


@app.get("/status")
async def status():
    """Check if the server is running and connections are working"""
    try:
        # Check MongoDB
        mongo_status = "OK"
        try:
            client.admin.command('ping')
            doc_count = collection.count_documents({})
            mongo_status = f"Connected, {doc_count} documents found"
        except Exception as e:
            mongo_status = f"Error: {str(e)}"
            
        # Check OpenAI
        openai_status = "OK"
        try:
            # Simple model list request to verify API key works
            models = openai_client.models.list()
            model_count = len(models.data)
            openai_status = f"Connected, {model_count} models available"
        except Exception as e:
            openai_status = f"Error: {str(e)}"
            
        return {
            "status": "running",
            "mongo": mongo_status,
            "openai": openai_status,
            "timestamp": str(datetime.datetime.now())
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/graph_stats")
async def graph_stats():
    """Get statistics about the document graph structure in the database"""
    try:
        # Count total documents
        total_docs = collection.count_documents({})
        
        # Count documents with parent-child relationships
        with_parent = collection.count_documents({"parent_chunk_id": {"$exists": True, "$ne": None}})
        with_children = collection.count_documents({"children": {"$exists": True, "$ne": []}})
        
        # Count documents with different header levels
        levels = {}
        for level in range(1, 7):  # h1 to h6
            count = collection.count_documents({"level": level})
            if count > 0:
                levels[f"h{level}"] = count
                
        # Sample some relationships
        sample_parent_child = []
        parent_child_cursor = collection.find(
            {"parent_chunk_id": {"$exists": True, "$ne": None}},
            {"_id": 1, "header": 1, "parent_chunk_id": 1}
        ).limit(3)
        
        for doc in parent_child_cursor:
            parent = collection.find_one({"_id": doc["parent_chunk_id"]})
            if parent:
                sample_parent_child.append({
                    "child_id": doc["_id"],
                    "child_header": doc.get("header", "Unknown"),
                    "parent_id": doc["parent_chunk_id"],
                    "parent_header": parent.get("header", "Unknown")
                })
                
        # Check if we have a proper graph structure
        has_graph = with_parent > 0 or with_children > 0
        
        return {
            "total_documents": total_docs,
            "documents_with_parent": with_parent,
            "documents_with_children": with_children,
            "header_level_distribution": levels,
            "sample_relationships": sample_parent_child,
            "has_graph_structure": has_graph,
            "graph_density": round((with_parent + with_children) / total_docs, 3) if total_docs > 0 else 0
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


# Add a new search function that uses the enhanced implementation
def enhanced_search(
    query: str, 
    n_seed_results: int = 5, 
    n_total_results: int = 15
) -> Dict[str, Any]:
    """
    Use the enhanced graph RAG implementation for better results.
    """
    return enhanced_rag.search(
        query=query,
        n_seed_results=n_seed_results,
        n_total_results=n_total_results,
        max_traversal_depth=3
    )

# Create a new endpoint to use the enhanced approach
@app.post("/chat_enhanced")
async def chat_enhanced(request: Request):
    """
    Non-streaming version with enhanced graph-based retrieval
    """
    try:
        data = await request.json()
        user_id = data.get("user_id")
        query = data.get("query")
        
        # Get optional parameters
        n_seed_results = data.get("n_seed_results", 5)
        n_total_results = data.get("n_total_results", 15)

        if not user_id or not query:
            return {"error": "Missing user_id or query"}

        # Log the received request
        print(f"Enhanced request received - user_id: {user_id}, query: {query}")
        print(f"Using enhanced graph RAG with {n_seed_results} seed docs, {n_total_results} total docs")
        
        # Get or create user session
        session_id = get_user_session(user_id)
        
        # Perform enhanced graph-based search
        print("Performing enhanced graph-based search...")
        search_results = enhanced_search(
            query, 
            n_seed_results=n_seed_results,
            n_total_results=n_total_results
        )
        
        relevant_passages = search_results.get("documents", [])
        graph_stats = search_results.get("graph_stats", {})
        
        print(f"Found {len(relevant_passages)} relevant passages")
        print(f"Graph stats: Seeds: {graph_stats.get('seed_nodes', 0)}, " +
              f"Graph nodes: {graph_stats.get('graph_traversed_nodes', 0)}")
        
        # Format context
        context = "\n\n".join([f"Passage {i+1}:\n{p[:300]}..." for i, p in enumerate(relevant_passages)])
        
        # Call OpenAI
        try:
            messages = [
                {"role": "system", "content": "You are an AI assistant helping with Confluence docs."},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"}
            ]
            
            print("Calling OpenAI API...")
            response = openai_client.chat.completions.create(
                model="gpt-4-turbo",
                messages=messages,
                temperature=0.7,
            )
            
            answer = response.choices[0].message.content
            
            # Store in history
            store_message(user_id, "user", query)
            store_message(user_id, "assistant", answer)
            
            return {
                "status": "success",
                "answer": answer,
                "passages_count": len(relevant_passages),
                "graph_stats": graph_stats
            }
            
        except Exception as e:
            print(f"OpenAI API error: {str(e)}")
            return {"status": "error", "message": f"OpenAI API error: {str(e)}"}
        
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"Error in /chat_enhanced: {str(e)}\n{tb}")
        return {"status": "error", "message": str(e), "traceback": tb}

# Also update the VS Code endpoint
@app.post("/vscode_chat")
async def vscode_chat(request: Request):
    """
    API Endpoint for VS Code extension using enhanced graph RAG
    """
    try:
        data = await request.json()
        user_id = data.get("user_id", "vscode_user")
        query = data.get("query")
        
        # Get optional parameters
        n_seed_results = data.get("n_seed_results", 5)
        n_total_results = data.get("n_total_results", 15)
        use_enhanced = data.get("use_enhanced", True)  # Default to enhanced

        if not query:
            return {"error": "Missing query"}

        # Log the received request
        print(f"VS Code request received - user_id: {user_id}, query: {query}")
        
        # Get or create user session
        session_id = get_user_session(user_id)
        
        # Use the appropriate search method
        if use_enhanced:
            print("Using enhanced graph RAG search...")
            search_results = enhanced_search(
                query, 
                n_seed_results=n_seed_results,
                n_total_results=n_total_results
            )
        else:
            print("Using standard graph RAG search...")
            search_results = search(
                query, 
                n_direct_results=n_seed_results,
                n_total_results=n_total_results
            )
        
        relevant_passages = search_results.get("documents", [])
        graph_stats = search_results.get("graph_stats", {})
        
        # Format context
        context = "\n\n".join([f"Passage {i+1}:\n{p[:300]}..." for i, p in enumerate(relevant_passages)])
        
        # Call OpenAI
        try:
            messages = [
                {"role": "system", "content": "You are an AI assistant helping with Confluence docs."},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"}
            ]
            
            response = openai_client.chat.completions.create(
                model="gpt-4-turbo",
                messages=messages,
                temperature=0.7,
            )
            
            answer = response.choices[0].message.content
            
            # Store in history
            store_message(user_id, "user", query)
            store_message(user_id, "assistant", answer)
            
            return {
                "answer": answer,
                "passages_count": len(relevant_passages),
                "graph_stats": {
                    "seed_nodes": graph_stats.get("seed_nodes", 0),
                    "graph_nodes": graph_stats.get("graph_traversed_nodes", 0),
                    "method": "enhanced" if use_enhanced else "standard"
                }
            }
            
        except Exception as e:
            print(f"OpenAI API error: {str(e)}")
            return {"error": f"OpenAI API error: {str(e)}"}
        
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"Error in /vscode_chat: {str(e)}\n{tb}")
        return {"error": str(e)}


# 📌 Start FastAPI Server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000, reload=True)
