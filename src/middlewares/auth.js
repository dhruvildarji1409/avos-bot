/**
 * Authentication Middleware
 * 
 * This middleware validates the JWT token and sets the user on the request object.
 */

const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('x-auth-token');
    
    // Check if no token
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token, access denied'
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Set user in request
    req.user = decoded.user;
    
    // Move to next middleware
    next();
  } catch (error) {
    console.error('Error in auth middleware:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token, access denied'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false, 
        message: 'Token expired, please log in again'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication',
      error: error.message
    });
  }
}; 