#!/usr/bin/env python3

import os
import sys
import json
import numpy as np
from pathlib import Path

# Handle import errors gracefully
try:
    import requests
    from openai import AzureOpenAI
    from sentence_transformers import SentenceTransformer
    DEPENDENCIES_INSTALLED = True
except ImportError:
    DEPENDENCIES_INSTALLED = False

def get_embedding(text):
    """Generate text embedding using local SentenceTransformer or Azure OpenAI."""
    if not text or text.strip() == "":
        return []
        
    try:
        # First try with SentenceTransformer (works offline)
        try:
            model = SentenceTransformer('all-MiniLM-L6-v2')
            embedding = model.encode(text)
            return embedding.tolist()
        except Exception as e:
            print(f"Error with SentenceTransformer: {e}", file=sys.stderr)
            
        # If SentenceTransformer fails, try Azure OpenAI (needs online)
        try:
            from azure_client import get_azure_client
            client = get_azure_client()
            if client:
                response = client.embeddings.create(
                    model="text-embedding-ada-002",
                    input=text[:8000]  # Limit input size
                )
                return response.data[0].embedding
        except Exception as e:
            print(f"Error with Azure OpenAI: {e}", file=sys.stderr)
        
        # If all else fails, return mock embedding (random values)
        print("Using mock embedding", file=sys.stderr)
        mock_embedding = np.random.rand(384).tolist()  # 384 dimensions like MiniLM
        return mock_embedding
        
    except Exception as e:
        print(f"General error in get_embedding: {e}", file=sys.stderr)
        return []

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("[]")
        sys.exit(1)
    
    text = sys.argv[1]
    embedding = get_embedding(text)
    print(json.dumps(embedding))
