const ConfluenceData = require('../models/ConfluenceData');
const ConfluenceService = require('../services/confluenceService');
const { getEmbedding, cleanTextForEmbedding } = require('../services/embeddingService');
const cheerio = require('cheerio');
const axios = require('axios');
const { processConfluencePage, processConfluenceSpace } = require('../db/seed-confluence');

// Initialize Confluence Service with credentials from environment variables
const confluenceService = new ConfluenceService(
  process.env.CONFLUENCE_HOST,
  process.env.CONFLUENCE_USERNAME,
  process.env.CONFLUENCE_API_TOKEN
);

// Helper function to clean HTML content
function cleanHtmlContent(html) {
  try {
    const $ = cheerio.load(html);
    
    // Remove script and style tags
    $('script, style').remove();
    
    // Extract text preserving some structure
    let text = '';
    
    // Process headers
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      text += `${$(el).text().trim()}\n`;
    });
    
    // Process paragraphs and list items
    $('p, li').each((i, el) => {
      text += `${$(el).text().trim()}\n`;
    });
    
    // Process tables
    $('table').each((i, table) => {
      $(table).find('tr').each((j, row) => {
        const rowText = [];
        $(row).find('th, td').each((k, cell) => {
          rowText.push($(cell).text().trim());
        });
        text += rowText.join(' | ') + '\n';
      });
    });
    
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  } catch (error) {
    console.error('Error cleaning HTML:', error);
    // Fallback to simpler cleaning if cheerio fails
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Add new Confluence data
exports.addConfluenceData = async (req, res) => {
  try {
    const { title, content, url, addedBy, tags } = req.body;
    
    if (!title || !content || !url || !addedBy) {
      return res.status(400).json({ error: 'Title, content, URL, and addedBy are required' });
    }
    
    // Check if this is HTML content (from browser extraction)
    const isHtml = content.includes('<html') || content.includes('<div') || content.includes('<p>');
    
    // Clean content for embedding
    const processedContent = isHtml 
      ? cleanHtmlContent(content) 
      : cleanTextForEmbedding(content);
    
    // Generate embedding for the content
    const embedding = await getEmbedding(title + " " + processedContent);
    
    // Check if this URL already exists in the database
    const existingData = await ConfluenceData.findOne({ url });
    
    if (existingData) {
      // Update existing entry
      existingData.title = title;
      existingData.content = content;
      existingData.processedContent = processedContent;
      existingData.embedding = embedding;
      existingData.addedBy = addedBy;
      existingData.tags = tags || existingData.tags;
      await existingData.save();
      
      return res.status(200).json({ 
        message: 'Confluence data updated successfully',
        ...existingData.toObject()
      });
    }
    
    // Extract page ID from URL if possible
    let pageId = null;
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      pageId = params.get('pageId');
    } catch (e) {
      // Ignore URL parsing errors
    }
    
    // Create new entry
    const confluenceData = new ConfluenceData({
      title,
      content,
      processedContent,
      embedding,
      url,
      addedBy,
      tags: tags || ['AVOS'],
      pageId: pageId,
      hasChildren: false, // Browser extraction doesn't include children information
    });
    
    await confluenceData.save();
    res.status(201).json(confluenceData);
  } catch (error) {
    console.error('Error adding Confluence data:', error);
    res.status(500).json({ error: 'Failed to add Confluence data' });
  }
};

