import chromadb
import pandas as pd
from typing import List, Dict
import plotly.express as px
from sklearn.decomposition import PCA
import numpy as np
from sentence_transformers import SentenceTransformer
import streamlit as st
import plotly.graph_objects as go

# Uncomment and adjust if you prefer using the Settings-based Client in Chroma >= 0.6:
# from chromadb.config import Settings
#
# def get_chroma_client(db_path: str = "./chroma_db"):
#     return chromadb.Client(
#         Settings(
#             chroma_db_impl="duckdb+parquet",
#             persist_directory=db_path
#         )
#     )

class ChromaDBVisualizer:
    def __init__(self, db_path: str = "./chroma_db"):
        """Initialize the ChromaDB visualizer."""
        # If you’re using newer Chroma versions, using a Settings-based client is recommended:
        #
        # self.client = get_chroma_client(db_path)
        #
        # If you specifically want to keep using PersistentClient, you can do:
        self.client = chromadb.PersistentClient(path=db_path)

        # Initialize embedding model
        self.model = SentenceTransformer('all-MiniLM-L6-v2')

    def get_collections(self) -> List[str]:
        """Get all collection names. In Chroma >= 0.6.0, list_collections() returns minimal dicts."""
        minimal_collections = self.client.list_collections()
        # Each item is something like {"name": "MyCollection"}
        return [mc for mc in minimal_collections]

    def get_collection_stats(self, collection_name: str) -> Dict:
        """Get some statistics about the collection."""
        # For Chroma 0.6.0 and above, specify name=... in get_collection
        collection = self.client.get_collection(name=collection_name)
        count = collection.count()

        # Retrieve all docs and metadata
        result = collection.get()

        # Count unique page IDs from metadata
        page_ids = set()
        for metadata in result['metadatas']:
            if isinstance(metadata, dict) and 'page_id' in metadata:
                page_ids.add(metadata['page_id'])

        return {
            'total_chunks': count,
            'unique_pages': len(page_ids),
            'has_embeddings': bool(result['embeddings']),
            'has_metadata': bool(result['metadatas'])
        }

    def visualize_embeddings(self, collection_name: str):
        """Perform a PCA to 2D and return the DataFrame + explained variance ratio."""
        collection = self.client.get_collection(name=collection_name)
        result = collection.get()

        if not result['embeddings']:
            # No embeddings in this collection
            return None, None

        # Convert embeddings to NumPy array
        embeddings = np.array(result['embeddings'])

        # Reduce dimensionality to 2D
        pca = PCA(n_components=2)
        embeddings_2d = pca.fit_transform(embeddings)

        # Prepare a DataFrame for visualization
        df = pd.DataFrame(embeddings_2d, columns=['x', 'y'])
        df['content'] = result['documents']
        df['header'] = [
            meta.get('header', 'Unknown') if isinstance(meta, dict) else 'Unknown'
            for meta in result['metadatas']
        ]

        return df, pca.explained_variance_ratio_


def main():
    st.set_page_config(page_title="ChromaDB Visualizer", layout="wide")
    st.title("ChromaDB Content Visualizer")

    # Instantiate the visualizer
    visualizer = ChromaDBVisualizer()
    collections = visualizer.get_collections()

    if not collections:
        st.error("No collections found in the database!")
        return

    # Sidebar to select which collection to visualize
    selected_collection = st.sidebar.selectbox(
        "Select Collection",
        collections
    )

    # Display collection stats
    st.header("Collection Statistics")
    stats = visualizer.get_collection_stats(selected_collection)
    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Total Chunks", stats['total_chunks'])
    with col2:
        st.metric("Unique Pages", stats['unique_pages'])
    with col3:
        st.metric("Has Embeddings", "✅" if stats['has_embeddings'] else "❌")

    # Visualization section
    st.header("Content Visualization")

    df, variance_ratio = visualizer.visualize_embeddings(selected_collection)

    if df is not None:
        # Create a scatter plot
        fig = px.scatter(
            df,
            x='x',
            y='y',
            hover_data=['header'],
            title=(
                "2D Visualization of Content Embeddings "
                f"(Explained Variance: {variance_ratio[0]:.2%}, {variance_ratio[1]:.2%})"
            )
        )

        fig.update_layout(
            width=1000,
            height=600,
            hovermode='closest'
        )

        st.plotly_chart(fig)

        # Provide a way to inspect content from each point
        st.header("Content Explorer")
        selected_point = st.selectbox(
            "Select a point to view content",
            df.index,
            format_func=lambda i: f"Chunk {i}: {df.iloc[i]['header'][:50]}..."
        )

        if selected_point is not None:
            st.subheader(f"Content for Chunk {selected_point}")
            st.write(df.iloc[selected_point]['content'])
    else:
        st.error("No embeddings found in the collection!")


if __name__ == "__main__":
    main()
