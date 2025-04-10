require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db/db');
const ConfluenceData = require('./models/ConfluenceData');

// Define the function to clean Confluence data
const cleanConfluenceData = async () => {
  try {
    // Connect to the database
    await connectDB();
    
    // Get the ConfluenceData model
    // const ConfluenceData = mongoose.model('confluencedatas');
    
    console.log('Connected to MongoDB. Preparing to clean Confluence data...');
    
    // Get the count of documents before deletion
    const countBefore = await ConfluenceData.countDocuments();
    console.log(`Current document count in ConfluenceData collection: ${countBefore}`);
    
    // Delete all documents from the ConfluenceData collection
    const result = await ConfluenceData.deleteMany({});
    
    console.log(`Deleted ${result.deletedCount} documents from ConfluenceData collection`);
    
    // Verify deletion
    const countAfter = await ConfluenceData.countDocuments();
    console.log(`Remaining document count in ConfluenceData collection: ${countAfter}`);
    
    console.log('Confluence data cleanup completed successfully!');
    
    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    
    return result;
  } catch (error) {
    console.error('Error cleaning Confluence data:', error);
    
    // Try to close the connection even if there was an error
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    } catch (closeError) {
      console.error('Error closing MongoDB connection:', closeError);
    }
    
    process.exit(1);
  }
};

// Run the function
cleanConfluenceData(); 