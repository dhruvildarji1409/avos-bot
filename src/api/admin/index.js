/**
 * Admin API Routes Index
 * 
 * This file serves as the main entry point for all admin-related API routes.
 */

const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth');
const adminAuth = require('../../middlewares/admin-auth');

// Apply authentication middleware to all admin routes
router.use(auth);
router.use(adminAuth);

/**
 * @route   GET /api/admin/profile
 * @desc    Get admin profile information
 * @access  Admin
 */
router.get('/profile', (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      admin: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Error in /api/admin/profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while getting admin profile',
      error: error.message
    });
  }
});

// Note: Specific admin routes are imported and used directly in the main API router
// This file only contains admin routes that don't have their own dedicated files

module.exports = router; 