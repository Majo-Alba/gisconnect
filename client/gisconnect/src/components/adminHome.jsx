import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import axios from "axios"

import { faHouse, faCheckToSlot, faCartShopping, faBell } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";
import HomeIcon from "/src/assets/images/Icono_Home.png";
import UserIcon from "/src/assets/images/Icono_User.png";
import SettingsIcon from "/src/assets/images/Icono_Settings.png";

import CotizaIcono from "/src/assets/images/Icono_Cotiza.png";
import CarritoIcono from "/src/assets/images/Icono_Carrito.png";
import CotizacionIcon from "/src/assets/images/Icono_cotizacionesNuevas.png";
import PorEmpacarIcono from "/src/assets/images/Icono_porEmpacar.png"
import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png"
import PorEntregarIcono from "/src/assets/images/Icono_porEntregar.png"
import EntregadoIcono from "/src/assets/images/Icono_entregado.png"

// import { registerAdminPushToken, refreshAdminPushToken, getCurrentFcmToken } from "../lib/pushClient";
import { registerAdminPushToken, getCurrentFcmToken } from "../lib/pushClient";
import { API } from "/src/lib/api";

/* ------------------ Web Push (VAPID) helpers ------------------ */

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Subscribe browser to native Web Push (works on iOS PWAs and others)
 * and register the subscription on the server.
 */
async function ensureWebPushSubscription(API_BASE, email, vapidPublicKey) {
  try {
    if (!email) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.log("[WebPush] Not supported in this browser");
      return;
    }

    // iOS PWAs: Notification API only exists when opened from Home Screen
    if (!("Notification" in window)) {
      console.log("[WebPush] Notification API unavailable (open from Home Screen on iOS).");
      return;
    }

    // Ask permission if not already granted/denied
    let permission = Notification.permission;
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission();
      } catch (e) {
        console.warn("[WebPush] requestPermission error:", e);
      }
    }
    if (permission !== "granted") {
      console.log("[WebPush] Permission not granted:", permission);
      return;
    }

    const reg = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.ready);
    if (!reg) {
      console.log("[WebPush] No Service Worker registration");
      return;
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (!vapidPublicKey) {
        console.warn("[WebPush] Missing VAPID public key.");
        return;
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const resp = await fetch(`${API_BASE}/admin/webpush/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, subscription: sub }),
    });
    const js = await resp.json().catch(() => ({}));
    console.log("[WebPush] register response:", js);
  } catch (err) {
    console.error("[WebPush] ensureWebPushSubscription error:", err);
  }
}

// oct25
async function resubscribeWebPush(API_BASE, email, vapidPublicKey) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const reg = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.ready);
  if (!reg) return;

  // 1) Unsubscribe old (if any)
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    try {
      await existing.unsubscribe();
      // (optional) tell server to clean it by endpoint:
      // await fetch(`${API_BASE}/admin/webpush/unsubscribe`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
    } catch (e) {
      console.warn("[WebPush] Unsubscribe failed (continuing):", e);
    }
  }

  // 2) Subscribe with the NEW canonical public key
  const newSub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: (function toUint8(base64) {
      const padding = "=".repeat((4 - (base64.length % 4)) % 4);
      const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(b64);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
      return out;
    })(vapidPublicKey),
  });

  // 3) Register new sub on server
  await fetch(`${API_BASE}/admin/webpush/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, subscription: newSub }),
  });
}

// oct25

/* ------------------ Component ------------------ */

