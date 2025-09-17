// src/lib/pushClient.js
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const cfg = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};
const VAPID = import.meta.env.VITE_FB_VAPID_KEY;

function assertFirebaseConfig() {
  const missing = Object.entries({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing Firebase env keys: ${missing.join(", ")}`);
  }
}

export async function registerAdminPushToken(API_BASE, email) {
  try {
    if (!("Notification" in window)) {
      console.info("Notifications not supported in this browser.");
      return null;
    }
    if (!(await isSupported())) {
      console.info("Firebase Messaging not supported in this environment.");
      return null;
    }
    assertFirebaseConfig();
    if (!VAPID) {
      console.warn("Missing VITE_FB_VAPID_KEY");
      return null;
    }

    // 1) Check permission first
    if (Notification.permission === "denied") {
      console.warn("Notifications are blocked for this site by the browser.");
      // Surface this in your UI (e.g. show a banner telling user how to enable)
      return null;
    }
    if (Notification.permission === "default") {
      // Ask only from a user gesture ideally; if this runs on page load, some browsers ignore it.
      const res = await Notification.requestPermission();
      if (res !== "granted") {
        console.warn("User did not grant notification permission.");
        return null;
      }
    }

    // 2) Register SW from the app origin root
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
      type: "classic", // Vite builds put SW in /public
    });

    // 3) Init + get token
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

    // 4) Send token to your API
    await fetch(`${API_BASE}/admin/push/register`, {
    // await fetch(`${API_BASE}/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token: fcmToken }),
    });

    console.info("FCM token registered for", email);
    return fcmToken;
  } catch (err) {
    console.error("registerAdminPushToken failed:", err);
    return null;
  }
}

// // /src/lib/pushClient.js
// import { initializeApp } from "firebase/app";
// import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

// const cfg = {
//   apiKey: import.meta.env.VITE_FB_API_KEY,
//   authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
//   projectId: import.meta.env.VITE_FB_PROJECT_ID,
//   messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
//   appId: import.meta.env.VITE_FB_APP_ID,
// };

// const VAPID_KEY = import.meta.env.VITE_FB_VAPID_KEY;

// // Guard rail: surface missing config early
// (function assertFirebaseConfig(c) {
//   const missing = Object.entries(c)
//     .filter(([, v]) => !v)
//     .map(([k]) => k);
//   if (missing.length) {
//     // eslint-disable-next-line no-console
//     console.error("Firebase config missing keys:", missing);
//     throw new Error(`Missing Firebase env keys: ${missing.join(", ")}`);
//   }
// })(cfg);

// const app = initializeApp(cfg);

// export async function registerAdminPushToken(API_BASE, adminEmail) {
//   try {
//     const supported = await isSupported();
//     if (!supported) {
//       console.warn("FCM not supported in this browser.");
//       return;
//     }

//     const messaging = getMessaging(app);

//     if (!VAPID_KEY) {
//       console.error("Missing VITE_FB_VAPID_KEY.");
//       return;
//     }

//     const token = await getToken(messaging, { vapidKey: VAPID_KEY });
//     if (!token) {
//       console.warn("No FCM token (permission denied or blocked).");
//       return;
//     }

//     // Send token to your backend
//     await fetch(`${API_BASE}/notifications/register-token`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ email: adminEmail, token, platform: "web" }),
//     });

//     // Optional: listen to foreground messages
//     onMessage(messaging, (payload) => {
//       console.log("[FCM] foreground message:", payload);
//       // You can show a toast/notification here
//     });
//   } catch (err) {
//     console.error("registerAdminPushToken failed:", err);
//   }
// }