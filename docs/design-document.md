# AVOS Bot Design Document

This document provides a comprehensive technical overview of the AVOS Bot's architecture, components, and data flows.

## 1. System Architecture

```
+-----------------+      +------------------+      +--------------------+
|                 |      |                  |      |                    |
|  Web Interface  +----->+  Express Server  +----->+  MongoDB Database  |
|                 |      |                  |      |                    |
+-----------------+      +-------+----------+      +--------------------+
                                 |
                                 |
                 +---------------v---------------+
                 |                               |
                 |        Service Layer          |
                 |                               |
                 +------+--------------+---------+
                        |              |
            +-----------v----+  +------v---------+
            |                |  |                |
            |   LLM Service  |  |  Embedding     |
            |   (OpenAI/     |  |  Service       |
            |    Azure)      |  |                |
            +----------------+  +----------------+
```

## 2. System Overview

The AVOS Bot is a chatbot designed to provide information about NVIDIA's Autonomous Vehicle Operating System (AVOS). It leverages a combination of semantic search, RAG (Retrieval Augmented Generation), and natural language processing to deliver accurate and helpful responses to user queries.

### Core Components:

1. **Web Interface**: A user-friendly interface for interacting with the chatbot, built using HTML, CSS, and JavaScript.
2. **Express Server**: Node.js backend handling API requests and serving the web interface.
3. **MongoDB Database**: Stores Confluence content, embeddings, and chat history.
4. **Service Layer**:
   - **LLM Service**: Interfaces with Azure OpenAI's API to generate responses.
   - **Embedding Service**: Generates vector embeddings for semantic search.
5. **Prompt System**: Centralized prompt management for tuning bot responses.

## 3. Data Flow Architecture

```
+-------------+     +----------------+     +----------------+     +-----------------+
|             |     |                |     |                |     |                 |
| User Query  +---->+ Generate Query +---->+ Semantic       +---->+ Relevant        |
|             |     | Embedding      |     | Search         |     | Content         |
+-------------+     +----------------+     +----------------+     +---------+-------+
                                                                           |
                                                                           v
+-------------+     +----------------+     +----------------+     +-----------------+
|             |     |                |     |                |     |                 |
| Response to <-----+ LLM Response   <-----+ Apply System   <-----+ Context         |
| User        |     | Generation     |     | Prompt         |     | Preparation     |
+-------------+     +----------------+     +----------------+     +-----------------+
```

## 4. Component Details

### 4.1 Web Interface

The web interface provides a chat-based UI for users to interact with the AVOS Bot. It includes:
- Chat input field
- Message history display
- Admin panel for content management
- Share functionality for chat sessions

**Key Files:**
- `public/index.html`: Main chat interface
- `public/script.js`: Client-side JavaScript for chat functionality
- `public/admin.html`: Admin interface for content management
- `public/admin-script.js`: Admin functionality implementation

### 4.2 Express Server

The Express server is the backend foundation handling:
- API endpoints for chat interactions
- User session management
- Confluence content management
- Authentication for admin access

```
Endpoints:
  - POST /api/chat: Handle chat messages
  - GET/POST /api/chat-history: Manage chat history
  - POST /api/confluence: Add Confluence content
  - GET /api/confluence/search: Search Confluence content
```

**Key Files:**
- `src/index.js`: Server initialization and configuration
- `src/api/routes.js`: API route definitions
- `src/controllers/`: Controller implementations
- `src/services/`: Service implementations

### 4.3 MongoDB Database

Schema design:

```
Collections:
1. ConfluenceData:
   {
     _id: ObjectId,
     title: String,
     content: String,
     processedContent: String,
     url: String,
     embedding: Array<Float>,
     page_id: String,
     parent_chunk_id: String,
     children: Array<String>,
     level: Number
   }

2. ChatHistory:
   {
     _id: ObjectId,
     userId: String,
     messages: [
       {
         sender: String,  // 'user' or 'bot'
         message: String,
         timestamp: Date
       }
     ]
   }
```

**Key Files:**
- `src/models/ConfluenceData.js`: Confluence data schema 
- `src/models/ChatHistory.js`: Chat history schema
- `src/db/db.js`: Database connection setup

### 4.4 LLM Service

Handles interactions with the LLM API:
- Makes API calls to Azure OpenAI
- Provides fallback responses when API calls fail
- Uses the centralized prompt system
- Processes context and generates contextually aware responses

**Key Files:**
- `src/services/llmService.js`: JavaScript service for LLM interactions
- `src/llm_client.py`: Python client for direct OpenAI API calls
- `src/config/prompts.js`: Centralized prompt configuration

### 4.5 Embedding Service

Generates and manages vector embeddings:
- Creates embeddings for Confluence content
- Generates embeddings for user queries
- Performs semantic similarity calculations
- Orders content by relevance for context preparation

**Key Files:**
- `src/services/embeddingService.js`: JavaScript service for embeddings
- `src/embedding_client.py`: Python client for embedding generation
- `src/db/generate-embeddings.js`: Script for bulk embedding generation

## 5. Prompt System Architecture

The prompt system is centralized in a single configuration file:

```
+-------------------+     +-------------------+     +-------------------+
|                   |     |                   |     |                   |
| prompts.js        |     | chatBotController |     | llmService.js     |
| - Defines all     +---->+ - Imports prompt  +---->+ - Uses prompts    |
|   system prompts  |     |   constants       |     |   for LLM calls   |
|   in one place    |     |                   |     |                   |
+-------------------+     +-------------------+     +-------------------+
         |
         |
         v
+-------------------+     +-------------------+
|                   |     |                   |
| llm_client.py     |     | Python LLM        |
| - Reads prompts   +---->+ - Builds messages |
|   from JS file    |     | - Makes API calls |
|                   |     |                   |
+-------------------+     +-------------------+
```

