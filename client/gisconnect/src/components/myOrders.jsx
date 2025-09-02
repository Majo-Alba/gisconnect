import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import OrdersIcon from "/src/assets/images/Icono_Pedidos.png";
import { API } from "/src/lib/api";

export default function MyOrders() {
  const navigate = useNavigate();
  const location = useLocation(); // to detect redirect from OrderNow

  const goHomeLogo = () => navigate("/userHome");
  const goToHome = () => navigate("/userHome");
  const goToNewOrder = () => navigate("/newOrder");
  const goToMyProfile = () => navigate("/userProfile");

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Resolve email robustly (PWAs sometimes miss a single key)
  const resolveEmail = () => {
    const direct = localStorage.getItem("userEmail");
    if (direct && direct.includes("@")) return direct;
    try {
      const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
      if (creds?.correo && String(creds.correo).includes("@")) return creds.correo;
    } catch {}
    return "";
  };

  // Minimal headers + no-store + cache-buster to beat SW caches on mobile
  const fetchOrders = async (email, signal) => {
    const url = `${API}/orders?email=${encodeURIComponent(email)}&_ts=${Date.now()}`;
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const cameFromOrderNow =
      !!(location?.state && location.state.from === "orderNow");

    const load = async (attempt = 1) => {
      const email = resolveEmail();
      if (!email) {
        console.warn("[MyOrders] No email found in localStorage.");
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        let data = await fetchOrders(email, controller.signal);

        // Right after creating an order on some hosts, the read can race the write.
        // If we came from OrderNow and got nothing, retry briefly (max 3 tries).
        if (cameFromOrderNow && Array.isArray(data) && data.length === 0 && attempt < 3) {
          await new Promise(r => setTimeout(r, 700));
          return load(attempt + 1);
        }

        if (!cancelled) {
          setOrders(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      } catch (err) {
        console.error("[MyOrders] fetch error:", err);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 500));
          return load(attempt + 1);
        }
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // Refresh when PWA tab becomes visible again (helps stale SW caches)
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [location?.state]);

  const goToTrackingTimeline = (order) => {
    navigate(`/orderDetail/${order._id}`, { state: { order } });
  };

  return (
    <body className="app-shell body-BG-Gradient">
      {/* LOGOS DIV */}
      <div className="loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Home Icon"
          width="180"
          height="55"
          onClick={goHomeLogo}
        />
      </div>
      {/* LOGOS END */}

      <div className="app-main">
        <div className="order-tracker-container">
          <div className="edit-titleIcon-Div">
            <label className="editAddress-headerLabel">Mis Pedidos</label>
            <img className="myOrders-Icon" src={OrdersIcon} alt="Carrito" width="50" height="50" />
          </div>

          <div className="myOrders-DetailDiv">
            {loading ? (
              <p>Cargando órdenes...</p>
            ) : orders.length === 0 ? (
              <p>No hay órdenes registradas.</p>
            ) : (
              <ul className="order-list">
                {[...orders]
                  .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
                  .map((order, index) => (
                    <li
                      key={order._id ?? `${order.userEmail}-${order.orderDate ?? index}`}
                      className="order-item"
                      onClick={() => goToTrackingTimeline(order)}
                      style={{
                        cursor: "pointer",
                        border: "1px solid #ccc",
                        borderRadius: "8px",
                        margin: "10px 0",
                        padding: "12px",
                      }}
                    >
                      <strong className="orderNumber-MyOrders">Pedido #:</strong>{" "}
                      {(order._id || "").slice(-5)} <br />
                      <strong className="orderNumber-MyOrders">Fecha:</strong>{" "}
                      {order.orderDate
                        ? (() => {
                            const date = new Date(order.orderDate);
                            const day = date.getDate().toString().padStart(2, "0");
                            const month = date.toLocaleString("es-MX", { month: "short" });
                            const year = date.getFullYear();
                            return `${day}/${month}/${year}`;
                          })()
                        : "Sin fecha"}
                      <br />
                      <strong className="orderNumber-MyOrders">Estado:</strong>{" "}
                      {order.orderStatus || "Pendiente"} <br />
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER MENU */}
      <div className="app-footer footerMenuDiv">
        <div className="footerHolder">
          <div className="footerIcon-NameDiv" onClick={goToHome}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons" />
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={goToMyProfile}>
            <FontAwesomeIcon icon={faUser} className="footerIcons" />
            <label className="footerIcon-Name">MI PERFIL</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={goToNewOrder}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
            <label className="footerIcon-Name">ORDENA</label>
          </div>
        </div>
      </div>
      {/* FOOTER MENU END */}
    </body>
  );
}


// NOT WORKING

// this is my current MyOrders.jsx, can you help me direct edit 
// import React, { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";

// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import OrdersIcon from "/src/assets/images/Icono_Pedidos.png";
// import { API } from "/src/lib/api";

// export default function MyOrders() {
//   const navigate = useNavigate();

//   const goHomeLogo = () => navigate("/userHome");
//   const goToHome = () => navigate("/userHome");
//   const goToNewOrder = () => navigate("/newOrder");
//   const goToMyProfile = () => navigate("/userProfile");

//   const [orders, setOrders] = useState([]);
//   const [loading, setLoading] = useState(true);

// //   sep02 - 4:08
// // Resolve email robustly (PWA sometimes misses the simple key)
//   const resolveEmail = () => {
//     const direct = localStorage.getItem("userEmail");
//     if (direct && direct.includes("@")) return direct;

//     try {
//       const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//       if (creds?.correo && String(creds.correo).includes("@")) return creds.correo;
//     } catch (_) {}

//     return ""; // not logged in / missing
//   };
// // sep02 - 4:08

//   // Fetcher with no-store + cache-buster (important for installed PWA)
//   const fetchOrders = async (userEmail) => {
//     const url = `${API}/userOrders?email=${encodeURIComponent(userEmail)}&t=${Date.now()}`;
//     // const url = `${API}/orders?email=${encodeURIComponent(email)}&_t=${Date.now()}`;
//     // const url = `${API}/orders/user?email=${encodeURIComponent(email)}&_t=${Date.now()}`;
//     const res = await fetch(url, {
//       method: "GET",
//       mode: "cors",
//       cache: "no-store",
//       headers: {
//         "Accept": "application/json",
//         "Pragma": "no-cache",
//         "Cache-Control": "no-cache, no-store, must-revalidate",
//       },
//     });
//     if (!res.ok) {
//       const text = await res.text().catch(() => "");
//       throw new Error(text || `HTTP ${res.status}`);
//     }
//     return res.json();
//   };

//   useEffect(() => {
//     let cancelled = false;

//     const load = async () => {
//       const email = resolveEmail();

//       if (!email) {
//         console.warn("[MyOrders] No email found in localStorage (userEmail / userLoginCreds.correo).");
//         if (!cancelled) {
//           setOrders([]);
//           setLoading(false);
//         }
//         return;
//       }

//       try {
//         // Try once
//         let data = await fetchOrders(email);

//         // If empty right after navigation from "Descargar Orden",
//         // try one quick retry (DB write may have just completed).
//         if (!Array.isArray(data) || data.length === 0) {
//           await new Promise((r) => setTimeout(r, 700));
//           data = await fetchOrders(email);
//         }

//         if (!cancelled) {
//           setOrders(Array.isArray(data) ? data : []);
//           setLoading(false);
//         }
//       } catch (err) {
//         console.error("[MyOrders] fetch error:", err);
//         if (!cancelled) {
//           setOrders([]);
//           setLoading(false);
//         }
//       }
//     };

//     load();
//     return () => {
//       cancelled = true;
//     };
//   }, []);

//   const goToTrackingTimeline = (order) => {
//     navigate(`/orderDetail/${order._id}`, { state: { order } });
//   };

//   return (
//     <body className="app-shell body-BG-Gradient">
//       {/* Header */}
//       <div className="loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src={Logo}
//           alt="Home Icon"
//           width="180"
//           height="55"
//           onClick={goHomeLogo}
//         />
//       </div>

//       <div className="app-main">
//         <div className="order-tracker-container">
//           <div className="edit-titleIcon-Div">
//             <label className="editAddress-headerLabel">Mis Pedidos</label>
//             <img className="myOrders-Icon" src={OrdersIcon} alt="Carrito" width="50" height="50" />
//           </div>

//           <div className="myOrders-DetailDiv">
//             {loading ? (
//               <p>Cargando órdenes...</p>
//             ) : orders.length === 0 ? (
//               <p>No hay órdenes registradas.</p>
//             ) : (
//               <ul className="order-list">
//                 {[...orders]
//                   .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
//                   .map((order, index) => (
//                     <li
//                       key={order._id || index}
//                       className="order-item"
//                       onClick={() => goToTrackingTimeline(order)}
//                       style={{
//                         cursor: "pointer",
//                         border: "1px solid #ccc",
//                         borderRadius: "8px",
//                         margin: "10px 0",
//                         padding: "12px",
//                       }}
//                     >
//                       <strong className="orderNumber-MyOrders">Pedido #:</strong>{" "}
//                       {(order._id || "").slice(-5)} <br />

//                       <strong className="orderNumber-MyOrders">Fecha:</strong>{" "}
//                       {order.orderDate
//                         ? (() => {
//                             const date = new Date(order.orderDate);
//                             const day = date.getDate().toString().padStart(2, "0");
//                             const month = date.toLocaleString("es-MX", { month: "short" });
//                             const year = date.getFullYear();
//                             return `${day}/${month}/${year}`;
//                           })()
//                         : "Sin fecha"}
//                       <br />

//                       <strong className="orderNumber-MyOrders">Estado:</strong>{" "}
//                       {order.orderStatus || "Pendiente"} <br />
//                     </li>
//                   ))}
//               </ul>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* Footer */}
//       <div className="app-footer footerMenuDiv">
//         <div className="footerHolder">
//           <div className="footerIcon-NameDiv" onClick={goToHome}>
//             <FontAwesomeIcon icon={faHouse} className="footerIcons" />
//             <label className="footerIcon-Name">PRINCIPAL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={goToMyProfile}>
//             <FontAwesomeIcon icon={faUser} className="footerIcons" />
//             <label className="footerIcon-Name">MI PERFIL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={goToNewOrder}>
//             <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
//             <label className="footerIcon-Name">ORDENA</label>
//           </div>
//         </div>
//       </div>
//     </body>
//   );
// }



// OG AND WORKING

// import React, { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";

// import { faHouse, faUser, faCartShopping, faHouseMedicalCircleExclamation } from "@fortawesome/free-solid-svg-icons"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

// import Logo from "/src/assets/images/GIS_Logo.png";
// import OrdersIcon from "/src/assets/images/Icono_Pedidos.png"
// import axios from "axios";
// import { API } from "/src/lib/api";

// export default function MyOrders() {

//     const navigate = useNavigate();

//     function goHomeLogo(){
//         console.log("Return home clicked")
//         navigate("/userHome")
//     }

//     function goToHome() {
//         console.log("Go to home")
//         navigate("/userHome")
//     }

//     function goToNewOrder() {
//         console.log("Go to new order")
//         navigate("/newOrder")
//     }

//     function goToMyProfile() {
//         console.log("Go to my profile")
//         navigate("/userProfile")
//     }

//     // SEP02 - 1:22
//     const [orders, setOrders] = useState([]);
//     const [loading, setLoading] = useState(true);

//     // Prefer the same source used on order creation
//     const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     const emailFromCreds = creds?.correo ? String(creds.correo).trim().toLowerCase() : "";
//     const emailFallback = localStorage.getItem("userEmail") || "";
//     const userEmail = (emailFromCreds || emailFallback).trim().toLowerCase();

//     useEffect(() => {
//         let cancelled = false;
//         const load = async () => {
//             try {
//                 if (!userEmail) {
//                     console.warn("User email not found");
//                     if (!cancelled) {
//                         setLoading(false);
//                     }
//                     return;
//                 }
//                 const url = `${API}/userOrders?email=${encodeURIComponent(userEmail)}&t=${Date.now()}`;
//                 const res = await fetch(url, {
//                     method: "GET",
//                     cache: "no-store",
//                     credentials: "omit",
//                     headers: { Accept: "application/json" }, // no custom headers → no preflight
//                 });
//                 if (!res.ok) throw new Error(`HTTP ${res.status}`);
//                 const data = await res.json();
//                 if (!cancelled) setOrders(Array.isArray(data) ? data : []);
//             } catch (e) {
//                 console.error("Failed to fetch user orders:", e);
//                 if (!cancelled) setOrders([]);
//             } finally {
//                 if (!cancelled) setLoading(false);
//             }
//         };
//         load();
//         return () => { cancelled = true; };
//     }, [userEmail]);
//     // const [orders, setOrders] = useState([]);
//     // const [loading, setLoading] = useState(true);
//     // const userEmail = localStorage.getItem("userEmail");

//     // useEffect(() => {
//     //     if (!userEmail) {
//     //     console.warn("User email not found in localStorage");
//     //     setLoading(false);
//     //     return;
//     //     }

//     //     fetch(`${API}/userOrders?email=${userEmail}`)
//     //     .then((res) => res.json())
//     //     .then((data) => {
//     //         setOrders(data);
//     //         setLoading(false);
//     //     })
//     //     .catch((err) => {
//     //         console.error("Failed to fetch user orders:", err);
//     //         setLoading(false);
//     //     });
//     // }, []);
//     // SEP02 - 1:22

//     const goToTrackingTimeline = (order) => {
//         navigate(`/orderDetail/${order._id}`, { state: { order } });
//     };

//     return (
//         <body className="app-shell body-BG-Gradient" >

//             {/* LOGOS DIV */}
//             <div className=" loginLogo-ParentDiv">
//                 <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
//             </div>
//             {/* LOGOS END*/}

//             <div className="app-main">
//             <div className="order-tracker-container">
//                 <div className="edit-titleIcon-Div">
//                     <label className="editAddress-headerLabel">Mis Pedidos</label>
//                     <img className="myOrders-Icon" src={OrdersIcon}alt="Carrito" width="50" height="50" />
//                 </div>

//                 <div className="myOrders-DetailDiv">
//                 {loading ? (
//                     <p>Cargando órdenes...</p>
//                 ) : orders.length === 0 ? (
//                     <p>No hay órdenes registradas.</p>
//                 ) : (
//                     <ul className="order-list">
//                         {[...orders] // clone array so original isn't mutated
//                             .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate)) // newest first
//                             .map((order, index) => (
//                             <li
//                                 key={order._id || index}
//                                 className="order-item"
//                                 onClick={() => goToTrackingTimeline(order)}
//                                 style={{
//                                 cursor: "pointer",
//                                 border: "1px solid #ccc",
//                                 borderRadius: "8px",
//                                 margin: "10px 0",
//                                 padding: "12px"
//                                 }}
//                             >
//                                 <strong className="orderNumber-MyOrders">Pedido #:</strong> {(order._id).slice(-5)} <br />

//                                 <strong className="orderNumber-MyOrders">Fecha:</strong>{" "}
//                                 {order.orderDate
//                                 ? (() => {
//                                     const date = new Date(order.orderDate);
//                                     const day = date.getDate().toString().padStart(2, "0");
//                                     const month = date.toLocaleString("en-MX", { month: "short" });
//                                     const year = date.getFullYear();
//                                     return `${day}/${month}/${year}`;
//                                     })()
//                                 : "Sin fecha"}
//                                 <br />

//                                 <strong className="orderNumber-MyOrders">Estado:</strong> {order.orderStatus || "Pendiente"} <br />
//                             </li>
//                             ))}
//                         </ul>
//                 )}
//                 </div>
//             </div>
//             </div>

//             {/* FOOTER MENU */}
//             <div className="app-footer footerMenuDiv">
//                 <div className="footerHolder">
//                     {/* HOME FOOTER DIV */}
//                     <div className="footerIcon-NameDiv" onClick={goToHome}>
//                         <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
//                         <label className="footerIcon-Name">PRINCIPAL</label>
//                     </div>

//                     {/* USER FOOTER DIV */}
//                     <div className="footerIcon-NameDiv" onClick={goToMyProfile}>
//                         <FontAwesomeIcon icon={faUser} className="footerIcons"/>
//                         <label className="footerIcon-Name">MI PERFIL</label>
//                     </div>

//                     {/* SETTINGS FOOTER DIV */}
//                     <div className="footerIcon-NameDiv" onClick={goToNewOrder}>
//                         <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
//                         <label className="footerIcon-Name">ORDENA</label>
//                     </div>
//                 </div>

//             </div>
//             {/* FOOTER MENU END */}
//         </body>
//     );
//     }