const express = require('express');
const router = express.Router();
const Community = require('../models/Community');
const User = require('../models/User');
const { protect, accountActive, admin, validateBody } = require('../middleware/auth');

// ==================== GET COMMUNITIES ====================

/**
 * @route   GET /api/community
 * @desc    Get all communities (with pagination)
 * @query   limit, page, search, sort
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 20, page = 1, search = '', sort = '-createdAt' } = req.query;
    const skip = (page - 1) * limit;

    let query = { isActive: true };

    // Search by name or description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const communities = await Community.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('creator', 'username avatar')
      .populate('moderators', 'username avatar');

    const total = await Community.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: communities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get communities error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch communities',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/community/:id
 * @desc    Get single community by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
      .populate('creator', 'username avatar bio')
      .populate('moderators', 'username avatar')
      .populate('members', 'username avatar');

    if (!community) {
      return res.status(404).json({
        status: 'error',
        message: 'Community not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: community,
    });
  } catch (error) {
    console.error('Get community error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch community',
      error: error.message,
    });
  }
});

// ==================== CREATE COMMUNITY ====================

/**
 * @route   POST /api/community
 * @desc    Create a new community
 * @access  Protected
 * @body    { name, description, category, privacy, banner }
 */
router.post(
  '/',
  protect,
  accountActive,
  validateBody(['name', 'description', 'category']),
  async (req, res) => {
    try {
      const { name, description, category, privacy = 'public', banner } = req.body;

      // Check if community name already exists
      const existingCommunity = await Community.findOne({ name });
      if (existingCommunity) {
        return res.status(409).json({
          status: 'error',
          message: 'Community with this name already exists',
        });
      }

      // Create community
      const community = await Community.create({
        name,
        description,
        category,
        privacy,
        banner,
        creator: req.user.userId,
        moderators: [req.user.userId],
        members: [req.user.userId],
      });

      await community.populate('creator', 'username avatar');
      await community.populate('moderators', 'username avatar');

      // Add user to community
      const user = await User.findById(req.user.userId);
      await user.joinCommunity(community._id);

      res.status(201).json({
        status: 'success',
        message: 'Community created successfully',
        data: community,
      });
    } catch (error) {
      console.error('Create community error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create community',
        error: error.message,
      });
    }
  }
);

// ==================== JOIN/LEAVE COMMUNITY ====================

/**
 * @route   POST /api/community/:id/join
 * @desc    Join a community
 * @access  Protected
 */
router.post('/:id/join', protect, accountActive, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({
        status: 'error',
        message: 'Community not found',
      });
    }

    // Check if already a member
    if (community.members.includes(req.user.userId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Already a member of this community',
      });
    }

    // Add user to community
    community.members.push(req.user.userId);
    await community.save();

    // Add community to user
    const user = await User.findById(req.user.userId);
    await user.joinCommunity(community._id);

    res.status(200).json({
      status: 'success',
      message: 'Joined community successfully',
      data: {
        communityId: community._id,
        memberCount: community.members.length,
      },
    });
  } catch (error) {
    console.error('Join community error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to join community',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/community/:id/leave
 * @desc    Leave a community
 * @access  Protected
 */
router.post('/:id/leave', protect, accountActive, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({
        status: 'error',
        message: 'Community not found',
      });
    }

    // Check if user is creator
    if (community.creator.toString() === req.user.userId) {
      return res.status(400).json({
        status: 'error',
        message: 'Creator cannot leave their own community',
      });
    }

    // Remove user from community
    community.members = community.members.filter(
      (id) => id.toString() !== req.user.userId
    );
    community.moderators = community.moderators.filter(
      (id) => id.toString() !== req.user.userId
    );
    await community.save();

    // Remove community from user
    const user = await User.findById(req.user.userId);
    await user.leaveCommunity(community._id);

    res.status(200).json({
      status: 'success',
      message: 'Left community successfully',
      data: {
        communityId: community._id,
        memberCount: community.members.length,
      },
    });
  } catch (error) {
    console.error('Leave community error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to leave community',
      error: error.message,
    });
  }
});

// ==================== UPDATE COMMUNITY ====================

/**
 * @route   PUT /api/community/:id
 * @desc    Update community details
 * @access  Protected (Creator/Moderator only)
 * @body    { name, description, category, privacy, banner }
 */
