const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // Don't include password in queries by default
    },
    avatar: {
      type: String,
      default: null, // URL to user avatar image
    },
    bio: {
      type: String,
      maxlength: 500,
      default: '',
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away'],
      default: 'offline',
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    communities: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Community',
      },
    ],
    savedConfessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Confession',
      },
    ],
    preferences: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      pushNotifications: {
        type: Boolean,
        default: true,
      },
      privateMessages: {
        type: String,
        enum: ['everyone', 'followers', 'none'],
        default: 'everyone',
      },
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light',
      },
    },
    role: {
      type: String,
      enum: ['user', 'moderator', 'admin'],
      default: 'user',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      select: false,
    },
    suspendedUntil: {
      type: Date,
      default: null, // For temporary bans
    },
    isBanned: {
      type: Boolean,
      default: false, // For permanent bans
    },
    banReason: {
      type: String,
      default: null,
    },
    stats: {
      totalMessages: {
        type: Number,
        default: 0,
      },
      totalConfessions: {
        type: Number,
        default: 0,
      },
      reportedCount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Indexes for better query performance
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ status: 1 });

// ==================== INSTANCE METHODS ====================

/**
 * Add follower
 */
userSchema.methods.addFollower = function (userId) {
  if (!this.followers.includes(userId)) {
    this.followers.push(userId);
  }
  return this.save();
};

/**
 * Remove follower
 */
userSchema.methods.removeFollower = function (userId) {
  this.followers = this.followers.filter((id) => id.toString() !== userId.toString());
  return this.save();
};

/**
 * Follow user
 */
userSchema.methods.followUser = function (userId) {
  if (!this.following.includes(userId)) {
    this.following.push(userId);
  }
  return this.save();
};

/**
 * Unfollow user
 */
userSchema.methods.unfollowUser = function (userId) {
  this.following = this.following.filter(
    (id) => id.toString() !== userId.toString()
  );
  return this.save();
};

/**
 * Block user
 */
userSchema.methods.blockUser = function (userId) {
  if (!this.blockedUsers.includes(userId)) {
    this.blockedUsers.push(userId);
  }
  return this.save();
};

/**
 * Unblock user
 */
userSchema.methods.unblockUser = function (userId) {
  this.blockedUsers = this.blockedUsers.filter(
    (id) => id.toString() !== userId.toString()
  );
  return this.save();
};

/**
 * Check if user is blocking another user
 */
userSchema.methods.isBlockingUser = function (userId) {
  return this.blockedUsers.some((id) => id.toString() === userId.toString());
};

/**
 * Add community
 */
userSchema.methods.joinCommunity = function (communityId) {
  if (!this.communities.includes(communityId)) {
    this.communities.push(communityId);
  }
  return this.save();
};

/**
 * Leave community
 */
userSchema.methods.leaveCommunity = function (communityId) {
  this.communities = this.communities.filter(
    (id) => id.toString() !== communityId.toString()
  );
  return this.save();
};

/**
 * Save confession
 */
userSchema.methods.saveConfession = function (confessionId) {
  if (!this.savedConfessions.includes(confessionId)) {
    this.savedConfessions.push(confessionId);
  }
  return this.save();
};

/**
 * Unsave confession
 */
userSchema.methods.unsaveConfession = function (confessionId) {
  this.savedConfessions = this.savedConfessions.filter(
    (id) => id.toString() !== confessionId.toString()
  );
  return this.save();
};

/**
 * Suspend user temporarily
 */
userSchema.methods.suspend = function (days, reason = '') {
  this.suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  this.status = 'offline';
  return this.save();
};

/**
 * Lift suspension
 */
userSchema.methods.liftSuspension = function () {
  this.suspendedUntil = null;
  return this.save();
};

/**
 * Ban user permanently
 */
userSchema.methods.ban = function (reason = '') {
  this.isBanned = true;
  this.banReason = reason;
  this.status = 'offline';
  return this.save();
};

/**
 * Unban user
 */
userSchema.methods.unban = function () {
  this.isBanned = false;
  this.banReason = null;
  return this.save();
};

/**
 * Check if user is suspended
 */
userSchema.methods.isSuspended = function () {
  if (!this.suspendedUntil) return false;
  return new Date() < this.suspendedUntil;
};

/**
 * Get user profile (public info)
 */
userSchema.methods.getPublicProfile = function () {
  return {
    _id: this._id,
    username: this.username,
    avatar: this.avatar,
    bio: this.bio,
    status: this.status,
    followers: this.followers.length,
    following: this.following.length,
    stats: this.stats,
    createdAt: this.createdAt,
  };
};

/**
 * Increment message count
 */
userSchema.methods.incrementMessageCount = function () {
  this.stats.totalMessages += 1;
  return this.save();
};

/**
 * Increment confession count
 */
userSchema.methods.incrementConfessionCount = function () {
  this.stats.totalConfessions += 1;
  return this.save();
};

// ==================== STATIC METHODS ====================

/**
 * Find user by email with password
 */
userSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email }).select('+password');
};

/**
 * Find active users (not banned, not suspended)
 */
userSchema.statics.findActiveUsers = function () {
  return this.find({
    isBanned: false,
    $or: [
      { suspendedUntil: null },
      { suspendedUntil: { $lte: new Date() } },
    ],
  });
};

/**
 * Search users by username or email
 */
userSchema.statics.searchUsers = function (query, limit = 10) {
  return this.find({
    $or: [
      { username: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } },
    ],
    isBanned: false,
  })
    .limit(limit)
    .select('-password');
};

// ==================== VIRTUALS ====================

/**
 * Virtual field for total followers + following
 */
userSchema.virtual('totalConnections').get(function () {
  return this.followers.length + this.following.length;
});

/**
 * Virtual field to check if account is active
 */
userSchema.virtual('isActive').get(function () {
  return !this.isBanned && !this.isSuspended();
});

// Ensure virtuals are included in JSON output
userSchema.set('toJSON', { virtuals: true });

// ==================== MIDDLEWARE ====================

/**
 * Hash password before saving if modified
 */
userSchema.pre('save', async function (next) {
  // Only hash if password is modified and this is not from direct password field selection
  if (!this.isModified('password')) return next();

  try {
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Remove password from user documents when serializing
 */
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.verificationToken;
  return userObject;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
