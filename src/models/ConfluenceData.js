const mongoose = require('mongoose');

// Define a schema for page sections
const sectionSchema = new mongoose.Schema({
  heading: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  level: {
    type: Number,
    default: 1,
  },
  order: {
    type: Number,
    required: true,
  },
  embedding: {
    type: [Number],
    sparse: true,
  }
});

// Define a schema for metadata
const metadataSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
  },
  value: {
    type: String,
    required: true,
  }
});

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
  childIds: {
    type: [String],
    default: [],
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
  // Space information
  spaceKey: {
    type: String,
    index: true,
  },
  spaceName: {
    type: String,
  },
  // Version information
  version: {
    type: Number,
    default: 1,
  },
  // Sections for structured content
  sections: {
    type: [sectionSchema],
    default: [],
  },
  // Metadata for additional information
  metadata: {
    type: [metadataSchema],
    default: [],
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
    default: 2  // Updated to version 2 for the new structure
  },
  // Last updated timestamp
  lastUpdated: {
    type: Date,
    default: Date.now,
  }
});

// Create text index for better search capabilities
confluenceDataSchema.index({ title: 'text', content: 'text', tags: 'text', 'sections.heading': 'text', 'sections.content': 'text' });

const ConfluenceData = mongoose.model('ConfluenceData', confluenceDataSchema);

module.exports = ConfluenceData; 