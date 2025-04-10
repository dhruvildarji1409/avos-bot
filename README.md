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
- Centralized prompt system for easy customization and tuning

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

### Customizing Bot Responses with Prompt Engineering

The AVOS Bot now features a centralized prompt system that makes it easy to customize and tune the bot's responses without modifying multiple files in the codebase.

All prompts are stored in a single file: `src/config/prompts.js`

To customize the bot's behavior:

1. Edit the prompts in this file according to your needs
2. Restart the server to apply changes
3. Test with different queries to see the effects

For detailed information about available prompts and best practices for customization, see the [Prompt Engineering Guide](docs/prompt-engineering.md).

### Generating Embeddings

To generate embeddings for existing content in the database:
```
npm run generate-embeddings
```

## Repository Structure

The repository has been cleaned up and organized as follows:

- `src/`: Core application code
  - `api/`: API routes and controllers
  - `config/`: Application configuration
  - `controllers/`: Request handlers
  - `db/`: Database access and query functions
  - `middlewares/`: Express middleware functions
  - `models/`: MongoDB models
  - `services/`: Business logic and external service integrations
  - `utils/`: Utility functions
  - `test-utils/`: Testing and debugging utilities (not used in production)

- `scripts/`: Helper scripts and utilities
  - Contains scripts for Confluence integration and testing

- `docs/`: Documentation

- `public/`: Static assets for web interface

## Development Notes

- Configuration files: Copy `.env.example` to `.env` and update with your credentials
- For script configuration, copy `scripts/.env.example` to `scripts/.env`
- Test files are organized in `src/test-utils/` to keep the main source directory clean
- The MCP (Model Control Protocol) integration is located in the `mcp-confluence/` directory

> **Important:** While typically .env files should not be committed to a repository for security reasons, 
> this project keeps them in version control for development convenience. Make sure to use placeholders 
> for sensitive values when sharing the repository, and rotate any exposed API tokens.

## AVOS Bot - Confluence Integration

This repository contains the code for the AVOS Bot with Confluence integration.

### Overview

The AVOS Bot can now search and index Confluence pages, providing accurate responses to user queries based on Confluence content. The system uses:

- Header-based chunking of Confluence pages
- OpenAI embeddings for semantic search
- Graph-based retrieval for more accurate answers
- Recursive page loading to capture linked content

### Setup

1. Install dependencies:

```bash
# Node.js dependencies
npm install

# Python dependencies (in virtual environment)
source venv/bin/activate
pip install atlassian-python-api beautifulsoup4 pymongo python-dotenv
```

2. Configure environment variables by copying `.env.example` to `.env` and updating the values:

```bash
cp .env.example .env
```

3. Start MongoDB:

```bash
# Start MongoDB (if not already running)
mongod --dbpath /path/to/data/db
```

### Loading Confluence Content

There are multiple ways to load Confluence content:

#### 1. Using the command-line utility

```bash
# Load a specific Confluence page with default settings (recursive with depth 3)
node scripts/load_confluence.js https://confluence.nvidia.com/display/SPACE/Page

# Load multiple pages
node scripts/load_confluence.js https://confluence.nvidia.com/display/SPACE/Page1 https://confluence.nvidia.com/display/SPACE/Page2

# Load without recursion
node scripts/load_confluence.js --no-recursive https://confluence.nvidia.com/display/SPACE/Page

# Set recursion depth
node scripts/load_confluence.js --depth 2 https://confluence.nvidia.com/display/SPACE/Page
```

#### 2. Using the Python script directly

```bash
# From a manifest file
python admin_load_confluence.py file manifest.txt --recursive

# Add pages directly
python admin_load_confluence.py add https://confluence.nvidia.com/display/SPACE/Page --recursive

# Search content
python admin_load_confluence.py search "your query here" --limit 5
```

#### 3. Using the API (for Admins)

POST to `/api/admin/confluence/load` with the following body:

```json
{
  "urls": ["https://confluence.nvidia.com/display/SPACE/Page"],
  "recursive": true,
  "depth": 3
}
```

### Searching Confluence Content

#### Using the API

POST to `/api/search/confluence` with the following body:

```json
{
  "query": "your search query",
  "limit": 5
}
```

### Running the Server

```bash
# Start the server
npm run dev
```

### Architecture

The integration consists of:

1. **Confluence Loader**: Python-based loader that extracts content from Confluence
2. **Header-Based Chunker**: Splits content into semantic chunks based on headers
3. **MongoDB Storage**: Stores content with graph relationships between chunks
4. **API Integration**: RESTful API for loading and searching content

### Admin Features

- Load and index Confluence pages
- Update Confluence credentials
- Search indexed content
- View statistics about indexed content

### Contributing

Please follow the established code style and patterns. Include proper error handling and tests for new features.