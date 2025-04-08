const { spawn } = require('child_process');
const path = require('path');
const { DEFAULT_LLM_PROMPT, SIMULATED_KNOWLEDGE } = require('../config/prompts');

// Function to call the Python script for LLM responses
const callPythonLLM = async (prompt, context = '', systemPrompt = '') => {
  return new Promise((resolve, reject) => {
    // Path to the Python script
    const pythonScriptPath = path.join(__dirname, '..', 'llm_client.py');
    
    // Spawn a new Python process
    const pythonProcess = spawn('python3', [
      pythonScriptPath, 
      prompt,
      context || '', 
      systemPrompt || DEFAULT_LLM_PROMPT // Use default prompt if none provided
    ]);
    
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
        console.error(`Python process exited with code ${code}`);
        console.error(`Python stderr: ${dataFromStderr}`);
        
        // Fallback to simulated response if Python script fails
        const fallbackResponse = getSimulatedResponse(prompt, context);
        resolve(fallbackResponse);
      } else {
        resolve(dataFromStdout);
      }
    });
    
    // Handle potential errors
    pythonProcess.on('error', (error) => {
      console.error('Failed to start Python process:', error);
      
      // Fallback to simulated response if Python script fails to start
      const fallbackResponse = getSimulatedResponse(prompt, context);
      resolve(fallbackResponse);
    });
  });
};

// Function to get a simulated LLM response based on the knowledge base (as a fallback)
const getSimulatedResponse = (prompt, context = '') => {
  // Convert prompt to lowercase for easier matching
  const promptLower = prompt.toLowerCase();
  
  // Check for specific keywords in the prompt
  let response = "I don't have specific information about that aspect of AVOS. Could you ask something more general about AVOS capabilities or features?";
  
  // Try to find relevant information in our knowledge base
  for (const [keyword, info] of Object.entries(SIMULATED_KNOWLEDGE)) {
    if (promptLower.includes(keyword.toLowerCase())) {
      response = info;
      break;
    }
  }
  
  // Use context if available and we don't have a good response yet
  if (context && response.includes("I don't have specific information")) {
    response = `Based on the available information: ${context}\n\nHowever, please note that this information may be limited. For more detailed information, please consult the official NVIDIA AVOS documentation.`;
  }
  
  // Special case for questions about the relationship between DriveOS and NDAS
  if (promptLower.includes('driveos') && promptLower.includes('ndas')) {
    response = SIMULATED_KNOWLEDGE['steps'];
  }
  
  // Special case for questions about DTSI files
  if (promptLower.includes('dtsi') && promptLower.includes('startupcmd')) {
    response = SIMULATED_KNOWLEDGE['dtsi'];
  }
  
  return response;
};

// Main function to get a response from the LLM
const getLLMResponse = async (prompt, context = '', systemPrompt = '') => {
  try {
    console.log('Getting LLM response for prompt:', prompt);
    
    // First, try to use the Python script to get a response
    try {
      const pythonResponse = await callPythonLLM(prompt, context, systemPrompt);
      return pythonResponse;
    } catch (pythonError) {
      console.error('Error calling Python LLM script:', pythonError);
      
      // If Python script fails, fall back to simulated response
      return getSimulatedResponse(prompt, context);
    }
  } catch (error) {
    console.error('Error in LLM service:', error);
    return "I'm sorry, I encountered an error while processing your request. Please try again later.";
  }
};

module.exports = {
  getLLMResponse
}; 