export default function AdminHome() {
  const navigate = useNavigate();

  function goToNewQuotes() { navigate("/newQuotes"); }
  function goToNewOrders() { navigate("/newOrders"); }
  function goToGeneratedQuotes() { navigate("/quotes"); }
  function goToForPacking() { navigate("/toPack"); }
  function goToManageDelivery() { navigate("/manageDelivery"); }
  function goToPackageReady() { navigate("/deliverReady"); }
  function goToDelivered() { navigate("/delivered"); }
  function goToAdminHome() { navigate("/adminHome"); }

  // SEP19
  // (NEW) Helper to ping the service worker and show a test notification
  const testServiceWorkerNotification = () => {
    (async () => {
      try {
        if (!("serviceWorker" in navigator)) {
          alert("Este navegador no soporta Service Workers");
          return;
        }
        // Try to get registration at root; fall back to ready
        const reg =
          (await navigator.serviceWorker.getRegistration("/")) ||
          (await navigator.serviceWorker.ready);

        const active = reg?.active;
        console.log("[TestSW] registration:", reg, "active:", active);

        if (!active) {
          alert("El Service Worker aún no está activo. Recarga la página (Ctrl/Cmd+R) un par de veces.");
          return;
        }

        // This posts a message the SW listens for and shows a system notification
        active.postMessage("SW_NOTIFY_TEST");
        console.log("[TestSW] sent SW_NOTIFY_TEST");
      } catch (e) {
        console.error("[TestSW] error", e);
      }
    })();
  };
  // SEP19

  // Register push token for signed-in admin on mount (FCM) + subscribe Web Push
  useEffect(() => {
    const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    const email = raw?.correo || localStorage.getItem("userEmail") || "";
    if (!email) return;

    // 1) FCM token (Android/desktop)
    registerAdminPushToken(API, email);
    console.log("FB projectId =", import.meta.env.VITE_FB_PROJECT_ID);

    // 2) Native Web Push subscription (iOS PWA + others)
    const PUBLIC_VAPID = import.meta.env.VITE_FB_VAPID_KEY; // you already have this in .env
    ensureWebPushSubscription(API, email, PUBLIC_VAPID);
  }, []);

  useEffect(() => {
    const onMsg = (ev) => console.log("[PAGE] message from SW:", ev.data);
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  // oct25
  async function fetchServerVapidKey(API_BASE) {
    try {
      const r = await fetch(`${API_BASE}/admin/webpush/public-key`);
      const { publicKey } = await r.json();
      return (publicKey || "").trim();
    } catch (e) {
      console.warn("[WebPush] Could not fetch server VAPID key:", e);
      return "";
    }
  }
  
  function b64urlToUint8(base64) {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
  }
  
  async function resubscribeWebPush(API_BASE, email) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!email) return;
  
    const reg = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.ready);
    if (!reg) return;
  
    // 1) Unsubscribe old
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try {
        await existing.unsubscribe();
        // Optional: inform server to prune
        await fetch(`${API_BASE}/admin/webpush/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        }).catch(()=>{});
      } catch (e) {
        console.warn("[WebPush] Unsubscribe failed (continuing):", e);
      }
    }
  
    // 2) Fetch canonical key from server
    const serverKey = await fetchServerVapidKey(API_BASE);
    if (!serverKey) {
      alert("No VAPID key from server");
      return;
    }
  
    // 3) Ensure permission and re-subscribe with server key
    if (!("Notification" in window)) {
      alert("Abre desde el ícono en Home Screen (iOS)");
      return;
    }
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission !== "granted") {
      alert("Permiso de notificaciones no concedido");
      return;
    }
  
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64urlToUint8(serverKey),
    });
  
    // 4) Register on server
    await fetch(`${API_BASE}/admin/webpush/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, subscription: sub }),
    });
    alert("Web Push re-suscrito con la clave del servidor");
  }
  // oct25

  return (
    <body className="body-BG-Gradient">
      {/* LOGOS DIV */}
      <div className="loginLogo-ParentDiv">
        <img className="userHome-GISLogo" src={Logo} alt="Home Icon" width="230" height="70"/>
        <img className="signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/>
      </div>

      <label className="userHomeHeader-Label">¡Bienvenido a casa!</label>

      {/* BODY */}
      <div className="userHome-BodyDiv">
        <div className="adminHome-iconLabel-Div" onClick={goToNewQuotes}>
          <img className="homeQuoter-Icon" src={CotizaIcono} alt="Home Icon" width="50" height="50"/>
          <label className="homeIcon-Label">Cotizaciones <br/>nuevas</label>
        </div>
        <div className="adminHome-iconLabel-Div" onClick={goToNewOrders}>
          <img className="homeQuoter-Icon" src={CarritoIcono} alt="Home Icon" width="50" height="50"/>
          <label className="homeIcon-Label">Pedidos <br/>nuevos</label>
        </div>
        <div className="adminHome-iconLabel-Div" onClick={goToGeneratedQuotes}>
          <img className="homeQuoter-Icon" src={CotizacionIcon} alt="Home Icon" width="50" height="50"/>
          <label className="homeIcon-Label">Facturas <br/>generadas</label>
        </div>
        <div className="adminHome-iconLabel-Div" onClick={goToForPacking}>
          <img className="homeQuoter-Icon" src={PorEmpacarIcono} alt="Home Icon" width="50" height="50"/>
          <label className="homeIcon-Label">Por <br/>empacar</label>
        </div>
        <div className="adminHome-iconLabel-Div" onClick={goToManageDelivery}>
          <img className="homeQuoter-Icon" src={GestionaIcono} alt="Home Icon" width="50" height="50"/>
          <label className="homeIcon-Label">Gestionar <br/>entrega</label>
        </div>
        <div className="adminHome-iconLabel-Div" onClick={goToPackageReady}>
          <img className="homeQuoter-Icon" src={PorEntregarIcono} alt="Home Icon" width="50" height="50"/>
          <label className="homeIcon-Label">Por <br/>entregar</label>
        </div>
        <div className="adminHome-iconLabel-Div" onClick={goToDelivered}>
          <img className="homeQuoter-Icon" src={EntregadoIcono} alt="Home Icon" width="50" height="50"/>
          <label className="homeIcon-Label">Pedidos <br/>Entregados</label>
        </div>
      </div>

      {/* Enable/refresh notifications */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
        {/* <button
          className="adminHome-NotifsBtn"
          onClick={async () => {
            const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
            const email = raw?.correo || localStorage.getItem("userEmail");
            if (email) await registerAdminPushToken(API, email);
          }}
          title="Habilitar/registrar notificaciones (FCM)"
        >
          <FontAwesomeIcon icon={faBell} className="footerIcons" />
        </button> */}

        {/* (NEW) Button to test SW -> notification */}
        {/* <button
          className="adminHome-TestBtn"
          onClick={async () => {
            const reg = await navigator.serviceWorker.ready;
            console.log("[TestSW] registration:", reg, "active:", reg.active);
            reg.active?.postMessage("SW_NOTIFY_TEST");
            console.log("[TestSW] sent SW_NOTIFY_TEST");
          }}
        >
          Probar SW
        </button> */}

        {/* (NEW) Dev-only: trigger Web Push subscription */}
        <button
          className="adminHome-WebPushSubBtn"
          onClick={async () => {
            const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
            const email = raw?.correo || localStorage.getItem("userEmail");
            if (!email) return alert("No email");
            const PUBLIC_VAPID = import.meta.env.VITE_FB_VAPID_KEY;
            await ensureWebPushSubscription(API, email, PUBLIC_VAPID);
            alert("Web Push suscripción verificada.");
          }}
          title="Suscribir Web Push (iOS PWA)"
        >
          Suscribir Web Push
        </button>

        {/* oct25 */}
        {/* <button
          onClick={async () => {
            const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
            const email = raw?.correo || localStorage.getItem("userEmail");
            const PUBLIC_VAPID = import.meta.env.VITE_FB_VAPID_KEY;
            await resubscribeWebPush(API, email, PUBLIC_VAPID);
            alert("Web Push resuscrito con la nueva clave.");
          }}
        >
          Re-suscribir Web Push
        </button> */}
        <button
          className="adminHome-WebPushResubBtn"
          onClick={async () => {
            const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
            const email = raw?.correo || localStorage.getItem("userEmail");
            await resubscribeWebPush(API, email);
          }}
        >
          Re-suscribir Web Push
        </button>
        {/* oct25 */}

        {/* // Inside your JSX, near the other dev buttons: */}
        {/* <button
          className="adminHome-ShowTokenBtn"
          onClick={async () => {
            const tok = await getCurrentFcmToken();
            if (!tok) return alert("No token yet");
            await navigator.clipboard.writeText(tok).catch(() => {});
            alert("Current FCM token copied to clipboard:\n\n" + tok);
          }}
          title="Mostrar/copiar token actual"
        >
          Token actual
        </button> */}
      </div>

      {/* FOOTER MENU */}
      <div className="footerMenuDiv">
        <div className="footerHolder">
          <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
            <label className="footerIcon-Name">ORDENES</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
            <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons"/>
            <label className="footerIcon-Name">ENTREGAR</label>
          </div>
        </div>
      </div>
    </body>
  );
}

