const ConfluenceData = require('../models/ConfluenceData');
const ConfluenceService = require('../services/confluenceService');
const { getEmbedding, cleanTextForEmbedding } = require('../services/embeddingService');
const cheerio = require('cheerio');

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