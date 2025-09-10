const mongoose = require("mongoose");

const AdminPushTokenSchema = new mongoose.Schema({
  email: { type: String, index: true, required: true },
  token: { type: String, unique: true, required: true },
  platform: { type: String }, // "web" | "ios" | "android" | etc (optional)
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AdminPushToken", AdminPushTokenSchema);