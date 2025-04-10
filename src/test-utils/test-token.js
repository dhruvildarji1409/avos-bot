const { getLLMResponse } = require('./services/llmService');

async function testToken() {
  try {
    console.log('Testing LLM token and API connection...');
    
    const response = await getLLMResponse('What is AVOS?');
    
    console.log('API Response:');
    console.log(response);
    console.log('\nConnection test completed successfully!');
  } catch (error) {
    console.error('Error testing token:', error);
  }
}

testToken(); 