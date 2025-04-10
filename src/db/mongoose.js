/**
 * MongoDB Connection
 * 
 * This file handles the connection to MongoDB.
 */

const mongoose = require('mongoose');
const config = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/avos-bot',
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.uri, config.options);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    // Exit process with failure
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log(`Mongoose connected to ${config.uri}`);
});

mongoose.connection.on('error', (err) => {
  console.error(`Mongoose connection error: ${err}`);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// Handle app termination
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('Mongoose connection closed due to app termination');
  process.exit(0);
});

module.exports = {
  connectDB,
  mongoose
}; 