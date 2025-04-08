from atlassian import Confluence
from bs4 import BeautifulSoup
import chromadb
from sentence_transformers import SentenceTransformer
import textwrap
import os

class ConfluenceVectorDB:
    def __init__(self, collection_name="confluence_docs"):
        # Initialize ChromaDB
        self.client = chromadb.PersistentClient(path="./chroma_db")
        
        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        
        # Initialize the sentence transformer model
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        
    def _chunk_text(self, text, chunk_size=500):
        """Split text into chunks of approximately chunk_size characters"""
        return textwrap.wrap(text, width=chunk_size, break_long_words=False, break_on_hyphens=False)
    
    def _html_to_text(self, html_content):
        """Convert HTML to plain text"""
        soup = BeautifulSoup(html_content, 'html.parser')
        return soup.get_text(separator=' ', strip=True)
    
    def add_confluence_page(self, page_id, html_content):
        """Add a Confluence page to the vector database"""
        # Convert HTML to text
        text = self._html_to_text(html_content)
        
        # Split into chunks
        chunks = self._chunk_text(text)
        
        # Create unique IDs for each chunk
        ids = [f"{page_id}-chunk-{i}" for i in range(len(chunks))]
        
        # Generate embeddings using sentence-transformers
        embeddings = self.model.encode(chunks).tolist()
        
        # Add to ChromaDB
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=[{"page_id": page_id, "chunk_index": i} for i in range(len(chunks))]
        )
    
    def search(self, query, n_results=3):
        """Search for similar content"""
        # Generate embedding for the query
        query_embedding = self.model.encode(query).tolist()
        
        # Search in ChromaDB
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results
        )
        
        return results

# Example usage
if __name__ == "__main__":
    # Initialize Confluence client
    confluence = Confluence(
        url='https://confluence.nvidia.com',
        username='ddarji',
        password='ArPfLkLoQxBbUjHESYdU7rfL8o61Itp07eOoqH'
    )
    
    # Get the page
    page = confluence.get_page_by_title(
        space='~kballa',
        title='Kedareswar AVOS-Info',
        expand='body.storage'
    )
    
    if page:
        # Initialize vector database
        vector_db = ConfluenceVectorDB()
        
        # Add page content to vector database
        content_html = page["body"]["storage"]["value"]
        vector_db.add_confluence_page(page["id"], content_html)
        
        # Example search
        search_query = "How to start AVOS 609 QNX safety container?"
        results = vector_db.search(search_query)
        
        print("\nSearch Results for:", search_query)
        print("-" * 50)
        for doc in results["documents"][0]:
            print(doc)
            print("-" * 50)

# # Initialize the vector database
# vector_db = ConfluenceVectorDB()

# # Add a page
# vector_db.add_confluence_page(page_id, html_content)

# # Search content
# results = vector_db.search("Your search query here") 