// // should the code you're showing for "Client hook (admin PWA) – subscribe once after login" (async function ensureWebPushSubscription(API_BASE, email, vapidPublicKey) [...]), be added inside my adminHome.jsx file? If so, direct edit into my current adminHome.jsx
// import { useState, useEffect } from "react"
// import { Link, useNavigate } from "react-router-dom"
// import axios from "axios"

// import { faHouse, faCheckToSlot, faCartShopping, faBell } from "@fortawesome/free-solid-svg-icons"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

// import Logo from "/src/assets/images/GIS_Logo.png";
// import Basket from "/src/assets/images/BG-veggieBasket.png";
// import HomeIcon from "/src/assets/images/Icono_Home.png";
// import UserIcon from "/src/assets/images/Icono_User.png";
// import SettingsIcon from "/src/assets/images/Icono_Settings.png";

// import CotizaIcono from "/src/assets/images/Icono_Cotiza.png";
// import CarritoIcono from "/src/assets/images/Icono_Carrito.png";
// import CotizacionIcon from "/src/assets/images/Icono_cotizacionesNuevas.png";
// import PorEmpacarIcono from "/src/assets/images/Icono_porEmpacar.png"
// import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png"
// import PorEntregarIcono from "/src/assets/images/Icono_porEntregar.png"
// import EntregadoIcono from "/src/assets/images/Icono_entregado.png"

