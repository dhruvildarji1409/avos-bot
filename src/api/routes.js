const express = require('express');
const chatController = require('../controllers/chatController');
const chatBotController = require('../controllers/chatBotController');
const confluenceController = require('../controllers/confluenceController');

const router = express.Router();

// Chat history routes
router.post('/chat-history', chatController.createChatHistory);
router.get('/chat-history/:userId', chatController.getChatHistory);
router.delete('/chat-history/:userId', chatController.deleteChatHistory);

// Enhanced sharing routes
router.post('/chat-history/share', chatController.shareChatHistory);
router.get('/chat-history/shared/:userId', chatController.getSharedChatHistories);
router.post('/chat-history/:userId/share', chatController.generateShareableLink);
router.get('/chat-history/token/:token', chatController.getChatHistoryByShareToken);

// Chat bot route
router.post('/chat', chatBotController.handleChatMessage);

// Confluence data routes
router.post('/confluence', confluenceController.addConfluenceData);
router.get('/confluence/search', confluenceController.searchConfluenceData);
router.post('/confluence/fetch', confluenceController.fetchAndStoreConfluenceData);
router.get('/confluence/:id', confluenceController.getConfluenceData);

module.exports = router; 