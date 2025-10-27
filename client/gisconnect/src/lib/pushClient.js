import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

const cfg = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};
const VAPID = import.meta.env.VITE_FB_VAPID_KEY;

// Helper: always return an active SW registration at root
async function getRegistration() {
  const reg = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.ready);
  if (!reg) throw new Error("No Service Worker registration at '/'");
  return reg;
}

export async function registerAdminPushToken(API_BASE, email) {
  try {
    // Only do FCM if the environment supports it (Android/desktop)
    if (!("Notification" in window)) return null;
    if (!(await isSupported())) return null; // iOS Safari => false

    if (Notification.permission === "default") {
      const res = await Notification.requestPermission();
      if (res !== "granted") return null;
    }
    if (Notification.permission === "denied") return null;

    // Use the SW that was registered at app startup
    const swReg = await getRegistration();
    console.log("[FCM] using SW scope:", swReg.scope);

    const app = initializeApp(cfg);
    const messaging = getMessaging(app);
    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID,
      serviceWorkerRegistration: swReg,
    });
    if (!fcmToken) {
      console.warn("[FCM] getToken returned empty token.");
      return null;
    }
    console.log("[FCM] token (prefix):", fcmToken.slice(0, 24) + "…");

    onMessage(messaging, (payload) => {
      console.log("[FCM onMessage]", payload);
      const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
      const body  = payload?.notification?.body  || payload?.data?.body  || "";
      try { new Notification(title, { body, icon: "/icons/icon-192.png" }); } catch {}
    });

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

// // this is my client/gisconnect/src/lib/pushClient.js... is this the place where I should add the Step 2: 2) Register the SW in your client
// import { initializeApp } from "firebase/app";
// import { getMessaging, getToken, isSupported, onMessage, deleteToken } from "firebase/messaging";

// const cfg = {
//   apiKey: import.meta.env.VITE_FB_API_KEY,
//   authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
//   projectId: import.meta.env.VITE_FB_PROJECT_ID,
//   messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
//   appId: import.meta.env.VITE_FB_APP_ID,
// };
// const VAPID = import.meta.env.VITE_FB_VAPID_KEY;

// export async function registerAdminPushToken(API_BASE, email) {
//   try {
//     if (!("Notification" in window)) return null;
//     if (!(await isSupported())) return null;

//     if (Notification.permission === "default") {
//       const res = await Notification.requestPermission();
//       if (res !== "granted") return null;
//     }
//     if (Notification.permission === "denied") return null;

//     // ✅ Register *this* SW
//     const swReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
//     await navigator.serviceWorker.ready; // ensure active
//     console.log("[FCM] SW scope:", swReg.scope);

//     // Init Firebase + get token bound to this SW
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
//     console.log("[FCM] token (prefix):", fcmToken.slice(0, 24) + "…");

//     // Foreground handler (page focused)
//     onMessage(messaging, (payload) => {
//       console.log("[FCM onMessage]", payload);
//       const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
//       const body  = payload?.notification?.body  || payload?.data?.body  || "";
//       try {
//         new Notification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/badge-72.png" });
//       } catch {}
//     });

//     // Save token server-side
//     await fetch(`${API_BASE}/admin/push/register`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ email, token: fcmToken }),
//     });

//     return fcmToken;
//   } catch (err) {
//     console.error("registerAdminPushToken failed:", err);
//     return null;
//   }
// }

// export async function getCurrentFcmToken() {
//   try {
//     const swReg = await getRegistration();
//     const app = initializeApp(cfg);
//     const messaging = getMessaging(app);
//     const tok = await getToken(messaging, { vapidKey: VAPID, serviceWorkerRegistration: swReg });
//     window.__FCM_TOKEN__ = tok;
//     console.log("[FCM] getCurrentFcmToken =", tok);
//     return tok;
//   } catch (e) {
//     console.warn("getCurrentFcmToken failed:", e);
//     return null;
//   }
// }

