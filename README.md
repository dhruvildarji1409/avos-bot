# AVOS Bot

AVOS Bot is a chatbot designed to help NVIDIA users get information about AVOS (Autonomous Vehicle Operating System). The bot stores knowledge in a MongoDB database with semantic search functionality and allows AVOS developers to upload new Confluence links to enhance the bot's knowledge base.

## Features

- Chat interface to ask questions about AVOS
- Semantic search with embeddings for more accurate responses
- MongoDB database for storing Confluence content and embeddings
- Ability to add Confluence content to the knowledge base
- Automatic extraction of child pages from Confluence
- Chat history storage for each user
- Enhanced sharing with secure, expirable links
- Admin panel for AVOS developers to upload new content

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4 or higher)
- Python (v3.7 or higher) for embeddings generation
- npm or yarn

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/avos-bot.git
   cd avos-bot
   ```

2. Install Node.js dependencies:
   ```
   npm install
   ```

3. Install Python dependencies for embedding generation:
   ```
   pip install -r requirements.txt
   ```

4. Create a `.env` file based on the provided `.env.example`:
   ```
   cp .env.example .env
   ```

5. Update the `.env` file with your configuration values:
   ```
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   APP_URL=http://localhost:3000

   # MongoDB Configuration
   MONGODB_URI=mongodb://localhost:27017/avos-bot

   # Confluence API Configuration
   CONFLUENCE_HOST=https://confluence.nvidia.com
   CONFLUENCE_USERNAME=your_username
   CONFLUENCE_API_TOKEN=your_api_token

   # JWT Secret for Authentication
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRES_IN=7d

   # Logging
   LOG_LEVEL=info

   # CORS Configuration
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
   ```

## Usage

### Starting the Server

Start the server in development mode with hot-reloading:
```
npm run dev
```

Start the server in production mode:
```
npm start
```

### Generating Embeddings

To generate embeddings for existing content in the database:
```
npm run generate-embeddings
```

### Accessing the Chat Interface

Open your browser and navigate to:
```
http://localhost:3000
```

### Accessing the Admin Panel

Open your browser and navigate to:
```
http://localhost:3000/admin.html
```

### Adding Confluence Content

1. Go to the Admin Panel.
2. Enter a Confluence URL and your name in the form.
3. Click "Fetch and Add Content" to automatically fetch and add the content.
4. The system will also fetch and add all child pages.
5. Embeddings will be automatically generated for the content.
6. Alternatively, you can manually add content using the second form.

### Sharing Chat History

1. In the chat interface, click the "Share" button in the bottom right.
2. A secure share link will be generated with an expiration date (default: 24 hours).
3. Copy the link and share it with others.
4. When someone opens the share link, they will see your chat history.

## API Endpoints

### Chat
- **POST /api/chat**: Send a message to the chatbot

### Chat History
- **POST /api/chat-history**: Create a new chat history
- **GET /api/chat-history/:userId**: Retrieve chat history by user ID
- **DELETE /api/chat-history/:userId**: Delete a chat history

### Enhanced Sharing
- **POST /api/chat-history/share**: Share chat history with another user
- **GET /api/chat-history/shared/:userId**: Get chat histories shared with a user
- **POST /api/chat-history/:userId/share**: Generate a shareable link
- **GET /api/chat-history/token/:token**: Get chat history by share token

### Confluence
- **POST /api/confluence**: Add new Confluence content
- **GET /api/confluence/search**: Search Confluence content
- **POST /api/confluence/fetch**: Fetch and store Confluence content

## How It Works

### Semantic Search

The bot uses embeddings-based semantic search to find the most relevant content:

1. When a user asks a question, the query is converted into an embedding vector.
2. This vector is compared with embeddings of stored Confluence content.
3. The most semantically similar content is retrieved and used as context.
4. The LLM generates a response based on this relevant context.

This approach provides more accurate responses than simple keyword matching.

### Embedding Generation

Embeddings are generated using:
1. Local SentenceTransformer model (works offline)
2. Falls back to Azure OpenAI's embedding API when needed

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.
