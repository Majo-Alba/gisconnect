/* public/sw.js */
// Increment this to force update on devices
const SW_VERSION = "v2025-10-26-01";

// ---- Try Firebase (Android/desktop). iOS Safari will skip on error. ----
let hasFirebase = false;
try {
  importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js");
  // Your config (OK for non-iOS browsers)
  const FB_CFG = {
    apiKey: "AIzaSyByLKSrWPn1_yCLxcPSfzSDnvufcCO7fqs",
    authDomain: "gisconnect-3e1d3.firebaseapp.com",
    projectId: "gisconnect-3e1d3",
    messagingSenderId: "268598065990",
    appId: "1:268598065990:web:f1aec8a1f47b6cdda74347",
  };
  // Some engines throw if messaging isn’t supported; guard carefully:
  try {
    // Avoid crashing on iOS: only initialize if global firebase exists
    if (typeof firebase !== "undefined" && firebase?.initializeApp) {
      firebase.initializeApp(FB_CFG);
      if (firebase?.messaging) {
        const messaging = firebase.messaging();

        // FCM background messages (Android/desktop web that support it)
        messaging.onBackgroundMessage((payload) => {
          const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
          const body  = payload?.notification?.body  || payload?.data?.body  || "Tienes una notificación.";
          const icon  = "/icons/icon-192.png";
          const url   = payload?.data?.click_action || "https://gisconnect-web.onrender.com/adminHome";
          self.registration.showNotification(title, { body, icon, data: { url } });
        });

        hasFirebase = true;
      }
    }
  } catch (e) {
    // If any Firebase path fails, continue with generic push
    // (we purposely do not rethrow)
    console.log("[SW] Firebase init failed, continuing with generic push:", e && e.message);
  }
} catch (e) {
  // importScripts may fail on iOS Safari; that’s fine—we still handle generic push
  console.log("[SW] Firebase scripts unavailable (expected on iOS). Using generic push only.");
}

// ---- Standard SW lifecycle ----
self.addEventListener("install", (evt) => {
  console.log("[SW] install", SW_VERSION);
  self.skipWaiting();
});

self.addEventListener("activate", (evt) => {
  console.log("[SW] activate", SW_VERSION, "scope:", self.registration.scope, "hasFirebase:", hasFirebase);
  evt.waitUntil(self.clients.claim());
  // tell open pages we activated
  evt.waitUntil((async () => {
    const clis = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clis) {
      try { c.postMessage({ kind: "SW_ACTIVATED", version: SW_VERSION }); } catch {}
    }
  })());
});

// ---- DEBUG ping from page ----
self.addEventListener("message", async (event) => {
  if (event.data === "SW_NOTIFY_TEST") {
    await self.registration.showNotification("🔔 SW test", { body: `SW ${SW_VERSION} OK` });
    const clis = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clis) {
      try { c.postMessage({ kind: "SW_NOTIFY_TEST_REPLY", swVersion: SW_VERSION, scope: self.registration.scope }); } catch {}
    }
  }
});

// ---- Generic Web Push handler (works on iOS Safari PWAs) ----
self.addEventListener("push", (event) => {
  const ts = new Date().toISOString();
  let raw = "", data = {};
  try { raw = event.data ? event.data.text() : ""; } catch(_) {}
  try { data = raw ? JSON.parse(raw) : {}; } catch(_) { data = {}; }

  const title = data?.notification?.title || data?.title || `🔔 GISConnect`;
  const body  = data?.notification?.body  || data?.body  || (raw || "Tienes una notificación.");
  const icon  = "/icons/icon-192.png";
  const url   = data?.data?.click_action || data?.click_action || "https://gisconnect-web.onrender.com/adminHome";

  event.waitUntil((async () => {
    // Always show a banner (unique tag avoids coalescing)
    await self.registration.showNotification(title, {
      body, icon, tag: `dbg-${SW_VERSION}-${ts}`, renotify: true,
      data: { url, rawSnippet: raw.slice(0, 200) }
    });

    // Let any open tabs know we received a push
    const clis = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clis) {
      try { c.postMessage({ kind: "PUSH_DBG", ts, title, body, raw }); } catch {}
    }
  })());
});

