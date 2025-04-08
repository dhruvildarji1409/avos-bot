const ChatHistory = require('../models/ChatHistory');
const ConfluenceData = require('../models/ConfluenceData');
const llmService = require('../services/llmService');
const { getEmbedding, computeSimilarity } = require('../services/embeddingService');
const { MAIN_SYSTEM_PROMPT, FALLBACK_RESPONSES } = require('../config/prompts');

// Handle chat messages
exports.handleChatMessage = async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId || !message) {
      return res.status(400).json({ error: 'UserId and message are required' });
    }
    
    let botReply = '';
    let context = '';
    let sources = [];
    
    // Generate embedding for the query
    const queryEmbedding = await getEmbedding(message);
    
    // First try semantic search with embeddings
    if (queryEmbedding && queryEmbedding.length > 0) {
      try {
        // Get all Confluence data
        const allData = await ConfluenceData.find({});
        
        // Calculate similarity scores
        const dataWithScores = allData.map(item => {
          let similarity = 0;
          
          if (item.embedding && item.embedding.length > 0) {
            similarity = computeSimilarity(queryEmbedding, item.embedding);
          }
          
          return {
            ...item.toObject(),
            score: similarity
          };
        });
        
        // Sort by similarity score
        const sortedData = dataWithScores.sort((a, b) => b.score - a.score);
        
        // Get top results with good scores
        const results = sortedData.filter(item => item.score > 0.6).slice(0, 3);
        
        if (results.length > 0) {
          // Build context from semantic search results
          context = results.map(result => {
            sources.push({
              title: result.title,
              url: result.url,
              score: result.score.toFixed(2)
            });
            
            return `Title: ${result.title}\nContent: ${result.processedContent || result.content}\nRelevance: ${result.score.toFixed(2)}`;
          }).join('\n\n');
        }
      } catch (error) {
        console.error('Error in semantic search:', error);
      }
    }
    
    // Fallback to traditional text search if semantic search returned no results
    if (!context) {
      try {
        const textResults = await ConfluenceData.find(
          { $text: { $search: message } },
          { score: { $meta: 'textScore' } }
        ).sort({ score: { $meta: 'textScore' } }).limit(3);
        
        if (textResults.length > 0) {
          // Build context from text search results
          context = textResults.map(result => {
            sources.push({
              title: result.title,
              url: result.url
            });
            
            return `Title: ${result.title}\nContent: ${result.processedContent || result.content}`;
          }).join('\n\n');
        }
      } catch (error) {
        console.error('Error in text search:', error);
      }
    }
    
    // Get response from LLM
    try {
      // Use the centralized system prompt
      botReply = await llmService.getLLMResponse(message, context, MAIN_SYSTEM_PROMPT);
      
      // Add source attribution if context was used
      if (sources.length > 0) {
        const uniqueSources = sources.filter((source, index, self) => 
          index === self.findIndex(s => s.url === source.url)
        );
        
        if (uniqueSources.length > 0 && !botReply.includes('Sources:')) {
          botReply += '\n\nSources:';
          uniqueSources.forEach(source => {
            botReply += `\n- [${source.title}](${source.url})`;
          });
        }
      }
    } catch (llmError) {
      console.error('Error getting LLM response:', llmError);
      
      // Fallback to predefined responses if LLM fails using centralized fallback responses
      const lowerCaseMessage = message.toLowerCase();
      if (lowerCaseMessage.includes('avos')) {
        botReply = FALLBACK_RESPONSES.avos;
      } else if (lowerCaseMessage.includes('help')) {
        botReply = FALLBACK_RESPONSES.help;
      } else if (lowerCaseMessage.includes('feature')) {
        botReply = FALLBACK_RESPONSES.feature;
      } else {
        botReply = FALLBACK_RESPONSES.default;
      }
    }
    
    // Find or create chat history for the user
    let chatHistory = await ChatHistory.findOne({ userId });
    
    if (!chatHistory) {
      chatHistory = new ChatHistory({ userId, messages: [] });
    }
    
    // Add user message to chat history
    chatHistory.messages.push({
      sender: 'user',
      message: message,
    });
    
    // Add bot reply to chat history
    chatHistory.messages.push({
      sender: 'bot',
      message: botReply,
    });
    
    // Save updated chat history
    await chatHistory.save();
    
    res.json({ reply: botReply });
  } catch (error) {
    console.error('Error handling chat message:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
}; 