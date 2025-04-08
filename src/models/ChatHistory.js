const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['user', 'bot'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const chatSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true
  },
  sessionName: {
    type: String,
    default: function() {
      // Auto-generate a name based on timestamp if not provided
      return `Chat ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    }
  },
  messages: [messageSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now
  }
});

const chatHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.userId; // Only required if userId is not provided
    }
  },
  userId: {
    type: String,
    sparse: true,
    required: function() {
      return !this.user; // Only required if user is not provided
    }
  },
  sessions: [chatSessionSchema],
  activeSessionId: {
    type: String,
    default: null
  },
  sharedWith: [String],
  // New fields for enhanced sharing
  shareToken: {
    type: String,
    sparse: true,
    index: true,
  },
  shareExpiration: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  title: {
    type: String,
    default: function() {
      // Generate title based on first message or date
      if (this.sessions && this.sessions.length > 0 && this.sessions[0].messages && this.sessions[0].messages.length > 0) {
        const firstUserMsg = this.sessions[0].messages.find(m => m.sender === 'user');
        if (firstUserMsg) {
          // Truncate message to make a title
          return firstUserMsg.message.substring(0, 30) + (firstUserMsg.message.length > 30 ? '...' : '');
        }
      }
      return `Chat from ${new Date().toLocaleDateString()}`;
    }
  }
});

// Update lastUpdatedAt whenever messages are modified
chatSessionSchema.pre('save', function(next) {
  this.lastUpdatedAt = new Date();
  next();
});

// Add a pre-save hook to update the updatedAt timestamp
chatHistorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Add indexes for faster querying
chatHistorySchema.index({ user: 1, createdAt: -1 });
chatHistorySchema.index({ userId: 1 }, { sparse: true });

const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);

module.exports = ChatHistory; 