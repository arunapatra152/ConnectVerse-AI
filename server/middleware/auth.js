const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware to verify JWT token and protect routes
 * Adds req.user with userId and email
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token, return error
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized to access this route',
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your_jwt_secret_key'
      );

      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized to access this route',
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Middleware to check if user is admin
 * Must be used after protect middleware
 */
const admin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to access this route - Admin only',
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Middleware to check if user is moderator or admin
 * Must be used after protect middleware
 */
const moderator = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to access this route - Moderator or Admin only',
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Middleware to check if user account is active
 * Must be used after protect middleware
 */
const accountActive = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({
        status: 'error',
        message: `Your account has been permanently banned. Reason: ${user.banReason || 'No reason provided'}`,
      });
    }

    // Check if user is suspended
    if (user.isSuspended()) {
      const resumeDate = user.suspendedUntil.toLocaleString();
      return res.status(403).json({
        status: 'error',
        message: `Your account is suspended until ${resumeDate}`,
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Server error',
      error: error.message,
    });
  }
};

/**
 * Middleware to check if user is the owner of a resource
 * Pass the resource object as parameter
 */
const isOwner = (resourceUserId) => {
  return (req, res, next) => {
    if (resourceUserId.toString() !== req.user.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to access this resource',
      });
    }
    next();
  };
};

/**
 * Middleware to validate request body
 * Pass an array of required fields
 */
const validateBody = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Middleware to rate limit requests
 */
const rateLimit = (maxRequests = 100, windowMs = 60000) => {
  const requestMap = new Map();

  return (req, res, next) => {
    const userId = req.user?.userId || req.ip;
    const now = Date.now();

    if (!requestMap.has(userId)) {
      requestMap.set(userId, []);
    }

    const userRequests = requestMap.get(userId);
    const recentRequests = userRequests.filter((time) => now - time < windowMs);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Please try again later.',
      });
    }

    recentRequests.push(now);
    requestMap.set(userId, recentRequests);

    next();
  };
};

/**
 * Middleware to log requests (optional)
 */
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const path = req.path;
  const userId = req.user?.userId || 'anonymous';

  console.log(`[${timestamp}] ${method} ${path} - User: ${userId}`);
  next();
};

module.exports = {
  protect,
  admin,
  moderator,
  accountActive,
  isOwner,
  validateBody,
  rateLimit,
  requestLogger,
};