// // import { registerAdminPushToken, refreshAdminPushToken, getCurrentFcmToken } from "../lib/pushClient";
// import { registerAdminPushToken, getCurrentFcmToken } from "../lib/pushClient";
// import { API } from "/src/lib/api";

// export default function AdminHome() {
//   const navigate = useNavigate();

//   function goToNewQuotes() { navigate("/newQuotes"); }
//   function goToNewOrders() { navigate("/newOrders"); }
//   function goToGeneratedQuotes() { navigate("/quotes"); }
//   function goToForPacking() { navigate("/toPack"); }
//   function goToManageDelivery() { navigate("/manageDelivery"); }
//   function goToPackageReady() { navigate("/deliverReady"); }
//   function goToDelivered() { navigate("/delivered"); }
//   function goToAdminHome() { navigate("/adminHome"); }

// // SEP19
// // (NEW) Helper to ping the service worker and show a test notification
// const testServiceWorkerNotification = () => {
//     (async () => {
//       try {
//         if (!("serviceWorker" in navigator)) {
//           alert("Este navegador no soporta Service Workers");
//           return;
//         }
//         // Try to get registration at root; fall back to ready
//         const reg =
//           (await navigator.serviceWorker.getRegistration("/")) ||
//           (await navigator.serviceWorker.ready);

//         const active = reg?.active;
//         console.log("[TestSW] registration:", reg, "active:", active);

//         if (!active) {
//           alert("El Service Worker aún no está activo. Recarga la página (Ctrl/Cmd+R) un par de veces.");
//           return;
//         }

//         // This posts a message the SW listens for and shows a system notification
//         active.postMessage("SW_NOTIFY_TEST");
//         console.log("[TestSW] sent SW_NOTIFY_TEST");
//       } catch (e) {
//         console.error("[TestSW] error", e);
//       }
//     })();
//   };

// // SEP19

//   // Register push token for signed-in admin on mount
//   useEffect(() => {
//     const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     const email = raw?.correo || localStorage.getItem("userEmail") || "";
//     if (!email) return;
//     registerAdminPushToken(API, email);
//     console.log("FB projectId =", import.meta.env.VITE_FB_PROJECT_ID);
//   }, []);

