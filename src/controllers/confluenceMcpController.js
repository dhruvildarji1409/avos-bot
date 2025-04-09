const confluenceMcpService = require('../services/confluenceMcpService');
const ConfluenceData = require('../models/ConfluenceData');
const { getEmbedding } = require('../services/embeddingService');

/**
 * Search Confluence content using MCP
 */
exports.searchConfluence = async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const results = await confluenceMcpService.searchConfluence(query, parseInt(limit));

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error searching Confluence:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get a specific Confluence page by ID
 */
exports.getPage = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { includeMetadata = 'true' } = req.query;

    if (!pageId) {
      return res.status(400).json({ success: false, message: 'Page ID is required' });
    }

    const page = await confluenceMcpService.getPage(
      pageId, 
      includeMetadata === 'true'
    );

    res.json({
      success: true,
      page
    });
  } catch (error) {
    console.error('Error getting Confluence page:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get child pages of a specific Confluence page
 */
exports.getPageChildren = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { includeContent = 'false', limit = 25 } = req.query;

    if (!parentId) {
      return res.status(400).json({ success: false, message: 'Parent page ID is required' });
    }

    const children = await confluenceMcpService.getPageChildren(
      parentId,
      includeContent === 'true',
      parseInt(limit)
    );

    res.json({
      success: true,
      children
    });
  } catch (error) {
    console.error('Error getting page children:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Add a comment to a Confluence page
 */
exports.addComment = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { comment } = req.body;

    if (!pageId) {
      return res.status(400).json({ success: false, message: 'Page ID is required' });
    }

    if (!comment) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }

    const result = await confluenceMcpService.addComment(pageId, comment);

    res.json({
      success: true,
      comment: result
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create a new Confluence page
 */
exports.createPage = async (req, res) => {
  try {
    const { spaceKey, title, content, parentId } = req.body;

    if (!spaceKey || !title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Space key, title, and content are required' 
      });
    }

    const page = await confluenceMcpService.createPage(spaceKey, title, content, parentId);

    res.json({
      success: true,
      page
    });
  } catch (error) {
    console.error('Error creating page:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Download a page and its children
 */
exports.downloadPage = async (req, res) => {
  try {
    const { pageIdOrUrl } = req.params;
    const { downloadChildren = 'true', maxDepth = 3 } = req.query;

    if (!pageIdOrUrl) {
      return res.status(400).json({ success: false, message: 'Page ID or URL is required' });
    }

    const data = await confluenceMcpService.downloadPage(
      pageIdOrUrl,
      downloadChildren === 'true',
      parseInt(maxDepth)
    );

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error downloading page:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get comments for a specific Confluence page
 */
exports.getComments = async (req, res) => {
  try {
    const { pageId } = req.params;

    if (!pageId) {
      return res.status(400).json({ success: false, message: 'Page ID is required' });
    }

    const comments = await confluenceMcpService.getComments(pageId);

    res.json({
      success: true,
      comments
    });
  } catch (error) {
    console.error('Error getting comments:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update an existing Confluence page
 */
exports.updatePage = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { title, content, isMinorEdit = false } = req.body;

    if (!pageId || !title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Page ID, title, and content are required' 
      });
    }

    const page = await confluenceMcpService.updatePage(
      pageId,
      title,
      content,
      isMinorEdit === true
    );

    res.json({
      success: true,
      page
    });
  } catch (error) {
    console.error('Error updating page:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Store Confluence page in database with embeddings
 */
exports.storePageInDatabase = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { addedBy = 'System' } = req.body;

    if (!pageId) {
      return res.status(400).json({ success: false, message: 'Page ID is required' });
    }

    // Check if page already exists in database
    let existingPage = await ConfluenceData.findOne({ pageId });

    // Get page from Confluence
    const page = await confluenceMcpService.getPage(pageId, true);

    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found in Confluence' });
    }

    // Generate embedding for page title and content
    const embedding = await getEmbedding(`${page.title} ${page.content.substring(0, 1000)}`);

    if (existingPage) {
      // Update existing page
      existingPage.title = page.title;
      existingPage.content = page.content;
      existingPage.processedContent = page.content;
      existingPage.embedding = embedding;
      existingPage.lastUpdated = new Date();
      await existingPage.save();

      return res.json({
        success: true,
        message: 'Page updated in database',
        page: existingPage
      });
    }

    // Create new page in database
    const newPage = new ConfluenceData({
      pageId: page.id,
      title: page.title,
      content: page.content,
      processedContent: page.content,
      embedding,
      url: page.url || `${process.env.CONFLUENCE_HOST}/pages/viewpage.action?pageId=${page.id}`,
      addedBy,
      formatVersion: 2,
      tags: ['confluence', page.spaceKey || 'unknown']
    });

    await newPage.save();

    res.json({
      success: true,
      message: 'Page stored in database',
      page: newPage
    });
  } catch (error) {
    console.error('Error storing page in database:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}; 