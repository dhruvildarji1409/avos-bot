const ChatHistory = require('../models/ChatHistory');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const User = require('../models/User');

// Create a new chat history
exports.createChatHistory = async (req, res) => {
  try {
    const { userId, messages } = req.body;
    const chatHistory = new ChatHistory({ userId, messages });
    await chatHistory.save();
    res.status(201).json(chatHistory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create chat history' });
  }
};

// Retrieve chat history by user ID
exports.getChatHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const chatHistory = await ChatHistory.findOne({ userId });
    if (!chatHistory) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    res.json(chatHistory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve chat history' });
  }
};

// Share chat history with another user
exports.shareChatHistory = async (req, res) => {
  try {
    const { userId, shareWithUserId } = req.body;
    const chatHistory = await ChatHistory.findOne({ userId });
    if (!chatHistory) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    // Add user to sharedWith array if not already present
    if (!chatHistory.sharedWith.includes(shareWithUserId)) {
      chatHistory.sharedWith.push(shareWithUserId);
      await chatHistory.save();
    }
    
    res.json(chatHistory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to share chat history' });
  }
};

// Get shared chat histories for a user
exports.getSharedChatHistories = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find chat histories shared with this user
    const sharedHistories = await ChatHistory.find({ sharedWith: userId });
    
    res.json(sharedHistories);
  } catch (error) {
    console.error('Error retrieving shared chat histories:', error);
    res.status(500).json({ error: 'Failed to retrieve shared chat histories' });
  }
};

// Generate shareable link for a chat history
exports.generateShareableLink = async (req, res) => {
  try {
    const { userId } = req.params;
    const { expiration } = req.body; // Optional: expiration time in hours
    
    const chatHistory = await ChatHistory.findOne({ userId });
    if (!chatHistory) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    // Generate a random token
    const shareToken = crypto.randomBytes(16).toString('hex');
    
    // Set expiration time if provided (default to 7 days)
    const expirationTime = expiration 
      ? new Date(Date.now() + expiration * 60 * 60 * 1000) // Convert hours to milliseconds
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);    // 7 days default
    
    // Add share info to chat history
    chatHistory.shareToken = shareToken;
    chatHistory.shareExpiration = expirationTime;
    
    await chatHistory.save();
    
    res.json({ 
      userId, 
      shareToken, 
      shareExpiration: expirationTime,
      shareUrl: `${process.env.APP_URL || ''}/chat?share=${shareToken}`
    });
  } catch (error) {
    console.error('Error generating shareable link:', error);
    res.status(500).json({ error: 'Failed to generate shareable link' });
  }
};

// Get chat history by share token
exports.getChatHistoryByShareToken = async (req, res) => {
  try {
    const { token } = req.params;
    
    const chatHistory = await ChatHistory.findOne({ 
      shareToken: token,
      shareExpiration: { $gt: new Date() } // Check if token hasn't expired
    });
    
    if (!chatHistory) {
      return res.status(404).json({ error: 'Shared chat history not found or has expired' });
    }
    
    res.json(chatHistory);
  } catch (error) {
    console.error('Error retrieving shared chat history:', error);
    res.status(500).json({ error: 'Failed to retrieve shared chat history' });
  }
};

// Delete chat history
exports.deleteChatHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await ChatHistory.deleteOne({ userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    res.json({ message: 'Chat history deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat history:', error);
    res.status(500).json({ error: 'Failed to delete chat history' });
  }
};

// Get all chat sessions for a user
exports.getUserChatSessions = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'UserId is required' });
    }
    
    let chatHistory = null;
    
    // If userId is a valid MongoDB ObjectId, try to find the user and their chat history
    if (mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const user = await User.findById(userId);
        if (user) {
          // Find chat history by user reference
          chatHistory = await ChatHistory.findOne({ user: user._id });
        }
      } catch (err) {
        console.error('Error finding user:', err);
        // Continue to fallback method
      }
    }
    
    // Fallback to old method - find by userId string if we don't have a chat history yet
    if (!chatHistory) {
      chatHistory = await ChatHistory.findOne({ userId });
    }
    
    if (!chatHistory) {
      return res.json({ 
        sessions: [],
        activeSessionId: null
      });
    }
    
    // Return simplified session information
    const sessions = chatHistory.sessions.map(session => ({
      sessionId: session.sessionId,
      sessionName: session.sessionName,
      firstMessage: session.messages.length > 0 ? session.messages[0].message : '',
      messagesCount: session.messages.length,
      lastUpdatedAt: session.lastUpdatedAt
    }));
    
    res.json({
      sessions,
      activeSessionId: chatHistory.activeSessionId
    });
  } catch (error) {
    console.error('Error getting user chat sessions:', error);
    res.status(500).json({ error: 'Failed to get user chat sessions' });
  }
};

