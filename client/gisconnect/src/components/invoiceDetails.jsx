import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";
import summaryIcon from "/src/assets/images/Icono_fileDownload.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHouse, faCartShopping, faCheckToSlot } from "@fortawesome/free-solid-svg-icons";

import { API } from "/src/lib/api";

const ALLOWED_ADMIN_EMAILS = new Set([
  "ventas@greenimportsol.com",
  "info@greenimportsol.com",
  "administracion@greenimportsol.com",
  "administracion2@greenimportsol.com",
  "majo_test@gmail.com",
]);

const CLIENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";

export default function InvoiceDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToDeliverReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  const [currentUserEmail, setCurrentUserEmail] = useState("");
  useEffect(() => {
    const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    setCurrentUserEmail((creds?.correo || "").trim().toLowerCase());
  }, []);

  const canUseScreen = ALLOWED_ADMIN_EMAILS.has(currentUserEmail);

  useEffect(() => {
    if (!canUseScreen && currentUserEmail) {
      navigate("/adminHome");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseScreen, currentUserEmail]);

  const [order, setOrder] = useState(null);
  const [billing, setBilling] = useState(null);

  // ✅ NEW (same logic as GeneratedQuotes)
  const [csvData, setCsvData] = useState([]);
  const [mongoUsers, setMongoUsers] = useState({});
  const [displayName, setDisplayName] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  function parseCSV(csvText) {
    const rows = String(csvText || "").split(/\r?\n/).filter(Boolean);
    if (rows.length === 0) return [];
    const headers = rows[0].split(",");
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const parts = rows[i].split(",");
      const obj = {};
      headers.forEach((h, j) => (obj[h] = parts[j] ?? ""));
      out.push(obj);
    }
    return out;
  }

  // CSV lookup fallback (email -> name)
  const emailToClientCSV = useMemo(() => {
    const map = {};
    const norm = (s) => String(s || "").trim().toLowerCase();
    (csvData || []).forEach((row) => {
      const email = norm(row.CORREO_EMPRESA);
      if (!email) return;
      map[email] = { name: row.NOMBRE_APELLIDO || "" };
    });
    return map;
  }, [csvData]);

  const displayForEmail = (email) => {
    const key = String(email || "").trim().toLowerCase();
    return mongoUsers[key]?.name || emailToClientCSV[key]?.name || email || "";
  };

  // Fetch CSV once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(CLIENTS_CSV_URL);
        if (!cancelled) setCsvData(parseCSV(res.data) || []);
      } catch (e) {
        console.error("Error fetching client CSV:", e);
        if (!cancelled) setCsvData([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch order + billing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrMsg("");
      try {
        const { data } = await axios.get(`${API}/orders/${orderId}`);
        if (cancelled) return;
        setOrder(data);

        const email = String(data?.userEmail || "").trim().toLowerCase();

        // ✅ Billing (your endpoint)
        if (email) {
          try {
            const billRes = await axios.get(
              `${API}/billing-address/${encodeURIComponent(email)}`,
              { params: { limit: 1 } }
            );
            const list = Array.isArray(billRes.data) ? billRes.data : [];
            const latest = list[0] || null;
            if (!cancelled) setBilling(latest);
          } catch (e) {
            if (!cancelled) setBilling(null);
          }
        } else {
          setBilling(null);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setErrMsg("No pudimos cargar la orden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [orderId]);

  // ✅ After order loads, fetch Mongo name for that email (same as GeneratedQuotes)
  useEffect(() => {
    const email = String(order?.userEmail || "").trim().toLowerCase();
    if (!email) {
      setDisplayName("");
      return;
    }

    // if we already have it cached
    if (mongoUsers[email]?.name) {
      setDisplayName(mongoUsers[email].name);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/users/by-email`, { params: { email } });
        const u = res?.data || {};
        const nombre = (u.nombre || "").toString().trim();
        const apellido = (u.apellido || "").toString().trim();
        const full = [nombre, apellido].filter(Boolean).join(" ");
        const finalName = full || email;

        if (!cancelled) {
          setMongoUsers((prev) => ({ ...prev, [email]: { name: finalName } }));
          setDisplayName(finalName);
        }
      } catch {
        // fallback to CSV/email
        if (!cancelled) setDisplayName(displayForEmail(email));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.userEmail, csvData]);

  // Keep displayName synced if csv loads after
  useEffect(() => {
    const email = String(order?.userEmail || "").trim().toLowerCase();
    if (!email) return;
    if (mongoUsers[email]?.name) return; // mongo wins
    setDisplayName(displayForEmail(email));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvData, order?.userEmail]);

  const fmtDate = (d) => {
    if (!d) return "Sin fecha";
    const date = new Date(d);
    const day = date.getDate().toString().padStart(2, "0");
    const month = date.toLocaleString("es-MX", { month: "short" });
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const shortId = useMemo(() => String(order?._id || "").slice(-5), [order?._id]);

  const saveNoteType = async (type) => {
    if (!order?._id) return;
    try {
      setSaving(true);
      await axios.put(`${API}/orders/${order._id}`, { invoiceNoteType: type });
      setOrder((prev) => ({ ...(prev || {}), invoiceNoteType: type }));
      alert(`Tipo de nota guardado: ${type}`);
      navigate("/generatedQuotes");
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar el tipo de nota.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="body-BG-Gradient">
        <div className="loginLogo-ParentDiv">
          <img className="secondaryPages-GISLogo" src={Logo} alt="Logo" width="180" height="55" onClick={goHomeLogo}/>
        </div>
        <label className="sectionHeader-Label">Detalles de Facturación</label>
        <p style={{ textAlign: "center" }}>Cargando…</p>
      </div>
    );
  }

  if (errMsg) {
    return (
      <div className="body-BG-Gradient">
        <div className="loginLogo-ParentDiv">
          <img className="secondaryPages-GISLogo" src={Logo} alt="Logo" width="180" height="55" onClick={goHomeLogo}/>
        </div>
        <label className="sectionHeader-Label">Detalles de Facturación</label>
        <p style={{ textAlign: "center", color: "red" }}>{errMsg}</p>
      </div>
    );
  }

  return (
    <body className="body-BG-Gradient">
      {/* LOGO */}
      <div className="loginLogo-ParentDiv">
        <img className="secondaryPages-GISLogo" src={Logo} alt="Logo" width="180" height="55" onClick={goHomeLogo}/>
      </div>

      <div className="edit-titleIcon-Div">
        <label className="editAddress-headerLabel">Detalles de Facturación</label>
        <img src={summaryIcon} alt="Resumen" width="35" height="35" />
      </div>

      <div className="newQuotesDetail-Div">
        <label style={{marginBottom:"5%"}}><b>Cliente:</b> {displayName || "—"}</label>
        <label><b>Pedido:</b> #{shortId}</label>
        <label><b>Fecha:</b> {fmtDate(order?.orderDate)}</label>

        {/* (Opcional) si quieres conservar email chiquito abajo */}
        {/* <label style={{ fontSize: 12, color: "#6b7280" }}>{order?.userEmail || "—"}</label> */}
      </div>

      <div className="orderDelivered-screenScroll">
        <div className="deliveryDets-AddressDiv">
          <div className="headerEditIcon-Div">
            <label className="newUserData-Label">Datos Fiscales</label>
          </div>

          <div className="existingQuote-Div">
            <div className="quoteAndFile-Div">
              {billing ? (
                <>
                  <label className="productDetail-Label"><b>Razón Social:</b> {billing.razonSocial || "—"}</label>
                  <label className="productDetail-Label"><b>RFC:</b> {billing.rfcEmpresa || "—"}</label>
                  <label className="productDetail-Label"><b>Correo Fiscal:</b> {billing.correoFiscal || "—"}</label>

                  <br />

                  <label className="productDetail-Label"><b>Calle:</b> {billing.calleFiscal || "—"}</label>
                  <label className="productDetail-Label"><b>No. Exterior:</b> {billing.exteriorFiscal || "—"}</label>
                  <label className="productDetail-Label"><b>No. Interior:</b> {billing.interiorFiscal || "—"}</label>
                  <label className="productDetail-Label"><b>Colonia:</b> {billing.coloniaFiscal || "—"}</label>
                  <label className="productDetail-Label"><b>Ciudad:</b> {billing.ciudadFiscal || "—"}</label>
                  <label className="productDetail-Label"><b>Estado:</b> {billing.estadoFiscal || "—"}</label>
                  <label className="productDetail-Label"><b>C.P.:</b> {billing.cpFiscal || "—"}</label>

                  <br />

                  <label className="productDetail-Label"><b>Uso CFDI:</b> {billing.usoCFDI || "—"}</label>
                  <label className="productDetail-Label"><b>Régimen Fiscal:</b> {billing.regimenFiscal || "—"}</label>
                </>
              ) : (
                <label className="productDetail-Label" style={{ color: "#6b7280" }}>
                  No hay datos fiscales registrados para este usuario.
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "grid", marginTop: "10%", marginLeft: "10%", gridTemplateColumns: "50% 50%" }}>
        {/* <div className="validatePaymentSubmitBtn-Div" style={{ display: "grid", gap: 10, marginTop: 14 }}> */}
          <button
            className="submitOrder-Btn"
            type="button"
            disabled={saving}
            onClick={() => saveNoteType("Nota de Remisión")}
          >
            Remisión
          </button>

          <button
            className="submitOrder-Btn"
            type="button"
            disabled={saving}
            onClick={() => saveNoteType("Factura")}
          >
            Factura
          </button>
        </div>
      </div>

      {/* FOOTER */}
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
          <div className="footerIcon-NameDiv" onClick={goToDeliverReady}>
            <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
            <label className="footerIcon-Name">ENTREGAR</label>
          </div>
        </div>
      </div>
    </body>
  );
}
// // in invoiceDetails.jsx, instead of "email", I'd like to have the name of the client, just like we have in generatedQuotes.jsx. Im attaching both files so you can replicate the logic
// import { useEffect, useMemo, useState } from "react";
// import { useNavigate, useParams } from "react-router-dom";
// import axios from "axios";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import summaryIcon from "/src/assets/images/Icono_fileDownload.png";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import { faHouse, faCartShopping, faCheckToSlot } from "@fortawesome/free-solid-svg-icons";

// import { API } from "/src/lib/api";

// const ALLOWED_ADMIN_EMAILS = new Set([
//   "ventas@greenimportsol.com",
//   "info@greenimportsol.com",
//   "administracion@greenimportsol.com",
//   "administracion2@greenimportsol.com",
//   "majo_test@gmail.com",
// ]);

// export default function InvoiceDetails() {
//   const { orderId } = useParams();
//   const navigate = useNavigate();

//   const goToAdminHome = () => navigate("/adminHome");
//   const goToNewOrders = () => navigate("/newOrders");
//   const goToDeliverReady = () => navigate("/deliverReady");
//   const goHomeLogo = () => navigate("/adminHome");

//   const [currentUserEmail, setCurrentUserEmail] = useState("");
//   useEffect(() => {
//     const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     setCurrentUserEmail((creds?.correo || "").trim().toLowerCase());
//   }, []);

//   const canUseScreen = ALLOWED_ADMIN_EMAILS.has(currentUserEmail);

//   useEffect(() => {
//     if (!canUseScreen && currentUserEmail) {
//       navigate("/adminHome");
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [canUseScreen, currentUserEmail]);

//   const [order, setOrder] = useState(null);
//   const [billing, setBilling] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const [errMsg, setErrMsg] = useState("");

//   useEffect(() => {
//     let cancelled = false;
//     (async () => {
//       setLoading(true);
//       setErrMsg("");
//       try {
//         const { data } = await axios.get(`${API}/orders/${orderId}`);
//         if (cancelled) return;
//         setOrder(data);

//         const email = String(data?.userEmail || "").trim().toLowerCase();
//             if (email) {
//             try {
//                 const billRes = await axios.get(
//                 `${API}/billing-address/${encodeURIComponent(email)}`,
//                 { params: { limit: 1 } }
//                 );

//                 const list = Array.isArray(billRes.data) ? billRes.data : [];
//                 const latest = list[0] || null;

//                 if (!cancelled) setBilling(latest);
//             } catch (e) {
//                 if (!cancelled) setBilling(null);
//             }
//             } else {
//             setBilling(null);
//             }
//       } catch (e) {
//         console.error(e);
//         if (!cancelled) setErrMsg("No pudimos cargar la orden.");
//       } finally {
//         if (!cancelled) setLoading(false);
//       }
//     })();

//     return () => { cancelled = true; };
//   }, [orderId]);

//   const fmtDate = (d) => {
//     if (!d) return "Sin fecha";
//     const date = new Date(d);
//     const day = date.getDate().toString().padStart(2, "0");
//     const month = date.toLocaleString("es-MX", { month: "short" });
//     const year = date.getFullYear();
//     return `${day}/${month}/${year}`;
//   };

//   const shortId = useMemo(() => String(order?._id || "").slice(-5), [order?._id]);

//   const saveNoteType = async (type) => {
//     if (!order?._id) return;
//     try {
//       setSaving(true);
//       await axios.put(`${API}/orders/${order._id}`, { invoiceNoteType: type });
//       setOrder((prev) => ({ ...(prev || {}), invoiceNoteType: type }));
//       alert(`Tipo de nota guardado: ${type}`);
//       navigate("/generatedQuotes");
//     } catch (e) {
//       console.error(e);
//       alert("No se pudo guardar el tipo de nota.");
//     } finally {
//       setSaving(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div className="body-BG-Gradient">
//         <div className="loginLogo-ParentDiv">
//           <img className="secondaryPages-GISLogo" src={Logo} alt="Logo" width="180" height="55" onClick={goHomeLogo}/>
//         </div>
//         <label className="sectionHeader-Label">Detalles de Facturación</label>
//         <p style={{ textAlign: "center" }}>Cargando…</p>
//       </div>
//     );
//   }

//   if (errMsg) {
//     return (
//       <div className="body-BG-Gradient">
//         <div className="loginLogo-ParentDiv">
//           <img className="secondaryPages-GISLogo" src={Logo} alt="Logo" width="180" height="55" onClick={goHomeLogo}/>
//         </div>
//         <label className="sectionHeader-Label">Detalles de Facturación</label>
//         <p style={{ textAlign: "center", color: "red" }}>{errMsg}</p>
//       </div>
//     );
//   }

//   return (
//     <body className="body-BG-Gradient">
//       {/* LOGO */}
//       <div className="loginLogo-ParentDiv">
//         <img className="secondaryPages-GISLogo" src={Logo} alt="Logo" width="180" height="55" onClick={goHomeLogo}/>
//       </div>

//       <div className="edit-titleIcon-Div">
//         <label className="editAddress-headerLabel">Detalles de Facturación</label>
//         <img src={summaryIcon} alt="Resumen" width="35" height="35" />
//       </div>

//       <div className="newQuotesDetail-Div">
//         <label><b>Pedido:</b> #{shortId}</label>
//         <label><b>Fecha:</b> {fmtDate(order?.orderDate)}</label>
//         <label><b>Email:</b> {order?.userEmail || "—"}</label>
//         {/* {order?.invoiceNoteType ? (
//           <label><b>Tipo actual:</b> {order.invoiceNoteType}</label>
//         ) : (
//           <label style={{ color: "#6b7280" }}>(Tipo de nota aún no definido)</label>
//         )} */}
//       </div>

//       <div className="orderDelivered-screenScroll">
//         <div className="deliveryDets-AddressDiv">
//           <div className="headerEditIcon-Div">
//             <label className="newUserData-Label">Datos Fiscales</label>
//           </div>

//           <div className="existingQuote-Div">
//             <div className="quoteAndFile-Div">
//               {billing ? (
//                 <>
//                   <label className="productDetail-Label"><b>Razón Social:</b> {billing.razonSocial || "—"}</label>
//                   <label className="productDetail-Label"><b>RFC:</b> {billing.rfcEmpresa || "—"}</label>
//                   <label className="productDetail-Label"><b>Correo Fiscal:</b> {billing.correoFiscal || "—"}</label>

//                   <br />

//                   <label className="productDetail-Label"><b>Calle:</b> {billing.calleFiscal || "—"}</label>
//                   <label className="productDetail-Label"><b>No. Exterior:</b> {billing.exteriorFiscal || "—"}</label>
//                   <label className="productDetail-Label"><b>No. Interior:</b> {billing.interiorFiscal || "—"}</label>
//                   <label className="productDetail-Label"><b>Colonia:</b> {billing.coloniaFiscal || "—"}</label>
//                   <label className="productDetail-Label"><b>Ciudad:</b> {billing.ciudadFiscal || "—"}</label>
//                   <label className="productDetail-Label"><b>Estado:</b> {billing.estadoFiscal || "—"}</label>
//                   <label className="productDetail-Label"><b>C.P.:</b> {billing.cpFiscal || "—"}</label>

//                   <br />

//                   <label className="productDetail-Label"><b>Uso CFDI:</b> {billing.usoCFDI || "—"}</label>
//                   <label className="productDetail-Label"><b>Régimen Fiscal:</b> {billing.regimenFiscal || "—"}</label>
//                 </>
//               ) : (
//                 <label className="productDetail-Label" style={{ color: "#6b7280" }}>
//                   No hay datos fiscales registrados para este usuario.
//                 </label>
//               )}
//             </div>
//           </div>
//         </div>

//         {/* Buttons */}
//         <div className="validatePaymentSubmitBtn-Div" style={{ display: "grid", gap: 10, marginTop: 14 }}>
//           <button
//             className="submitOrder-Btn"
//             type="button"
//             disabled={saving}
//             onClick={() => saveNoteType("Nota de Remisión")}
//           >
//             Remisión
//           </button>

//           <button
//             className="submitOrder-Btn"
//             type="button"
//             disabled={saving}
//             onClick={() => saveNoteType("Factura")}
//           >
//             Factura
//           </button>
//         </div>
//       </div>

//       {/* FOOTER */}
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
//           <div className="footerIcon-NameDiv" onClick={goToDeliverReady}>
//             <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
//             <label className="footerIcon-Name">ENTREGAR</label>
//           </div>
//         </div>
//       </div>
//     </body>
//   );
// }