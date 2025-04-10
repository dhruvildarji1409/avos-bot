const express = require('express');
const chatController = require('../controllers/chatController');
const chatBotController = require('../controllers/chatBotController');
const confluenceController = require('../controllers/confluenceController');
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const confluenceMcpController = require('../controllers/confluenceMcpController');

const router = express.Router();

// Auth routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', authMiddleware, authController.getCurrentUser);

// Chat history routes - protected
router.post('/chat-history', authMiddleware, chatController.createChatHistory);
router.get('/chat-history/:userId', chatController.getChatHistory); // Keep public for shared chats
router.delete('/chat-history/:userId', authMiddleware, chatController.deleteChatHistory);

// Enhanced sharing routes
router.post('/chat-history/share', authMiddleware, chatController.shareChatHistory);
router.get('/chat-history/shared/:userId', authMiddleware, chatController.getSharedChatHistories);
router.post('/chat-history/:userId/share', chatController.generateShareableLink); // Keep public for shared links
router.get('/chat-history/token/:token', chatController.getChatHistoryByShareToken); // Keep public for share tokens

// Chat bot route - protected for logged in users, but allow anonymous
router.post('/chat', chatBotController.handleChatMessage);

// Chat Session routes - protected
router.get('/chat-sessions/:userId', authMiddleware, chatController.getUserChatSessions);
router.post('/chat-sessions', authMiddleware, chatController.createChatSession);
router.get('/chat-sessions/:userId/:sessionId', authMiddleware, chatController.getChatSessionMessages);
router.post('/chat-sessions/set-active', authMiddleware, chatController.setActiveSession);
router.delete('/chat-sessions/:userId/:sessionId', authMiddleware, chatController.deleteChatSession);
router.put('/chat-sessions/:userId/:sessionId/clear', authMiddleware, chatController.clearChatSession);
router.put('/chat-sessions/rename', authMiddleware, chatController.renameChatSession);

// Confluence data routes - protected
router.post('/confluence', authMiddleware, confluenceController.addConfluenceData);
router.get('/confluence/search', confluenceController.searchConfluence); // Keep public for searching
router.post('/confluence/fetch', authMiddleware, confluenceController.fetchAndStoreConfluenceData);
router.get('/confluence/:id', confluenceController.getConfluenceData); // Keep public for viewing

// Confluence admin routes (all public for now for testing)
router.get('/confluence/admin/pages', confluenceController.getAllPages);
router.get('/confluence/admin/pages/:id', confluenceController.getPageDetails);
router.get('/confluence/admin/pages/:id/sections', confluenceController.getPageSections);
router.post('/confluence/admin/pages', confluenceController.addPageByUrl);
router.post('/confluence/admin/spaces', confluenceController.processSpace);
router.delete('/confluence/admin/pages/:id', confluenceController.deletePage);
router.get('/confluence/admin/stats', confluenceController.getStats);
router.post('/confluence/admin/pages/:id/refresh', confluenceController.refreshPage);

// Confluence MCP routes
router.get('/confluence-mcp/search', confluenceMcpController.searchConfluence);
router.get('/confluence-mcp/page/:pageId', confluenceMcpController.getPage);
router.get('/confluence-mcp/page/:pageId/children', confluenceMcpController.getPageChildren);
router.post('/confluence-mcp/page/:pageId/comment', authMiddleware, confluenceMcpController.addComment);
router.post('/confluence-mcp/page', authMiddleware, confluenceMcpController.createPage);
router.put('/confluence-mcp/page/:pageId', authMiddleware, confluenceMcpController.updatePage);
router.get('/confluence-mcp/download/:pageIdOrUrl', confluenceMcpController.downloadPage);
router.get('/confluence-mcp/page/:pageId/comments', confluenceMcpController.getComments);
router.post('/confluence-mcp/store/:pageId', authMiddleware, confluenceMcpController.storePageInDatabase);

module.exports = router; 