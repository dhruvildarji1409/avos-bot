const mongoose = require('mongoose');
const ConfluenceData = require('../models/ConfluenceData');
require('dotenv').config();

async function countRecords() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
    
    // Get all collection names in the database using Mongoose
    console.log('\nDatabase summary:');
    
    // Mongoose models
    const models = mongoose.modelNames();
    console.log(`Registered Mongoose models: ${models.join(', ')}`);
    
    // Try to directly check the confluencedata collection
    const count = await ConfluenceData.countDocuments();
    console.log(`- confluencedata: ${count} records`);
    
    if (count > 0) {
      console.log('\nSample of Confluence data:');
      const samples = await ConfluenceData.find().limit(2);
      samples.forEach(doc => {
        console.log(`Title: ${doc.title}`);
        console.log(`URL: ${doc.url}`);
        console.log(`Tags: ${doc.tags.join(', ')}`);
        console.log('---');
      });
    }
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the function
countRecords(); 