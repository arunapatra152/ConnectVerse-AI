const socketIO = require('socket.io');
const Message = require('../models/Message');

// Store active users: { userId: socketId }
const activeUsers = new Map();

// Store typing users: { roomId: Set of userIds }
const typingUsers = new Map();

const initializeSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Middleware for authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    const userId = socket.handshake.auth.userId;

    if (!token || !userId) {
      return next(new Error('Authentication required'));
    }

    // TODO: Verify JWT token here
    socket.userId = userId;
    next();
  });

  // Connection event
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId} (Socket ID: ${socket.id})`);

    // Store active user
    activeUsers.set(socket.userId, socket.id);

    // Broadcast user online status
    io.emit('user_online', {
      userId: socket.userId,
      timestamp: new Date(),
    });

    // ==================== ONE-ON-ONE CHAT ====================

    // Join a private chat room (between two users)
    socket.on('join_private_chat', (data) => {
      const { recipientId } = data;
      // Create a unique room ID for two users
      const roomId = [socket.userId, recipientId].sort().join('_');
      socket.join(roomId);

      console.log(`${socket.userId} joined private chat with ${recipientId}`);

      // Notify recipient that user is online
      const recipientSocketId = activeUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('user_online_in_chat', {
          userId: socket.userId,
        });
      }
    });

    // Send private message
    socket.on('send_private_message', async (data) => {
      const { recipientId, content } = data;
      const roomId = [socket.userId, recipientId].sort().join('_');

      try {
        // Save message to MongoDB
        const message = await Message.create({
          senderId: socket.userId,
          recipientId: recipientId,
          content: content,
          messageType: 'private',
          timestamp: new Date(),
          read: false,
        });

        const messageData = {
          _id: message._id,
          senderId: message.senderId,
          recipientId: message.recipientId,
          content: message.content,
          timestamp: message.timestamp,
          read: message.read,
        };

        // Emit to both users in the room
        io.to(roomId).emit('receive_private_message', messageData);

        console.log(
          `Message from ${socket.userId} to ${recipientId}: ${content}`
        );
      } catch (error) {
        socket.emit('error', { message: 'Failed to send message' });
        console.error('Error saving message:', error);
      }
    });

    // Get chat history
    socket.on('get_chat_history', async (data) => {
      const { recipientId, limit = 50, page = 1 } => data;

      try {
        const skip = (page - 1) * limit;
        const roomId = [socket.userId, recipientId].sort().join('_');

        const messages = await Message.find({
          $or: [
            {
              senderId: socket.userId,
              recipientId: recipientId,
            },
            {
              senderId: recipientId,
              recipientId: socket.userId,
            },
          ],
          messageType: 'private',
        })
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit);

        socket.emit('chat_history', {
          roomId: roomId,
          messages: messages.reverse(),
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to load chat history' });
        console.error('Error fetching chat history:', error);
      }
    });

    // ==================== GROUP CHAT ====================

    // Join a community/group chat room
    socket.on('join_group_chat', (data) => {
      const { roomId, communityId } = data;
      socket.join(roomId);

      console.log(`${socket.userId} joined group chat: ${roomId}`);

      // Notify others that user joined
      socket.to(roomId).emit('user_joined_group', {
        userId: socket.userId,
        roomId: roomId,
        timestamp: new Date(),
      });
    });

    // Send group message
    socket.on('send_group_message', async (data) => {
      const { roomId, content, communityId } = data;

      try {
        // Save message to MongoDB
        const message = await Message.create({
          senderId: socket.userId,
          roomId: roomId,
          communityId: communityId,
          content: content,
          messageType: 'group',
          timestamp: new Date(),
        });

        const messageData = {
          _id: message._id,
          senderId: message.senderId,
          roomId: message.roomId,
          communityId: message.communityId,
          content: message.content,
          timestamp: message.timestamp,
        };

        // Emit to all users in the room
        io.to(roomId).emit('receive_group_message', messageData);

        console.log(
          `Group message from ${socket.userId} in ${roomId}: ${content}`
        );
      } catch (error) {
        socket.emit('error', { message: 'Failed to send group message' });
        console.error('Error saving group message:', error);
      }
    });

    // Get group chat history
    socket.on('get_group_chat_history', async (data) => {
      const { roomId, limit = 50, page = 1 } = data;

      try {
        const skip = (page - 1) * limit;

        const messages = await Message.find({
          roomId: roomId,
          messageType: 'group',
        })
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .populate('senderId', 'username avatar');

        socket.emit('group_chat_history', {
          roomId: roomId,
          messages: messages.reverse(),
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to load group chat history' });
        console.error('Error fetching group chat history:', error);
      }
    });

    // ==================== TYPING INDICATORS ====================

    // User started typing
    socket.on('user_typing', (data) => {
      const { roomId } = data;

      if (!typingUsers.has(roomId)) {
        typingUsers.set(roomId, new Set());
      }
      typingUsers.get(roomId).add(socket.userId);

      // Broadcast typing status to room
      socket.to(roomId).emit('user_typing_status', {
        userId: socket.userId,
        typing: true,
      });
    });

    // User stopped typing
    socket.on('user_stop_typing', (data) => {
      const { roomId } = data;

      if (typingUsers.has(roomId)) {
        typingUsers.get(roomId).delete(socket.userId);
      }

      // Broadcast typing stopped to room
      socket.to(roomId).emit('user_typing_status', {
        userId: socket.userId,
        typing: false,
      });
    });

    // ==================== MESSAGE READ RECEIPTS ====================

    // Mark message as read
    socket.on('mark_message_read', async (data) => {
      const { messageId } = data;

      try {
        // Update message read status in MongoDB
        await Message.findByIdAndUpdate(messageId, { read: true });

        io.emit('message_read', {
          messageId: messageId,
          userId: socket.userId,
        });
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // Mark multiple messages as read
    socket.on('mark_messages_read', async (data) => {
      const { messageIds } = data;

      try {
        // Update multiple messages in MongoDB
        await Message.updateMany(
          { _id: { $in: messageIds } },
          { read: true }
        );

        io.emit('messages_read', {
          messageIds: messageIds,
          userId: socket.userId,
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // ==================== DISCONNECTION ====================

    // Leave private chat
    socket.on('leave_private_chat', (data) => {
      const { recipientId } = data;
      const roomId = [socket.userId, recipientId].sort().join('_');
      socket.leave(roomId);

      console.log(`${socket.userId} left private chat with ${recipientId}`);
    });

    // Leave group chat
    socket.on('leave_group_chat', (data) => {
      const { roomId } = data;
      socket.leave(roomId);

      // Notify others
      socket.to(roomId).emit('user_left_group', {
        userId: socket.userId,
        roomId: roomId,
        timestamp: new Date(),
      });

      console.log(`${socket.userId} left group chat: ${roomId}`);
    });

    // User disconnected
    socket.on('disconnect', () => {
      activeUsers.delete(socket.userId);

      // Broadcast user offline status
      io.emit('user_offline', {
        userId: socket.userId,
        timestamp: new Date(),
      });

      console.log(`User disconnected: ${socket.userId}`);
    });

    // ==================== ERROR HANDLING ====================

    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.userId}:`, error);
    });
  });

  return io;
};

// Helper function to get active users
const getActiveUsers = () => {
  return Array.from(activeUsers.keys());
};

// Helper function to get users in a room
const getUsersInRoom = (io, roomId) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  return room ? Array.from(room) : [];
};

module.exports = {
  initializeSocket,
  getActiveUsers,
  getUsersInRoom,
};
