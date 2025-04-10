#!/bin/bash

# Test script for Confluence loader with OpenAI authentication
# This script demonstrates how to use the Confluence loader with sample pages

# Set up environment
echo "Setting up environment..."
source .env 2>/dev/null || echo "Warning: .env file not found, using environment variables"

# Check if OpenAI API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: OPENAI_API_KEY is not set"
    echo "Please set it in the .env file or export it"
    exit 1
fi

# Check if Confluence credentials are set
if [ -z "$CONFLUENCE_USERNAME" ] || [ -z "$CONFLUENCE_PASSWORD" ]; then
    echo "Error: Confluence credentials are not set"
    echo "Please set CONFLUENCE_USERNAME and CONFLUENCE_PASSWORD in the .env file"
    exit 1
fi

# Check if MongoDB is running
echo "Checking MongoDB status..."
mongo --eval "db.stats()" >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Error: MongoDB is not running"
    echo "Please start MongoDB before running this script"
    exit 1
fi

# Create a test manifest file
echo "Creating test manifest file..."
cat > manifest.txt << EOF
https://confluence.nvidia.com/display/DRIVEOS/DriveOS+Hypervisor
EOF

echo "Test URLs added to manifest.txt:"
cat manifest.txt

# Run the Confluence loader
echo -e "\nRunning Confluence loader..."
python3 confluence_loader.py

# Check if the loader was successful
if [ $? -ne 0 ]; then
    echo "Error: Confluence loader failed"
    exit 1
fi

# Run a test search
echo -e "\nTesting search functionality..."
python3 admin_load_confluence.py search "hypervisor features" --limit 3

echo -e "\nTest completed successfully!"
echo "You can now use the following commands for further testing:"
echo "- python3 admin_load_confluence.py add [URL] --recursive"
echo "- python3 admin_load_confluence.py file manifest.txt --recursive"
echo "- python3 admin_load_confluence.py search \"your query\""

exit 0 