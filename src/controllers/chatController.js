const ChatHistory = require('../models/ChatHistory');
const crypto = require('crypto');

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