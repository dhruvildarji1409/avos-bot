const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Function to call the Python script for generating embeddings
const generateEmbedding = async (text) => {
  return new Promise((resolve, reject) => {
    // First create the Python embedding script if it doesn't exist
    ensureEmbeddingScriptExists();
    
    // Path to the Python script
    const pythonScriptPath = path.join(__dirname, '..', 'embedding_client.py');
    
    // Spawn a new Python process
    const pythonProcess = spawn('python3', [pythonScriptPath, text]);
    
    // Variables to collect stdout and stderr
    let dataFromStdout = '';
    let dataFromStderr = '';
    
    // Collect data from stdout
    pythonProcess.stdout.on('data', (data) => {
      dataFromStdout += data.toString();
    });
    
    // Collect errors from stderr
    pythonProcess.stderr.on('data', (data) => {
      dataFromStderr += data.toString();
    });
    
    // Handle process exit
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python embedding process exited with code ${code}`);
        console.error(`Python stderr: ${dataFromStderr}`);
        
        // Fallback to empty embedding if Python script fails
        resolve([]);
      } else {
        try {
          // Parse the embedding from stdout
          const embedding = JSON.parse(dataFromStdout);
          resolve(embedding);
        } catch (error) {
          console.error('Error parsing embedding JSON:', error);
          resolve([]);
        }
      }
    });
    
    // Handle potential errors
    pythonProcess.on('error', (error) => {
      console.error('Failed to start Python embedding process:', error);
      resolve([]);
    });
  });
};

// Function to ensure the embedding script exists
const ensureEmbeddingScriptExists = () => {
  const scriptPath = path.join(__dirname, '..', 'embedding_client.py');
  
  // Skip if script already exists
  if (fs.existsSync(scriptPath)) return;
  
  // Create the script file
  const scriptContent = `#!/usr/bin/env python3

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
`;

  fs.writeFileSync(scriptPath, scriptContent);
  fs.chmodSync(scriptPath, 0o755); // Make executable
  
  console.log('Created embedding_client.py script');
};

// Function to get embedding for a text chunk
const getEmbedding = async (text) => {
  try {
    // Clean and prepare text
    const processedText = text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
    
    // Limit text length (most embedding models have token limits)
    const truncatedText = processedText.slice(0, 8000);
    
    // Get embedding
    return await generateEmbedding(truncatedText);
  } catch (error) {
    console.error('Error in embedding service:', error);
    return [];
  }
};

// Function to clean content for embedding
const cleanTextForEmbedding = (text) => {
  return text
    .replace(/<[^>]*>/g, '')  // Remove HTML tags
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
};

// Function to compute similarity between two embeddings
const computeSimilarity = (embedding1, embedding2) => {
  if (!embedding1 || !embedding2 || !embedding1.length || !embedding2.length) {
    return 0;
  }
  
  try {
    // Cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    
    return dotProduct / (norm1 * norm2);
  } catch (error) {
    console.error('Error computing similarity:', error);
    return 0;
  }
};

module.exports = {
  getEmbedding,
  cleanTextForEmbedding,
  computeSimilarity
}; 