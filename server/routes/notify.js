// server/routes/notify.js
// Purpose: role-targeted push sender used by router.js

const AdminPushToken = require("../models/AdminPushToken");
const { admin } = require("../notifications/fcm");          // uses your firebase-admin init
const { recipientsForStage } = require("../notifications/roles");

/**
 * Send a role-targeted push for a business stage.
 * @param {string} stage - One of STAGES.* (from roles.js)
 * @param {string} title - Notification title
 * @param {string} body  - Notification body
 * @param {object} data  - Extra key/values (strings only in FCM). Will be stringified.
 */
async function notifyStage(stage, title, body, data = {}) {
  try {
    // 1) resolve recipients by stage
    const targetEmails = recipientsForStage(stage);
    if (!Array.isArray(targetEmails) || targetEmails.length === 0) {
      console.log(`[notifyStage] No recipients for stage ${stage}`);
      return;
    }

    // 2) look up tokens for those emails
    const tokens = await AdminPushToken.find({ email: { $in: targetEmails } }).select("token -_id");
    const tokenList = tokens.map(t => t.token).filter(Boolean);

    if (tokenList.length === 0) {
      console.log(`[notifyStage] No tokens for recipients: ${targetEmails.join(", ")}`);
      return;
    }

    // 3) build message
    const messaging = admin.messaging();
    const safeData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
    );

    // 4) chunk + send
    const chunkSize = 400; // under FCM's 500 recommendation
    for (let i = 0; i < tokenList.length; i += chunkSize) {
      const chunk = tokenList.slice(i, i + chunkSize);

      const message = {
        tokens: chunk,
        notification: { title, body },
        data: safeData,
        webpush: {
          fcmOptions: {
            link: safeData.deepLink || "https://gisconnect-web.onrender.com/adminHome",
          },
        },
      };

      const resp = await messaging.sendEachForMulticast(message);
      console.log(`[notifyStage] ${stage} sent: success=${resp.successCount}, fail=${resp.failureCount}`);
      if (resp.failureCount) {
        resp.responses.forEach((r, idx) => {
          if (!r.success) {
            console.warn("  • failure:", r.error?.code, r.error?.message, "(token:", chunk[idx], ")");
          }
        });
      }
    }
  } catch (err) {
    console.error("notifyStage error:", err);
  }
}

module.exports = { notifyStage };

// const express = require("express");
// const router = express.Router();
// const AdminPushToken = require("../models/AdminPushToken");
// const messaging = require("../notifications/fcm");
// const { recipientsForStage } = require("../notifications/roles");

// // (B) A tiny helper you can call from anywhere in your app:
// async function notifyStage(stage, title, body, data = {}) {
//   try {
//     const targetEmails = recipientsForStage(stage);
//     if (targetEmails.length === 0) return;

//     const tokens = await AdminPushToken.find({ email: { $in: targetEmails } }).select("token -_id");
//     const tokenList = tokens.map(t => t.token).filter(Boolean);
//     if (tokenList.length === 0) return;

//     // Send in chunks (FCM recommends < 500 tokens per call)
//     const chunkSize = 400;
//     for (let i = 0; i < tokenList.length; i += chunkSize) {
//       const chunk = tokenList.slice(i, i + chunkSize);

//       await messaging.sendEachForMulticast({
//         tokens: chunk,
//         notification: { title, body },
//         data: Object.entries(data).reduce((acc, [k, v]) => {
//           acc[k] = String(v ?? "");
//           return acc;
//         }, {}),
//         webpush: {
//           fcmOptions: {
//             link: data?.deepLink || "https://gisconnect-web.onrender.com/adminHome",
//           },
//         },
//       });
//     }
//   } catch (err) {
//     console.error("notifyStage error:", err);
//   }
// }

// module.exports = { router, notifyStage };