router.put('/:id', protect, accountActive, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({
        status: 'error',
        message: 'Community not found',
      });
    }

    // Check authorization
    const isCreator = community.creator.toString() === req.user.userId;
    const isModerator = community.moderators.includes(req.user.userId);

    if (!isCreator && !isModerator) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this community',
      });
    }

    // Update fields
    if (req.body.name) community.name = req.body.name;
    if (req.body.description) community.description = req.body.description;
    if (req.body.category) community.category = req.body.category;
    if (req.body.privacy) community.privacy = req.body.privacy;
    if (req.body.banner) community.banner = req.body.banner;

    await community.save();

    res.status(200).json({
      status: 'success',
      message: 'Community updated successfully',
      data: community,
    });
  } catch (error) {
    console.error('Update community error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update community',
      error: error.message,
    });
  }
});

// ==================== MODERATOR MANAGEMENT ====================

/**
 * @route   POST /api/community/:id/moderators/:userId
 * @desc    Add moderator to community
 * @access  Protected (Creator only)
 */
router.post('/:id/moderators/:userId', protect, accountActive, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({
        status: 'error',
        message: 'Community not found',
      });
    }

    // Check if user is creator
    if (community.creator.toString() !== req.user.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Only creator can add moderators',
      });
    }

    // Check if user exists and is member
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (!community.members.includes(req.params.userId)) {
      return res.status(400).json({
        status: 'error',
        message: 'User is not a member of this community',
      });
    }

    // Add as moderator
    if (!community.moderators.includes(req.params.userId)) {
      community.moderators.push(req.params.userId);
      await community.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Moderator added successfully',
      data: {
        communityId: community._id,
        moderatorCount: community.moderators.length,
      },
    });
  } catch (error) {
    console.error('Add moderator error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to add moderator',
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/community/:id/moderators/:userId
 * @desc    Remove moderator from community
 * @access  Protected (Creator only)
 */
router.delete('/:id/moderators/:userId', protect, accountActive, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({
        status: 'error',
        message: 'Community not found',
      });
    }

    // Check if user is creator
    if (community.creator.toString() !== req.user.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Only creator can remove moderators',
      });
    }

    // Remove moderator
    community.moderators = community.moderators.filter(
      (id) => id.toString() !== req.params.userId
    );
    await community.save();

    res.status(200).json({
      status: 'success',
      message: 'Moderator removed successfully',
      data: {
        communityId: community._id,
        moderatorCount: community.moderators.length,
      },
    });
  } catch (error) {
    console.error('Remove moderator error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove moderator',
      error: error.message,
    });
  }
});

// ==================== MEMBER MANAGEMENT ====================

/**
 * @route   DELETE /api/community/:id/members/:userId
 * @desc    Remove member from community (kick out)
 * @access  Protected (Moderator/Creator only)
 */
router.delete('/:id/members/:userId', protect, accountActive, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({
        status: 'error',
        message: 'Community not found',
      });
    }

    // Check authorization
    const isCreator = community.creator.toString() === req.user.userId;
    const isModerator = community.moderators.includes(req.user.userId);

    if (!isCreator && !isModerator) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to remove members',
      });
    }

    // Remove member
    community.members = community.members.filter(
      (id) => id.toString() !== req.params.userId
    );
    await community.save();

    // Remove community from user
    const user = await User.findById(req.params.userId);
    if (user) {
      await user.leaveCommunity(community._id);
    }

    res.status(200).json({
      status: 'success',
      message: 'Member removed successfully',
      data: {
        communityId: community._id,
        memberCount: community.members.length,
      },
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove member',
      error: error.message,
    });
  }
});

// ==================== COMMUNITY STATS ====================

/**
 * @route   GET /api/community/:id/stats
 * @desc    Get community statistics
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({
        status: 'error',
        message: 'Community not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        communityId: community._id,
        name: community.name,
        memberCount: community.members.length,
        moderatorCount: community.moderators.length,
        createdAt: community.createdAt,
        updatedAt: community.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get community stats error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch community stats',
      error: error.message,
    });
  }
});

// ==================== DELETE COMMUNITY ====================

/**
 * @route   DELETE /api/community/:id
 * @desc    Delete community (soft delete)
 * @access  Protected (Creator only)
 */
router.delete('/:id', protect, accountActive, async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);

    if (!community) {
      return res.status(404).json({
        status: 'error',
        message: 'Community not found',
      });
    }

    // Check if user is creator
    if (community.creator.toString() !== req.user.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Only creator can delete the community',
      });
    }

    // Soft delete
    community.isActive = false;
    await community.save();

    res.status(200).json({
      status: 'success',
      message: 'Community deleted successfully',
    });
  } catch (error) {
    console.error('Delete community error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete community',
      error: error.message,
    });
  }
});

module.exports = router;
