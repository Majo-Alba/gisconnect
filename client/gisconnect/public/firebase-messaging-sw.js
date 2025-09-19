// /public/firebase-messaging-sw.js
/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyByLKSrWPn1_yCLxcPSfzSDnvufcCO7fqs",
  authDomain: "gisconnect-3e1d3.firebaseapp.com",
  projectId: "gisconnect-3e1d3",
  messagingSenderId: "268598065990",
  appId: "1:268598065990:web:f1aec8a1f47b6cdda74347",
});

console.log("[SW] Firebase options:", firebase.app().options);

const messaging = firebase.messaging();

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

// sep19
self.addEventListener("install", () => console.log("[SW] install"));
self.addEventListener("activate", () => console.log("[SW] activate"));

self.addEventListener("message", (event) => {
  if (event && event.data === "SW_NOTIFY_TEST") {
    self.registration.showNotification("SW test", {
      body: "This came directly from the Service Worker",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
    });
  }
});
// sep19

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
