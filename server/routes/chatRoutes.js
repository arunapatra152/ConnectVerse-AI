const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const { protect, accountActive, validateBody } = require('../middleware/auth');

// ==================== PRIVATE MESSAGES ====================

/**
 * @route   GET /api/chat/private/:recipientId
 * @desc    Get private chat history with a user
 * @access  Protected
 * @query   limit, page
 */
router.get('/private/:recipientId', protect, accountActive, async (req, res) => {
  try {
    const { recipientId } = req.params;
    const { limit = 50, page = 1 } = req.query;

    // Validate recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Check if users are blocking each other
    const currentUser = await User.findById(req.user.userId);
    if (currentUser.isBlockingUser(recipientId) || recipient.isBlockingUser(req.user.userId)) {
      return res.status(403).json({
        status: 'error',
        message: 'Cannot access chat with this user',
      });
    }

    // Get chat history
    const messages = await Message.getPrivateChatHistory(
      req.user.userId,
      recipientId,
      parseInt(limit),
      parseInt(page)
    );

    res.status(200).json({
      status: 'success',
      data: messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Get private chat error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch chat history',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/chat/private/:recipientId
 * @desc    Send private message
 * @access  Protected
 * @body    { content }
 */
router.post(
  '/private/:recipientId',
  protect,
  accountActive,
  validateBody(['content']),
  async (req, res) => {
    try {
      const { recipientId } = req.params;
      const { content } = req.body;

      // Validate recipient exists
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      // Check if users are blocking each other
      const currentUser = await User.findById(req.user.userId);
      if (currentUser.isBlockingUser(recipientId) || recipient.isBlockingUser(req.user.userId)) {
        return res.status(403).json({
          status: 'error',
          message: 'Cannot send message to this user',
        });
      }

      // Create message
      const message = await Message.create({
        senderId: req.user.userId,
        recipientId: recipientId,
        content: content,
        messageType: 'private',
      });

      // Populate sender info
      await message.populate('senderId', 'username avatar');

      // Update sender message count
      await currentUser.incrementMessageCount();

      // Emit via Socket.io if available
      if (req.io) {
        const roomId = [req.user.userId, recipientId].sort().join('_');
        req.io.to(roomId).emit('receive_private_message', message);
      }

      res.status(201).json({
        status: 'success',
        message: 'Message sent successfully',
        data: message,
      });
    } catch (error) {
      console.error('Send private message error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to send message',
        error: error.message,
      });
    }
  }
);

/**
 * @route   PUT /api/chat/private/:messageId
 * @desc    Edit private message
 * @access  Protected
 * @body    { content }
 */
router.put('/private/:messageId', protect, accountActive, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        status: 'error',
        message: 'Content is required',
      });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        status: 'error',
        message: 'Message not found',
      });
    }

    // Check if user is the sender
    if (message.senderId.toString() !== req.user.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to edit this message',
      });
    }

    // Update message
    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    res.status(200).json({
      status: 'success',
      message: 'Message updated successfully',
      data: message,
    });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update message',
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/chat/private/:messageId
 * @desc    Delete private message (soft delete)
 * @access  Protected
 */
router.delete('/private/:messageId', protect, accountActive, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        status: 'error',
        message: 'Message not found',
      });
    }

    // Check if user is the sender
    if (message.senderId.toString() !== req.user.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this message',
      });
    }

    // Soft delete
    await message.softDelete();

    res.status(200).json({
      status: 'success',
      message: 'Message deleted successfully',
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete message',
      error: error.message,
    });
  }
});

/**
 * @route   PUT /api/chat/private/:messageId/read
 * @desc    Mark private message as read
 * @access  Protected
 */
router.put('/private/:messageId/read', protect, accountActive, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        status: 'error',
        message: 'Message not found',
      });
    }

    // Mark as read
    await message.markAsRead();

    res.status(200).json({
      status: 'success',
      message: 'Message marked as read',
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to mark message as read',
      error: error.message,
    });
  }
});

