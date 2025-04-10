#!/bin/bash

# Start AVOS-bot with MCP-Confluence integration
# This script handles starting both the MCP-Confluence service and the main AVOS-bot

# Configuration
MCP_PATH="/home/nvidia/dhruvil/git/mcp-confluence"
AVOS_PATH="$(pwd)"

# Check if MCP Confluence directory exists
if [ ! -d "$MCP_PATH" ]; then
    echo "Error: MCP Confluence directory not found at $MCP_PATH"
    echo "Please update the path in this script or in .env file"
    exit 1
fi

# Function to check if a process is running on a specific port
check_port() {
    local port=$1
    if command -v lsof &> /dev/null; then
        lsof -i :$port > /dev/null
        return $?
    else
        netstat -tuln | grep ":$port " > /dev/null
        return $?
    fi
}

# Check if MCP service is already running
if check_port 6277; then
    echo "MCP service is already running on port 6277"
    echo "Using the existing MCP service"
else
    echo "Starting MCP Confluence service from $MCP_PATH"
    
    # Start MCP Confluence in a new terminal window/tab if possible
    if command -v gnome-terminal &> /dev/null; then
        # Linux with GNOME
        gnome-terminal -- bash -c "cd '$MCP_PATH' && npx @modelcontextprotocol/inspector uv run mcp-confluence --confluence-url=https://confluence.nvidia.com --confluence-username=${CONFLUENCE_USERNAME:-''} --confluence-personal-token=${CONFLUENCE_PERSONAL_TOKEN:-''}; read -p 'Press Enter to close...'"
    elif command -v x-terminal-emulator &> /dev/null; then
        # Generic Linux
        x-terminal-emulator -e "bash -c \"cd '$MCP_PATH' && npx @modelcontextprotocol/inspector uv run mcp-confluence --confluence-url=https://confluence.nvidia.com --confluence-username=${CONFLUENCE_USERNAME:-''} --confluence-personal-token=${CONFLUENCE_PERSONAL_TOKEN:-''}; read -p 'Press Enter to close...'\""
    elif command -v open &> /dev/null && [ "$(uname)" == "Darwin" ]; then
        # macOS
        osascript -e "tell application \"Terminal\" to do script \"cd '$MCP_PATH' && npx @modelcontextprotocol/inspector uv run mcp-confluence --confluence-url=https://confluence.nvidia.com --confluence-username=${CONFLUENCE_USERNAME:-''} --confluence-personal-token=${CONFLUENCE_PERSONAL_TOKEN:-''}\""
    else
        # Fallback: start in background
        echo "Starting MCP Confluence in background..."
        cd "$MCP_PATH" && npx @modelcontextprotocol/inspector uv run mcp-confluence --confluence-url=https://confluence.nvidia.com --confluence-username=${CONFLUENCE_USERNAME:-''} --confluence-personal-token=${CONFLUENCE_PERSONAL_TOKEN:-''} &
        # Give it time to start
        sleep 5
        cd "$AVOS_PATH"
    fi
    
    # Wait for MCP service to start
    echo "Waiting for MCP service to start..."
    max_attempts=10
    attempts=0
    
    while ! check_port 6277 && [ $attempts -lt $max_attempts ]; do
        attempts=$((attempts + 1))
        echo "Waiting for MCP service to start (attempt $attempts/$max_attempts)..."
        sleep 2
    done
    
    if ! check_port 6277; then
        echo "Warning: MCP service hasn't started properly. AVOS-bot will fall back to mock mode."
    else
        echo "MCP service is now running!"
    fi
fi

# Start the AVOS-bot
echo "Starting AVOS-bot..."
cd "$AVOS_PATH"
npm start 