/* public/firebase-messaging-sw.js */
/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// SAME config as the web app config above
firebase.initializeApp({
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  messagingSenderId: "…",
  appId: "…",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "GISConnect";
  const body = payload?.notification?.body || "";
  const data = payload?.data || {};
  self.registration.showNotification(title, {
    body,
    data,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.deepLink || "https://gisconnect-web.onrender.com/adminHome";
  event.waitUntil(clients.openWindow(url));
});
