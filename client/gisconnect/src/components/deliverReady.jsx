import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { API } from "/src/lib/api";

export default function DeliverReady() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);

  // ===== NEW: Mongo cache (email -> user) =====
  const [mongoByEmail, setMongoByEmail] = useState({});
  const [mongoLoading, setMongoLoading] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API}/orders`);
      // ✨ Include both statuses in the list
      const deliverableOrders = response.data.filter(
        (order) =>
          order.orderStatus === "Etiqueta Generada" ||
          order.orderStatus === "Pendiente de Entrega"
      );
      setOrders(deliverableOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
    }
  };

  // Pull needed Mongo users for the list (dedup by email)
  useEffect(() => {
    const norm = (s) => String(s || "").trim().toLowerCase();
    const emails = Array.from(
      new Set(
        (orders || [])
          .map((o) => norm(o.userEmail))
          .filter((e) => !!e)
      )
    );

    const missing = emails.filter((e) => !(e in mongoByEmail));
    if (missing.length === 0) return;

    let cancelled = false;
    setMongoLoading(true);

    (async () => {
      try {
        const results = await Promise.allSettled(
          missing.map((email) =>
            axios
              .get(`${API}/users/by-email`, { params: { email } })
              .then((res) => ({ email, user: res.data || null }))
              .catch(() => ({ email, user: null }))
          )
        );

        if (cancelled) return;

        setMongoByEmail((prev) => {
          const next = { ...prev };
          results.forEach((r) => {
            if (r.status === "fulfilled") {
              const { email, user } = r.value;
              next[email] = user;
            }
          });
          return next;
        });
      } finally {
        if (!cancelled) setMongoLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orders, mongoByEmail]);

  const handleOrderClick = (orderId) => {
    navigate(`/deliveryDetails/${orderId}`);
  };

  function goToAdminHome() {
    navigate("/adminHome");
  }
  function goToNewOrders() {
    navigate("/newOrders");
  }
  function goToPackageReady() {
    navigate("/deliverReady");
  }
  const goHomeLogo = () => {
    navigate("/adminHome");
  };

  const normalize = (s) => String(s || "").trim().toLowerCase();

  const displayNameFor = (email) => {
    const user = mongoByEmail[normalize(email)];
    const nombre = (user?.nombre || "").trim();
    const apellido = (user?.apellido || "").trim();
    const full = [nombre, apellido].filter(Boolean).join(" ");
    return full || email || "Cliente";
  };

  const preferredCarrierFor = (email) => {
    const user = mongoByEmail[normalize(email)];
    return (
      (user?.shippingPreferences?.preferredCarrier ||
        user?.preferredCarrier ||
        "")?.toString()
        .trim() || ""
    );
  };

  const insureShipmentLabelFor = (email) => {
    const user = mongoByEmail[normalize(email)];
    const val =
      user?.shippingPreferences?.insureShipment ??
      user?.insureShipment;
    if (typeof val === "boolean") return val ? "Sí" : "No";
    return "";
  };

  // ===== Helpers to detect "future" date & format nicely =====
  const parseDeliveryDate = (order) => {
    // Prefer YMD string if present, else native Date
    if (order?.deliveryDateYMD) {
      // YYYY-MM-DD
      return new Date(`${order.deliveryDateYMD}T00:00:00`);
    }
    if (order?.deliveryDate) {
      return new Date(order.deliveryDate);
    }
    return null;
  };

  const isFuture = (d) => {
    if (!d) return false;
    const today = new Date();
    // Compare by local date (ignore time)
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return a > b;
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    const day = d.getDate().toString().padStart(2, "0");
    const month = d.toLocaleString("es-MX", { month: "short" }); // keep short label style
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // ===== NEW: pickup helpers for inline label override =====
  const isPickupOrder = (order) => {
    const sr = order?.shippingInfo;
    const fromString =
      typeof sr === "string" && sr.trim().toLowerCase() === "recoger en matriz";
    const fromObject =
      !!(sr && (sr.pickup === true || sr?.method === "pickup"));
    return fromString || fromObject;
  };

  const fmtDMY = (isoLike) => {
    if (!isoLike) return "";
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return String(isoLike);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const pickupLineFor = (order) => {
    const p = order?.pickupDetails || null;
    if (!p) return "";
    const d = fmtDMY(p.date);
    const t = (p.time || "").trim();
    if (d && t) return `${d} • ${t}`;
    return d || t || "";
  };

  return (
    <body className="body-BG-Gradient">
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
      {/* LOGOS END*/}

      <label className="sectionHeader-Label">Por Entregar</label>

      <div>
        <select className="sectionFilter-Dropdown" type="text" required>
          <option>Filtrar por...</option>
          <option>Día</option>
          <option>Semana</option>
          <option>Mes</option>
          <option>Bimestre</option>
          <option>Trimestre</option>
          <option>Semestre</option>
        </select>
      </div>

      <div className="newQuotesScroll-Div">
        {orders.map((order) => {
          const name = displayNameFor(order.userEmail);
          const carrier = preferredCarrierFor(order.userEmail);
          const insured = insureShipmentLabelFor(order.userEmail);

          // NEW: Pending label logic
          const d = parseDeliveryDate(order);
          const isPendingBadge =
            order.orderStatus === "Pendiente de Entrega" || isFuture(d);

          // NEW: detect pickup + build line
          const isPickup = isPickupOrder(order);
          const pickupLine = pickupLineFor(order);

          return (
            <div className="existingQuote-Div" key={order._id}>
              <div
                className="quoteAndFile-Div"
                onClick={() => handleOrderClick(order._id)}
              >
                <label className="orderQuick-Label">{name}</label>

                <label className="orderQuick-Label">
                  {order.orderDate
                    ? (() => {
                        const date = new Date(order.orderDate);
                        const day = date.getDate().toString().padStart(2, "0");
                        const month = date.toLocaleString("en-MX", { month: "short" });
                        const year = date.getFullYear();
                        return `${day}/${month}/${year}`;
                      })()
                    : "Sin fecha"}
                </label>

                <label className="orderQuick-Label">
                  No. {String(order._id).slice(-5)}
                </label>

                {/* ✅ Override Paquetería for pickup orders */}
                {isPickup ? (
                  <label className="orderQuick-Label">
                    <b>Recoger en Matriz:</b> {pickupLine || "—"}
                  </label>
                ) : (
                  <label className="orderQuick-Label">
                    <b>Paquetería:</b> {carrier || "No especificado"}
                  </label>
                )}

                {/* ✨ NEW: Badge when pending or future date */}
                {isPendingBadge && (
                  <label className="orderQuick-Label" style={{ color: "#b45309" }}>
                    <b>Pendiente de Entrega:</b> {fmtDate(d)}
                  </label>
                )}
              </div>
            </div>
          );
        })}

        {orders.length === 0 && (
          <p style={{ textAlign: "center", marginTop: "2rem" }}>
            No hay pedidos por entregar.
          </p>
        )}
      </div>

      {/* FOOTER MENU */}
      <div className="footerMenuDiv">
        <div className="footerHolder">
          <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons" />
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
            <label className="footerIcon-Name">ORDENES</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
            <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
            <label className="footerIcon-Name">ENTREGAR</label>
          </div>
        </div>
      </div>
      {/* FOOTER MENU END */}
    </body>
  );
}

// // hey chatgpt, for deliverReady.jsx if in mongodb we have "shippingInfo" set as "Recoger en Matriz", I'd like to override label "Paquetería" and, instead of having that, display "Recoger en Matriz: date and time" (remember we have "pickupDetails" object in mongodb, ehich contains date and time). Here is my deliverReady.jsx, please direct edit
// import { useState, useEffect, useMemo } from "react";
// import { useNavigate } from "react-router-dom";
// import axios from "axios";

// import Logo from "/src/assets/images/GIS_Logo.png";

// import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import { API } from "/src/lib/api";

// export default function DeliverReady() {
//   const navigate = useNavigate();
//   const [orders, setOrders] = useState([]);

//   // ===== NEW: Mongo cache (email -> user) =====
//   const [mongoByEmail, setMongoByEmail] = useState({});
//   const [mongoLoading, setMongoLoading] = useState(false);

//   useEffect(() => {
//     fetchOrders();
//   }, []);

//   const fetchOrders = async () => {
//     try {
//       const response = await axios.get(`${API}/orders`);
//       // ✨ Include both statuses in the list
//       const deliverableOrders = response.data.filter(
//         (order) =>
//           order.orderStatus === "Etiqueta Generada" ||
//           order.orderStatus === "Pendiente de Entrega"
//       );
//       setOrders(deliverableOrders);
//     } catch (err) {
//       console.error("Error fetching orders:", err);
//     }
//   };

//   // Pull needed Mongo users for the list (dedup by email)
//   useEffect(() => {
//     const norm = (s) => String(s || "").trim().toLowerCase();
//     const emails = Array.from(
//       new Set(
//         (orders || [])
//           .map((o) => norm(o.userEmail))
//           .filter((e) => !!e)
//       )
//     );

//     const missing = emails.filter((e) => !(e in mongoByEmail));
//     if (missing.length === 0) return;

//     let cancelled = false;
//     setMongoLoading(true);

//     (async () => {
//       try {
//         const results = await Promise.allSettled(
//           missing.map((email) =>
//             axios
//               .get(`${API}/users/by-email`, { params: { email } })
//               .then((res) => ({ email, user: res.data || null }))
//               .catch(() => ({ email, user: null }))
//           )
//         );

//         if (cancelled) return;

//         setMongoByEmail((prev) => {
//           const next = { ...prev };
//           results.forEach((r) => {
//             if (r.status === "fulfilled") {
//               const { email, user } = r.value;
//               next[email] = user;
//             }
//           });
//           return next;
//         });
//       } finally {
//         if (!cancelled) setMongoLoading(false);
//       }
//     })();

//     return () => {
//       cancelled = true;
//     };
//   }, [orders, mongoByEmail]);

//   const handleOrderClick = (orderId) => {
//     navigate(`/deliveryDetails/${orderId}`);
//   };

//   function goToAdminHome() {
//     navigate("/adminHome");
//   }
//   function goToNewOrders() {
//     navigate("/newOrders");
//   }
//   function goToPackageReady() {
//     navigate("/deliverReady");
//   }
//   const goHomeLogo = () => {
//     navigate("/adminHome");
//   };

//   const normalize = (s) => String(s || "").trim().toLowerCase();

//   const displayNameFor = (email) => {
//     const user = mongoByEmail[normalize(email)];
//     const nombre = (user?.nombre || "").trim();
//     const apellido = (user?.apellido || "").trim();
//     const full = [nombre, apellido].filter(Boolean).join(" ");
//     return full || email || "Cliente";
//   };

//   const preferredCarrierFor = (email) => {
//     const user = mongoByEmail[normalize(email)];
//     return (
//       (user?.shippingPreferences?.preferredCarrier ||
//         user?.preferredCarrier ||
//         "")?.toString()
//         .trim() || ""
//     );
//   };

//   const insureShipmentLabelFor = (email) => {
//     const user = mongoByEmail[normalize(email)];
//     const val =
//       user?.shippingPreferences?.insureShipment ??
//       user?.insureShipment;
//     if (typeof val === "boolean") return val ? "Sí" : "No";
//     return "";
//   };

//   // ===== Helpers to detect "future" date & format nicely =====
//   const parseDeliveryDate = (order) => {
//     // Prefer YMD string if present, else native Date
//     if (order?.deliveryDateYMD) {
//       // YYYY-MM-DD
//       return new Date(`${order.deliveryDateYMD}T00:00:00`);
//     }
//     if (order?.deliveryDate) {
//       return new Date(order.deliveryDate);
//     }
//     return null;
//   };

//   const isFuture = (d) => {
//     if (!d) return false;
//     const today = new Date();
//     // Compare by local date (ignore time)
//     const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
//     const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
//     return a > b;
//     // (If you want "today but later time" to still be "today", this is correct.)
//   };

//   const fmtDate = (d) => {
//     if (!d) return "—";
//     const day = d.getDate().toString().padStart(2, "0");
//     const month = d.toLocaleString("es-MX", { month: "short" }); // keep short label style
//     const year = d.getFullYear();
//     return `${day}/${month}/${year}`;
//   };

//   return (
//     <body className="body-BG-Gradient">
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
//       {/* LOGOS END*/}

//       <label className="sectionHeader-Label">Por Entregar</label>

//       <div>
//         <select className="sectionFilter-Dropdown" type="text" required>
//           <option>Filtrar por...</option>
//           <option>Día</option>
//           <option>Semana</option>
//           <option>Mes</option>
//           <option>Bimestre</option>
//           <option>Trimestre</option>
//           <option>Semestre</option>
//         </select>
//       </div>

//       <div className="newQuotesScroll-Div">
//         {orders.map((order) => {
//           const name = displayNameFor(order.userEmail);
//           const carrier = preferredCarrierFor(order.userEmail);
//           const insured = insureShipmentLabelFor(order.userEmail);

//           // NEW: Pending label logic
//           const d = parseDeliveryDate(order);
//           const isPendingBadge =
//             order.orderStatus === "Pendiente de Entrega" || isFuture(d);

//           return (
//             <div className="existingQuote-Div" key={order._id}>
//               <div
//                 className="quoteAndFile-Div"
//                 onClick={() => handleOrderClick(order._id)}
//               >
//                 <label className="orderQuick-Label">{name}</label>

//                 <label className="orderQuick-Label">
//                   {order.orderDate
//                     ? (() => {
//                         const date = new Date(order.orderDate);
//                         const day = date.getDate().toString().padStart(2, "0");
//                         const month = date.toLocaleString("en-MX", { month: "short" });
//                         const year = date.getFullYear();
//                         return `${day}/${month}/${year}`;
//                       })()
//                     : "Sin fecha"}
//                 </label>

//                 <label className="orderQuick-Label">
//                   No. {String(order._id).slice(-5)}
//                 </label>

//                 <label className="orderQuick-Label">
//                   <b>Paquetería:</b> {carrier || "No especificado"}
//                 </label>

//                 {/* ✨ NEW: Badge when pending or future date */}
//                 {isPendingBadge && (
//                   <label className="orderQuick-Label" style={{ color: "#b45309" }}>
//                     <b>Pendiente de Entrega:</b> {fmtDate(d)}
//                   </label>
//                 )}
//               </div>
//             </div>
//           );
//         })}

//         {orders.length === 0 && (
//           <p style={{ textAlign: "center", marginTop: "2rem" }}>
//             No hay pedidos por entregar.
//           </p>
//         )}
//       </div>

//       {/* FOOTER MENU */}
//       <div className="footerMenuDiv">
//         <div className="footerHolder">
//           <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
//             <FontAwesomeIcon icon={faHouse} className="footerIcons" />
//             <label className="footerIcon-Name">PRINCIPAL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
//             <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
//             <label className="footerIcon-Name">ORDENES</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
//             <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
//             <label className="footerIcon-Name">ENTREGAR</label>
//           </div>
//         </div>
//       </div>
//       {/* FOOTER MENU END */}
//     </body>
//   );
// }