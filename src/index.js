const express = require('express');
const connectDB = require('./db/db');
const chatRoutes = require('./api/routes');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(cookieParser());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', chatRoutes);

// Helper function to check auth token
const isAuthenticated = (req) => {
  try {
    const token = req.cookies?.auth_token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return false;
    
    jwt.verify(token, process.env.JWT_SECRET);
    return true;
  } catch (error) {
    return false;
  }
};

// Middleware to check login for main pages
const checkAuthForPage = (req, res, next) => {
  const publicPages = ['/login', '/register', '/confluence-admin.html', '/confluence-section-debug.html'];
  const isPublicPage = publicPages.includes(req.path);
  
  // If path is login page or has file extension, continue
  if (isPublicPage || req.path.includes('.')) {
    return next();
  }
  
  // Only redirect to login for the main app page
  if (req.path === '/' && !isAuthenticated(req)) {
    return res.redirect('/login');
  }
  
  next();
};

// Apply auth check middleware
app.use(checkAuthForPage);

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

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Serve admin pages explicitly
app.get('/confluence-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/confluence-admin.html'));
});

app.get('/confluence-section-debug.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/confluence-section-debug.html'));
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