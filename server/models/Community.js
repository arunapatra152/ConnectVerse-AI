const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      // Generated from name
    },
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'technology',
        'lifestyle',
        'education',
        'health',
        'entertainment',
        'gaming',
        'sports',
        'art',
        'music',
        'food',
        'travel',
        'business',
        'other',
      ],
    },
    banner: {
      type: String,
      default: null, // URL to banner image
    },
    icon: {
      type: String,
      default: null, // URL to community icon
    },
    privacy: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    moderators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    rules: [
      {
        title: String,
        description: String,
      },
    ],
    tags: [String],
    stats: {
      totalMembers: {
        type: Number,
        default: 0,
      },
      totalPosts: {
        type: Number,
        default: 0,
      },
      totalConfessions: {
        type: Number,
        default: 0,
      },
    },
    settings: {
      allowMemberPosts: {
        type: Boolean,
        default: true,
      },
      requireApproval: {
        type: Boolean,
        default: false,
      },
      allowConfessions: {
        type: Boolean,
        default: true,
      },
      postFrequencyLimit: {
        type: Number,
        default: null, // Posts per hour, null = no limit
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    joinRequests: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        requestedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ==================== INDEXES ====================

communitySchema.index({ name: 1 });
communitySchema.index({ slug: 1 });
communitySchema.index({ category: 1 });
communitySchema.index({ creator: 1 });
communitySchema.index({ createdAt: -1 });
communitySchema.index({ 'stats.totalMembers': -1 });

// ==================== PRE-SAVE MIDDLEWARE ====================

/**
 * Generate slug from name before saving
 */
communitySchema.pre('save', function (next) {
  if (!this.slug || this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-');
  }
  next();
});

/**
 * Update member count
 */
communitySchema.pre('save', function (next) {
  this.stats.totalMembers = this.members.length;
  next();
});

// ==================== INSTANCE METHODS ====================

/**
 * Add member to community
 */
communitySchema.methods.addMember = function (userId) {
  if (!this.members.includes(userId)) {
    this.members.push(userId);
    this.stats.totalMembers = this.members.length;
  }
  return this.save();
};

/**
 * Remove member from community
 */
communitySchema.methods.removeMember = function (userId) {
  this.members = this.members.filter((id) => id.toString() !== userId.toString());
  this.stats.totalMembers = this.members.length;
  return this.save();
};

/**
 * Check if user is member
 */
communitySchema.methods.isMember = function (userId) {
  return this.members.some((id) => id.toString() === userId.toString());
};

/**
 * Add moderator
 */
communitySchema.methods.addModerator = function (userId) {
  if (!this.moderators.includes(userId)) {
    this.moderators.push(userId);
  }
  return this.save();
};

/**
 * Remove moderator
 */
communitySchema.methods.removeModerator = function (userId) {
  this.moderators = this.moderators.filter(
    (id) => id.toString() !== userId.toString()
  );
  return this.save();
};

/**
 * Check if user is moderator
 */
communitySchema.methods.isModerator = function (userId) {
  return this.moderators.some((id) => id.toString() === userId.toString());
};

/**
 * Check if user is creator
 */
communitySchema.methods.isCreator = function (userId) {
  return this.creator.toString() === userId.toString();
};

/**
 * Check if user has permission to moderate
 */
communitySchema.methods.canModerate = function (userId) {
  return this.isCreator(userId) || this.isModerator(userId);
};

/**
 * Add join request
 */
communitySchema.methods.addJoinRequest = function (userId) {
  const exists = this.joinRequests.some(
    (req) => req.userId.toString() === userId.toString()
  );

  if (!exists) {
    this.joinRequests.push({
      userId: userId,
      requestedAt: new Date(),
    });
  }

  return this.save();
};

/**
 * Approve join request
 */
communitySchema.methods.approveJoinRequest = function (userId) {
  this.joinRequests = this.joinRequests.filter(
    (req) => req.userId.toString() !== userId.toString()
  );
  return this.addMember(userId);
};

/**
 * Reject join request
 */
communitySchema.methods.rejectJoinRequest = function (userId) {
  this.joinRequests = this.joinRequests.filter(
    (req) => req.userId.toString() !== userId.toString()
  );
  return this.save();
};

/**
 * Add rule
 */
communitySchema.methods.addRule = function (title, description) {
  this.rules.push({ title, description });
  return this.save();
};

/**
 * Remove rule
 */
communitySchema.methods.removeRule = function (ruleIndex) {
  if (ruleIndex >= 0 && ruleIndex < this.rules.length) {
    this.rules.splice(ruleIndex, 1);
  }
  return this.save();
};

/**
 * Increment post count
 */
communitySchema.methods.incrementPostCount = function () {
  this.stats.totalPosts += 1;
  return this.save();
};

/**
 * Decrement post count
 */
communitySchema.methods.decrementPostCount = function () {
  if (this.stats.totalPosts > 0) {
    this.stats.totalPosts -= 1;
  }
  return this.save();
};

/**
 * Increment confession count
 */
communitySchema.methods.incrementConfessionCount = function () {
  this.stats.totalConfessions += 1;
  return this.save();
};

/**
 * Decrement confession count
 */
communitySchema.methods.decrementConfessionCount = function () {
  if (this.stats.totalConfessions > 0) {
    this.stats.totalConfessions -= 1;
  }
  return this.save();
};

/**
 * Get public community info
 */
communitySchema.methods.getPublicInfo = function () {
  return {
    _id: this._id,
    name: this.name,
    slug: this.slug,
    description: this.description,
    category: this.category,
    banner: this.banner,
    icon: this.icon,
    privacy: this.privacy,
    memberCount: this.members.length,
    postCount: this.stats.totalPosts,
    confessionCount: this.stats.totalConfessions,
    isFeatured: this.isFeatured,
    createdAt: this.createdAt,
  };
};

// ==================== STATIC METHODS ====================

/**
 * Find communities by category
 */
communitySchema.statics.findByCategory = function (category, limit = 10) {
  return this.find({ category, isActive: true })
    .sort({ 'stats.totalMembers': -1 })
    .limit(limit)
    .populate('creator', 'username avatar');
};

/**
 * Find featured communities
 */
communitySchema.statics.findFeatured = function (limit = 10) {
  return this.find({ isFeatured: true, isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('creator', 'username avatar');
};

/**
 * Search communities
 */
communitySchema.statics.searchCommunities = function (query, limit = 20) {
  return this.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } },
      { tags: { $in: [new RegExp(query, 'i')] } },
    ],
    isActive: true,
  })
    .sort({ 'stats.totalMembers': -1 })
    .limit(limit)
    .populate('creator', 'username avatar');
};

/**
 * Find trending communities
 */
communitySchema.statics.findTrending = function (limit = 10) {
  return this.find({ isActive: true })
    .sort({ 'stats.totalMembers': -1 })
    .limit(limit)
    .populate('creator', 'username avatar');
};

/**
 * Get communities by creator
 */
communitySchema.statics.findByCreator = function (creatorId, limit = 50) {
  return this.find({ creator: creatorId, isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ==================== VIRTUALS ====================

/**
 * Virtual field for member count
 */
communitySchema.virtual('memberCount').get(function () {
  return this.members.length;
});

/**
 * Virtual field for moderator count
 */
communitySchema.virtual('moderatorCount').get(function () {
  return this.moderators.length;
});

/**
 * Virtual field for activity score (for trending)
 */
communitySchema.virtual('activityScore').get(function () {
  return this.stats.totalMembers + this.stats.totalPosts + this.stats.totalConfessions;
});

// Ensure virtuals are included in JSON output
communitySchema.set('toJSON', { virtuals: true });

const Community = mongoose.model('Community', communitySchema);

module.exports = Community;
