/**
 * Admin Authentication Middleware
 * 
 * This middleware ensures that only administrators can access admin routes.
 * It should be used after the regular authentication middleware.
 */

module.exports = (req, res, next) => {
  try {
    // Check if user exists (should be set by the auth middleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // Check if user is an admin
    // Note: Adjust the condition based on your user model structure
    if (!req.user.isAdmin && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    // User is authenticated and is an admin, proceed
    next();
  } catch (error) {
    console.error('Error in admin auth middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication',
      error: error.message
    });
  }
}; 