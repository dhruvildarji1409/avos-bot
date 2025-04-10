/**
 * Confluence Chunk Model
 * 
 * This model represents chunks from Confluence pages stored in MongoDB.
 */

const mongoose = require('mongoose');

// Nested schema for header path
const HeaderPathSchema = new mongoose.Schema({
  level: {
    type: Number,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  chunk_id: {
    type: String,
    required: true
  }
}, { _id: false });

// Schema for content chunks from Confluence
const ConfluenceChunkSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
    alias: 'chunk_id'
  },
  page_id: {
    type: String,
    required: true,
    index: true
  },
  page_title: {
    type: String,
    required: true,
    index: true
  },
  header: {
    type: String,
    required: true,
    index: true
  },
  level: {
    type: Number,
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  full_context: {
    type: String,
    required: true
  },
  embedding: {
    type: [Number],
    index: true,
    sparse: true
  },
  references: {
    type: [String],
    default: [],
    index: true
  },
  keywords: {
    type: [String],
    default: [],
    index: true
  },
  parent_chunk_id: {
    type: String,
    index: true,
    sparse: true
  },
  children: {
    type: [String],
    default: [],
    index: true
  },
  header_path: {
    type: [HeaderPathSchema],
    default: []
  },
  depth: {
    type: Number,
    default: 0,
    index: true
  },
  node_type: {
    type: String,
    default: 'content_chunk',
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  outgoing_links: {
    type: [{
      type: { type: String },
      target_page_id: { type: String }
    }],
    default: []
  }
});

// Create indexes for better performance
ConfluenceChunkSchema.index({ page_id: 1, header: 1 });
ConfluenceChunkSchema.index({ content: 'text', header: 'text' });

const ConfluenceChunk = mongoose.model('ConfluenceChunk', ConfluenceChunkSchema, 'page_chunks');

module.exports = ConfluenceChunk; 