const axios = require('axios');
const { URL, URLSearchParams } = require('url');
const cheerio = require('cheerio');
const { getEmbedding } = require('./embeddingService');

/**
 * Improved Confluence service for extracting page content and structure
 * Inspired by the Python helper implementation
 */
class ConfluenceService {
  constructor(confluenceHost, username, apiToken) {
    this.confluenceHost = confluenceHost.replace(/\/$/, ''); // Remove trailing slash
    this.username = username;
    this.apiToken = apiToken;
    this.processedUrls = new Set();
  }

  /**
   * Clean and normalize a Confluence URL
   */
  cleanUrl(url) {
    // Remove anchor fragments
    url = url.split('#')[0];
    
    // Handle viewpage.action URLs
    if (url.includes('viewpage.action')) {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      if (params.has('pageId')) {
        return `${this.confluenceHost}/pages/viewpage.action?pageId=${params.get('pageId')}`;
      }
    }
    
    return url;
  }

  /**
   * Extract page info (space key and title) from a Confluence URL
   */
  extractPageInfo(url) {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/').filter(p => p);
    const params = new URLSearchParams(parsedUrl.search);
    
    let spaceKey = null;
    let title = null;
    
    // Case 1: viewpage.action format
    if (parsedUrl.pathname.includes('viewpage.action')) {
      spaceKey = params.get('spaceKey');
      title = params.get('title');
      if (title) {
        title = decodeURIComponent(title).replace(/\+/g, ' ');
      }
    } 
    // Case 2: display format
    else if (pathParts.includes('display')) {
      const displayIndex = pathParts.indexOf('display');
      if (pathParts.length > displayIndex + 1) {
        spaceKey = pathParts[displayIndex + 1];
        title = decodeURIComponent(pathParts[pathParts.length - 1]);
      }
    }
    // Case 3: spaces format
    else if (pathParts.includes('spaces')) {
      const spacesIndex = pathParts.indexOf('spaces');
      if (pathParts.length > spacesIndex + 1) {
        spaceKey = pathParts[spacesIndex + 1];
        title = decodeURIComponent(pathParts[pathParts.length - 1]);
      }
    }
    // Case 4: Simple format (last resort)
    else if (pathParts.length >= 2) {
      spaceKey = pathParts[pathParts.length - 2];
      title = decodeURIComponent(pathParts[pathParts.length - 1]);
    }
    
    // Clean up the title
    if (title) {
      title = this.cleanTitle(title);
    }
    
    console.log(`Extracted space key: ${spaceKey}, title: ${title}`);
    return { spaceKey, title };
  }

  /**
   * Clean up the page title
   */
  cleanTitle(title) {
    // Remove file extensions
    title = title.replace(/\.(html|htm)$/, '');
    // Replace URL encodings and common separators
    title = title.replace(/\+/g, ' ').replace(/-/g, ' ');
    // Remove multiple spaces
    title = title.split(/\s+/).join(' ');
    return title;
  }

  /**
   * Extract all Confluence links from HTML content
   */
  extractConfluenceLinks(htmlContent) {
    const $ = cheerio.load(htmlContent);
    const links = new Set();
    
    $('a[href]').each((i, el) => {
      let href = $(el).attr('href');
      
      // Handle relative URLs
      if (href.startsWith('/')) {
        href = `${this.confluenceHost}${href}`;
      }
      
      // Only process Confluence page URLs
      if (href.includes(this.confluenceHost) && 
          (href.includes('/display/') || href.includes('/pages/') || href.includes('/spaces/'))) {
        const cleanedUrl = this.cleanUrl(href);
        if (cleanedUrl) {
          links.add(cleanedUrl);
        }
      }
    });
    
    return Array.from(links);
  }