// Search Confluence data
exports.searchConfluenceData = async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    // Generate embedding for the query
    const queryEmbedding = await getEmbedding(query);
    
    // Get all confluence data (could be optimized with pagination for large datasets)
    const allData = await ConfluenceData.find({});
    
    // Calculate similarity scores
    const dataWithScores = allData.map(item => {
      // Compute vector similarity if embeddings exist
      let similarity = 0;
      
      if (item.embedding && item.embedding.length > 0 && queryEmbedding.length > 0) {
        // Calculate dot product
        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;
        
        for (let i = 0; i < item.embedding.length; i++) {
          dotProduct += item.embedding[i] * queryEmbedding[i];
          magnitude1 += item.embedding[i] * item.embedding[i];
          magnitude2 += queryEmbedding[i] * queryEmbedding[i];
        }
        
        // Cosine similarity = dot product / (magnitude1 * magnitude2)
        similarity = dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
      }
      
      return {
        ...item.toObject(),
        score: similarity
      };
    });
    
    // Sort by similarity score (highest first)
    const sortedData = dataWithScores.sort((a, b) => b.score - a.score);
    
    // Return top results (with score > 0.5 or top 10, whichever is smaller)
    const results = sortedData.filter(item => item.score > 0.5).slice(0, 10);
    
    // Fallback to text search if vector search returned no results
    if (results.length === 0) {
      const textResults = await ConfluenceData.find(
        { $text: { $search: query } },
        { score: { $meta: 'textScore' } }
      ).sort({ score: { $meta: 'textScore' } }).limit(10);
      
      res.json(textResults);
    } else {
      res.json(results);
    }
  } catch (error) {
    console.error('Error searching Confluence data:', error);
    res.status(500).json({ error: 'Failed to search Confluence data' });
  }
};

// Fetch data from Confluence API and store in database using the improved service
exports.fetchAndStoreConfluenceData = async (req, res) => {
  try {
    const { url, addedBy } = req.body;
    
    if (!url || !addedBy) {
      return res.status(400).json({ error: 'URL and addedBy are required' });
    }
    
    console.log(`Fetching Confluence data from: ${url} (added by: ${addedBy})`);
    
    // Process the page and its children with the improved service
    const pages = await confluenceService.processPageRecursive(url, 0, 1);
    
    if (!pages || pages.length === 0) {
      return res.status(404).json({ error: 'Confluence page not found or could not be accessed' });
    }
    
    // Store the main page first
    const mainPage = pages[0];
    const savedPage = await confluenceService.storePageWithEmbeddings(
      ConfluenceData, 
      mainPage, 
      addedBy
    );
    
    console.log(`Saved main page: ${mainPage.title}`);
    
    // Store child pages
    const childrenCount = pages.length - 1;
    for (let i = 1; i < pages.length; i++) {
      const childPage = pages[i];
      console.log(`Processing child page ${i}/${childrenCount}: ${childPage.title}`);
      
      try {
        await confluenceService.storePageWithEmbeddings(
          ConfluenceData,
          childPage,
          addedBy
        );
      } catch (childError) {
        console.error(`Error storing child page ${childPage.title}:`, childError);
      }
    }
    
    // Return success response
    res.status(201).json({
      ...savedPage.toObject(),
      childrenCount
    });
    
  } catch (error) {
    console.error('Error fetching and storing Confluence data:', error);
    
    // Handle different types of errors
    if (error.message && error.message.includes('Could not fetch page content')) {
      return res.status(404).json({ error: 'Confluence page not found or could not be accessed' });
    }
    
    if (error.response) {
      console.error('API Response:', error.response.data);
      return res.status(error.response.status).json({ 
        error: `Confluence API error: ${error.response.data.message || 'Unknown error'}`,
        details: error.response.data
      });
    }
    
    res.status(500).json({ error: `Failed to fetch and store Confluence data: ${error.message}` });
  }
};

// Get a specific Confluence data entry by ID
exports.getConfluenceData = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }
    
    const confluenceData = await ConfluenceData.findById(id);
    
    if (!confluenceData) {
      return res.status(404).json({ error: 'Confluence data not found' });
    }
    
    res.json(confluenceData);
  } catch (error) {
    console.error('Error getting Confluence data:', error);
    res.status(500).json({ error: 'Failed to get Confluence data' });
  }
};

/**
 * Search Confluence data in the database
 */
