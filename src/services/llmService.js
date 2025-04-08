const { spawn } = require('child_process');
const path = require('path');

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
      systemPrompt || ''
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

// Simulated LLM knowledge base for AVOS-related queries (as a fallback)
const avosKnowledge = {
  'avos': 'AVOS (Autonomous Vehicle Operating System) is NVIDIA\'s comprehensive software stack designed for autonomous vehicles. It provides a flexible, scalable platform that integrates perception, planning, and control systems necessary for self-driving capabilities.',
  
  'drive': 'NVIDIA DRIVE is a platform that uses AVOS and is designed for developing autonomous vehicles. It includes both hardware (like the DRIVE AGX Orin system-on-a-chip) and software components that work together to enable self-driving capabilities.',
  
  'driveos': 'DriveOS is the operating system layer of NVIDIA\'s autonomous vehicle software stack. It provides a foundation for running autonomous driving applications, managing hardware resources, and ensuring real-time performance for critical driving functions.',
  
  'ndas': 'NDAS (NVIDIA Data Annotation System) is a tool for labeling and annotating sensor data collected from vehicles. It helps create training datasets for machine learning models used in autonomous driving systems.',
  
  'feature': 'AVOS includes many features such as:\n- Sensor fusion for combining data from cameras, radar, and lidar\n- Perception systems for object detection and classification\n- Planning and decision-making algorithms\n- Control systems for vehicle operation\n- Simulation capabilities for testing and validation\n- Over-the-air update functionality',
  
  'dtsi': 'In the context of DriveOS, a DTSI (Device Tree Source Include) file is used to describe hardware components and their properties. The "startupcmd" DTSI file specifically contains commands that are executed during system startup to configure hardware components and initialize services.',
  
  'steps': 'To integrate DriveOS changes into NDAS, you would typically follow these steps:\n1. Develop and test your changes in a DriveOS development environment\n2. Document the changes thoroughly\n3. Submit the changes through the code review process\n4. Work with the NDAS team to integrate and test the changes\n5. Monitor and validate the integration through regression testing',
};

// Function to get a simulated LLM response based on the knowledge base (as a fallback)
const getSimulatedResponse = (prompt, context = '') => {
  // Convert prompt to lowercase for easier matching
  const promptLower = prompt.toLowerCase();
  
  // Check for specific keywords in the prompt
  let response = "I don't have specific information about that aspect of AVOS. Could you ask something more general about AVOS capabilities or features?";
  
  // Try to find relevant information in our knowledge base
  for (const [keyword, info] of Object.entries(avosKnowledge)) {
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
    response = avosKnowledge['steps'];
  }
  
  // Special case for questions about DTSI files
  if (promptLower.includes('dtsi') && promptLower.includes('startupcmd')) {
    response = avosKnowledge['dtsi'];
  }
  
  return response;
};

// Main function to get a response from the LLM
const getLLMResponse = async (prompt, context = '') => {
  try {
    console.log('Getting LLM response for prompt:', prompt);
    
    // First, try to use the Python script to get a response
    try {
      const pythonResponse = await callPythonLLM(prompt, context);
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