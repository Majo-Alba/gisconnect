import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, deleteToken } from "firebase/messaging";

const cfg = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};
const VAPID = import.meta.env.VITE_FB_VAPID_KEY;

export async function registerAdminPushToken(API_BASE, email) {
  try {
    if (!("Notification" in window)) return null;
    if (!(await isSupported())) return null;

    if (Notification.permission === "default") {
      const res = await Notification.requestPermission();
      if (res !== "granted") return null;
    }
    if (Notification.permission === "denied") return null;

    // ✅ Register *this* SW
    const swReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready; // ensure active
    console.log("[FCM] SW scope:", swReg.scope);

    // Init Firebase + get token bound to this SW
    const app = initializeApp(cfg);
    const messaging = getMessaging(app);
    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID,
      serviceWorkerRegistration: swReg,
    });
    if (!fcmToken) {
      console.warn("getToken returned empty token.");
      return null;
    }
    console.log("[FCM] token (prefix):", fcmToken.slice(0, 24) + "…");

    // Foreground handler (page focused)
    onMessage(messaging, (payload) => {
      console.log("[FCM onMessage]", payload);
      const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
      const body  = payload?.notification?.body  || payload?.data?.body  || "";
      try {
        new Notification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/badge-72.png" });
      } catch {}
    });

    // Save token server-side
    await fetch(`${API_BASE}/admin/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token: fcmToken }),
    });

    return fcmToken;
  } catch (err) {
    console.error("registerAdminPushToken failed:", err);
    return null;
  }
}

export async function getCurrentFcmToken() {
  try {
    const swReg = await getRegistration();
    const app = initializeApp(cfg);
    const messaging = getMessaging(app);
    const tok = await getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: swReg });
    window.__FCM_TOKEN__ = tok;
    console.log("[FCM] getCurrentFcmToken =", tok);
    return tok;
  } catch (e) {
    console.warn("getCurrentFcmToken failed:", e);
    return null;
  }
}

// // src/lib/pushClient.js
// import { initializeApp } from "firebase/app";
// // import { getMessaging, getToken, isSupported } from "firebase/messaging";
// import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
// import { deleteToken } from "firebase/messaging";


// const cfg = {
//   apiKey: import.meta.env.VITE_FB_API_KEY,
//   authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
//   projectId: import.meta.env.VITE_FB_PROJECT_ID,
//   messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
//   appId: import.meta.env.VITE_FB_APP_ID,
// };

// const VAPID = import.meta.env.VITE_FB_VAPID_KEY;


// console.log("[FB web cfg]", {
//     projectId: cfg.projectId,
//     appId: cfg.appId,
//     senderId: cfg.messagingSenderId,
//     vapidKeyPrefix: (VAPID || "").slice(0, 16) + "...",
//   });

// function assertFirebaseConfig() {
//   const missing = Object.entries({
//     apiKey: cfg.apiKey,
//     authDomain: cfg.authDomain,
//     projectId: cfg.projectId,
//     messagingSenderId: cfg.messagingSenderId,
//     appId: cfg.appId,
//   })
//     .filter(([, v]) => !v)
//     .map(([k]) => k);
//   if (missing.length) {
//     throw new Error(`Missing Firebase env keys: ${missing.join(", ")}`);
//   }
// }

// export async function registerAdminPushToken(API_BASE, email) {
//   try {
//     if (!("Notification" in window)) {
//       console.info("Notifications not supported in this browser.");
//       return null;
//     }
//     if (!(await isSupported())) {
//       console.info("Firebase Messaging not supported in this environment.");
//       return null;
//     }
//     assertFirebaseConfig();
//     if (!VAPID) {
//       console.warn("Missing VITE_FB_VAPID_KEY");
//       return null;
//     }

//     // 1) Check permission first
//     if (Notification.permission === "denied") {
//       console.warn("Notifications are blocked for this site by the browser.");
//       // Surface this in your UI (e.g. show a banner telling user how to enable)
//       return null;
//     }
//     if (Notification.permission === "default") {
//       // Ask only from a user gesture ideally; if this runs on page load, some browsers ignore it.
//       const res = await Notification.requestPermission();
//       if (res !== "granted") {
//         console.warn("User did not grant notification permission.");
//         return null;
//       }
//     }

//     // 2) Use the controlling SW at "/" (sw.js). If missing, register it now.
//     const swReg =
//     (await navigator.serviceWorker.getRegistration("/")) ||
//     (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
//     // const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
//     //   scope: "/",
//     //   type: "classic", // Vite builds put SW in /public
//     // });

//     // 3) Init + get token
//     const app = initializeApp(cfg);
//     const messaging = getMessaging(app);
//     const fcmToken = await getToken(messaging, {
//       vapidKey: VAPID,
//       serviceWorkerRegistration: swReg,
//     });
//     if (!fcmToken) {
//       console.warn("getToken returned empty token.");
//       return null;
//     }

//     // sep18
//     // Foreground messages (when the tab is focused):
//     // Show a system notification so admins see it even with the app open.
//     onMessage(messaging, (payload) => {
//         console.log("[FCM onMessage]", payload);
//         const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
//         const body  = payload?.notification?.body  || payload?.data?.body  || "";
//         try {
//             if (Notification.permission === "granted") {
//                 new Notification(title, {
//                     body,
//                     icon: "/icons/icon-192.png",
//                     badge: "/icons/badge-72.png",
//                 });
//             } else {
//                 console.warn("[onMessage] permission is not 'granted'");
//             }
//         } catch (err) {
//             console.warn("[onMessage] Notification error:", err);
//             // last-resort: visible in console if OS blocks notifications
//             alert(`${title}\n\n${body}`);
//         }
//     });

//     // NEW: log and expose current token for quick copy in DevTools
//     console.log("[FCM] current token =", fcmToken);           
//     window.__FCM_TOKEN__ = fcmToken;                           
//     // sep18

//     // 4) Send token to your API
//     await fetch(`${API_BASE}/admin/push/register`, {
//     // await fetch(`${API_BASE}/push/register`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ email, token: fcmToken }),
//     });

//     console.info("FCM token registered for", email);
//     return fcmToken;
//   } catch (err) {
//     console.error("registerAdminPushToken failed:", err);
//     return null;
//   }
// }


// export async function refreshAdminPushToken(API_BASE, email) {
//     try {
//       const app = initializeApp(cfg);
//       const messaging = getMessaging(app);
  
//       // use an active SW reg
//       const swReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
//     //   const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
  
//       // 1) delete old token (if any)
//       try {
//         const old = await getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: swReg });
//         if (old) {
//           await deleteToken(messaging);
//           console.log("[FCM] deleted old token:", old.slice(0, 12) + "…");
//         }
//       } catch (e) {
//         console.warn("[FCM] deleteToken failed (ok to ignore):", e?.message || e);
//       }
  
//       // 2) get a new token
//       const fresh = await getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: swReg });
//       console.log("[FCM] fresh token:", fresh);
  
//       // 3) register server-side
//       await fetch(`${API_BASE}/admin/push/register`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ email, token: fresh }),
//       });
  
//       return fresh;
//     } catch (e) {
//       console.error("refreshAdminPushToken failed:", e);
//       return null;
//     }
//   }


// // NEW: helper to read the *current* token the app is using
// export async function getCurrentFcmToken() {
//     try {
//       const swReg =
//         (await navigator.serviceWorker.getRegistration("/")) ||
//         (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
//       const app = initializeApp(cfg);
//       const messaging = getMessaging(app);
//       const tok = await getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: swReg });
//       console.log("[FCM] getCurrentFcmToken =", tok);
//       window.__FCM_TOKEN__ = tok;
//       return tok;
//     } catch (e) {
//       console.warn("getCurrentFcmToken failed:", e);
//       return null;
//     }
//   }