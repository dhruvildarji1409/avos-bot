/**
 * MCP API Explorer
 * 
 * This script helps explore the available API endpoints of a running MCP Inspector server
 * to understand how to interact with it properly.
 */

require('dotenv').config();
const axios = require('axios');

// Define the base URLs for the MCP Inspector
const UI_PORT = 6274;
const API_PORT = 6277;
const UI_BASE_URL = `http://localhost:${UI_PORT}`;
const API_BASE_URL = `http://localhost:${API_PORT}`;

// List of endpoints to check
const endpointsToCheck = [
  // MCP Inspector UI endpoints
  { url: `${UI_BASE_URL}/`, method: 'GET', description: 'UI Home' },
  { url: `${UI_BASE_URL}/api/status`, method: 'GET', description: 'UI API Status' },
  
  // MCP Inspector API endpoints
  { url: `${API_BASE_URL}/`, method: 'GET', description: 'API Root' },
  { url: `${API_BASE_URL}/inspector`, method: 'GET', description: 'Inspector Status' },
  { url: `${API_BASE_URL}/api/v1/status`, method: 'GET', description: 'API Status' },
  { url: `${API_BASE_URL}/api/v1/tools`, method: 'GET', description: 'List Tools' },
  { url: `${API_BASE_URL}/api/v1/execute`, method: 'POST', description: 'Execute', data: {
    conversation_id: "test-" + Date.now(),
    conversation_history: [{
      role: "user",
      content: "Test execution"
    }]
  }},
  
  // Try common MCP paths
  { url: `${API_BASE_URL}/mcp/v1/tools`, method: 'GET', description: 'MCP Tools' },
  { url: `${API_BASE_URL}/mcp/v1/resources`, method: 'GET', description: 'MCP Resources' },
  { url: `${API_BASE_URL}/mcp/v1/prompts`, method: 'GET', description: 'MCP Prompts' },
  
  // Try with different path structures
  { url: `${API_BASE_URL}/tools`, method: 'GET', description: 'Root Tools' },
  { url: `${API_BASE_URL}/resources`, method: 'GET', description: 'Root Resources' },
  { url: `${API_BASE_URL}/prompts`, method: 'GET', description: 'Root Prompts' },
];

// Function to check if an endpoint is accessible
async function checkEndpoint(endpoint) {
  try {
    const config = {
      method: endpoint.method,
      url: endpoint.url,
      timeout: 3000,
      validateStatus: function (status) {
        return true; // Accept any status code
      }
    };
    
    // Add data for POST requests
    if (endpoint.method === 'POST' && endpoint.data) {
      config.data = endpoint.data;
      config.headers = {
        'Content-Type': 'application/json'
      };
    }
    
    const response = await axios(config);
    
    console.log(`\n--- ${endpoint.description} (${endpoint.method} ${endpoint.url}) ---`);
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    // Show headers if available
    if (response.headers) {
      console.log('Headers:', JSON.stringify(response.headers, null, 2));
    }
    
    // Show data if available and it's not too large
    if (response.data) {
      const dataStr = typeof response.data === 'string' 
        ? response.data 
        : JSON.stringify(response.data, null, 2);
        
      if (dataStr.length > 500) {
        // If data is large, show a preview
        console.log('Data (preview):', dataStr.substring(0, 500) + '...');
      } else {
        console.log('Data:', dataStr);
      }
    }
    
    // Check if this endpoint responds with valid data
    const isSuccessful = response.status >= 200 && response.status < 300;
    if (isSuccessful) {
      console.log('✅ Endpoint accessible');
      return true;
    } else {
      console.log('❌ Endpoint returned non-success status code');
      return false;
    }
  } catch (error) {
    console.log(`\n--- ${endpoint.description} (${endpoint.method} ${endpoint.url}) ---`);
    console.log('❌ Error:', error.message);
    return false;
  }
}

