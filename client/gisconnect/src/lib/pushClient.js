// src/lib/pushClient.js
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// Web config (NOT service account). Put in env or inline.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FB_VAPID_KEY; // Web Push cert from Firebase settings

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

export async function registerAdminPushToken(API_BASE, email) {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return;

    await fetch(`${API_BASE}/admin/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, platform: "web" }),
    });

    // Foreground listener (optional)
    onMessage(messaging, (payload) => {
      // Optionally show an in-app toast
      console.log("Push (foreground):", payload);
    });
  } catch (err) {
    console.error("registerAdminPushToken error:", err);
  }
}
