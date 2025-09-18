// server/routes/notify.js
const AdminPushToken = require("../models/AdminPushToken");
const { admin } = require("../notifications/fcm");
const { recipientsForStage } = require("../notifications/roles");

async function notifyStage(stage, title, body, data = {}) {
  try {
    const targetEmails = recipientsForStage(stage);
    console.log(`[notifyStage] stage=${stage} -> recipients:`, targetEmails);

    if (!Array.isArray(targetEmails) || targetEmails.length === 0) {
      console.log(`[notifyStage] No recipients for stage ${stage}`);
      return;
    }

    const tokens = await AdminPushToken.find({ email: { $in: targetEmails } }).select("email token -_id");
    const tokenList = tokens.map(t => t.token).filter(Boolean);

    console.log(`[notifyStage] found tokens: ${tokenList.length}`);
    if (tokenList.length === 0) {
      console.log(`[notifyStage] No tokens found for recipients (did admins open AdminHome to register?)`);
      return;
    }

    const messaging = admin.messaging();
    const safeData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "")]));

    const chunkSize = 400;
    for (let i = 0; i < tokenList.length; i += chunkSize) {
      const chunk = tokenList.slice(i, i + chunkSize);

      const message = {
        tokens: chunk,

        // Keep top-level for cross-platform parity
        notification: { title, body },

        // Put the actual web push notification here (most reliable for browsers)
        webpush: {
          fcmOptions: {
            link: safeData.deepLink || "https://gisconnect-web.onrender.com/adminHome",
          },
          notification: {
            title,
            body,
            icon: "/icons/icon-192.png",
            badge: "/icons/badge-72.png",
          },
          headers: {
            Urgency: "high",
          },
        },

        data: safeData,
      };

      const resp = await messaging.sendEachForMulticast(message);
      console.log(`[notifyStage] ${stage} sent: success=${resp.successCount}, fail=${resp.failureCount}`);

    // Remove invalid tokens so we don’t keep failing on them
    const invalidIdx = [];
    resp.responses.forEach((r, idx) => {
        if (!r.success && r.error?.code === "messaging/registration-token-not-registered") {
            invalidIdx.push(idx);
        }
    });
    if (invalidIdx.length) {
        const badTokens = invalidIdx.map(i => chunk[i]);
        await AdminPushToken.deleteMany({ token: { $in: badTokens } });
        console.log(`[notifyStage] pruned ${badTokens.length} invalid tokens`);
    }

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
