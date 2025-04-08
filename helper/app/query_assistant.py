import os
import numpy as np
from openai import OpenAI
from pymongo import MongoClient
from typing import List, Dict, Any
import openai



class MongoDBVectorSearch:
    """
    A simple class to query MongoDB for pre-stored embeddings 
    and perform local similarity search in Python.
    """
    def __init__(
        self,
        mongo_host: str = "localhost",
        mongo_port: int = 27017,
        db_name: str = "confluence_db",
        collection_name: str = "page_chunks",
        openai_api_key: str = None
    ):
        self.client = MongoClient(mongo_host, mongo_port)
        self.db = self.client[db_name]
        self.collection = self.db[collection_name]

        # Setup OpenAI
        if not openai_api_key:
            raise ValueError("OpenAI API key must be provided!")

    def _compute_query_embedding(self, query: str) -> List[float]:
        """
        Call OpenAI to compute embedding for the user's query.
        Uses 'text-embedding-ada-002' as an example.
        """
        response = openai.embeddings.create(model="text-embedding-ada-002",
        input=query)
        return response.data[0].embedding

    def _cosine_similarity(self, v1: np.ndarray, v2: np.ndarray) -> float:
        """Compute cosine similarity between two numpy vectors."""
        denom = (np.linalg.norm(v1) * np.linalg.norm(v2))
        if denom == 0:
            return 0.0
        return float(np.dot(v1, v2) / denom)

    def search(self, query: str, n_results: int = 3) -> Dict[str, Any]:
        """
        Perform a vector search in MongoDB:
         1) Compute the query embedding
         2) Retrieve documents with embeddings
         3) Calculate similarity
         4) Return top-n matches
         
        Returns:
            A dict with "documents": List[str], "scores": List[float]
        """
        # 1) Compute query embedding
        query_embedding = np.array(self._compute_query_embedding(query))

        # 2) Fetch all chunk docs that have "embedding" from Mongo
        #    We'll just pull 'content', 'full_context', 'embedding', etc.
        cursor = self.collection.find(
            {"embedding": {"$exists": True}},
            {"content": 1, "full_context": 1, "embedding": 1, "_id": 0}
        )
        docs = list(cursor)

        # 3) Calculate similarity for each doc
        scored_docs = []
        for d in docs:
            emb = np.array(d["embedding"], dtype=float)
            score = self._cosine_similarity(query_embedding, emb)
            scored_docs.append((d, score))

        # 4) Sort by descending similarity, pick top-n
        scored_docs.sort(key=lambda x: x[1], reverse=True)
        top_docs = scored_docs[:n_results]

        # Format output
        return {
            "documents": [td[0]["full_context"] for td in top_docs],  # or "content"
            "scores": [td[1] for td in top_docs]
        }


from typing import Dict, List, Any

class QueryAssistant:
    def __init__(self, openai_api_key: str, mongo_host: str, mongo_port: int):
        """
        Initialize with MongoDB-based vector search + OpenAI
        """
        self.vector_search = MongoDBVectorSearch(
            mongo_host=mongo_host,
            mongo_port=mongo_port,
            db_name="confluence_db",
            collection_name="page_chunks",
            openai_api_key=openai_api_key
        )

        # We'll talk directly to openai for chat completions

        self.conversation_history: List[Dict[str, str]] = []

    def get_response(self, query: str, n_results: int = 3) -> Dict[str, Any]:
        """
        1) Vector search to get top-n relevant passages
        2) Build a chat prompt with context
        3) Call OpenAI ChatCompletion
        4) Return answer + relevant passages
        """
        # 1) Vector search
        search_results = self.vector_search.search(query, n_results=n_results)
        relevant_passages = search_results["documents"]

        # 2) Build a system prompt
        system_prompt = (
            "You are a helpful assistant that answers questions based on the provided context "
            "and conversation history. You MUST use only the provided context to answer. If you see code, "
            "format it as code blocks. If the question can't be answered from context, say you don't know."
        )

        # Format the passages
        context = "\n\n".join(
            [f"Passage {i+1}:\n{p}" for i, p in enumerate(relevant_passages)]
        )

        # Build messages
        messages = [
            {"role": "system", "content": system_prompt},
        ]
        # Add conversation history
        messages.extend(self.conversation_history)

        # Add user message with context
        user_content = f"Context:\n{context}\n\nQuestion: {query}"
        messages.append({"role": "user", "content": user_content})
        # 3) Call OpenAI
        response = openai.chat.completions.create(model="gpt-4",  # or gpt-4 if you have access
        messages=messages,
        temperature=0.7,
        max_tokens=1000)

        answer = response.choices[0].message.content

        # Update conversation history
        self.conversation_history.append({"role": "user", "content": query})
        self.conversation_history.append({"role": "assistant", "content": answer})

        # Keep only the last 6 messages total
        if len(self.conversation_history) > 6:
            self.conversation_history = self.conversation_history[-6:]

        return {
            "answer": answer,
            "relevant_passages": relevant_passages
        }

    def clear_history(self):
        self.conversation_history = []


def main():
    # Make sure you set your OpenAI API key in an environment variable
    # openai_api_key = os.getenv("OPENAI_API_KEY", "<YOUR_OPENAI_KEY_HERE>")
    openai.api_key = ""
    if not openai.api_key:
        raise ValueError("Please set OPENAI_API_KEY env variable or put it in code.")

    # If Mongo runs locally on your dev server, use "localhost". 
    # If it's on another machine (like 10.111.85.40), adjust accordingly.
    mongo_host = "localhost"  
    mongo_port = 27017

    assistant = QueryAssistant(openai.api_key , mongo_host, mongo_port)
    print("MongoDB Chat Assistant. Type 'quit' to exit or 'clear' to reset conversation.")

    while True:
        query = input("\nEnter your question: ")

        if query.lower() == "quit":
            break
        elif query.lower() == "clear":
            assistant.clear_history()
            print("Chat history cleared.")
            continue

        try:
            result = assistant.get_response(query, n_results=3)
            print("\n=== AI Response ===")
            print(result["answer"])

            # Optionally, print relevant passages:
            # print("\n=== Relevant Passages ===")
            # for i, passage in enumerate(result["relevant_passages"], 1):
            #     print(f"[Passage {i}]: {passage}")

        except Exception as e:
            print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()