// ---- Focus the app when the user taps the notification ----
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "https://gisconnect-web.onrender.com/adminHome";
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const match = all.find(c => c.url.includes("gisconnect-web.onrender.com"));
    if (match) {
      try { await match.focus(); } catch {}
      try { await match.navigate(target); } catch {}
    } else {
      try { await clients.openWindow(target); } catch {}
    }
  })());
});

console.log("[SW] loaded", SW_VERSION, "hasFirebase:", hasFirebase);

// /* client/gisconnect/public/sw.js */
// /* global importScripts, firebase */
// importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js");
// importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js");

// // MUST match your web config (same as your client .env)
// const FB_CFG = {
//   apiKey: "AIzaSyByLKSrWPn1_yCLxcPSfzSDnvufcCO7fqs",
//   authDomain: "gisconnect-3e1d3.firebaseapp.com",
//   projectId: "gisconnect-3e1d3",
//   messagingSenderId: "268598065990",
//   appId: "1:268598065990:web:f1aec8a1f47b6cdda74347",
// };

// // ✅ Initialize with the real config (remove any placeholder init)
// firebase.initializeApp(FB_CFG);

// self.addEventListener("install", (evt) => {
//   console.log("[SW] install");
//   self.skipWaiting();
// });
// self.addEventListener("activate", (evt) => {
//   console.log("[SW] activate");
//   evt.waitUntil(self.clients.claim());
//   console.log("[SW] scope:", self.registration.scope);
// });

// const messaging = firebase.messaging();

// // 1) FCM background handler (when payload comes via Firebase channel)
// messaging.onBackgroundMessage((payload) => {
//   const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
//   const body  = payload?.notification?.body  || payload?.data?.body  || "Tienes una notificación.";
//   const icon  = "/icons/icon-192.png"; // ensure this file exists

//   self.registration.showNotification(title, {
//     body,
//     icon,
//     data: { url: payload?.data?.click_action || "https://gisconnect-web.onrender.com/adminHome" }
//   });
// });

// // // 2) Generic Web Push handler (when browser gets a push event directly)
// // self.addEventListener("push", (event) => {
// //   const raw = event.data?.text() || "";
// //   let data = {};
// //   try { data = JSON.parse(raw); } catch (_) {}
// //   const title = data?.notification?.title || data?.title || "GISConnect";
// //   const body  = data?.notification?.body  || data?.body  || "Tienes una notificación.";
// //   const icon  = "/icons/icon-192.png";

// //   event.waitUntil(self.registration.showNotification(title, {
// //     body,
// //     icon,
// //     data: { url: data?.data?.click_action || data?.click_action || "https://gisconnect-web.onrender.com/adminHome" }
// //   }));
// // });

// // --- DEBUG push handler (temporary while we verify iOS path) ---
// self.addEventListener("push", (event) => {
//   const ts = new Date().toISOString();
//   let payloadText = "";
//   let data = {};
//   try {
//     payloadText = event.data ? event.data.text() : "";
//     try { data = JSON.parse(payloadText); } catch { data = {}; }
//   } catch (_) {
//     // some engines throw on accessing event.data when empty
//   }

//   const title =
//     data?.notification?.title || data?.title || `🔔 Push @ ${ts}`;
//   const body =
//     data?.notification?.body || data?.body || (payloadText ? payloadText : "Tienes una notificación.");
//   const icon = "https://gisconnect-web.onrender.com/icons/icon-192.png";
//   const clickUrl =
//     data?.data?.click_action || data?.click_action || "https://gisconnect-web.onrender.com/adminHome";

//   event.waitUntil((async () => {
//     // Always show a banner
//     await self.registration.showNotification(title, {
//       body,
//       icon,
//       tag: `dbg-${ts}`,        // unique tag so iOS doesn't collapse duplicates
//       renotify: true,
//       data: { url: clickUrl, dbgTs: ts, raw: payloadText.slice(0, 200) }
//     });

