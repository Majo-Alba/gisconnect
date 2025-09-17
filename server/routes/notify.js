// Once logged into adminHome, getting the following console error "POST https://gisconnect-api.onrender.com/push/register 404 (Not Found)". I get that this error comes because all of my endpoints are stored in router.js, except for /push/register who is currently sitting in notify.js. This is my current notify.js, I'll be sending the router.post to my routes.js, but what about the async function notifyStage? Do I also send it to router.js or should this part of code stay seperately?
const express = require("express");
const router = express.Router();
const AdminPushToken = require("../models/AdminPushToken");
const messaging = require("../notifications/fcm");
const { recipientsForStage } = require("../notifications/roles");

// (A) Admin device registers its token (call from admin UI after login)
// router.post("/admin/push/register", async (req, res) => {
//   try {
//     const { email, token, platform } = req.body || {};
//     if (!email || !token) return res.status(400).json({ error: "email and token are required" });

//     await AdminPushToken.updateOne(
//       { token },
//       { $set: { email, token, platform, lastSeenAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
//       { upsert: true }
//     );

//     res.json({ ok: true });
//   } catch (err) {
//     console.error("register token error:", err);
//     res.status(500).json({ error: "Failed to register token" });
//   }
// });

// (B) A tiny helper you can call from anywhere in your app:
async function notifyStage(stage, title, body, data = {}) {
  try {
    const targetEmails = recipientsForStage(stage);
    if (targetEmails.length === 0) return;

    const tokens = await AdminPushToken.find({ email: { $in: targetEmails } }).select("token -_id");
    const tokenList = tokens.map(t => t.token).filter(Boolean);
    if (tokenList.length === 0) return;

    // Send in chunks (FCM recommends < 500 tokens per call)
    const chunkSize = 400;
    for (let i = 0; i < tokenList.length; i += chunkSize) {
      const chunk = tokenList.slice(i, i + chunkSize);

      await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: Object.entries(data).reduce((acc, [k, v]) => {
          acc[k] = String(v ?? "");
          return acc;
        }, {}),
        webpush: {
          fcmOptions: {
            link: data?.deepLink || "https://gisconnect-web.onrender.com/adminHome",
          },
        },
      });
    }
  } catch (err) {
    console.error("notifyStage error:", err);
  }
}

module.exports = { router, notifyStage };
