const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  messages: [
    {
      sender: String,
      message: String,
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
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
      if (this.messages && this.messages.length > 0) {
        const firstUserMsg = this.messages.find(m => m.sender === 'user');
        if (firstUserMsg) {
          // Truncate message to make a title
          return firstUserMsg.message.substring(0, 30) + (firstUserMsg.message.length > 30 ? '...' : '');
        }
      }
      return `Chat from ${new Date().toLocaleDateString()}`;
    }
  }
});

// Add a pre-save hook to update the updatedAt timestamp
chatHistorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Add an index for faster querying
chatHistorySchema.index({ userId: 1, createdAt: -1 });

const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);

module.exports = ChatHistory; 