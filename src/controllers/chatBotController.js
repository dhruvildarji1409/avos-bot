const ChatHistory = require('../models/ChatHistory');
const ConfluenceData = require('../models/ConfluenceData');
const User = require('../models/User');
const llmService = require('../services/llmService');
const { getEmbedding, computeSimilarity } = require('../services/embeddingService');
const { MAIN_SYSTEM_PROMPT, FALLBACK_RESPONSES } = require('../config/prompts');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

// Handle chat messages
exports.handleChatMessage = async (req, res) => {
  try {
    const { userId, message, sessionId } = req.body;
    
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
    
    // Find the user to associate with chat history
    let chatHistory = null;
    
    // If userId is a valid MongoDB ObjectId, try to find the user and their chat history
    if (mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const user = await User.findById(userId);
        if (user) {
          // Find chat history by user reference
          chatHistory = await ChatHistory.findOne({ user: user._id });
          
          // If no chat history found for this user, create a new one
          if (!chatHistory) {
            chatHistory = new ChatHistory({
              user: user._id,
              sessions: [],
              activeSessionId: null
            });
          }
        }
      } catch (err) {
        console.error('Error finding user:', err);
        // Continue to fallback method
      }
    }
    
    // Fallback to old method - find by userId string if we don't have a chat history yet
    if (!chatHistory) {
      chatHistory = await ChatHistory.findOne({ userId });
      
      // Create new chat history if none exists
      if (!chatHistory) {
        chatHistory = new ChatHistory({
          userId,
          sessions: [],
          activeSessionId: null
        });
      }
    }
    
    // Get active session or create new one if none exists
    let activeSession;
    let activeSessionId = sessionId || chatHistory.activeSessionId;
    
    if (activeSessionId) {
      activeSession = chatHistory.sessions.find(s => s.sessionId === activeSessionId);
    }
    
    // If no active session or specified session not found, create a new one
    if (!activeSession) {
      const newSessionId = uuidv4();
      activeSession = {
        sessionId: newSessionId,
        sessionName: `Chat ${new Date().toLocaleDateString()}`,
        messages: [],
        createdAt: new Date(),
        lastUpdatedAt: new Date()
      };
      
      chatHistory.sessions.push(activeSession);
      chatHistory.activeSessionId = newSessionId;
      activeSessionId = newSessionId;
    }
    
    // Add up to last 10 messages from the active session as conversation history
    const conversationHistory = activeSession.messages
      .slice(-10)
      .map(msg => ({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.message }));
    
    // Get response from LLM
    try {
      // Use the centralized system prompt with conversation history
      botReply = await llmService.getLLMResponse(message, context, MAIN_SYSTEM_PROMPT, conversationHistory);
      
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
    
    // Add user message to chat history
    activeSession.messages.push({
      sender: 'user',
      message: message,
      timestamp: new Date()
    });
    
    // Add bot reply to chat history
    activeSession.messages.push({
      sender: 'bot',
      message: botReply,
      timestamp: new Date()
    });
    
    // Update session's lastUpdatedAt
    activeSession.lastUpdatedAt = new Date();
    
    // Save updated chat history
    await chatHistory.save();
    
    res.json({ 
      reply: botReply,
      sessionId: activeSessionId
    });
  } catch (error) {
    console.error('Error handling chat message:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
}; 