/* --- GISConnect SW (single canonical worker) --- */
const SW_VERSION = "gc-sw-2025-09-19-02";

importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

/* MUST match your client env exactly */
firebase.initializeApp({
  apiKey: "AIzaSyByLKSrWPn1_yCLxcPSfzSDnvufcCO7fqs",
  authDomain: "gisconnect-3e1d3.firebaseapp.com",
  projectId: "gisconnect-3e1d3",
  messagingSenderId: "268598065990",
  appId: "1:268598065990:web:f1aec8a1f47b6cdda74347",
});

console.log(`[SW ${SW_VERSION}] init Firebase:`, firebase.app().options);

const messaging = firebase.messaging();

self.addEventListener("install", () => console.log(`[SW ${SW_VERSION}] install`));
self.addEventListener("activate", (evt) => {
  console.log(`[SW ${SW_VERSION}] activate`);
  evt.waitUntil(self.clients.claim());
});

/* Background FCM handler (fires for data messages; notification messages may auto-show) */
messaging.onBackgroundMessage((payload) => {
  console.log(`[SW ${SW_VERSION}] onBackgroundMessage:`, payload);
  const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
  const body  = payload?.notification?.body  || payload?.data?.body  || "";
  const data  = payload?.data || {};
  self.registration.showNotification(title, {
    body,
    data,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
  }).then(() => {
    console.log(`[SW ${SW_VERSION}] onBackgroundMessage -> notification shown`);
  }).catch((e) => {
    console.error(`[SW ${SW_VERSION}] onBackgroundMessage -> showNotification failed:`, e);
  });
});

/* Raw push fallback */
self.addEventListener("push", (event) => {
  try {
    const payload = event.data ? event.data.json() : {};
    console.log(`[SW ${SW_VERSION}] raw push:`, payload);
    const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
    const body  = payload?.notification?.body  || payload?.data?.body  || "";
    const data  = payload?.data || {};
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        data,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
      }).then(() => {
        console.log(`[SW ${SW_VERSION}] raw push -> notification shown`);
      }).catch((e) => {
        console.error(`[SW ${SW_VERSION}] raw push -> showNotification failed:`, e);
      })
    );
  } catch (e) {
    console.warn(`[SW ${SW_VERSION}] raw push parse error:`, e);
  }
});

/* DEBUG: page -> SW ping (and SW -> page reply) */
self.addEventListener("message", (event) => {
  console.log(`[SW ${SW_VERSION}] message event:`, event.data);
  if (event?.data === "SW_NOTIFY_TEST") {
    event.waitUntil((async () => {
      try {
        await self.registration.showNotification("SW test", {
          body: "If you see this, SW can show notifications",
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-72.png",
        });
        console.log(`[SW ${SW_VERSION}] SW_NOTIFY_TEST -> notification shown`);
      } catch (e) {
        console.error(`[SW ${SW_VERSION}] SW_NOTIFY_TEST -> showNotification failed:`, e);
      } finally {
        // Reply back to any open clients so the page can confirm SW handled it
        const all = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
        all.forEach(c => c.postMessage({ kind: "SW_NOTIFY_TEST_REPLY", swVersion: SW_VERSION }));
      }
    })());
  }
});

/* Click → deep link */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.deepLink || "https://gisconnect-web.onrender.com/adminHome";
  event.waitUntil(clients.openWindow(url));
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
