/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// ⚠️ These MUST EXACTLY MATCH your web app Firebase config (projectId, appId, senderId)
firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
});

const messaging = firebase.messaging();

// Background handler (FCM)
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] onBackgroundMessage:", payload);
  const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
  const body  = payload?.notification?.body  || payload?.data?.body  || "";
  const data  = payload?.data || {};
  self.registration.showNotification(title, {
    body,
    data,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
  });
});

// Generic push fallback
self.addEventListener("push", (event) => {
  try {
    const payload = event.data ? event.data.json() : {};
    console.log("[SW] raw push event:", payload);
    const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
    const body  = payload?.notification?.body  || payload?.data?.body  || "";
    const data  = payload?.data || {};
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        data,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
      })
    );
  } catch (e) {
    console.warn("[SW] push event parse error:", e);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.deepLink || "https://gisconnect-web.onrender.com/adminHome";
  event.waitUntil(clients.openWindow(url));
});


// /* public/firebase-messaging-sw.js */
// /* global importScripts, firebase */
// importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
// importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// // SAME config as the web app config above
// firebase.initializeApp({
//   apiKey: "…",
//   authDomain: "…",
//   projectId: "…",
//   messagingSenderId: "…",
//   appId: "…",
// });

// const messaging = firebase.messaging();

// messaging.onBackgroundMessage((payload) => {
//   const title = payload?.notification?.title || "GISConnect";
//   const body = payload?.notification?.body || "";
//   const data = payload?.data || {};
//   self.registration.showNotification(title, {
//     body,
//     data,
//     icon: "/icons/icon-192.png",
//     badge: "/icons/badge-72.png",
//   });
// });

// self.addEventListener("notificationclick", (event) => {
//   event.notification.close();
//   const url = event.notification?.data?.deepLink || "https://gisconnect-web.onrender.com/adminHome";
//   event.waitUntil(clients.openWindow(url));
// });
