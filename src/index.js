const express = require('express');
const connectDB = require('./db/db');
const chatRoutes = require('./api/routes');
const path = require('path');
require('dotenv').config();

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', chatRoutes);

// Serve documentation files with proper content type
app.get('/docs/:filename', (req, res) => {
  const { filename } = req.params;
  const fs = require('fs');
  
  // Construct the file path
  const filePath = path.join(__dirname, '..', 'docs', filename);
  
  // Check if file exists
  if (fs.existsSync(filePath)) {
    // Determine content type
    let contentType = 'text/plain';
    if (filename.endsWith('.md')) {
      contentType = 'text/markdown';
    } else if (filename.endsWith('.html')) {
      contentType = 'text/html';
    }
    
    // Read and send the file
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        return res.status(500).send('Error loading documentation');
      }
      
      res.setHeader('Content-Type', contentType);
      res.send(data);
    });
  } else {
    res.status(404).send('Documentation not found');
  }
});

// Serve the main HTML file for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 