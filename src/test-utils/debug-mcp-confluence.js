/**
 * MCP Confluence Diagnostics
 * 
 * This script helps diagnose issues with the MCP Confluence integration
 * by checking connection, listing available tools, and performing test calls.
 */

require('dotenv').config();
const axios = require('axios');
const mcpClient = require('./utils/mcpClient');
const fs = require('fs');

// Configuration
const API_PORT = 6277; // Default proxy port for MCP Inspector
const UI_PORT = 6274;  // Default UI port for MCP Inspector
const MCP_CONFLUENCE_PATH = '/home/nvidia/dhruvil/git/mcp-confluence'; // Path to working mcp-confluence

async function checkServerStatus() {
  console.log('\n=== MCP Inspector Server Status ===');
  
  try {
    // Check if the mcp-confluence path exists
    if (fs.existsSync(MCP_CONFLUENCE_PATH)) {
      console.log(`✅ MCP Confluence directory exists at: ${MCP_CONFLUENCE_PATH}`);
    } else {
      console.log(`❌ MCP Confluence directory NOT found at: ${MCP_CONFLUENCE_PATH}`);
    }
    
    // Check if the server is running by trying to connect to the inspector UI
    const response = await axios.get(`http://localhost:${UI_PORT}`, { 
      timeout: 2000,
      validateStatus: function() { return true; } // Accept any status code
    });
    
    console.log(`✅ MCP Inspector UI is running on port ${UI_PORT}`);
    console.log(`Response status: ${response.status}`);
    
    // Now check the API port
    try {
      const apiResponse = await axios.get(`http://localhost:${API_PORT}/inspector`, { 
        timeout: 2000,
        validateStatus: function() { return true; } 
      });
      console.log(`✅ MCP Proxy Server is running on port ${API_PORT}`);
      console.log(`Response status: ${apiResponse.status}`);
    } catch (apiError) {
      console.log(`❌ MCP Proxy Server is NOT running on port ${API_PORT}`);
      console.log(`Error: ${apiError.message}`);
    }
  } catch (error) {
    console.log(`❌ MCP Inspector UI is NOT running on port ${UI_PORT}`);
    console.log(`Error: ${error.message}`);
  }
}

async function listAvailableTools() {
  console.log('\n=== Available MCP Tools ===');
  
  try {
    const response = await axios.get(`http://localhost:${API_PORT}/api/v1/tools`, { 
      timeout: 3000,
      validateStatus: function() { return true; } 
    });
    
    if (response.status === 200 && response.data && Array.isArray(response.data)) {
      console.log(`Found ${response.data.length} tools:`);
      response.data.forEach((tool, index) => {
        console.log(`${index + 1}. ${tool.name}`);
        if (tool.description) {
          console.log(`   Description: ${tool.description}`);
        }
        if (tool.parameters) {
          console.log(`   Parameters: ${Object.keys(tool.parameters).join(', ')}`);
        }
        console.log();
      });
      
      // Look specifically for Confluence tools
      const confluenceTools = response.data.filter(tool => tool.name.includes('confluence'));
      if (confluenceTools.length > 0) {
        console.log(`✅ Found ${confluenceTools.length} Confluence tools.`);
        return confluenceTools;
      } else {
        console.log('❌ No Confluence tools found. The MCP-Confluence server might not be properly configured.');
        return [];
      }
    } else {
      console.log(`❌ Failed to list tools. Status: ${response.status}`);
      console.log(response.data || 'No data returned');
      return [];
    }
  } catch (error) {
    console.log(`❌ Error listing tools: ${error.message}`);
    return [];
  }
}

async function testDirectToolAccess(tools) {
  console.log('\n=== Testing Direct Tool Access ===');
  
  if (!tools || tools.length === 0) {
    console.log('No Confluence tools available to test');
    return;
  }
  
  // Find search tool
  const searchTool = tools.find(t => t.name.includes('search'));
  if (searchTool) {
    console.log(`Testing direct access to ${searchTool.name}`);
    try {
      const response = await axios.post(
        `http://localhost:${API_PORT}/api/v1/tools/${searchTool.name}`, 
        { query: 'AVOS', limit: 2 }
      );
      
      if (response.status === 200) {
        console.log('✅ Direct tool access successful!');
        console.log('Sample results:', JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
      } else {
        console.log(`❌ Direct tool access failed with status: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Error with direct tool access: ${error.message}`);
    }
  } else {
    console.log('No search tool found for testing');
  }
}

async function testMcpClient() {
  console.log('\n=== Testing MCP Client ===');
  
  try {
    // Initialize the client
    console.log('Initializing MCP client...');
    await mcpClient.initialize();
    
    console.log('MCP client initialized successfully.');
    console.log(`Mock mode: ${mcpClient.isMockMode ? 'ON' : 'OFF'}`);
    console.log(`External mode: ${mcpClient.externalMcpMode ? 'ON' : 'OFF'}`);
    
    // If not in mock mode, try to list tools
    if (!mcpClient.isMockMode) {
      const tools = await mcpClient.listTools();
      console.log(`Found ${tools.length} tools through the client.`);
      
      // Try a simple search if tools are available
      if (tools.length > 0 && tools.some(t => t.name.includes('confluence_search'))) {
        console.log('\nTesting Confluence search...');
        const searchTool = tools.find(t => t.name.includes('confluence_search'));
        const searchResult = await mcpClient.call(searchTool.name, { query: 'AVOS', limit: 2 });
        console.log('Search results:', JSON.stringify(searchResult, null, 2));
      }
    }
  } catch (error) {
    console.log(`❌ Error testing MCP client: ${error.message}`);
  }
}

async function runDiagnostics() {
  console.log('==================================');
  console.log('MCP Confluence Diagnostics');
  console.log('==================================');
  
  // Print environment info
  console.log('\n=== Environment ===');
  console.log(`CONFLUENCE_HOST: ${process.env.CONFLUENCE_HOST || 'Not set'}`);
  console.log(`CONFLUENCE_USERNAME: ${process.env.CONFLUENCE_USERNAME ? '✅ Set' : '❌ Not set'}`);
  console.log(`CONFLUENCE_API_TOKEN: ${process.env.CONFLUENCE_API_TOKEN ? '✅ Set' : '❌ Not set'}`);
  
  // Check server status
  await checkServerStatus();
  
  // List available tools
  const tools = await listAvailableTools();
  
  // Test direct tool access
  await testDirectToolAccess(tools);
  
  // Test the client
  await testMcpClient();
  
  console.log('\n==================================');
  console.log('Diagnostics completed');
  console.log('==================================');
}

// Run the diagnostics
runDiagnostics().catch(console.error); 