// Create a new chat session
exports.createChatSession = async (req, res) => {
  try {
    const { userId, sessionName } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'UserId is required' });
    }
    
    const sessionId = uuidv4();
    let chatHistory = null;
    
    // If userId is a valid MongoDB ObjectId, try to find the user and their chat history
    if (mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const user = await User.findById(userId);
        if (user) {
          // Find chat history by user reference
          chatHistory = await ChatHistory.findOne({ user: user._id });
          
          // If found, proceed with this chat history
          if (chatHistory) {
            // Create a new session
            const newSession = {
              sessionId,
              sessionName: sessionName || `Chat ${new Date().toLocaleDateString()}`,
              messages: [],
              createdAt: new Date(),
              lastUpdatedAt: new Date()
            };
            
            chatHistory.sessions.push(newSession);
            chatHistory.activeSessionId = sessionId;
            await chatHistory.save();
            
            return res.json({
              sessionId,
              sessionName: newSession.sessionName,
              activeSessionId: sessionId
            });
          } else {
            // Create new chat history for this user
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
    
    // Fallback: If we don't have a chat history yet (no valid user found or error occurred)
    // Try to find by userId string
    if (!chatHistory) {
      chatHistory = await ChatHistory.findOne({ userId });
      
      // If still no chat history, create one with userId
      if (!chatHistory) {
        chatHistory = new ChatHistory({
          userId,
          sessions: [],
          activeSessionId: null
        });
      }
    }
    
    // Create a new session
    const newSession = {
      sessionId,
      sessionName: sessionName || `Chat ${new Date().toLocaleDateString()}`,
      messages: [],
      createdAt: new Date(),
      lastUpdatedAt: new Date()
    };
    
    // Add the new session to the user's sessions
    chatHistory.sessions.push(newSession);
    
    // Set it as the active session
    chatHistory.activeSessionId = sessionId;
    
    // Save the updated chat history
    await chatHistory.save();
    
    res.json({
      sessionId,
      sessionName: newSession.sessionName,
      activeSessionId: sessionId
    });
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({ error: 'Failed to create chat session' });
  }
};

// Get messages for a specific chat session
exports.getChatSessionMessages = async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    
    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'UserId and sessionId are required' });
    }
    
    // Find the user and chat history
    let user;
    let chatHistory = null;
    
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      
      if (user) {
        // Find chat history by user reference
        chatHistory = await ChatHistory.findOne({ user: user._id });
      }
    }
    
    // Fallback to old method - find by userId string if we don't have a chat history yet
    if (!chatHistory) {
      chatHistory = await ChatHistory.findOne({ userId });
    }
    
    if (!chatHistory) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    // Find the specific session
    const session = chatHistory.sessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }
    
    // Update the active session
    chatHistory.activeSessionId = sessionId;
    await chatHistory.save();
    
    res.json({
      sessionId,
      sessionName: session.sessionName,
      messages: session.messages
    });
  } catch (error) {
    console.error('Error getting chat session messages:', error);
    res.status(500).json({ error: 'Failed to get chat session messages' });
  }
};

