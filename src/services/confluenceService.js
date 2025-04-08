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
   * Store a page and generate embeddings for it and its sections
   */
  async storePageWithEmbeddings(ConfluenceData, page, addedBy) {
    try {
      // Clean the HTML content to extract useful text
      const cleanedContent = this.cleanHtmlContent(page.content);
      
      // Check if page already exists
      let existingPage = await ConfluenceData.findOne({ pageId: page.id });
      
      // Extract space information if available
      const urlObj = new URL(page.url);
      const pathParts = urlObj.pathname.split('/');
      const params = new URLSearchParams(urlObj.search);
      
      let spaceKey = params.get('spaceKey') || '';
      let spaceName = '';
      
      if (pathParts.includes('spaces') && pathParts.length > pathParts.indexOf('spaces') + 1) {
        spaceKey = pathParts[pathParts.indexOf('spaces') + 1];
      }
      
      // Extract page sections
      const sections = this.chunkContentByHeaders(page.content, page.id);
      
      // Generate embeddings for sections
      const processedSections = await Promise.all(sections.map(async (section, index) => {
        try {
          const embedding = await getEmbedding(section.full_context);
          return {
            heading: section.header,
            content: section.content,
            level: section.level,
            order: index,
            embedding
          };
        } catch (err) {
          console.error(`Error generating embedding for section: ${err.message}`);
          return {
            heading: section.header,
            content: section.content,
            level: section.level,
            order: index,
            embedding: []
          };
        }
      }));
      
      // Generate an embedding for the whole page
      let pageEmbedding = [];
      try {
        // Generate embedding from title + first section or title + truncated content
        const embeddingText = page.title + '\n\n' + (sections.length > 0 ? 
          sections[0].full_context.substring(0, 1000) :
          cleanedContent.substring(0, 1000));
          
        pageEmbedding = await getEmbedding(embeddingText);
      } catch (err) {
        console.error(`Error generating page embedding: ${err.message}`);
      }
      
      // Build metadata array
      const metadata = [
        { key: 'pageId', value: page.id },
        { key: 'spaceKey', value: spaceKey },
        { key: 'lastExtracted', value: new Date().toISOString() }
      ];
      
      // If page exists, update it
      if (existingPage) {
        console.log(`Updating existing page: ${page.title}`);
        
        existingPage.title = page.title;
        existingPage.content = page.content;
        existingPage.processedContent = cleanedContent;
        existingPage.lastUpdated = new Date();
        existingPage.embedding = pageEmbedding;
        existingPage.sections = processedSections;
        existingPage.spaceKey = spaceKey;
        existingPage.spaceName = spaceName;
        existingPage.metadata = metadata;
        existingPage.formatVersion = 2;
        
        if (page.parentId) {
          existingPage.parentId = page.parentId;
        }
        
        // Update child relationships if available
        if (page.children && page.children.length > 0) {
          existingPage.hasChildren = true;
          existingPage.childIds = page.children.map(child => child.id);
        }
        
        await existingPage.save();
        return existingPage;
      }
      
      // Create new page
      console.log(`Creating new page: ${page.title}`);
      const newPage = new ConfluenceData({
        title: page.title,
        content: page.content,
        processedContent: cleanedContent,
        url: page.url,
        pageId: page.id,
        embedding: pageEmbedding,
        sections: processedSections,
        addedBy: addedBy || 'System',
        spaceKey,
        spaceName,
        metadata,
        formatVersion: 2,
        tags: ['confluence', spaceKey]
      });
      
      if (page.parentId) {
        newPage.parentId = page.parentId;
      }
      
      // Set child relationships if available
      if (page.children && page.children.length > 0) {
        newPage.hasChildren = true;
        newPage.childIds = page.children.map(child => child.id);
      }
      
      await newPage.save();
      return newPage;
    } catch (error) {
      console.error('Error storing page with embeddings:', error);
      throw error;
    }
  }

  /**
   * Clean HTML content and extract plain text
   */
  cleanHtmlContent(html) {
    try {
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script, style, svg, .hidden, .aui-icon').remove();
      
      // Replace some elements with their text representation
      $('br').replaceWith('\n');
      $('p, div, li, h1, h2, h3, h4, h5, h6').each((i, el) => {
        $(el).append('\n');
      });
      
      // Special handling for code blocks
      $('pre, code').each((i, el) => {
        const text = $(el).text();
        $(el).replaceWith(`\`\`\`\n${text}\n\`\`\``);
      });
      
      // Special handling for tables
      $('table').each((i, table) => {
        $(table).find('tr').each((j, row) => {
          $(row).find('th, td').each((k, cell) => {
            $(cell).append(' | ');
          });
          $(row).append('\n');
        });
      });
      
      // Extract text and clean whitespace
      let text = $.text();
      
      // Normalize whitespace
      text = text.replace(/\s+/g, ' ');
      
      // Replace multiple newlines with just two
      text = text.replace(/\n{3,}/g, '\n\n');
      
      return text.trim();
    } catch (error) {
      console.error('Error cleaning HTML content:', error);
      return html; // Return original HTML if there's an error
    }
  }
  
  /**
   * Process a Confluence page in depth with structured extraction
   */
  async processPageStructured(pageUrl, options = {}) {
    const defaultOptions = {
      extractSections: true,
      maxDepth: 1,
      processChildren: true,
      includeMetadata: true
    };
    
    const processOptions = { ...defaultOptions, ...options };
    
    try {
      // Get page content
      const page = await this.getPageContent(pageUrl);
      if (!page) {
        throw new Error(`Could not fetch page content from ${pageUrl}`);
      }
      
      // Extract metadata if enabled
      if (processOptions.includeMetadata) {
        // Extract space information
        const urlObj = new URL(pageUrl);
        const pathParts = urlObj.pathname.split('/');
        const params = new URLSearchParams(urlObj.search);
        
        page.metadata = {
          spaceKey: params.get('spaceKey') || '',
          lastExtracted: new Date().toISOString(),
          pageId: page.id
        };
        
        if (pathParts.includes('spaces') && pathParts.length > pathParts.indexOf('spaces') + 1) {
          page.metadata.spaceKey = pathParts[pathParts.indexOf('spaces') + 1];
        }
      }
      
      // Extract sections if enabled
      if (processOptions.extractSections) {
        page.sections = this.chunkContentByHeaders(page.content, page.id);
      }
      
      // Process children if enabled and not at max depth
      if (processOptions.processChildren && processOptions.maxDepth > 0) {
        page.processedChildren = [];
        
        // Process direct children from API
        if (page.children && page.children.length > 0) {
          for (const child of page.children) {
            const childUrl = `${this.confluenceHost}/pages/viewpage.action?pageId=${child.id}`;
            
            try {
              const childPage = await this.processPageStructured(childUrl, {
                ...processOptions,
                maxDepth: processOptions.maxDepth - 1
              });
              
              if (childPage) {
                childPage.parentId = page.id;
                page.processedChildren.push(childPage);
              }
            } catch (err) {
              console.error(`Error processing child page: ${err.message}`);
            }
          }
        }
      }
      
      return page;
    } catch (error) {
      console.error(`Error processing page structure: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ConfluenceService; 