//   useEffect(() => {
//     const onMsg = (ev) => console.log("[PAGE] message from SW:", ev.data);
//     navigator.serviceWorker.addEventListener("message", onMsg);
//     return () => navigator.serviceWorker.removeEventListener("message", onMsg);
//   }, []);

//   return (
//     <body className="body-BG-Gradient">
//       {/* LOGOS DIV */}
//       <div className="loginLogo-ParentDiv">
//         <img className="userHome-GISLogo" src={Logo} alt="Home Icon" width="230" height="70"/>
//         <img className="signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/>
//       </div>

//       <label className="userHomeHeader-Label">¡Bienvenido a casa!</label>

//       {/* BODY */}
//       <div className="userHome-BodyDiv">
//         <div className="adminHome-iconLabel-Div" onClick={goToNewQuotes}>
//           <img className="homeQuoter-Icon" src={CotizaIcono} alt="Home Icon" width="50" height="50"/>
//           <label className="homeIcon-Label">Cotizaciones <br/>nuevas</label>
//         </div>
//         <div className="adminHome-iconLabel-Div" onClick={goToNewOrders}>
//           <img className="homeQuoter-Icon" src={CarritoIcono} alt="Home Icon" width="50" height="50"/>
//           <label className="homeIcon-Label">Pedidos <br/>nuevos</label>
//         </div>
//         <div className="adminHome-iconLabel-Div" onClick={goToGeneratedQuotes}>
//           <img className="homeQuoter-Icon" src={CotizacionIcon} alt="Home Icon" width="50" height="50"/>
//           <label className="homeIcon-Label">Facturas <br/>generadas</label>
//         </div>
//         <div className="adminHome-iconLabel-Div" onClick={goToForPacking}>
//           <img className="homeQuoter-Icon" src={PorEmpacarIcono} alt="Home Icon" width="50" height="50"/>
//           <label className="homeIcon-Label">Por <br/>empacar</label>
//         </div>
//         <div className="adminHome-iconLabel-Div" onClick={goToManageDelivery}>
//           <img className="homeQuoter-Icon" src={GestionaIcono} alt="Home Icon" width="50" height="50"/>
//           <label className="homeIcon-Label">Gestionar <br/>entrega</label>
//         </div>
//         <div className="adminHome-iconLabel-Div" onClick={goToPackageReady}>
//           <img className="homeQuoter-Icon" src={PorEntregarIcono} alt="Home Icon" width="50" height="50"/>
//           <label className="homeIcon-Label">Por <br/>entregar</label>
//         </div>
//         <div className="adminHome-iconLabel-Div" onClick={goToDelivered}>
//           <img className="homeQuoter-Icon" src={EntregadoIcono} alt="Home Icon" width="50" height="50"/>
//           <label className="homeIcon-Label">Pedidos <br/>Entregados</label>
//         </div>
//       </div>

//       {/* Enable/refresh notifications */}
//       <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
//         <button
//           className="adminHome-NotifsBtn"
//           onClick={async () => {
//             const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//             const email = raw?.correo || localStorage.getItem("userEmail");
//             if (email) await registerAdminPushToken(API, email);
//           }}
//           title="Habilitar/registrar notificaciones"
//         >
//           <FontAwesomeIcon icon={faBell} className="footerIcons" />
//         </button>

//         {/* (NEW) Button to test SW -> notification */}
//         <button
//             className="adminHome-TestBtn"
//             onClick={async () => {
//               const reg = await navigator.serviceWorker.ready;
//               console.log("[TestSW] registration:", reg, "active:", reg.active);
//               reg.active?.postMessage("SW_NOTIFY_TEST");
//               console.log("[TestSW] sent SW_NOTIFY_TEST");
//             }}
//           >
//             Probar SW
//         </button>