exports.searchConfluence = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    // Perform text search
    const textResults = await ConfluenceData.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(5);

    // If we have enough text results, return them
    if (textResults.length >= 3) {
      return res.json({
        success: true,
        results: textResults.map(doc => ({
          id: doc._id,
          title: doc.title,
          url: doc.url,
          content: doc.content.substring(0, 300) + '...',
          score: doc._score
        }))
      });
    }

    // If text search didn't yield good results, try semantic search
    const embedding = await getEmbedding(query);

    // Query for vector similarity
    const pipeline = [
      {
        $search: {
          index: 'vector_index',
          knnBeta: {
            vector: embedding,
            path: 'embedding',
            k: 5
          }
        }
      },
      {
        $project: {
          title: 1,
          url: 1,
          content: 1,
          score: { $meta: 'searchScore' }
        }
      }
    ];

    const semanticResults = await ConfluenceData.aggregate(pipeline);

    // Combine results
    const combinedResults = [...textResults, ...semanticResults];
    const uniqueResults = Array.from(new Map(combinedResults.map(item => [item._id, item])).values());

    res.json({
      success: true,
      results: uniqueResults.map(doc => ({
        id: doc._id,
        title: doc.title,
        url: doc.url,
        content: doc.content.substring(0, 300) + '...',
        score: doc.score
      }))
    });
  } catch (error) {
    console.error('Error searching Confluence:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all Confluence pages stored in the database
 */
exports.getAllPages = async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'addedAt', order = 'desc' } = req.query;
    
    // Build sort options
    const sortOptions = {};
    sortOptions[sortBy] = order === 'desc' ? -1 : 1;
    
    // Count total documents
    const total = await ConfluenceData.countDocuments();
    
    // Get pages with pagination
    const pages = await ConfluenceData.find()
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('title url addedAt addedBy pageId spaceKey formatVersion');
    
    res.json({
      success: true,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalItems: total,
      pages
    });
  } catch (error) {
    console.error('Error getting Confluence pages:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get details of a specific Confluence page
 */
exports.getPageDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const page = await ConfluenceData.findById(id);
    
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    res.json({
      success: true,
      page
    });
  } catch (error) {
    console.error('Error getting page details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Add a new Confluence page by URL
 */
exports.addPageByUrl = async (req, res) => {
  try {
    const { url, processChildren = true, maxDepth = 2 } = req.body;
    // Use 'System' as the default username if no user is authenticated
    const username = req.user?.username || 'System';
    
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL is required' });
    }
    
    // Process the page and its children
    const result = await processConfluencePage(url, {
      maxDepth: parseInt(maxDepth),
      processChildren: processChildren === 'true' || processChildren === true,
      addedBy: username
    });
    
    if (!result) {
      return res.status(400).json({ 
        success: false, 
        message: 'Failed to process the page. Check the URL and try again.' 
      });
    }
    
    res.json({
      success: true,
      message: 'Page added successfully',
      page: {
        id: result._id,
        title: result.title,
        url: result.url
      }
    });
  } catch (error) {
    console.error('Error adding page by URL:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Process a Confluence space
 */
exports.processSpace = async (req, res) => {
  try {
    const { spaceKey, maxDepth = 1 } = req.body;
    // Use 'System' as the default username if no user is authenticated
    const username = req.user?.username || 'System';
    
    if (!spaceKey) {
      return res.status(400).json({ success: false, message: 'Space key is required' });
    }
    
    // Process the space
    const result = await processConfluenceSpace(spaceKey, {
      maxDepth: parseInt(maxDepth),
      processChildren: true,
      addedBy: username
    });
    
    if (!result) {
      return res.status(400).json({ 
        success: false, 
        message: 'Failed to process the space. Check the space key and try again.' 
      });
    }
    
    res.json({
      success: true,
      message: `Space ${spaceKey} processed successfully`
    });
  } catch (error) {
    console.error('Error processing space:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a Confluence page
 */
exports.deletePage = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await ConfluenceData.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    res.json({
      success: true,
      message: 'Page deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get stats about Confluence data
 */
exports.getStats = async (req, res) => {
  try {
    const totalPages = await ConfluenceData.countDocuments();
    
    // Count by space
    const spaceStats = await ConfluenceData.aggregate([
      { $group: { _id: '$spaceKey', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Count by format version
    const versionStats = await ConfluenceData.aggregate([
      { $group: { _id: '$formatVersion', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Get latest pages
    const latestPages = await ConfluenceData.find()
      .sort({ addedAt: -1 })
      .limit(5)
      .select('title url addedAt addedBy');
    
    res.json({
      success: true,
      stats: {
        totalPages,
        bySpace: spaceStats,
        byVersion: versionStats,
        latestPages
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Refresh a page and update its content
 */
exports.refreshPage = async (req, res) => {
  try {
    const { id } = req.params;
    // Use 'System' as the default username if no user is authenticated
    const username = req.user?.username || 'System';
    
    const page = await ConfluenceData.findById(id);
    
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    // Process the page and update it
    const result = await processConfluencePage(page.url, {
      maxDepth: 0, // Don't process children for a refresh
      processChildren: false,
      addedBy: username
    });
    
    if (!result) {
      return res.status(400).json({ 
        success: false, 
        message: 'Failed to refresh the page. Try again later.' 
      });
    }
    
    res.json({
      success: true,
      message: 'Page refreshed successfully',
      page: {
        id: result._id,
        title: result.title,
        url: result.url,
        lastUpdated: result.lastUpdated
      }
    });
  } catch (error) {
    console.error('Error refreshing page:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get section details of a specific Confluence page for debugging
 */
exports.getPageSections = async (req, res) => {
  try {
    const { id } = req.params;
    
    const page = await ConfluenceData.findById(id);
    
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    // Extract page information
    const pageInfo = {
      id: page._id,
      title: page.title,
      url: page.url,
      addedBy: page.addedBy,
      addedAt: page.addedAt,
      formatVersion: page.formatVersion || 1,
      spaceKey: page.spaceKey,
      hasEmbedding: page.embedding && page.embedding.length > 0
    };
    
    // Extract section information
    const sectionInfo = page.sections && page.sections.length > 0 
      ? page.sections.map((section, index) => ({
          heading: section.heading,
          content: section.content,
          level: section.level,
          order: section.order || index,
          hasEmbedding: section.embedding && section.embedding.length > 0,
          contentLength: section.content.length
        }))
      : [];
      
    // If page has no sections but has content, create a mock section from the full content
    if (sectionInfo.length === 0 && page.content) {
      // Use the cheerio parser to extract headers and content
      const $ = cheerio.load(page.content);
      const headers = [];
      
      // Find all headers in the content
      $('h1, h2, h3, h4, h5, h6').each(function() {
        const level = parseInt(this.tagName.substring(1));
        headers.push({
          text: $(this).text().trim(),
          level,
          element: this
        });
      });
      
      // If headers were found, create mock sections
      if (headers.length > 0) {
        let mockSections = [];
        
        // For each header, extract content until the next header
        headers.forEach((header, i) => {
          let contentElements = [];
          let currentElement = header.element;
          
          // Collect elements until the next header or end of content
          while ((currentElement = currentElement.nextSibling) !== null) {
            if (currentElement.tagName && /^h[1-6]$/.test(currentElement.tagName.toLowerCase())) {
              break;
            }
            if (currentElement.type === 'tag') {
              contentElements.push($(currentElement).html());
            }
          }
          
          mockSections.push({
            heading: header.text,
            content: contentElements.join('\n'),
            level: header.level,
            order: i,
            hasEmbedding: false,
            contentLength: contentElements.join('\n').length,
            isMocked: true
          });
        });
        
        sectionInfo.push(...mockSections);
      } else {
        // If no headers, create single mock section with full content
        sectionInfo.push({
          heading: page.title,
          content: page.processedContent || page.content.substring(0, 10000),
          level: 0,
          order: 0,
          hasEmbedding: false,
          contentLength: (page.processedContent || page.content).length,
          isMocked: true
        });
      }
    }
    
    res.json({
      success: true,
      page: pageInfo,
      sections: sectionInfo,
      totalSections: sectionInfo.length,
      rawContentLength: page.content.length,
      processedContentLength: page.processedContent ? page.processedContent.length : 0
    });
  } catch (error) {
    console.error('Error getting page sections:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}; 