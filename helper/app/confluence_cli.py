#!/usr/bin/env python3
import argparse
import requests
import json
import time
import sys
import matplotlib.pyplot as plt
import networkx as nx

BASE_URL = "http://localhost:5050/api"

def add_url(url, process_now=True):
    """Add a new Confluence URL to the knowledge base."""
    response = requests.post(
        f"{BASE_URL}/add_url",
        json={"url": url, "process_now": process_now}
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ {result['message']}")
        if process_now and "processing_result" in result:
            pr = result["processing_result"]
            if pr["success"]:
                print(f"   Processed {pr['processed_pages']} pages with {pr['total_chunks']} chunks")
            else:
                print(f"   Error during processing: {pr['error']}")
    else:
        print(f"❌ Error: {response.json().get('error', 'Unknown error')}")

def reload_all():
    """Reload all Confluence pages with graph-based approach."""
    response = requests.post(f"{BASE_URL}/reload_all")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ {result['message']}")
        print("   Monitoring progress...")
        
        # Monitor progress until complete
        while True:
            status_response = requests.get(f"{BASE_URL}/status")
            status = status_response.json()
            
            if status["status"] == "running":
                progress = status["progress"]
                total = status["total"]
                if total > 0:
                    percentage = int((progress / total) * 100)
                    print(f"\r   Progress: [{percentage}%] {progress}/{total} - {status['message']}", end="")
                else:
                    print(f"\r   {status['message']}", end="")
                    
                time.sleep(2)
            else:
                if status["status"] == "completed":
                    print(f"\n✅ Job completed: {status['message']}")
                else:
                    print(f"\n❌ Job failed: {status['message']}")
                break
    else:
        print(f"❌ Error: {response.json().get('error', 'Unknown error')}")

def query(query_text, max_results=5):
    """Query the knowledge graph."""
    response = requests.post(
        f"{BASE_URL}/query",
        json={"query": query_text, "max_results": max_results}
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"Query: {result['query']}")
        print(f"Found {len(result['results'])} results:")
        
        for i, item in enumerate(result['results'], 1):
            print(f"\n{i}. {item['page_title']} - {item['header']}")
            print(f"   Similarity: {item['similarity_score']:.2f}")
            print(f"   Content: {item['content'][:200]}...")
    else:
        print(f"❌ Error: {response.json().get('error', 'Unknown error')}")

def check_status():
    """Check the status of any running background jobs."""
    response = requests.get(f"{BASE_URL}/status")
    
    if response.status_code == 200:
        status = response.json()
        print(f"Current job: {status['current_job'] or 'None'}")
        print(f"Status: {status['status']}")
        
        if status["status"] == "running":
            progress = status["progress"]
            total = status["total"]
            if total > 0:
                percentage = int((progress / total) * 100)
                print(f"Progress: {percentage}% ({progress}/{total})")
            print(f"Message: {status['message']}")
            print(f"Started at: {status['started_at']}")
        elif status["status"] != "idle":
            print(f"Message: {status['message']}")
            print(f"Started at: {status['started_at']}")
            print(f"Completed at: {status['completed_at']}")
    else:
        print(f"❌ Error: Cannot connect to the API server")

def validate_graph_vs_vector(query, embedding):
    # Get pure vector search results
    vector_results = mongo_db.collection.aggregate([
        {
            "$vectorSearch": {
                "index": "embedding_index",
                "queryVector": embedding,
                "numCandidates": 20,
                "limit": 5
            }
        }
    ])
    
    # Get graph-enhanced results
    graph_results = mongo_db.graph_based_retrieve(
        query=query,
        embedding=embedding,
        max_results=5,
        depth=2
    )
    
    # Compare results
    vector_ids = set(doc["_id"] for doc in vector_results)
    graph_ids = set(doc["_id"] for doc in graph_results)
    
    # Analyze differences
    different_results = len(vector_ids.symmetric_difference(graph_ids))
    graph_only = len(graph_ids - vector_ids)
    
    print(f"Different results: {different_results}")
    print(f"Results found only by graph traversal: {graph_only}")
    
    return different_results > 0  # True if graph RAG is doing something different

def analyze_graph_paths(query, embedding):
    # Modified retrieve method that records paths
    initial_results = mongo_db.collection.aggregate([
        {
            "$vectorSearch": {
                "index": "embedding_index",
                "queryVector": embedding,
                "numCandidates": 10,
                "limit": 5
            }
        }
    ])
    
    seed_nodes = set(doc["_id"] for doc in initial_results)
    
    # Track traversal paths
    paths = []
    nodes_by_traversal = {0: list(seed_nodes)}
    
    # Traverse graph
    for depth in range(1, 3):
        nodes_by_traversal[depth] = []
        
        for node_id in nodes_by_traversal[depth-1]:
            # Get linked nodes
            for link_type in ["outgoing_links", "incoming_links", "hierarchical"]:
                linked_nodes = get_linked_nodes(node_id, link_type)
                
                for linked_node in linked_nodes:
                    paths.append({
                        "from": node_id,
                        "to": linked_node,
                        "type": link_type,
                        "hop": depth
                    })
                    nodes_by_traversal[depth].append(linked_node)
    
    print(f"Total paths traversed: {len(paths)}")
    print(f"Nodes by traversal level: {[len(nodes) for _, nodes in nodes_by_traversal.items()]}")
    
    # The more paths found, the more graph-like your data is
    return paths

def test_graph_specific_scenarios():
    scenarios = [
        {
            "name": "Multi-hop connection test",
            "query": "Information that requires following several links",
            "expected_results": ["node123", "node456"]  # IDs known to require traversal
        },
        {
            "name": "Hierarchical information test",
            "query": "Question about a topic with subtopics",
            "expected_results": ["parent123", "child456"]  # Parent/child relationship
        },
        {
            "name": "Referenced but semantically distant test",
            "query": "Topic that's explicitly linked but vector-dissimilar",
            "expected_results": ["distantNode789"]  # Would be missed by vector search alone
        }
    ]
    
    results = {}
    for scenario in scenarios:
        embedding = get_embedding(scenario["query"])
        
        # Run both methods
        vector_results = run_vector_search(scenario["query"], embedding)
        graph_results = run_graph_search(scenario["query"], embedding)
        
        # Check if expected nodes were found
        vector_found = [node in vector_results for node in scenario["expected_results"]]
        graph_found = [node in graph_results for node in scenario["expected_results"]]
        
        # Record results
        results[scenario["name"]] = {
            "vector_success_rate": sum(vector_found) / len(vector_found),
            "graph_success_rate": sum(graph_found) / len(graph_found),
            "improvement": (sum(graph_found) - sum(vector_found)) / len(vector_found) if sum(vector_found) > 0 else "infinite"
        }
    
    return results

def analyze_graph_structure():
    # Count nodes and edges
    node_count = mongo_db.collection.count_documents({})
    
    # Count all edges (various relationship types)
    edge_count = 0
    edge_count += mongo_db.collection.aggregate([
        {"$unwind": "$outgoing_links"},
        {"$count": "total"}
    ]).next()["total"]
    
    edge_count += mongo_db.collection.count_documents({"parent_chunk_id": {"$ne": None}})
    
    # Calculate average degree (connections per node)
    avg_degree = edge_count / node_count if node_count > 0 else 0
    
    # Calculate clustering coefficient (how nodes cluster together)
    # This is computationally expensive for large graphs but valuable
    # Simplified version:
    sample_nodes = list(mongo_db.collection.aggregate([
        {"$sample": {"size": 100}},
        {"$project": {"_id": 1}}
    ]))
    
    clustering_coefficients = []
    for node in sample_nodes:
        node_id = node["_id"]
        neighbors = get_all_neighbors(node_id)
        
        if len(neighbors) < 2:
            continue
            
        # Count connections between neighbors
        connections = 0
        for i, n1 in enumerate(neighbors):
            for n2 in neighbors[i+1:]:
                if are_connected(n1, n2):
                    connections += 1
        
        max_possible = (len(neighbors) * (len(neighbors) - 1)) / 2
        clustering_coefficients.append(connections / max_possible if max_possible > 0 else 0)
    
    avg_clustering = sum(clustering_coefficients) / len(clustering_coefficients) if clustering_coefficients else 0
    
    return {
        "node_count": node_count,
        "edge_count": edge_count,
        "avg_degree": avg_degree,
        "avg_clustering": avg_clustering,
        "is_graph_like": avg_degree > 1 and avg_clustering > 0  # Basic threshold
    }

def visualize_answer_trace(query, answer):
    # Get the trace of nodes that contributed to the answer
    trace = get_answer_trace(query, answer)
    
    # Generate a network graph visualization
    G = nx.DiGraph()
    
    # Add nodes
    for node in trace["nodes"]:
        G.add_node(node["id"], label=node["header"], type=node["type"])
    
    # Add edges
    for edge in trace["edges"]:
        G.add_edge(edge["from"], edge["to"], type=edge["type"])
    
    # Visualize with your preferred tool (matplotlib, pyvis, etc.)
    plt.figure(figsize=(12, 8))
    pos = nx.spring_layout(G)
    nx.draw(G, pos, with_labels=True, node_color='lightblue', 
            node_size=1500, arrowsize=20, font_size=10)
    plt.title(f"Answer Trace for: {query}")
    plt.savefig("answer_trace.png")
    plt.show()

def evaluate_multi_hop_performance():
    multi_hop_questions = [
        "What is the relationship between Project X and System Y?",
        "How does feature A affect the performance of component B?",
        "What are the prerequisites for using tool Z with framework W?"
    ]
    
    vector_scores = []
    graph_scores = []
    
    for question in multi_hop_questions:
        # Get expert rating on accuracy (e.g., 0-5 scale)
        vector_answer = get_vector_search_answer(question)
        graph_answer = get_graph_search_answer(question)
        
        # Have an expert rate these answers
        vector_rating = expert_rating(question, vector_answer)
        graph_rating = expert_rating(question, graph_answer)
        
        vector_scores.append(vector_rating)
        graph_scores.append(graph_rating)
    
    avg_vector = sum(vector_scores) / len(vector_scores)
    avg_graph = sum(graph_scores) / len(graph_scores)
    
    return {
        "vector_avg_score": avg_vector,
        "graph_avg_score": avg_graph,
        "improvement": (avg_graph - avg_vector) / avg_vector if avg_vector > 0 else "infinite"
    }

def main():
    parser = argparse.ArgumentParser(description="Confluence Knowledge Base Manager")
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Add URL command
    add_parser = subparsers.add_parser("add", help="Add a new Confluence URL")
    add_parser.add_argument("url", help="Confluence page URL")
    add_parser.add_argument("--no-process", action="store_true", help="Don't process the URL immediately")
    
    # Reload command
    reload_parser = subparsers.add_parser("reload", help="Reload all Confluence pages")
    
    # Query command
    query_parser = subparsers.add_parser("query", help="Query the knowledge graph")
    query_parser.add_argument("text", help="Query text")
    query_parser.add_argument("--max", type=int, default=5, help="Maximum number of results")
    
    # Status command
    status_parser = subparsers.add_parser("status", help="Check the status of background jobs")
    
    args = parser.parse_args()
    
    if args.command == "add":
        add_url(args.url, not args.no_process)
    elif args.command == "reload":
        reload_all()
    elif args.command == "query":
        query(args.text, args.max)
    elif args.command == "status":
        check_status()
    else:
        parser.print_help()

if __name__ == "__main__":
    main() 