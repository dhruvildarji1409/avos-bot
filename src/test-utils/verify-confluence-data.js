require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db/db');
// Import the ConfluenceData model
const ConfluenceData = require('./models/ConfluenceData');

// Define the function to verify Confluence data
const verifyConfluenceData = async () => {
  try {
    // Connect to the database
    await connectDB();
    
    console.log('Connected to MongoDB. Verifying Confluence data...');
    
    // Get the count of documents
    const count = await ConfluenceData.countDocuments();
    console.log(`Current document count in ConfluenceData collection: ${count}`);
    
    if (count === 0) {
      console.log('Verification successful: ConfluenceData collection is empty.');
    } else {
      console.log('Verification failed: ConfluenceData collection still has documents.');
      
      // Get a list of all documents (limit to 10 for display)
      const docs = await ConfluenceData.find().limit(10).lean();
      console.log(`Sample of remaining documents (up to 10):`);
      docs.forEach((doc, index) => {
        console.log(`Document ${index + 1}:`);
        console.log(`- ID: ${doc._id}`);
        console.log(`- Title: ${doc.title}`);
        console.log(`- Page ID: ${doc.pageId}`);
      });
    }
    
    // Close the connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error verifying Confluence data:', error);
    
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
verifyConfluenceData(); 