**Key Files:**
- `src/config/prompts.js`: Central prompt repository
- `docs/prompt-engineering.md`: Guide for prompt tuning

## 6. Information Retrieval Flow

```
+----------------+     +----------------+     +----------------+
|                |     |                |     |                |
| Semantic Search+---->+ Text Search    +---->+ Source         |
| Primary method |     | Fallback method|     | Attribution    |
|                |     |                |     |                |
+----------------+     +----------------+     +----------------+
```

1. **Semantic Search**: Uses embedding similarity to find relevant content.
2. **Text Search**: Falls back to traditional text search if semantic search returns no results.
3. **Source Attribution**: Adds source links to responses when context is used.

**Implementation Notes:**
- The system uses cosine similarity to compare query embeddings with stored content embeddings.
- Search results are filtered by a minimum similarity threshold (0.6).
- Top 3 most relevant results are used for context.

## 7. Query Processing Pipeline

```
                         +-------------------+
                         |                   |
                         |  User Query       |
                         |                   |
                         +--------+----------+
                                  |
                                  v
+----------------+     +----------------+     +----------------+
|                |     |                |     |                |
| Topic Extraction+---->+ Context        +---->+ Response       |
| Using LLM      |     | Retrieval      |     | Generation     |
|                |     |                |     |                |
+----------------+     +----------------+     +----------------+
```

**Key Process Steps:**
1. **Topic Extraction**: Extract key topics from the user query.
   - Implemented using LLM to identify 3-5 key technical topics.
   - Helps focus the context retrieval on relevant content.

2. **Context Retrieval**: Find relevant content based on the extracted topics.
   - Uses a Graph RAG approach to follow relationships between content.
   - Explores parent-child relationships for more comprehensive context.

3. **Response Generation**: Generate a response using the LLM and the retrieved context.
   - Applies system prompts to guide the tone and style of responses.
   - Formats response with proper source attribution.

## 8. Error Handling and Fallbacks

```
+----------------+     +----------------+     +----------------+
|                |     |                |     |                |
| LLM API Error  +---->+ Fallback to    +---->+ Predefined     |
| Detection      |     | Local Knowledge|     | Responses      |
|                |     |                |     |                |
+----------------+     +----------------+     +----------------+
```

The system includes multiple fallback mechanisms:
1. Fallback from semantic search to text search.
2. Fallback from LLM API to simulated responses.
3. Predefined responses for common topics when all else fails.

**Key Features:**
- Error logging for API failures.
- Graceful degradation of functionality.
- Consistent user experience even during service disruptions.

## 9. Technologies Used

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Database**: MongoDB
- **AI Services**: Azure OpenAI API, SentenceTransformers
- **Languages**: JavaScript, Python
- **Tools**: npm, pip

## 10. Security Considerations

- Sensitive credentials stored in .env file (not in version control)
- JWT for authentication
- HTTPs for production deployments
- Input sanitization for user queries
- Rate limiting for API endpoints

## 11. Scalability Considerations

The AVOS Bot can be scaled in several ways:
- Horizontal scaling of Express server instances
- MongoDB sharding for large content databases
- Caching frequently accessed content
- Implementing queue systems for high-volume query processing

## 12. Future Enhancements

- Multi-language support
- Voice interface integration
- Real-time content updates from Confluence
- Enhanced analytics on user questions and bot performance
- Personalized responses based on user history
- Integration with other NVIDIA internal systems

## 13. Browser Extraction Feature

The browser extraction feature allows users to extract content from Confluence pages that can't be accessed via the API:

```
+----------------+     +----------------+     +----------------+
|                |     |                |     |                |
| Browser Script +---->+ HTML Content   +---->+ Process and    |
| (Client-side)  |     | Extraction     |     | Store Content  |
|                |     |                |     |                |
+----------------+     +----------------+     +----------------+
```

Key implementation details:
- User runs a script in browser console when viewing a Confluence page
- Script extracts HTML content, page title, URL, and ID
- Content is sent to the backend for processing
- Cheerio is used to clean HTML and extract text
- Content is stored in the database and embeddings are generated

## 14. Deployment Architecture

Production deployment architecture:

```
+----------------+     +----------------+     +----------------+
|                |     |                |     |                |
| Nginx          +---->+ PM2-managed    +---->+ MongoDB Atlas  |
| (Reverse Proxy)|     | Node.js        |     | (Database)     |
|                |     |                |     |                |
+----------------+     +----------------+     +----------------+
```

- **Nginx**: Handles SSL termination, static file serving, and load balancing
- **PM2**: Process manager for Node.js applications with auto-restart capability
- **MongoDB Atlas**: Managed MongoDB database service for production use

## 15. Monitoring and Logging

- Winston for structured logging
- Morgan for HTTP request logging
- Error tracking with appropriate context
- Usage statistics collection for analytics

## Conclusion

The AVOS Bot represents a sophisticated, modular system designed to provide accurate and helpful information about NVIDIA's Autonomous Vehicle Operating System. Through its combination of semantic search, context retrieval, and LLM generation, it delivers a powerful, context-aware chatbot experience that can be continuously improved and extended. 