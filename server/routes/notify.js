// server/routes/notify.js
const AdminPushToken = require("../models/AdminPushToken");
const WebPushSubscription = require("../models/WebPushSubscription"); // ✅ iOS PWA: native Web Push
const { admin } = require("../notifications/fcm");
const { sendWebPush } = require("../notifications/webpush");          // ✅ uses VAPID keys
const { recipientsForStage } = require("../notifications/roles");

/**
 * Notify all admins tied to a given stage (order lifecycle event)
 * - FCM (Web) → Android + desktop browsers
 * - Native Web Push (VAPID) → iOS PWAs (and also works on other browsers)
 */
async function notifyStage(stage, title, body, data = {}) {
  try {
    const targetEmails = recipientsForStage(stage);
    console.log(`[notifyStage] stage=${stage} -> recipients:`, targetEmails);

    if (!Array.isArray(targetEmails) || targetEmails.length === 0) {
      console.log(`[notifyStage] No recipients for stage ${stage}`);
      return;
    }

    const safeData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
    );

    // --------------------------------------------------------------------
    // 1) FCM (Android / Desktop)
    // --------------------------------------------------------------------
    let fcmSuccess = 0;
    let fcmFail = 0;

    try {
      const tokens = await AdminPushToken.find({
        email: { $in: targetEmails }
      }).select("email token -_id");

      const tokenList = tokens.map(t => t.token).filter(Boolean);
      console.log(`[notifyStage] found FCM tokens: ${tokenList.length}`);

      const messaging = admin.messaging();
      const chunkSize = 400;

      if (tokenList.length === 0) {
        console.log("[notifyStage] No FCM tokens for recipients (did admins open AdminHome to register?). Will still try Web Push.");
      } else {
        for (let i = 0; i < tokenList.length; i += chunkSize) {
          const chunk = tokenList.slice(i, i + chunkSize);

          const message = {
            tokens: chunk,
            webpush: {
              notification: {
                title: title || "GISConnect",
                body: body || "Tienes una nueva actualización en un pedido.",
                // Absolute URL is safest across push services:
                icon: "https://gisconnect-web.onrender.com/icons/icon-192.png"
              },
              fcmOptions: { link: "https://gisconnect-web.onrender.com/adminHome" },
              headers: { TTL: "2419200" } // optional (28 days)
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
          fcmSuccess += resp.successCount;
          fcmFail += resp.failureCount;
          console.log(`[notifyStage] FCM ${stage}: success=${resp.successCount}, fail=${resp.failureCount}`);

          // prune invalid tokens
          const badTokens = resp.responses
            .map((r, idx) => (!r.success && r.error?.code === "messaging/registration-token-not-registered" ? chunk[idx] : null))
            .filter(Boolean);

          if (badTokens.length) {
            await AdminPushToken.deleteMany({ token: { $in: badTokens } });
            console.warn(`[notifyStage] pruned ${badTokens.length} invalid FCM tokens`);
          }

          if (resp.failureCount) {
            resp.responses.forEach((r, idx) => {
              if (!r.success) {
                console.warn("  • FCM failure:", r.error?.code, r.error?.message, "(token:", chunk[idx], ")");
              }
            });
          }
        }
      }
    } catch (e) {
      console.error("[notifyStage] FCM send error:", e);
    }

    // --------------------------------------------------------------------
    // 2) Native Web Push (VAPID) — works on iOS PWAs (and others)
    // --------------------------------------------------------------------
    let wpTried = 0;
    let wpPruned = 0;

    try {
      const subs = await WebPushSubscription.findByEmails(targetEmails);
      console.log(`[notifyStage] found WebPush subs: ${subs.length}`);

      const payload = {
        title: title || "GISConnect",
        body: body || "Actualización de pedido.",
        icon: "https://gisconnect-web.onrender.com/icons/icon-192.png",
        data: { click_action: "https://gisconnect-web.onrender.com/adminHome", stage, ...safeData }
      };

      for (const s of subs) {
        wpTried++;
        try {
          await sendWebPush(s.subscription, payload);
        } catch (err) {
          // 410/404 => subscription expired/invalid → remove it
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await WebPushSubscription.removeByEndpoint(s.subscription.endpoint);
            wpPruned++;
            console.warn("[webpush] pruned expired subscription:", s.subscription.endpoint);
          } else {
            console.warn("[webpush] send failed:", err?.statusCode, err?.body || err?.message);
          }
        }
      }
    } catch (e) {
      console.error("[notifyStage] Web Push send error:", e);
    }

    console.log(`[notifyStage] summary stage=${stage} :: FCM ok=${fcmSuccess}, FCM fail=${fcmFail}, WebPush tried=${wpTried}, WebPush pruned=${wpPruned}`);
  } catch (err) {
    console.error("notifyStage error:", err);
  }
}

module.exports = { notifyStage };

// // is it this one then? (this is my notify.js file )server/routes/notify.js
// const AdminPushToken = require("../models/AdminPushToken");
// const { admin } = require("../notifications/fcm");
// const { recipientsForStage } = require("../notifications/roles");

// /**
//  * Notify all admins tied to a given stage (order lifecycle event)
//  */
// async function notifyStage(stage, title, body, data = {}) {
//   try {
//     const targetEmails = recipientsForStage(stage);
//     console.log(`[notifyStage] stage=${stage} -> recipients:`, targetEmails);

//     if (!Array.isArray(targetEmails) || targetEmails.length === 0) {
//       console.log(`[notifyStage] No recipients for stage ${stage}`);
//       return;
//     }

//     const tokens = await AdminPushToken.find({
//       email: { $in: targetEmails }
//     }).select("email token -_id");
//     const tokenList = tokens.map(t => t.token).filter(Boolean);

//     console.log(`[notifyStage] found tokens: ${tokenList.length}`);
//     if (tokenList.length === 0) {
//       console.log(`[notifyStage] No tokens found for recipients (did admins open AdminHome to register?)`);
//       return;
//     }

//     const safeData = Object.fromEntries(
//       Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
//     );
//     const messaging = admin.messaging();
//     const chunkSize = 400;

//     for (let i = 0; i < tokenList.length; i += chunkSize) {
//       const chunk = tokenList.slice(i, i + chunkSize);

//       const message = {
//         tokens: chunk, // ✅ correct variable
//         webpush: {
//           notification: {
//             title: title || "GISConnect",
//             body: body || "Tienes una nueva actualización en un pedido.",
//             icon: "/icons/icon-192.png"
//           },
//           fcmOptions: {
//             link: "https://gisconnect-web.onrender.com/adminHome"
//           },
//           headers: { TTL: "2419200" }
//         },
//         data: {
//           title: title || "GISConnect",
//           body: body || "Tienes una nueva actualización en un pedido.",
//           click_action: "https://gisconnect-web.onrender.com/adminHome",
//           stage,
//           ...safeData
//         }
//       };

//       const resp = await messaging.sendEachForMulticast(message);
//       console.log(`[notifyStage] ${stage} sent: success=${resp.successCount}, fail=${resp.failureCount}`);

//       // prune invalid tokens
//       const badTokens = resp.responses
//         .map((r, idx) => (!r.success && r.error?.code === "messaging/registration-token-not-registered" ? chunk[idx] : null))
//         .filter(Boolean);

//       if (badTokens.length) {
//         await AdminPushToken.deleteMany({ token: { $in: badTokens } });
//         console.log(`[notifyStage] pruned ${badTokens.length} invalid tokens`);
//       }

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
