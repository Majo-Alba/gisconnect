// ✅ Updated manageDelivery.jsx
// - Removed time filter UI (dropdown) + related state
// - Always sorts newest -> oldest
// - Auto-refresh every 30 seconds (with cleanup)

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { API } from "/src/lib/api";

export default function ManageDelivery() {
  const navigate = useNavigate();

  function goToAdminHome() {
    navigate("/adminHome");
  }
  function goToNewOrders() {
    navigate("/newOrders");
  }
  function goToPackageReady() {
    navigate("/deliverReady");
  }
  const goHomeLogo = () => navigate("/adminHome");

  const [orders, setOrders] = useState([]);

  // ===== Google Sheets (Client DB) — fallback only =====
  const [csvRows, setCsvRows] = useState([]);
  useEffect(() => {
    const fetchCSV = async () => {
      try {
        const url =
          "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
        const resp = await axios.get(url);
        setCsvRows(parseCSV(resp.data));
      } catch (e) {
        console.error("Error fetching client CSV:", e);
        setCsvRows([]);
      }
    };
    fetchCSV();
  }, []);

  const normalize = (s) => (s ?? "").toString().trim().toLowerCase();

  // Build quick lookup from CSV (fallback):
  // email -> { name, company, carrier?, insurance? }
  const clientLookupCSV = useMemo(() => {
    const map = {};
    csvRows.forEach((r) => {
      const email = normalize(r.CORREO_EMPRESA);
      if (!email) return;
      map[email] = {
        name: (r.NOMBRE_APELLIDO || "").trim(),
        company: (r.NOMBRE_EMPRESA || "").trim(),
        carrier: (r.PAQUETERIA_ENVIO || "").trim(),
        insurance: (r.SEGURO_ENVIO || "").trim(),
      };
    });
    return map;
  }, [csvRows]);

  // ===== Orders (only "Preparando Pedido") =====
  useEffect(() => {
    fetchOrders();
  }, []);

  // ✅ Auto-refresh orders every 30 seconds
  useEffect(() => {
    const id = setInterval(() => {
      fetchOrders();
    }, 30_000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API}/orders`);
      const readyOrders = (response.data || []).filter(
        (order) => order.orderStatus === "Preparando Pedido"
      );
      setOrders(readyOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
      setOrders([]); // keep UI consistent
    }
  };

  // ===== Mongo users (email -> { name, company, preferredCarrier, insureShipment }) =====
  const [mongoUsers, setMongoUsers] = useState({}); // { [email]: { name, company, preferredCarrier, insureShipment } }

  useEffect(() => {
    const emails = Array.from(
      new Set(
        (orders || [])
          .map((o) => normalize(o.userEmail))
          .filter(Boolean)
      )
    );
    if (emails.length === 0) return;

    // fetch only missing emails
    const missing = emails.filter((e) => !mongoUsers[e]);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.allSettled(
          missing.map((email) =>
            axios.get(`${API}/users/by-email`, { params: { email } })
          )
        );

        const next = { ...mongoUsers };
        results.forEach((res, idx) => {
          const email = missing[idx];
          if (res.status === "fulfilled") {
            const u = res.value?.data || {};
            const nombre = (u.nombre || "").toString().trim();
            const apellido = (u.apellido || "").toString().trim();
            const empresa = (u.empresa || "").toString().trim();

            // Shipping prefs might be nested or at top level
            const prefCarrier =
              (u.shippingPreferences && u.shippingPreferences.preferredCarrier) ||
              u.preferredCarrier ||
              "";
            const insure =
              (u.shippingPreferences && u.shippingPreferences.insureShipment) ??
              u.insureShipment;

            next[email] = {
              name: [nombre, apellido].filter(Boolean).join(" ") || email,
              company: empresa || "",
              preferredCarrier: (prefCarrier || "").toString().trim(),
              insureShipment: Boolean(insure),
            };
          }
        });

        if (!cancelled) setMongoUsers(next);
      } catch (e) {
        // Ignore: we’ll fall back to CSV/email in render
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOrderClick = (orderId) => {
    navigate(`/manageDelivery/${orderId}`);
  };

  // Simple CSV parser
  function parseCSV(csvText) {
    const rows = csvText.split(/\r?\n/).filter(Boolean);
    if (rows.length === 0) return [];
    const headers = rows[0].split(",").map((h) => h.trim());
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(",");
      const obj = {};
      headers.forEach((h, idx) => (obj[h] = (cols[idx] || "").trim()));
      data.push(obj);
    }
    return data;
  }

  // Helpers to display values with fallback priority: Mongo → CSV → default/email
  const nameForEmail = (emailRaw) => {
    const email = normalize(emailRaw);
    return (
      mongoUsers[email]?.name ||
      clientLookupCSV[email]?.name ||
      emailRaw ||
      ""
    );
  };

  const companyForEmail = (emailRaw) => {
    const email = normalize(emailRaw);
    return (
      mongoUsers[email]?.company ||
      clientLookupCSV[email]?.company ||
      ""
    );
  };

  const carrierForEmail = (emailRaw) => {
    const email = normalize(emailRaw);
    return (
      mongoUsers[email]?.preferredCarrier ||
      clientLookupCSV[email]?.carrier ||
      ""
    );
  };

  const insuranceForEmail = (emailRaw) => {
    const email = normalize(emailRaw);
    // Prefer Mongo boolean → "Sí"/"No"
    if (mongoUsers[email]) {
      return mongoUsers[email].insureShipment ? "Sí" : "No";
    }
    // Fallback CSV (string like "Sí"/"No" or empty)
    return clientLookupCSV[email]?.insurance || "";
  };

  // ✅ Newest first (no filters that hide orders)
  const sortedOrders = useMemo(() => {
    const arr = [...orders];
    arr.sort((a, b) => {
      const da = new Date(a.orderDate || a.createdAt || 0).getTime();
      const db = new Date(b.orderDate || b.createdAt || 0).getTime();
      return db - da;
    });
    return arr;
  }, [orders]);

  return (
    <body className="body-BG-Gradient">
      {/* LOGOS DIV */}
      <div className="loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Logo"
          width="180"
          height="55"
          onClick={goHomeLogo}
        />
      </div>

      <label className="sectionHeader-Label">Gestionar Entrega</label>

      <div className="newQuotesScroll-Div">
        {sortedOrders.map((order) => {
          const displayName = nameForEmail(order.userEmail);
          const companyName = companyForEmail(order.userEmail);
          const carrierName = carrierForEmail(order.userEmail);
          const insurancePref = insuranceForEmail(order.userEmail);

          return (
            <div className="existingQuote-Div" key={order._id}>
              <div className="quoteAndFile-Div" onClick={() => handleOrderClick(order._id)}>
                <label className="orderQuick-Label">{displayName}</label>
                <label className="orderQuick-Label">{companyName}</label>
                <label className="orderQuick-Label">
                  <strong>Pedido: </strong>
                  {String(order._id).slice(-5)}
                </label>
                <label className="orderQuick-Label">
                  <b>Instrucción:</b><br />
                  Paquetería: {carrierName || "Sin preferencia especificada"}<br />
                  Mercancía Asegurada: {insurancePref || "Sin preferencia especificada"}
                </label>
              </div>
            </div>
          );
        })}

        {sortedOrders.length === 0 && (
          <p style={{ textAlign: "center", marginTop: "2rem" }}>
            No hay pedidos listos para entrega.
          </p>
        )}
      </div>

      {/* FOOTER MENU */}
      <div className="footerMenuDiv">
        <div className="footerHolder">
          {/* HOME FOOTER DIV */}
          <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons" />
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>

          {/* USER FOOTER DIV */}
          <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
            <label className="footerIcon-Name">ORDENES</label>
          </div>

          {/* SETTINGS FOOTER DIV */}
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

// // lets do the exact same thing for manageDelivery.jsx. Remove the search filter, place orders newest on top, oldest on bottom, and add auto-refresh every 30 seconds. Here is my current pendingPack.jsx, please direct edit
// import { useState, useEffect, useMemo } from "react";
// import { useNavigate } from "react-router-dom";
// import axios from "axios";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import { API } from "/src/lib/api";

// export default function ManageDelivery() {
//   const navigate = useNavigate();

//   function goToAdminHome() {
//     navigate("/adminHome");
//   }
//   function goToNewOrders() {
//     navigate("/newOrders");
//   }
//   function goToPackageReady() {
//     navigate("/deliverReady");
//   }
//   const goHomeLogo = () => navigate("/adminHome");

//   const [orders, setOrders] = useState([]);

//   // ===== Google Sheets (Client DB) — fallback only =====
//   const [csvRows, setCsvRows] = useState([]);
//   useEffect(() => {
//     const fetchCSV = async () => {
//       try {
//         const url =
//           "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
//         const resp = await axios.get(url);
//         setCsvRows(parseCSV(resp.data));
//       } catch (e) {
//         console.error("Error fetching client CSV:", e);
//         setCsvRows([]);
//       }
//     };
//     fetchCSV();
//   }, []);

//   const normalize = (s) => (s ?? "").toString().trim().toLowerCase();

//   // Build quick lookup from CSV (fallback):
//   // email -> { name, company, carrier?, insurance? }
//   const clientLookupCSV = useMemo(() => {
//     const map = {};
//     csvRows.forEach((r) => {
//       const email = normalize(r.CORREO_EMPRESA);
//       if (!email) return;
//       map[email] = {
//         name: (r.NOMBRE_APELLIDO || "").trim(),
//         company: (r.NOMBRE_EMPRESA || "").trim(),
//         carrier: (r.PAQUETERIA_ENVIO || "").trim(),
//         insurance: (r.SEGURO_ENVIO || "").trim(),
//       };
//     });
//     return map;
//   }, [csvRows]);

//   // ===== Orders (only "Preparando Pedido") =====
//   useEffect(() => {
//     fetchOrders();
//   }, []);

//   const fetchOrders = async () => {
//     try {
//       const response = await axios.get(`${API}/orders`);
//       const readyOrders = (response.data || []).filter(
//         (order) => order.orderStatus === "Preparando Pedido"
//       );
//       setOrders(readyOrders);
//     } catch (err) {
//       console.error("Error fetching orders:", err);
//     }
//   };

//   // ===== Mongo users (email -> { name, company, preferredCarrier, insureShipment }) =====
//   const [mongoUsers, setMongoUsers] = useState({}); // { [email]: { name, company, preferredCarrier, insureShipment } }

//   useEffect(() => {
//     const emails = Array.from(
//       new Set(
//         (orders || [])
//           .map((o) => normalize(o.userEmail))
//           .filter(Boolean)
//       )
//     );
//     if (emails.length === 0) return;

//     // fetch only missing emails
//     const missing = emails.filter((e) => !mongoUsers[e]);
//     if (missing.length === 0) return;

//     let cancelled = false;
//     (async () => {
//       try {
//         const results = await Promise.allSettled(
//           missing.map((email) =>
//             axios.get(`${API}/users/by-email`, { params: { email } })
//           )
//         );

//         const next = { ...mongoUsers };
//         results.forEach((res, idx) => {
//           const email = missing[idx];
//           if (res.status === "fulfilled") {
//             const u = res.value?.data || {};
//             const nombre = (u.nombre || "").toString().trim();
//             const apellido = (u.apellido || "").toString().trim();
//             const empresa = (u.empresa || "").toString().trim();

//             // Shipping prefs might be nested or at top level
//             const prefCarrier =
//               (u.shippingPreferences && u.shippingPreferences.preferredCarrier) ||
//               u.preferredCarrier ||
//               "";
//             const insure =
//               (u.shippingPreferences && u.shippingPreferences.insureShipment) ??
//               u.insureShipment;

//             next[email] = {
//               name: [nombre, apellido].filter(Boolean).join(" ") || email,
//               company: empresa || "",
//               preferredCarrier: (prefCarrier || "").toString().trim(),
//               insureShipment: Boolean(insure),
//             };
//           }
//         });

//         if (!cancelled) setMongoUsers(next);
//       } catch (e) {
//         // Ignore: we’ll fall back to CSV/email in render
//       }
//     })();

//     return () => {
//       cancelled = true;
//     };
//   }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

//   const handleOrderClick = (orderId) => {
//     navigate(`/manageDelivery/${orderId}`);
//   };

//   // Simple CSV parser
//   function parseCSV(csvText) {
//     const rows = csvText.split(/\r?\n/).filter(Boolean);
//     if (rows.length === 0) return [];
//     const headers = rows[0].split(",").map((h) => h.trim());
//     const data = [];
//     for (let i = 1; i < rows.length; i++) {
//       const cols = rows[i].split(",");
//       const obj = {};
//       headers.forEach((h, idx) => (obj[h] = (cols[idx] || "").trim()));
//       data.push(obj);
//     }
//     return data;
//   }

//   // Helpers to display values with fallback priority: Mongo → CSV → default/email
//   const nameForEmail = (emailRaw) => {
//     const email = normalize(emailRaw);
//     return (
//       mongoUsers[email]?.name ||
//       clientLookupCSV[email]?.name ||
//       emailRaw ||
//       ""
//     );
//   };

//   const companyForEmail = (emailRaw) => {
//     const email = normalize(emailRaw);
//     return (
//       mongoUsers[email]?.company ||
//       clientLookupCSV[email]?.company ||
//       ""
//     );
//   };

//   const carrierForEmail = (emailRaw) => {
//     const email = normalize(emailRaw);
//     return (
//       mongoUsers[email]?.preferredCarrier ||
//       clientLookupCSV[email]?.carrier ||
//       ""
//     );
//   };

//   const insuranceForEmail = (emailRaw) => {
//     const email = normalize(emailRaw);
//     // Prefer Mongo boolean → "Sí"/"No"
//     if (mongoUsers[email]) {
//       return mongoUsers[email].insureShipment ? "Sí" : "No";
//     }
//     // Fallback CSV (string like "Sí"/"No" or empty)
//     return clientLookupCSV[email]?.insurance || "";
//   };

//   return (
//     <body className="body-BG-Gradient">
//       {/* LOGOS DIV */}
//       <div className="loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src={Logo}
//           alt="Logo"
//           width="180"
//           height="55"
//           onClick={goHomeLogo}
//         />
//       </div>

//       <label className="sectionHeader-Label">Gestionar Entrega</label>

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
//           const displayName = nameForEmail(order.userEmail);
//           const companyName = companyForEmail(order.userEmail);
//           const carrierName = carrierForEmail(order.userEmail);
//           const insurancePref = insuranceForEmail(order.userEmail);

//           return (
//             <div className="existingQuote-Div" key={order._id}>
//               <div className="quoteAndFile-Div" onClick={() => handleOrderClick(order._id)}>
//                 <label className="orderQuick-Label">{displayName}</label>
//                 <label className="orderQuick-Label">{companyName}</label>
//                 <label className="orderQuick-Label">
//                   <strong>Pedido: </strong>
//                   {String(order._id).slice(-5)}
//                 </label>
//                 <label className="orderQuick-Label">
//                   <b>Instrucción:</b><br />
//                   Paquetería: {carrierName || "Sin preferencia especificada"}<br />
//                   Mercancía Asegurada: {insurancePref || "Sin preferencia especificada"}
//                 </label>
//               </div>
//             </div>
//           );
//         })}
//         {orders.length === 0 && (
//           <p style={{ textAlign: "center", marginTop: "2rem" }}>No hay pedidos listos para entrega.</p>
//         )}
//       </div>

//       {/* FOOTER MENU */}
//       <div className="footerMenuDiv">
//         <div className="footerHolder">
//           {/* HOME FOOTER DIV */}
//           <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
//             <FontAwesomeIcon icon={faHouse} className="footerIcons" />
//             <label className="footerIcon-Name">PRINCIPAL</label>
//           </div>

//           {/* USER FOOTER DIV */}
//           <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
//             <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
//             <label className="footerIcon-Name">ORDENES</label>
//           </div>

//           {/* SETTINGS FOOTER DIV */}
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