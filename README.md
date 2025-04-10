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