//         {/* // Inside your JSX, near the other dev buttons: */}
//         {/* <button
//         className="adminHome-ShowTokenBtn"
//         onClick={async () => {
//             const tok = await getCurrentFcmToken();
//             if (!tok) return alert("No token yet");
//             await navigator.clipboard.writeText(tok).catch(() => {});
//             alert("Current FCM token copied to clipboard:\n\n" + tok);
//         }}
//         title="Mostrar/copiar token actual"
//         >
//         Token actual
//         </button> */}
//       </div>

//       {/* FOOTER MENU */}
//       <div className="footerMenuDiv">
//         <div className="footerHolder">
//           <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
//             <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
//             <label className="footerIcon-Name">PRINCIPAL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
//             <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
//             <label className="footerIcon-Name">ORDENES</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
//             <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons"/>
//             <label className="footerIcon-Name">ENTREGAR</label>
//           </div>
//         </div>
//       </div>
//     </body>
//   );
// }






// -------> OG <-------

// // im my adminHome.jsx we've added several buttons to test, can I get rid of them now and change for the one youre suggesting in step 2?
// // import { useState } from "react"
// import { useState, useEffect } from "react"

// import { Link, useNavigate } from "react-router-dom"
// import axios from "axios"

// import { faHouse, faCheckToSlot, faCartShopping, faBell } from "@fortawesome/free-solid-svg-icons"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

// import Logo from "/src/assets/images/GIS_Logo.png";
// import Basket from "/src/assets/images/BG-veggieBasket.png";
// import HomeIcon from "/src/assets/images/Icono_Home.png";
// import UserIcon from "/src/assets/images/Icono_User.png";
// import SettingsIcon from "/src/assets/images/Icono_Settings.png";

// import CotizaIcono from "/src/assets/images/Icono_Cotiza.png";
// import CarritoIcono from "/src/assets/images/Icono_Carrito.png";
// import CotizacionIcon from "/src/assets/images/Icono_cotizacionesNuevas.png";
// import PorEmpacarIcono from "/src/assets/images/Icono_porEmpacar.png"
// import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png"
// import PorEntregarIcono from "/src/assets/images/Icono_porEntregar.png"
// import EntregadoIcono from "/src/assets/images/Icono_entregado.png"

// import { registerAdminPushToken } from "../lib/pushClient";
// import { API } from "/src/lib/api";

// export default function AdminHome() {

//     const navigate = useNavigate();

//     function goToNewQuotes() {
//         console.log("Go to new quotes")
//         navigate("/newQuotes")
//     }
    
//     function goToNewOrders() {
//         console.log("Go to new orders")
//         navigate("/newOrders")
//     }
    
//     function goToGeneratedQuotes() {
//         console.log("Go to generated quotes")
//         navigate("/quotes")
//     }
    
//     function goToForPacking() {
//         console.log("Go to for packing")
//         navigate("/toPack")
//     }
    
//     function goToManageDelivery() {
//         console.log("Go to manage delivery")
//         navigate("/manageDelivery")
//     }
    
//     function goToPackageReady() {
//         console.log("Go to package ready")
//         navigate("/deliverReady")
//     }
    
//     function goToDelivered() {
//         console.log("Go to delivered")
//         navigate("/delivered")
//     }

//     function goToAdminHome() {
//         console.log("Go to admin home")
//         navigate("/adminHome")
//     }

//     // SEP10
//     // Register push token for signed-in admin
//     useEffect(() => {
//         const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//         const email = raw?.correo || localStorage.getItem("userEmail") || "";
//         if (!email) return;
//         // Optional: gate by your known admin list here before calling
//         registerAdminPushToken(API, email);
//         console.log("FB projectId =", import.meta.env.VITE_FB_PROJECT_ID);

//     }, []);

//     // SEP10

//     return (
//         <body className="body-BG-Gradient">

//             {/* LOGOS DIV */}
//             <div className="loginLogo-ParentDiv">
//                 <img className="userHome-GISLogo" src={Logo} alt="Home Icon" width="230" height="70"/>
//                 <img className="signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/>
//             </div>
//             {/* LOGOS END*/}

