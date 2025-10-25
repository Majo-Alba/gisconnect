// server/models/WebPushSubscription.js
const mongoose = require("mongoose");

const WebPushSubscriptionSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    // The exact object returned by reg.pushManager.subscribe(...)
    subscription: {
      endpoint: { type: String, required: true },
      expirationTime: { type: Number, required: false }, // may be null
      keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
      },
    },

    // Optional, handy for debugging/analytics
    userAgent: { type: String },

    // Bookkeeping
    lastSeenAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
    minimize: false,
    versionKey: false,
  }
);

// Prevent duplicate rows for the same email+endpoint pair
WebPushSubscriptionSchema.index(
  { email: 1, "subscription.endpoint": 1 },
  { unique: true }
);

// Keep lastSeenAt fresh
WebPushSubscriptionSchema.pre("save", function (next) {
  this.lastSeenAt = new Date();
  next();
});

/**
 * Upsert a subscription for an email.
 * - Ensures uniqueness on (email, endpoint)
 * - Updates keys/expirationTime/userAgent and lastSeenAt on revisit
 */
WebPushSubscriptionSchema.statics.upsertForEmail = async function ({
  email,
  subscription,
  userAgent,
}) {
  if (!email || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error("Invalid subscription payload");
  }

  const filter = { email: email.toLowerCase().trim(), "subscription.endpoint": subscription.endpoint };

  const update = {
    email: filter.email,
    subscription: {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    },
    userAgent: userAgent || undefined,
    lastSeenAt: new Date(),
  };

  const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
  return this.findOneAndUpdate(filter, update, opts).lean();
};

/**
 * Fetch all subscriptions for a list of emails.
 */
WebPushSubscriptionSchema.statics.findByEmails = async function (emails = []) {
  const list = (emails || []).map((e) => e.toLowerCase().trim()).filter(Boolean);
  if (!list.length) return [];
  return this.find({ email: { $in: list } }).lean();
};

/**
 * Remove a subscription by endpoint (e.g., on unsubscribe).
 */
WebPushSubscriptionSchema.statics.removeByEndpoint = async function (endpoint) {
  if (!endpoint) return { deletedCount: 0 };
  return this.deleteMany({ "subscription.endpoint": endpoint });
};

module.exports = mongoose.model("WebPushSubscription", WebPushSubscriptionSchema);