//     // Tell any open tabs we got a push
//     const clis = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
//     for (const c of clis) {
//       try { c.postMessage({ kind: "PUSH_DBG", ts, title, body, payloadText }); } catch {}
//     }
//   })());
// });

// // Focus the app when the user taps the notification
// self.addEventListener("notificationclick", (event) => {
//   event.notification.close();
//   const target = event.notification.data?.url || "https://gisconnect-web.onrender.com/adminHome";
//   event.waitUntil((async () => {
//     const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
//     const matching = allClients.find((c) => c.url.includes("gisconnect-web.onrender.com"));
//     if (matching) {
//       matching.focus();
//       matching.navigate(target);
//     } else {
//       clients.openWindow(target);
//     }
//   })());
// });

// // Tiny ping to prove this SW can show a notification + reply back to the page
// self.addEventListener("message", async (event) => {
//   if (event.data === "SW_NOTIFY_TEST") {
//     console.log("[SW] got SW_NOTIFY_TEST");
//     await self.registration.showNotification("🔔 SW test", { body: "Hello from service worker" });
//     const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
//     for (const c of clientsList) {
//       c.postMessage({ kind: "SW_NOTIFY_TEST_REPLY", swVersion: "v1", scope: self.registration.scope });
//     }
//   }
// });








// /* client/gisconnect/public/sw.js */
// /* global firebase */
// // importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
// // importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// /* global importScripts, firebase */
// importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js");
// importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js");

// // ⚠️ MUST match your web config (same as .env in the client)
// const FB_CFG = {
//   apiKey: "AIzaSyByLKSrWPn1_yCLxcPSfzSDnvufcCO7fqs",
//   authDomain: "gisconnect-3e1d3.firebaseapp.com",
//   projectId: "gisconnect-3e1d3",
//   messagingSenderId: "268598065990",
//   appId: "1:268598065990:web:f1aec8a1f47b6cdda74347",
// };

// // firebase.initializeApp(FB_CFG);
// firebase.initializeApp({
//   apiKey: "...",
//   authDomain: "...",
//   projectId: "...",
//   messagingSenderId: "...",
//   appId: "..."
// });


// self.addEventListener("install", (evt) => {
//   console.log("[SW] install");
//   self.skipWaiting();
// });
// self.addEventListener("activate", (evt) => {
//   console.log("[SW] activate");
//   evt.waitUntil(self.clients.claim());
//   console.log("[SW] scope:", self.registration.scope);
// });

// const messaging = firebase.messaging();

// // FCM “background” handler (when page isn’t focused)
// // messaging.onBackgroundMessage((payload) => {
// //   console.log("[SW] onBackgroundMessage:", payload);
// //   const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
// //   const body  = payload?.notification?.body  || payload?.data?.body  || "";
// //   const data  = payload?.data || {};
// //   self.registration.showNotification(title, {
// //     body,
// //     data,
// //     icon: "/icons/icon-192.png",
// //     badge: "/icons/badge-72.png",
// //   });
// // });

// // 1) FCM background handler (when payload comes via Firebase channel)
// messaging.onBackgroundMessage((payload) => {
//   const title = payload?.notification?.title || payload?.data?.title || "GISConnect";
//   const body  = payload?.notification?.body  || payload?.data?.body  || "Tienes una notificación.";
//   const icon  = "/icons/icon-192.png"; // ensure exists

//   self.registration.showNotification(title, {
//     body,
//     icon,
//     data: { url: payload?.data?.click_action || "https://gisconnect-web.onrender.com/adminHome" }
//   });
// });

// // 2) Generic Web Push handler (when browser gets a push event directly)
// self.addEventListener("push", (event) => {
//   const raw = event.data?.text() || "";
//   let data = {};
//   try { data = JSON.parse(raw); } catch (_) {}
//   const title = data?.notification?.title || data?.title || "GISConnect";
//   const body  = data?.notification?.body  || data?.body  || "Tienes una notificación.";
//   const icon  = "/icons/icon-192.png";

//   event.waitUntil(self.registration.showNotification(title, {
//     body,
//     icon,
//     data: { url: data?.data?.click_action || data?.click_action || "https://gisconnect-web.onrender.com/adminHome" }
//   }));
// });