//             {/* NEW JUN05 */}
//                 <label className="userHomeHeader-Label">¡Bienvenido a casa!</label>
//             {/* END JUN05 */}

//             {/* BODY */}
//             <div className="userHome-BodyDiv">
//                 {/* INDIVIDUAL BLOCKS */}
//                 <div className="adminHome-iconLabel-Div" onClick={goToNewQuotes}>
//                     <img className="homeQuoter-Icon" src={CotizaIcono} alt="Home Icon" width="50" height="50"/>
//                     <label className="homeIcon-Label">Cotizaciones <br></br>nuevas</label>
//                 </div>
//                 <div className="adminHome-iconLabel-Div" onClick={goToNewOrders}>
//                     <img className="homeQuoter-Icon" src={CarritoIcono} alt="Home Icon" width="50" height="50"/>
//                     <label className="homeIcon-Label">Pedidos <br></br>nuevos</label>
//                 </div>
//                 <div className="adminHome-iconLabel-Div" onClick={goToGeneratedQuotes}>
//                     <img className="homeQuoter-Icon" src={CotizacionIcon} alt="Home Icon" width="50" height="50"/>
//                     <label className="homeIcon-Label">Facturas <br></br>generadas</label>
//                 </div>
//                 <div className="adminHome-iconLabel-Div" onClick={goToForPacking}>
//                     <img className="homeQuoter-Icon" src={PorEmpacarIcono} alt="Home Icon" width="50" height="50"/>
//                     <label className="homeIcon-Label">Por <br></br>empacar</label>
//                 </div>
//                 <div className="adminHome-iconLabel-Div" onClick={goToManageDelivery}>
//                     <img className="homeQuoter-Icon" src={GestionaIcono} alt="Home Icon" width="50" height="50"/>
//                     <label className="homeIcon-Label">Gestionar <br></br>entrega</label>
//                 </div>
//                 <div className="adminHome-iconLabel-Div" onClick={goToPackageReady}>
//                     <img className="homeQuoter-Icon" src={PorEntregarIcono} alt="Home Icon" width="50" height="50"/>
//                     <label className="homeIcon-Label">Por <br></br>entregar</label>
//                 </div>
//                 <div className="adminHome-iconLabel-Div" onClick={goToDelivered}>
//                     <img className="homeQuoter-Icon" src={EntregadoIcono} alt="Home Icon" width="50" height="50"/>
//                     <label className="homeIcon-Label">Pedidos <br></br>Entregados</label>
//                 </div>
//             </div>
//             {/* BODY END */}
//             <button
//             className="adminHome-NotifsBtn"
//             onClick={async () => {
//                 const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//                 const email = raw?.correo || localStorage.getItem("userEmail");
//                 if (email) await registerAdminPushToken(API, email);
//             }}
//             >
//             <FontAwesomeIcon icon={faBell} className="footerIcons"/>
//             {/* Habilitar notificaciones */}
//             </button>

//             {/* test */}
//             <button
//                 onClick={() => {
//                     if (Notification.permission !== "granted") {
//                     Notification.requestPermission().then(p => {
//                         if (p === "granted") new Notification("Prueba", { body: "¿Ves esta notificación?" });
//                     });
//                     } else {
//                     new Notification("Prueba", { body: "¿Ves esta notificación?" });
//                     }
//                 }}
//                 >
//                 Probar notificación local
//             </button>
//             {/* test */}

//             {/* FOOTER MENU */}
//             <div className="footerMenuDiv">
//                 <div className="footerHolder">
//                     {/* HOME FOOTER DIV */}
//                     <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
//                         <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
//                         <label className="footerIcon-Name">PRINCIPAL</label>
//                     </div>

//                     {/* USER FOOTER DIV */}
//                     <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
//                         <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
//                         <label className="footerIcon-Name">ORDENES</label>
//                     </div>

//                     {/* SETTINGS FOOTER DIV */}
//                     <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
//                         <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons"/>
//                         <label className="footerIcon-Name">ENTREGAR</label>
//                     </div>
//                 </div>
//             </div>
//             {/* FOOTER MENU END */}
//         </body>
//     )
// }