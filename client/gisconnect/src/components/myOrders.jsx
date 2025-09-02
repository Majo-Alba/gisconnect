// import React, { useEffect, useMemo, useState } from "react";
// import { useLocation, useNavigate } from "react-router-dom";
// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import axios from "axios";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import OrdersIcon from "/src/assets/images/Icono_Pedidos.png";
// import { API } from "/src/lib/api";

// export default function MyOrders() {
//   const navigate = useNavigate();
//   const location = useLocation();

//   // If you navigate here after creating an order, send:
//   // navigate("/myOrders", { state: { refresh: true, justCreatedOrderId: createdOrderId } })
//   const refresh = !!location.state?.refresh;
//   const createdId = location.state?.justCreatedOrderId || null;

//   const [orders, setOrders] = useState([]);
//   const [loading, setLoading] = useState(true);

//   // Robust email resolver
//   const resolvedEmail = useMemo(() => {
//     const direct = localStorage.getItem("userEmail");
//     if (direct && direct.includes("@")) return direct;

//     try {
//       const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//       if (creds?.correo && creds.correo.includes("@")) {
//         // Keep a copy for future screens that read userEmail
//         localStorage.setItem("userEmail", creds.correo);
//         return creds.correo;
//       }
//     } catch (_) {}
//     return null;
//   }, []);

//   // Clear runtime caches (not the workbox precache) — helps mobile PWAs stuck on stale responses
//   const clearRuntimeCaches = async () => {
//     if (!("caches" in window)) return;
//     const keys = await caches.keys();
//     await Promise.all(
//       keys
//         .filter((k) => !k.startsWith("workbox-precache")) // keep code assets
//         .map((k) => caches.delete(k))
//     );
//   };

//   const fetchOrders = async (attempt = 1) => {
//     if (!resolvedEmail) {
//       console.warn("User email not found; cannot fetch orders");
//       setLoading(false);
//       return;
//     }
//     const url = `${API}/userOrders?email=${encodeURIComponent(resolvedEmail)}&ts=${Date.now()}`;

//     const { data } = await axios.get(url, {
//       headers: { "Cache-Control": "no-store", Accept: "application/json" },
//       withCredentials: false,
//     });

//     const list = Array.isArray(data) ? data : data?.orders || [];

//     // If we expect to see the order we just created but don't, or we got an empty list on refresh → retry once after cache sweep
//     const hasJustCreated = createdId ? list.some((o) => (o._id || o.id) === createdId) : list.length > 0;
//     if ((refresh && !hasJustCreated) && attempt === 1) {
//       await clearRuntimeCaches();
//       // tiny wait to let SW settle
//       await new Promise((r) => setTimeout(r, 300));
//       return fetchOrders(2);
//     }

//     setOrders(list);
//     setLoading(false);
//   };

//   useEffect(() => {
//     // Nudge SW to update itself (no-op if none). Helps on mobile PWAs.
//     navigator.serviceWorker?.ready?.then((reg) => reg.update?.()).catch(() => {});
//     fetchOrders().catch((err) => {
//       console.error("Failed to fetch user orders:", err);
//       setLoading(false);
//     });
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [resolvedEmail]);

//   const goHomeLogo = () => navigate("/userHome");
//   const goToHome = () => navigate("/userHome");
//   const goToNewOrder = () => navigate("/newOrder");
//   const goToMyProfile = () => navigate("/userProfile");

//   const goToTrackingTimeline = (order) => {
//     navigate(`/orderDetail/${order._id || order.id}`, { state: { order } });
//   };

//   return (
//     <body className="app-shell body-BG-Gradient">
//       {/* LOGOS DIV */}
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
//       {/* LOGOS END */}

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
//                       key={order._id || order.id || index}
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
//                       {(order._id || order.id || "").toString().slice(-5)} <br />
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

//       {/* FOOTER MENU */}
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
//       {/* FOOTER MENU END */}
//     </body>
//   );
// }


// // Im still getting the same error, so here is my current myOrders.jsx code. Can you help me direct edit to see what I'm possibly missing?

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { faHouse, faUser, faCartShopping, faHouseMedicalCircleExclamation } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import OrdersIcon from "/src/assets/images/Icono_Pedidos.png"
import axios from "axios";
import { API } from "/src/lib/api";

export default function MyOrders() {

    const navigate = useNavigate();

    function goHomeLogo(){
        console.log("Return home clicked")
        navigate("/userHome")
    }

    function goToHome() {
        console.log("Go to home")
        navigate("/userHome")
    }

    function goToNewOrder() {
        console.log("Go to new order")
        navigate("/newOrder")
    }

    function goToMyProfile() {
        console.log("Go to my profile")
        navigate("/userProfile")
    }

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const userEmail = localStorage.getItem("userEmail");

    useEffect(() => {
        if (!userEmail) {
        console.warn("User email not found in localStorage");
        setLoading(false);
        return;
        }

        fetch(`${API}/userOrders?email=${userEmail}`)
        .then((res) => res.json())
        .then((data) => {
            setOrders(data);
            setLoading(false);
        })
        .catch((err) => {
            console.error("Failed to fetch user orders:", err);
            setLoading(false);
        });
    }, []);

    const goToTrackingTimeline = (order) => {
        navigate(`/orderDetail/${order._id}`, { state: { order } });
    };

    return (
        <body className="app-shell body-BG-Gradient" >

            {/* LOGOS DIV */}
            <div className=" loginLogo-ParentDiv">
                <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
            </div>
            {/* LOGOS END*/}

            <div className="app-main">
            <div className="order-tracker-container">
                <div className="edit-titleIcon-Div">
                    <label className="editAddress-headerLabel">Mis Pedidos</label>
                    <img className="myOrders-Icon" src={OrdersIcon}alt="Carrito" width="50" height="50" />
                </div>

                <div className="myOrders-DetailDiv">
                {loading ? (
                    <p>Cargando órdenes...</p>
                ) : orders.length === 0 ? (
                    <p>No hay órdenes registradas.</p>
                ) : (
                    <ul className="order-list">
                        {[...orders] // clone array so original isn't mutated
                            .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate)) // newest first
                            .map((order, index) => (
                            <li
                                key={order._id || index}
                                className="order-item"
                                onClick={() => goToTrackingTimeline(order)}
                                style={{
                                cursor: "pointer",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                margin: "10px 0",
                                padding: "12px"
                                }}
                            >
                                <strong className="orderNumber-MyOrders">Pedido #:</strong> {(order._id).slice(-5)} <br />

                                <strong className="orderNumber-MyOrders">Fecha:</strong>{" "}
                                {order.orderDate
                                ? (() => {
                                    const date = new Date(order.orderDate);
                                    const day = date.getDate().toString().padStart(2, "0");
                                    const month = date.toLocaleString("en-MX", { month: "short" });
                                    const year = date.getFullYear();
                                    return `${day}/${month}/${year}`;
                                    })()
                                : "Sin fecha"}
                                <br />

                                <strong className="orderNumber-MyOrders">Estado:</strong> {order.orderStatus || "Pendiente"} <br />
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
                    {/* HOME FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToHome}>
                        <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
                        <label className="footerIcon-Name">PRINCIPAL</label>
                    </div>

                    {/* USER FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToMyProfile}>
                        <FontAwesomeIcon icon={faUser} className="footerIcons"/>
                        <label className="footerIcon-Name">MI PERFIL</label>
                    </div>

                    {/* SETTINGS FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToNewOrder}>
                        <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
                        <label className="footerIcon-Name">ORDENA</label>
                    </div>
                </div>

            </div>
            {/* FOOTER MENU END */}
        </body>
    );
    }