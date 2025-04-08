const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;

// Middleware to verify JWT token
const authMiddleware = (req, res, next) => {
  try {
    // Get token from header, cookie, or query param
    const token = 
      req.cookies?.auth_token || 
      req.header('Authorization')?.replace('Bearer ', '') ||
      req.query?.token;
    
    // Check if token exists
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Add user from payload to request
    req.user = decoded;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authMiddleware; 