// Try accessing the SSE endpoint which is commonly used for MCP
async function checkSseEndpoint() {
  console.log('\n--- Testing SSE endpoint ---');
  try {
    const { EventSource } = require('eventsource');
    const sseUrl = `${API_BASE_URL}/sse`;
    
    console.log(`Connecting to SSE endpoint: ${sseUrl}`);
    
    return new Promise((resolve) => {
      const eventSource = new EventSource(sseUrl);
      
      // Set a timeout to close the connection after a few seconds
      const timeout = setTimeout(() => {
        console.log('Closing SSE connection after timeout');
        eventSource.close();
        resolve(false);
      }, 5000);
      
      eventSource.onopen = () => {
        console.log('✅ SSE connection established');
        clearTimeout(timeout);
        
        // Close after successful connection
        setTimeout(() => {
          eventSource.close();
          resolve(true);
        }, 1000);
      };
      
      eventSource.onerror = (error) => {
        console.log('❌ SSE connection error:', error);
        clearTimeout(timeout);
        eventSource.close();
        resolve(false);
      };
      
      eventSource.onmessage = (event) => {
        console.log('Received SSE message:', event.data);
      };
    });
  } catch (error) {
    console.log('❌ Error setting up SSE connection:', error.message);
    return false;
  }
}

// Try to send a confluence search request directly to commonly used endpoints
async function tryConfluenceSearch() {
  console.log('\n--- Trying Confluence Search Directly ---');
  
  const searchEndpoints = [
    `${API_BASE_URL}/api/v1/tools/mcp_confluence_confluence_search`,
    `${API_BASE_URL}/mcp/v1/tools/mcp_confluence_confluence_search`,
    `${API_BASE_URL}/tools/mcp_confluence_confluence_search`,
    `${API_BASE_URL}/mcp_confluence_confluence_search`
  ];
  
  const searchData = {
    query: 'AVOS',
    limit: 2
  };
  
  for (const endpoint of searchEndpoints) {
    try {
      console.log(`\nTrying endpoint: ${endpoint}`);
      const response = await axios.post(endpoint, searchData, {
        timeout: 5000,
        validateStatus: function (status) {
          return true; // Accept any status code
        }
      });
      
      console.log(`Status: ${response.status} ${response.statusText}`);
      
      // Show data if available
      if (response.data) {
        console.log('Response data:', JSON.stringify(response.data, null, 2).substring(0, 500));
      }
      
      if (response.status >= 200 && response.status < 300) {
        console.log('✅ Search request succeeded');
      } else {
        console.log('❌ Search request failed with status code');
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }
}

// Main function to check all endpoints
async function exploreApi() {
  console.log('=================================');
  console.log('Starting MCP API Exploration');
  console.log('=================================');
  
  let accessibleEndpoints = 0;
  
  // Check UI and API server status
  console.log('\n--- Checking Server Status ---');
  try {
    const uiResponse = await axios.get(UI_BASE_URL, { timeout: 2000, validateStatus: () => true });
    console.log(`UI Server (${UI_PORT}): ${uiResponse.status === 200 ? '✅ Running' : '❌ Not accessible'}`);
  } catch (error) {
    console.log(`UI Server (${UI_PORT}): ❌ Not accessible - ${error.message}`);
  }
  
  try {
    const apiResponse = await axios.get(`${API_BASE_URL}/inspector`, { timeout: 2000, validateStatus: () => true });
    console.log(`API Server (${API_PORT}): ${apiResponse.status === 200 ? '✅ Running' : '❌ Not accessible'}`);
  } catch (error) {
    console.log(`API Server (${API_PORT}): ❌ Not accessible - ${error.message}`);
  }
  
  // Check all endpoints
  for (const endpoint of endpointsToCheck) {
    const isAccessible = await checkEndpoint(endpoint);
    if (isAccessible) {
      accessibleEndpoints++;
    }
  }
  
  // Check SSE endpoint
  const isSseAccessible = await checkSseEndpoint();
  if (isSseAccessible) {
    accessibleEndpoints++;
  }
  
  // Try direct confluence search
  await tryConfluenceSearch();
  
  console.log('\n=================================');
  console.log(`API Exploration Completed`);
  console.log(`${accessibleEndpoints} accessible endpoints found`);
  console.log('=================================');
}

// Run the exploration
exploreApi().catch(console.error); 