/* client/gisconnect/public/sw.js */
/* global firebase */
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// ⚠️ MUST match your web config (same as .env in the client)
const FB_CFG = {
  apiKey: "AIzaSyByLKSrWPn1_yCLxcPSfzSDnvufcCO7fqs",
  authDomain: "gisconnect-3e1d3.firebaseapp.com",
  projectId: "gisconnect-3e1d3",
  messagingSenderId: "268598065990",
  appId: "1:268598065990:web:f1aec8a1f47b6cdda74347",
};

firebase.initializeApp(FB_CFG);

self.addEventListener("install", (evt) => {
  console.log("[SW] install");
  self.skipWaiting();
});
self.addEventListener("activate", (evt) => {
  console.log("[SW] activate");
  evt.waitUntil(self.clients.claim());
  console.log("[SW] scope:", self.registration.scope);
});

const messaging = firebase.messaging();

// FCM “background” handler (when page isn’t focused)
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

// Generic WebPush fallback (covers data-only & non-FCM pushes)
self.addEventListener("push", (event) => {
  let raw = null, json = {};
  try { raw = event.data ? event.data.text() : null; } catch {}
  try { json = event.data ? event.data.json() : {}; } catch {}
  console.log("[SW] push event raw:", raw, "json:", json);

  const note = json.notification || {};
  const data = json.data || json || {};
  const title = note.title || data.title || "GISConnect";
  const body  = note.body  || data.body  || "";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.deepLink || "https://gisconnect-web.onrender.com/adminHome";
  event.waitUntil(self.clients.openWindow(url));
});

// Tiny ping to prove this SW can show a notification + reply back to the page
self.addEventListener("message", async (event) => {
  if (event.data === "SW_NOTIFY_TEST") {
    console.log("[SW] got SW_NOTIFY_TEST");
    await self.registration.showNotification("🔔 SW test", { body: "Hello from service worker" });
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      c.postMessage({ kind: "SW_NOTIFY_TEST_REPLY", swVersion: "v1", scope: self.registration.scope });
    }
  }
});




// // --- Basic lifecycle + claim control ---
// self.addEventListener("install", () => console.log("[SW] install"));
// self.addEventListener("activate", (event) => {
//   console.log("[SW] activate");
//   event.waitUntil(self.clients.claim());
// });

// // --- FCM (Firebase Messaging) ---
// importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
// importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// // ⚠️ MUST match your web app config
// firebase.initializeApp({
//   apiKey: "AIzaSyByLKSrWPn1_yCLxcPSfzSDnvufcCO7fqs",
//   authDomain: "gisconnect-3e1d3.firebaseapp.com",
//   projectId: "gisconnect-3e1d3",
//   messagingSenderId: "268598065990",
//   appId: "1:268598065990:web:f1aec8a1f47b6cdda74347",
// });

// console.log("[SW] Firebase options:", firebase.app().options);

// const messaging = firebase.messaging();

// // FCM: background messages
// messaging.onBackgroundMessage((payload) => {
//   console.log("[SW] onBackgroundMessage:", payload);
//   const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
//   const body  = payload?.notification?.body  || payload?.data?.body  || "";
//   const data  = payload?.data || {};
//   self.registration.showNotification(title, {
//     body,
//     data,
//     icon: "/icons/icon-192.png",
//     badge: "/icons/badge-72.png",
//   });
// });

// // Generic Web Push fallback (in case a pure data push arrives)
// self.addEventListener("push", (event) => {
//   try {
//     const payload = event.data ? event.data.json() : {};
//     console.log("[SW] raw push event:", payload);
//     const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
//     const body  = payload?.notification?.body  || payload?.data?.body  || "";
//     const data  = payload?.data || {};
//     event.waitUntil(
//       self.registration.showNotification(title, {
//         body,
//         data,
//         icon: "/icons/icon-192.png",
//         badge: "/icons/badge-72.png",
//       })
//     );
//   } catch (e) {
//     console.warn("[SW] push event parse error:", e);
//   }
// });

// // Click → open admin dashboard (or deepLink if provided)
// self.addEventListener("notificationclick", (event) => {
//   event.notification.close();
//   const url = event.notification?.data?.deepLink || "https://gisconnect-web.onrender.com/adminHome";
//   event.waitUntil(clients.openWindow(url));
// });

// // Dev helper: make sure your "Probar SW" button works with this SW
// self.addEventListener("message", (event) => {
//   if (event && event.data === "SW_NOTIFY_TEST") {
//     self.registration.showNotification("SW test", {
//       body: "This came directly from the Service Worker (sw.js)",
//       icon: "/icons/icon-192.png",
//       badge: "/icons/badge-72.png",
//     });
//   }
// });