// Set active chat session
exports.setActiveSession = async (req, res) => {
  try {
    const { userId, sessionId } = req.body;
    
    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'UserId and sessionId are required' });
    }
    
    // Find the user and chat history
    let user;
    let chatHistory = null;
    
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      
      if (user) {
        // Find chat history by user reference
        chatHistory = await ChatHistory.findOne({ user: user._id });
      }
    }
    
    // Fallback to old method - find by userId string if we don't have a chat history yet
    if (!chatHistory) {
      chatHistory = await ChatHistory.findOne({ userId });
    }
    
    if (!chatHistory) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    // Make sure the session exists
    const sessionExists = chatHistory.sessions.some(s => s.sessionId === sessionId);
    
    if (!sessionExists) {
      return res.status(404).json({ error: 'Chat session not found' });
    }
    
    // Update the active session
    chatHistory.activeSessionId = sessionId;
    await chatHistory.save();
    
    res.json({ success: true, activeSessionId: sessionId });
  } catch (error) {
    console.error('Error setting active chat session:', error);
    res.status(500).json({ error: 'Failed to set active chat session' });
  }
};

// Clear a chat session (delete all messages)
exports.clearChatSession = async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    
    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'UserId and sessionId are required' });
    }
    
    // Find the user and chat history
    let user;
    let chatHistory = null;
    
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      
      if (user) {
        // Find chat history by user reference
        chatHistory = await ChatHistory.findOne({ user: user._id });
      }
    }
    
    // Fallback to old method - find by userId string if we don't have a chat history yet
    if (!chatHistory) {
      chatHistory = await ChatHistory.findOne({ userId });
    }
    
    if (!chatHistory) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    // Find the session index
    const sessionIndex = chatHistory.sessions.findIndex(s => s.sessionId === sessionId);
    
    if (sessionIndex === -1) {
      return res.status(404).json({ error: 'Chat session not found' });
    }
    
    // Clear messages while keeping the session
    chatHistory.sessions[sessionIndex].messages = [];
    chatHistory.sessions[sessionIndex].lastUpdatedAt = new Date();
    
    await chatHistory.save();
    
    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Error clearing chat session:', error);
    res.status(500).json({ error: 'Failed to clear chat session' });
  }
};

// Delete a chat session
exports.deleteChatSession = async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    
    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'UserId and sessionId are required' });
    }
    
    // Find the user and chat history
    let user;
    let chatHistory = null;
    
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      
      if (user) {
        // Find chat history by user reference
        chatHistory = await ChatHistory.findOne({ user: user._id });
      }
    }
    
    // Fallback to old method - find by userId string if we don't have a chat history yet
    if (!chatHistory) {
      chatHistory = await ChatHistory.findOne({ userId });
    }
    
    if (!chatHistory) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    // Remove the session
    chatHistory.sessions = chatHistory.sessions.filter(s => s.sessionId !== sessionId);
    
    // Update active session if it was the deleted one
    if (chatHistory.activeSessionId === sessionId) {
      // Set to newest session or null if no sessions left
      chatHistory.activeSessionId = chatHistory.sessions.length > 0 
        ? chatHistory.sessions[0].sessionId 
        : null;
    }
    
    await chatHistory.save();
    
    res.json({ 
      success: true, 
      activeSessionId: chatHistory.activeSessionId
    });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    res.status(500).json({ error: 'Failed to delete chat session' });
  }
};

// Rename a chat session
exports.renameChatSession = async (req, res) => {
  try {
    const { userId, sessionId, newName } = req.body;
    
    if (!userId || !sessionId || !newName) {
      return res.status(400).json({ error: 'UserId, sessionId, and newName are required' });
    }
    
    // Find the user and chat history
    let user;
    let chatHistory = null;
    
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
      
      if (user) {
        // Find chat history by user reference
        chatHistory = await ChatHistory.findOne({ user: user._id });
      }
    }
    
    // Fallback to old method - find by userId string if we don't have a chat history yet
    if (!chatHistory) {
      chatHistory = await ChatHistory.findOne({ userId });
    }
    
    if (!chatHistory) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    // Find the session
    const session = chatHistory.sessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }
    
    // Update the session name
    session.sessionName = newName;
    await chatHistory.save();
    
    res.json({ success: true, sessionId, sessionName: newName });
  } catch (error) {
    console.error('Error renaming chat session:', error);
    res.status(500).json({ error: 'Failed to rename chat session' });
  }
}; 