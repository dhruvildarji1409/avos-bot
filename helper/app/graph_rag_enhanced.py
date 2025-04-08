"""
Enhanced Graph-based RAG Implementation for Confluence Knowledge Base
--------------------------------
This module provides improved graph traversal and retrieval algorithms
for more accurate and comprehensive answers from Confluence content.
"""

import os
import numpy as np
from typing import List, Dict, Any, Tuple, Set
import datetime
import traceback
from pymongo import MongoClient
from openai import OpenAI

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
        self.openai_client = OpenAI(api_key=openai_api_key or os.getenv("OPENAI_API_KEY"))
        
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