// ==================== GROUP MESSAGES ====================

/**
 * @route   GET /api/chat/group/:roomId
 * @desc    Get group chat history
 * @access  Protected
 * @query   limit, page
 */
router.get('/group/:roomId', protect, accountActive, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 50, page = 1 } = req.query;

    // Get group chat history
    const messages = await Message.getGroupChatHistory(
      roomId,
      parseInt(limit),
      parseInt(page)
    );

    res.status(200).json({
      status: 'success',
      data: messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Get group chat error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch group chat history',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/chat/group/:roomId
 * @desc    Send group message
 * @access  Protected
 * @body    { content, communityId }
 */
router.post(
  '/group/:roomId',
  protect,
  accountActive,
  validateBody(['content']),
  async (req, res) => {
    try {
      const { roomId } = req.params;
      const { content, communityId } = req.body;

      // Create group message
      const message = await Message.create({
        senderId: req.user.userId,
        roomId: roomId,
        communityId: communityId,
        content: content,
        messageType: 'group',
      });

      // Populate sender info
      await message.populate('senderId', 'username avatar');

      // Update sender message count
      const user = await User.findById(req.user.userId);
      await user.incrementMessageCount();

      // Emit via Socket.io if available
      if (req.io) {
        req.io.to(roomId).emit('receive_group_message', message);
      }

      res.status(201).json({
        status: 'success',
        message: 'Message sent successfully',
        data: message,
      });
    } catch (error) {
      console.error('Send group message error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to send message',
        error: error.message,
      });
    }
  }
);

/**
 * @route   PUT /api/chat/group/:messageId
 * @desc    Edit group message
 * @access  Protected
 * @body    { content }
 */
router.put('/group/:messageId', protect, accountActive, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        status: 'error',
        message: 'Content is required',
      });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        status: 'error',
        message: 'Message not found',
      });
    }

    // Check if user is the sender
    if (message.senderId.toString() !== req.user.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to edit this message',
      });
    }

    // Update message
    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    res.status(200).json({
      status: 'success',
      message: 'Message updated successfully',
      data: message,
    });
  } catch (error) {
    console.error('Edit group message error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update message',
      error: error.message,
    });
  }
});

/**
 * @route   DELETE /api/chat/group/:messageId
 * @desc    Delete group message (soft delete)
 * @access  Protected
 */
router.delete('/group/:messageId', protect, accountActive, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        status: 'error',
        message: 'Message not found',
      });
    }

    // Check if user is the sender
    if (message.senderId.toString() !== req.user.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this message',
      });
    }

    // Soft delete
    await message.softDelete();

    res.status(200).json({
      status: 'success',
      message: 'Message deleted successfully',
    });
  } catch (error) {
    console.error('Delete group message error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete message',
      error: error.message,
    });
  }
});

/**
 * @route   PUT /api/chat/group/:messageId/read
 * @desc    Mark group message as read by user
 * @access  Protected
 */
router.put('/group/:messageId/read', protect, accountActive, async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        status: 'error',
        message: 'Message not found',
      });
    }

    // Mark as read by user
    await message.markAsReadBy(req.user.userId);

    res.status(200).json({
      status: 'success',
      message: 'Message marked as read',
      data: {
        messageId: message._id,
        readCount: message.readCount,
      },
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to mark message as read',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/chat/conversations
 * @desc    Get all conversations for current user
 * @access  Protected
 */
router.get('/conversations', protect, accountActive, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get latest private messages
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { senderId: userId, messageType: 'private' },
            { recipientId: userId, messageType: 'private' },
          ],
          deletedAt: null,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$senderId', userId] },
              '$recipientId',
              '$senderId',
            ],
          },
          lastMessage: { $first: '$$ROOT' },
        },
      },
      {
        $limit: 50,
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: conversations,
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch conversations',
      error: error.message,
    });
  }
});

module.exports = router;
