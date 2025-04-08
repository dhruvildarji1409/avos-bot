const mongoose = require('mongoose');
const ConfluenceData = require('../models/ConfluenceData');
const { getEmbedding, cleanTextForEmbedding } = require('../services/embeddingService');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  updateAllEmbeddings();
}).catch(err => {
  console.error('Error connecting to MongoDB:', err);
  process.exit(1);
});

// Function to update all embeddings
async function updateAllEmbeddings() {
  try {
    // Get all Confluence documents
    const allDocs = await ConfluenceData.find({});
    console.log(`Found ${allDocs.length} documents to update`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each document
    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i];
      
      try {
        console.log(`Processing document ${i+1}/${allDocs.length}: ${doc.title}`);
        
        // Clean content for embedding
        const processedContent = cleanTextForEmbedding(doc.content);
        
        // Generate embedding
        const embedding = await getEmbedding(doc.title + " " + processedContent);
        
        // Update document
        doc.processedContent = processedContent;
        doc.embedding = embedding;
        
        // Save document
        await doc.save();
        
        successCount++;
        console.log(`✅ Successfully updated document: ${doc.title}`);
      } catch (docError) {
        errorCount++;
        console.error(`❌ Error updating document ${doc.title}:`, docError);
      }
      
      // Small delay to avoid overwhelming the embedding service
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\nEmbedding update complete:');
    console.log(`✅ Successfully updated: ${successCount} documents`);
    console.log(`❌ Errors: ${errorCount} documents`);
    
    // Disconnect from MongoDB
    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error updating embeddings:', error);
    mongoose.disconnect();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  mongoose.disconnect();
  console.log('\nDisconnected from MongoDB due to application termination');
  process.exit(0);
}); 