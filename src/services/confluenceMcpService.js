const axios = require('axios');

/**
 * Service for interacting with Confluence pages using MCP
 */
class ConfluenceMcpService {
  constructor() {
    this.pageCache = new Map();
  }

  /**
   * Search Confluence content
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} - Search results
   */
  async searchConfluence(query, limit = 10) {
    try {
      // Call the Confluence MCP search function
      const data = await global.mcpClient.call('mcp_confluence_confluence_search', {
        query,
        limit
      });

      return data;
    } catch (error) {
      console.error('Error searching Confluence:', error);
      throw error;
    }
  }

  /**
   * Get a specific Confluence page by ID
   * @param {string} pageId - The Confluence page ID
   * @param {boolean} includeMetadata - Whether to include page metadata
   * @returns {Promise<Object>} - Page content and details
   */
  async getPage(pageId, includeMetadata = true) {
    try {
      // Check cache first
      if (this.pageCache.has(pageId)) {
        return this.pageCache.get(pageId);
      }

      // Call the Confluence MCP get page function
      const data = await global.mcpClient.call('mcp_confluence_confluence_get_page', {
        page_id: pageId,
        include_metadata: includeMetadata
      });

      // Cache the result
      this.pageCache.set(pageId, data);
      
      return data;
    } catch (error) {
      console.error(`Error getting Confluence page ${pageId}:`, error);
      throw error;
    }
  }

  /**
   * Get child pages of a specific Confluence page
   * @param {string} parentId - Parent page ID
   * @param {boolean} includeContent - Whether to include page content
   * @param {number} limit - Maximum number of children to return
   * @returns {Promise<Array>} - Child pages
   */
  async getPageChildren(parentId, includeContent = false, limit = 25) {
    try {
      // Call the Confluence MCP get page children function
      const data = await global.mcpClient.call('mcp_confluence_confluence_get_page_children', {
        parent_id: parentId,
        include_content: includeContent,
        limit: limit
      });

      return data;
    } catch (error) {
      console.error(`Error getting children of page ${parentId}:`, error);
      throw error;
    }
  }

  /**
   * Add a comment to a Confluence page
   * @param {string} pageId - Page ID
   * @param {string} comment - Comment text in Markdown format
   * @returns {Promise<Object>} - Created comment details
   */
  async addComment(pageId, comment) {
    try {
      // Call the Confluence MCP add comment function
      const data = await global.mcpClient.call('mcp_confluence_confluence_add_comment', {
        page_id: pageId,
        comment: comment
      });

      return data;
    } catch (error) {
      console.error(`Error adding comment to page ${pageId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new Confluence page
   * @param {string} spaceKey - Space key
   * @param {string} title - Page title
   * @param {string} content - Page content in Markdown format
   * @param {string} parentId - Optional parent page ID
   * @returns {Promise<Object>} - Created page details
   */
  async createPage(spaceKey, title, content, parentId = null) {
    try {
      // Call the Confluence MCP create page function
      const params = {
        space_key: spaceKey,
        title: title,
        content: content
      };

      // Add parent_id if provided
      if (parentId) {
        params.parent_id = parentId;
      }

      const data = await global.mcpClient.call('mcp_confluence_confluence_create_page', params);

      return data;
    } catch (error) {
      console.error('Error creating Confluence page:', error);
      throw error;
    }
  }

  /**
   * Download a page and its children
   * @param {string} pageIdOrUrl - Page ID or URL
   * @param {boolean} downloadChildren - Whether to download child pages
   * @param {number} maxDepth - Maximum recursion depth
   * @returns {Promise<Object>} - Downloaded page data
   */
  async downloadPage(pageIdOrUrl, downloadChildren = true, maxDepth = 3) {
    try {
      // Call the Confluence MCP download page function
      const data = await global.mcpClient.call('mcp_confluence_confluence_download_page', {
        page_id_or_url: pageIdOrUrl,
        download_children: downloadChildren,
        max_depth: maxDepth
      });

      return data;
    } catch (error) {
      console.error(`Error downloading page ${pageIdOrUrl}:`, error);
      throw error;
    }
  }

  /**
   * Get comments for a specific Confluence page
   * @param {string} pageId - Page ID
   * @returns {Promise<Array>} - Comments
   */
  async getComments(pageId) {
    try {
      // Call the Confluence MCP get comments function
      const data = await global.mcpClient.call('mcp_confluence_confluence_get_comments', {
        page_id: pageId
      });

      return data;
    } catch (error) {
      console.error(`Error getting comments for page ${pageId}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing Confluence page
   * @param {string} pageId - Page ID
   * @param {string} title - New page title
   * @param {string} content - New page content
   * @param {boolean} isMinorEdit - Whether this is a minor edit
   * @returns {Promise<Object>} - Updated page details
   */
  async updatePage(pageId, title, content, isMinorEdit = false) {
    try {
      // Call the Confluence MCP update page function
      const data = await global.mcpClient.call('mcp_confluence_confluence_update_page', {
        page_id: pageId,
        title: title,
        content: content,
        is_minor_edit: isMinorEdit
      });

      // Clear the cache for this page
      this.pageCache.delete(pageId);

      return data;
    } catch (error) {
      console.error(`Error updating page ${pageId}:`, error);
      throw error;
    }
  }

  /**
   * Clear the page cache
   */
  clearCache() {
    this.pageCache.clear();
  }
}

module.exports = new ConfluenceMcpService(); 