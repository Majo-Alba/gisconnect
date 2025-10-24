// server/routes/notify.js
const AdminPushToken = require("../models/AdminPushToken");
const { admin } = require("../notifications/fcm");
const { recipientsForStage } = require("../notifications/roles");

/**
 * Notify all admins tied to a given stage (order lifecycle event)
 */
async function notifyStage(stage, title, body, data = {}) {
  try {
    const targetEmails = recipientsForStage(stage);
    console.log(`[notifyStage] stage=${stage} -> recipients:`, targetEmails);

    if (!Array.isArray(targetEmails) || targetEmails.length === 0) {
      console.log(`[notifyStage] No recipients for stage ${stage}`);
      return;
    }

    const tokens = await AdminPushToken.find({
      email: { $in: targetEmails }
    }).select("email token -_id");
    const tokenList = tokens.map(t => t.token).filter(Boolean);

    console.log(`[notifyStage] found tokens: ${tokenList.length}`);
    if (tokenList.length === 0) {
      console.log(`[notifyStage] No tokens found for recipients (did admins open AdminHome to register?)`);
      return;
    }

    const safeData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
    );
    const messaging = admin.messaging();
    const chunkSize = 400;

    for (let i = 0; i < tokenList.length; i += chunkSize) {
      const chunk = tokenList.slice(i, i + chunkSize);

      const message = {
        tokens: chunk, // ✅ correct variable
        webpush: {
          notification: {
            title: title || "GISConnect",
            body: body || "Tienes una nueva actualización en un pedido.",
            icon: "/icons/icon-192.png"
          },
          fcmOptions: {
            link: "https://gisconnect-web.onrender.com/adminHome"
          },
          headers: { TTL: "2419200" }
        },
        data: {
          title: title || "GISConnect",
          body: body || "Tienes una nueva actualización en un pedido.",
          click_action: "https://gisconnect-web.onrender.com/adminHome",
          stage,
          ...safeData
        }
      };

      const resp = await messaging.sendEachForMulticast(message);
      console.log(`[notifyStage] ${stage} sent: success=${resp.successCount}, fail=${resp.failureCount}`);

      // prune invalid tokens
      const badTokens = resp.responses
        .map((r, idx) => (!r.success && r.error?.code === "messaging/registration-token-not-registered" ? chunk[idx] : null))
        .filter(Boolean);

      if (badTokens.length) {
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



// // previously we already created the notify.js file (route: server/routes/notify.js). Is this the same as sender.js or should I additionally create sender.js?
// const AdminPushToken = require("../models/AdminPushToken");
// const { admin } = require("../notifications/fcm");
// const { recipientsForStage } = require("../notifications/roles");

// async function notifyStage(stage, title, body, data = {}) {
//   try {
//     const targetEmails = recipientsForStage(stage);
//     console.log(`[notifyStage] stage=${stage} -> recipients:`, targetEmails);

//     if (!Array.isArray(targetEmails) || targetEmails.length === 0) {
//       console.log(`[notifyStage] No recipients for stage ${stage}`);
//       return;
//     }

//     const tokens = await AdminPushToken.find({ email: { $in: targetEmails } }).select("email token -_id");
//     const tokenList = tokens.map(t => t.token).filter(Boolean);

//     console.log(`[notifyStage] found tokens: ${tokenList.length}`);
//     if (tokenList.length === 0) {
//       console.log(`[notifyStage] No tokens found for recipients (did admins open AdminHome to register?)`);
//       return;
//     }

//     const messaging = admin.messaging();
//     const safeData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "")]));

//     const chunkSize = 400;
//     for (let i = 0; i < tokenList.length; i += chunkSize) {
//       const chunk = tokenList.slice(i, i + chunkSize);

//       const message = {
//         tokens, // array of tokens
//         webpush: {
//           notification: {
//             title: "🔔 GISConnect (Test)",
//             body: "If you can read this, Web Push is wired correctly.",
//             icon: "/icons/icon-192.png",   // make sure this file exists!
//             // badge: "/icons/badge-72.png", // REMOVE if you don't actually have this file
//             vibrate: [100, 50, 100]
//           },
//           fcmOptions: {
//             link: "https://gisconnect-web.onrender.com/adminHome"
//           },
//           headers: {
//             TTL: "2419200" // 28 days, optional
//           }
//         },
//         // Optional extra data for your SW:
//         data: {
//           title: "GISConnect",
//           body: "Nuevo evento en un pedido",
//           click_action: "https://gisconnect-web.onrender.com/adminHome",
//           type: "test"
//         }
//       };
      
//       await admin.messaging().sendEachForMulticast(message);

//       // const resp = await messaging.sendEachForMulticast(message);
//       console.log(`[notifyStage] ${stage} sent: success=${resp.successCount}, fail=${resp.failureCount}`);

//     // Remove invalid tokens so we don’t keep failing on them
//     const invalidIdx = [];
//     resp.responses.forEach((r, idx) => {
//         if (!r.success && r.error?.code === "messaging/registration-token-not-registered") {
//             invalidIdx.push(idx);
//         }
//     });
//     if (invalidIdx.length) {
//         const badTokens = invalidIdx.map(i => chunk[i]);
//         await AdminPushToken.deleteMany({ token: { $in: badTokens } });
//         console.log(`[notifyStage] pruned ${badTokens.length} invalid tokens`);
//     }

//       if (resp.failureCount) {
//         resp.responses.forEach((r, idx) => {
//           if (!r.success) {
//             console.warn("  • failure:", r.error?.code, r.error?.message, "(token:", chunk[idx], ")");
//           }
//         });
//       }
//     }
//   } catch (err) {
//     console.error("notifyStage error:", err);
//   }
// }

// module.exports = { notifyStage };


