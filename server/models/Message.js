const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Null for group messages
    },
    roomId: {
      type: String,
      default: null, // Used for group/community chats
    },
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      default: null, // Reference to community if group message
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    messageType: {
      type: String,
      enum: ['private', 'group'],
      required: true,
    },
    read: {
      type: Boolean,
      default: false, // Track if private message is read
    },
    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ], // Track who read group messages
    attachments: [
      {
        url: String,
        type: String, // 'image', 'video', 'file', etc.
        filename: String,
      },
    ],
    edited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null, // Soft delete
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Indexes for better query performance
messageSchema.index({ senderId: 1, timestamp: -1 });
messageSchema.index({ recipientId: 1, timestamp: -1 });
messageSchema.index({ roomId: 1, timestamp: -1 });
messageSchema.index({ communityId: 1, timestamp: -1 });
messageSchema.index(
  { senderId: 1, recipientId: 1, timestamp: -1 },
  { name: 'private_chat_index' }
);
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // Optional: Auto-delete after 30 days

// Static method to get private chat history
messageSchema.statics.getPrivateChatHistory = function (userId1, userId2, limit = 50, page = 1) {
  const skip = (page - 1) * limit;

  return this.find({
    $or: [
      {
        senderId: userId1,
        recipientId: userId2,
      },
      {
        senderId: userId2,
        recipientId: userId1,
      },
    ],
    messageType: 'private',
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('senderId', 'username avatar')
    .lean();
};

// Static method to get group chat history
messageSchema.statics.getGroupChatHistory = function (roomId, limit = 50, page = 1) {
  const skip = (page - 1) * limit;

  return this.find({
    roomId: roomId,
    messageType: 'group',
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('senderId', 'username avatar')
    .lean();
};

// Instance method to mark as read (for private messages)
messageSchema.methods.markAsRead = function () {
  this.read = true;
  return this.save();
};

// Instance method to mark as read by user (for group messages)
messageSchema.methods.markAsReadBy = function (userId) {
  const existingRead = this.readBy.find(
    (read) => read.userId.toString() === userId.toString()
  );

  if (!existingRead) {
    this.readBy.push({
      userId: userId,
      readAt: new Date(),
    });
  }

  return this.save();
};

// Instance method to soft delete
messageSchema.methods.softDelete = function () {
  this.deletedAt = new Date();
  return this.save();
};

// Virtual to get message read count (for group messages)
messageSchema.virtual('readCount').get(function () {
  return this.readBy ? this.readBy.length : 0;
});

// Ensure virtuals are included in JSON output
messageSchema.set('toJSON', { virtuals: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
