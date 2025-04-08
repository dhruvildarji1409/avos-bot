const mongoose = require('mongoose');

const confluenceDataSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  addedBy: {
    type: String,
    required: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
  tags: [String],
  // Add embedding field for vector search
  embedding: {
    type: [Number],
    sparse: true, // Optimize for sparse vectors
    index: true,  // Allow indexing for faster search
  },
  // Add processed content field to store cleaned text
  processedContent: {
    type: String,
  },
  // Add parent-child relationship fields
  parentId: {
    type: String,
    index: true, // For faster parent-child lookups
  },
  hasChildren: {
    type: Boolean,
    default: false,
  },
  // Add page ID field from Confluence
  pageId: {
    type: String,
    index: true,  // Index for faster lookups
  },
  // Source information
  source: {
    type: String,
    enum: ['api', 'browser-extract', 'manual'],
    default: 'api'
  },
  // Content format version (for future migrations)
  formatVersion: {
    type: Number,
    default: 1
  }
});

// Create text index for better search capabilities
confluenceDataSchema.index({ title: 'text', content: 'text', tags: 'text' });

const ConfluenceData = mongoose.model('ConfluenceData', confluenceDataSchema);

module.exports = ConfluenceData; 