  /**
   * Get content of a Confluence page
   */
  async getPageContent(url) {
    try {
      const { spaceKey, title } = this.extractPageInfo(url);
      
      // Try to get the page by space and title if both are available
      if (spaceKey && title) {
        try {
          const response = await axios.get(
            `${this.confluenceHost}/rest/api/content`,
            {
              params: {
                spaceKey,
                title,
                expand: 'body.storage,children.page'
              },
              auth: {
                username: this.username,
                password: this.apiToken
              }
            }
          );
          
          if (response.data.results && response.data.results.length > 0) {
            const page = response.data.results[0];
            return {
              id: page.id,
              title: page.title,
              content: page.body.storage.value,
              children: page.children && page.children.page ? page.children.page.results : [],
              url
            };
          }
        } catch (err) {
          console.error('Error fetching by space/title:', err.message);
        }
      }
      
      // Try by pageId if the URL contains it
      if (url.includes('pageId=')) {
        const parsedUrl = new URL(url);
        const params = new URLSearchParams(parsedUrl.search);
        const pageId = params.get('pageId');
        
        if (pageId) {
          try {
            const response = await axios.get(
              `${this.confluenceHost}/rest/api/content/${pageId}`,
              {
                params: {
                  expand: 'body.storage,children.page'
                },
                auth: {
                  username: this.username,
                  password: this.apiToken
                }
              }
            );
            
            if (response.data) {
              return {
                id: response.data.id,
                title: response.data.title,
                content: response.data.body.storage.value,
                children: response.data.children && response.data.children.page ? 
                          response.data.children.page.results : [],
                url
              };
            }
          } catch (err) {
            console.error('Error fetching by pageId:', err.message);
          }
        }
      }
      
      throw new Error('Could not fetch page content - page not found or access denied');
    } catch (error) {
      console.error(`Error fetching page content for ${url}:`, error.message);
      throw error;
    }
  }

  /**
   * Recursively process a Confluence page and its children
   */
  async processPageRecursive(url, currentDepth = 0, maxDepth = 2) {
    if (currentDepth > maxDepth) {
      return [];
    }
    
    // Clean the URL
    url = this.cleanUrl(url);
    
    if (this.processedUrls.has(url)) {
      return [];
    }
    
    this.processedUrls.add(url);
    const processedPages = [];
    
    try {
      // Get current page content
      const page = await this.getPageContent(url);
      if (!page) {
        console.log(`Skipping ${url} - Page not found or access denied`);
        return [];
      }
      
      processedPages.push(page);
      
      // Process child pages (direct children from the hierarchy)
      if (page.children && page.children.length > 0) {
        for (const child of page.children) {
          try {
            const childUrl = `${this.confluenceHost}/pages/viewpage.action?pageId=${child.id}`;
            
            // Get detailed child page with content
            const childPage = await this.getPageContent(childUrl);
            if (childPage) {
              childPage.parentId = page.id;
              processedPages.push(childPage);
            }
          } catch (err) {
            console.error(`Error processing child page: ${err.message}`);
            continue;
          }
        }
      }
      
      // Process linked pages (if not at max depth)
      if (currentDepth < maxDepth) {
        const linkedUrls = this.extractConfluenceLinks(page.content);
        
        for (const linkedUrl of linkedUrls) {
          try {
            const linkedPages = await this.processPageRecursive(
              linkedUrl,
              currentDepth + 1,
              maxDepth
            );
            processedPages.push(...linkedPages);
          } catch (err) {
            console.error(`Error processing linked page: ${err.message}`);
            continue;
          }
        }
      }
      
      return processedPages;
    } catch (error) {
      console.error(`Error processing page ${url}: ${error.message}`);
      return processedPages;
    }
  }

