#!/usr/bin/env python3
import sys
from pymongo import MongoClient
from openai import OpenAI
import os
import time
import json
import networkx as nx
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

# Configure these values
MONGODB_URI = "mongodb://localhost:27017"
DB_NAME = "confluence_db"
COLLECTION_NAME = "page_chunks"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your-api-key-here")

openai_client = OpenAI(api_key=OPENAI_API_KEY)

def get_embedding(text):
    """Get an embedding for the provided text."""
    try:
        embedding_response = openai_client.embeddings.create(
            model="text-embedding-ada-002",
            input=text
        )
        return embedding_response.data[0].embedding
    except Exception as e:
        print(f"Error getting embedding: {e}")
        return None

def visualize_graph_structure(db_client, limit=100):
    """Visualize the graph structure of chunks in the database."""
    collection = db_client[DB_NAME][COLLECTION_NAME]
    
    # Get a sample of documents
    docs = list(collection.find().limit(limit))
    
    if not docs:
        print("No documents found in the database.")
        return
    
    # Create a graph
    G = nx.DiGraph()
    
    # Add nodes and edges
    for doc in docs:
        node_id = doc["_id"]
        page_title = doc.get("page_title", "Unknown")
        header = doc.get("header", "Unknown")
        level = doc.get("level", 0)
        
        # Add node with attributes
        G.add_node(node_id, 
                  title=page_title, 
                  header=header, 
                  level=level,
                  type="document")
        
        # Add parent-child edges
        parent_id = doc.get("parent_chunk_id")
        if parent_id:
            G.add_edge(parent_id, node_id, type="parent-child")
        
        # Add children edges
        for child_id in doc.get("children", []):
            G.add_edge(node_id, child_id, type="parent-child")
        
        # Add reference edges
        for ref in doc.get("references", []):
            # Since references are URLs, we need to find the corresponding document
            ref_doc = collection.find_one({"url": ref})
            if ref_doc:
                G.add_edge(node_id, ref_doc["_id"], type="reference")
    
    # Print graph stats
    print(f"Graph has {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
    
    # Calculate percentage of nodes with parents
    nodes_with_parents = sum(1 for n in G.nodes() if G.in_degree(n) > 0)
    parent_percentage = nodes_with_parents / G.number_of_nodes() * 100
    print(f"Percentage of nodes with parents: {parent_percentage:.1f}%")
    
    # Calculate average number of children
    total_children = sum(G.out_degree(n) for n in G.nodes())
    avg_children = total_children / G.number_of_nodes()
    print(f"Average number of children per node: {avg_children:.2f}")
    
    # Draw the graph
    plt.figure(figsize=(12, 10))
    
    # Use different colors for different header levels
    colors = []
    for node in G.nodes():
        level = G.nodes[node].get("level", 0)
        if level == 1:
            colors.append("red")
        elif level == 2:
            colors.append("green")
        elif level == 3:
            colors.append("blue")
        elif level == 4:
            colors.append("orange")
        elif level == 5:
            colors.append("purple")
        else:
            colors.append("gray")
    
    # Create a hierarchical layout
    pos = nx.spring_layout(G, iterations=100, seed=42)
    
    # Draw nodes and edges
    nx.draw_networkx_nodes(G, pos, node_size=200, node_color=colors, alpha=0.8)
    
    # Draw edges with different styles for different types
    parent_child_edges = [(u, v) for u, v, d in G.edges(data=True) if d.get("type") == "parent-child"]
    reference_edges = [(u, v) for u, v, d in G.edges(data=True) if d.get("type") == "reference"]
    
    nx.draw_networkx_edges(G, pos, edgelist=parent_child_edges, edge_color="black", arrows=True)
    nx.draw_networkx_edges(G, pos, edgelist=reference_edges, edge_color="red", style="dashed", arrows=True)
    
    # Add legend
    legend_elements = [
        Line2D([0], [0], marker='o', color='w', markerfacecolor='red', markersize=10, label='H1'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor='green', markersize=10, label='H2'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor='blue', markersize=10, label='H3'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor='orange', markersize=10, label='H4'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor='purple', markersize=10, label='H5/H6'),
        Line2D([0], [0], color='black', label='Parent-Child'),
        Line2D([0], [0], color='red', linestyle='dashed', label='Reference')
    ]
    plt.legend(handles=legend_elements, loc='upper right')
    
    plt.title("Confluence Content Graph Structure")
    plt.tight_layout()
    plt.savefig("confluence_graph.png")
    plt.show()
    
    print(f"Graph visualization saved to confluence_graph.png")

def main():
    try:
        client = MongoClient(MONGODB_URI)
        visualize_graph_structure(client)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main() 