  /**
   * Process HTML content and break it into sections by headers
   */
  chunkContentByHeaders(html, pageId) {
    const $ = cheerio.load(html);
    const chunks = [];
    const headerTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    
    // Find all headers and content
    const allElements = $('h1, h2, h3, h4, h5, h6, p, div, ul, ol, table, pre, code');
    
    // Track current header and content
    let currentHeaderLevel = 0;
    let currentHeader = null;
    let currentContent = [];
    let currentHeaderIndex = -1;
    
    // Current header hierarchy
    const headerStack = [null, null, null, null, null, null]; // h1 to h6
    
    allElements.each((i, element) => {
      const tagName = $(element).prop('tagName').toLowerCase();
      
      // If this is a header, it starts a new chunk
      if (headerTags.includes(tagName)) {
        // Save the previous chunk if it exists
        if (currentHeader && currentContent.length > 0) {
          const contentText = currentContent.join('\n');
          chunks.push({
            header: currentHeader,
            level: currentHeaderLevel,
            content: contentText,
            full_context: `${currentHeader}\n${contentText}`,
            parent_chunk_id: null, // Will be filled in later
            children: [],
            depth: currentHeaderLevel - 1,
          });
          currentHeaderIndex++;
        }
        
        // Start a new chunk with this header
        currentHeader = $(element).text().trim();
        currentContent = [];
        currentHeaderLevel = parseInt(tagName.substring(1));
        
        // Update header stack
        headerStack[currentHeaderLevel - 1] = {
          text: currentHeader,
          index: chunks.length
        };
        
        // Clear lower levels in the stack
        for (let i = currentHeaderLevel; i < 6; i++) {
          headerStack[i] = null;
        }
      } 
      // For non-header elements, add to current content if we have a header
      else if (currentHeader !== null) {
        // Extract text and preserve code blocks
        let text = '';
        
        if (tagName === 'pre') {
          // Code block
          text = `\`\`\`\n${$(element).text()}\n\`\`\``;
        } else if (tagName === 'code') {
          // Inline code
          text = `\`${$(element).text()}\``;
        } else {
          text = $(element).text().trim();
        }
        
        if (text) {
          currentContent.push(text);
        }
      }
    });
    
    // Add the last chunk if needed
    if (currentHeader && currentContent.length > 0) {
      const contentText = currentContent.join('\n');
      chunks.push({
        header: currentHeader,
        level: currentHeaderLevel,
        content: contentText,
        full_context: `${currentHeader}\n${contentText}`,
        parent_chunk_id: null,
        children: [],
        depth: currentHeaderLevel - 1,
      });
    }
    
    // Build parent-child relationships
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkId = `${pageId}-chunk-${i}`;
      chunk.chunk_id = chunkId;
      
      // Look for parent
      let parentFound = false;
      for (let level = chunk.level - 2; level >= 0; level--) {
        if (headerStack[level] !== null) {
          const parentIndex = headerStack[level].index;
          if (parentIndex < i) {
            chunk.parent_chunk_id = `${pageId}-chunk-${parentIndex}`;
            // Add this chunk as child of parent
            chunks[parentIndex].children.push(chunkId);
            parentFound = true;
            break;
          }
        }
      }
    }
    
    return chunks;
  }

  /**
   * Store page content in MongoDB with embeddings
   */
  async storePageWithEmbeddings(ConfluenceData, page, addedBy) {
    try {
      const { id, title, content, url } = page;
      
      // Check if this page already exists
      const existingPage = await ConfluenceData.findOne({ 
        $or: [
          { url },
          { url: `${this.confluenceHost}/pages/viewpage.action?pageId=${id}` }
        ]
      });
      
      // Create clean text version for embedding
      const cleanText = this.cleanHtmlContent(content);
      
      // Generate embedding for the content
      const embedding = await getEmbedding(title + " " + cleanText);
      
      if (existingPage) {
        // Update existing page
        existingPage.title = title;
        existingPage.content = content;
        existingPage.processedContent = cleanText;
        existingPage.embedding = embedding;
        existingPage.addedBy = addedBy;
        existingPage.hasChildren = page.children && page.children.length > 0;
        if (page.parentId) {
          existingPage.parentId = page.parentId;
        }
        
        await existingPage.save();
        return existingPage;
      } else {
        // Create new page
        const newPage = new ConfluenceData({
          title,
          content,
          processedContent: cleanText,
          embedding,
          url,
          addedBy,
          tags: ['AVOS'],
          hasChildren: page.children && page.children.length > 0,
          parentId: page.parentId || undefined
        });
        
        await newPage.save();
        return newPage;
      }
    } catch (error) {
      console.error(`Error storing page: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean HTML content for embeddings
   */
  cleanHtmlContent(html) {
    const $ = cheerio.load(html);
    
    // Remove script and style tags
    $('script, style').remove();
    
    // Extract text, preserving some structure
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
  }
}

module.exports = ConfluenceService; 