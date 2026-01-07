import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { faArrowLeftLong, faUpload } from "@fortawesome/free-solid-svg-icons";
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import { API } from "/src/lib/api";

const ADMIN_WHITELIST = new Set([
  "ventas@greenimportsol.com",
  "majo_test@gmail.com",
]);

// Normalize helper
const norm = (s) => (s ?? "").toString().trim().toLowerCase();

// Try to detect the admin email and flag from different shapes the backend might use
function extractAdminOrderInfo(order) {
  if (!order) return { adminEmailOnOrder: "", isAdminOrder: false };

  const candidates = [
    order?.placedByAdmin?.adminEmail,
    order?.placedByAdmin?.email,
    order?.createdByAdminEmail,
    order?.createdBy?.email,
    order?.meta?.createdByAdminEmail,
    order?.meta?.placedByAdminEmail,
  ]
    .map(norm)
    .filter(Boolean);

  // Boolean flags that might exist:
  const boolFlags = [
    Boolean(order?.createdByAdmin),
    Boolean(order?.isAdminOrder),
    Boolean(order?.meta?.createdByAdmin),
    Boolean(order?.meta?.placedByAdmin),
  ];

  const adminEmailOnOrder = candidates[0] || "";
  const isAdminOrder = !!adminEmailOnOrder || boolFlags.some(Boolean);

  return { adminEmailOnOrder, isAdminOrder };
}

function adminBadge(email) {
  const e = norm(email);
  if (e === "ventas@greenimportsol.com") return "Registrado por Alex";
  if (e === "majo_test@gmail.com") return "Registrado por Majo";
  return e ? `Registrado por ${email}` : null;
}

export default function PendingEvidenceAdmin() {
  const navigate = useNavigate();

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  const { orderId } = useParams();

  const [me, setMe] = useState(null);
  const [order, setOrder] = useState(null);

  const [evidenceFile, setEvidenceFile] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [msg, setMsg] = useState("");

  // Current user (Alex/Majo)
  useEffect(() => {
    // Your project sometimes uses `userLoginCreds.correo` and sometimes `userEmail`.
    // Prefer creds, fallback to userEmail.
    const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    const fallback = localStorage.getItem("userEmail") || "";
    const correo = norm(creds?.correo || fallback);
    setMe({ correo });
  }, []);

  const myEmail = norm(me?.correo);
  const isWhitelisted = ADMIN_WHITELIST.has(myEmail);

  // Load the order
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/orders/${orderId}`);
        setOrder(res.data);
      } catch (e) {
        console.error("Error loading order:", e);
        setOrder(null);
      }
    })();
  }, [orderId]);

  const { adminEmailOnOrder, isAdminOrder } = extractAdminOrderInfo(order);
  const tag = adminBadge(adminEmailOnOrder);
  const canUpload = isWhitelisted && isAdminOrder;

  async function uploadEvidence() {
    // if (!canUpload) {
    //   setMsg("No autorizado: este pedido no está marcado como registrado por admin o tu usuario no tiene permisos.");
    //   return;
    // }
    if (!evidenceFile || !order?._id) {
      setMsg("Selecciona una imagen o PDF válido.");
      return;
    }
    const okType = evidenceFile.type.startsWith("image/") || evidenceFile.type === "application/pdf";
    if (!okType) {
      setMsg("Formato no permitido. Sube imagen o PDF.");
      return;
    }
    if (evidenceFile.size > 25 * 1024 * 1024) {
      setMsg("Archivo excede 25MB.");
      return;
    }

    setMsg("");
    setUploadBusy(true);
    setUploadProgress(0);

    try {
      // 1) upload file to S3-backed endpoint
      const form = new FormData();
      form.append("file", evidenceFile);
      const s3Resp = await axios.post(`${API}/orders/${order._id}/evidence/payment`, form, {
        onUploadProgress: (pe) => {
          if (!pe.total) return;
          setUploadProgress(Math.round((pe.loaded / pe.total) * 100));
        },
      });

      const s3Url    = s3Resp?.data?.url || s3Resp?.data?.Location || "";
      const filename = s3Resp?.data?.filename || evidenceFile.name || "";

      // 2) mark payment evidence (trigger push, etc.)
      await fetch(`${API}/orders/${order._id}/evidence/mark-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Url, filename }),
      });

      // 3) update order status → Evidencia Subida
      await fetch(`${API}/order/${order._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "Evidencia Subida" }),
      });

      setMsg("¡Evidencia cargada y estatus actualizado!");
      setTimeout(() => navigate("/adminHome"), 800);
    } catch (e) {
      console.error("Error al subir evidencia:", e);
      setMsg("No se pudo subir la evidencia. Intenta nuevamente.");
    } finally {
      setUploadBusy(false);
      setTimeout(() => setUploadProgress(0), 800);
    }
  }

  if (!isWhitelisted) {
    return (
      <body className="body-BG-Gradient">
        <div className="loginLogo-ParentDiv">
          <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={() => navigate("/adminHome")} />
        </div>
        <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
          <div className="orderNow-AddressDiv" style={{ maxWidth: 520, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Acceso restringido</div>
            <div>Esta sección solo está disponible para ventas@greenimportsol.com y majo_test@gmail.com.</div>
          </div>
          <button className="submitOrder-Btn" style={{ marginTop: 16 }} onClick={() => navigate("/admin/pending-evidence")}>
            Regresar
          </button>
        </div>
      </body>
    );
  }

  if (!order) {
    return (
      <body className="body-BG-Gradient">
        <div className="loginLogo-ParentDiv">
          <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={() => navigate("/adminHome")} />
        </div>
        <div style={{ padding: 24 }}>Cargando pedido…</div>
      </body>
    );
  }

  return (
    <body className="body-BG-Gradient">
      <div className="loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="GIS"
          width="180"
          height="55"
          onClick={() => navigate("/admin/pending-evidence")}
        />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <label className="sectionHeader-Label">Evidencia — Pedido #{String(order._id).slice(-5)}</label>
          {/* <button
            className="submitOrder-Btn"
            type="button"
            onClick={() => navigate("/admin/pending-evidence")}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", marginRight: "8%" }}
          >
            <FontAwesomeIcon icon={faArrowLeftLong} />
            Regresar
          </button> */}
        </div>

        <div className="orderQuickDetails-Div" style={{ alignItems: "center", width: "70%" }}>
          <label className="orderQuick-Label">{order.userName || order.userEmail}</label>
          {order.userCompany && <label className="orderQuick-Label">{order.userCompany}</label>}
          <label className="orderQuick-Label">
            {order.orderDate
              ? new Date(order.orderDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
              : "Sin fecha"}
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {tag && (
              <span
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,.15)",
                  border: "1px solid rgba(255,255,255,.25)",
                  whiteSpace: "nowrap",
                }}
              >
                {tag}
              </span>
            )}
            <span style={{ fontSize: 12, opacity: 0.9 }}>Estatus: {order.orderStatus}</span>
          </div>
        </div>

        {/* Items quick summary */}
        <div className="quoter-wishlistDiv" style={{ marginTop: 10 }}>
          <ul className="wishlist-ulElement">
            {(order.items || []).map((it, i) => (
              <div key={i} className="wishlist-liElement">
                {it.amount} x {it.product} ({it.presentation})
                {it.packPresentation ? ` — ${it.packPresentation}` : ""} — ${Number(it.price).toFixed(2)} {it.currency} c/u
              </div>
            ))}
          </ul>
        </div>

        {/* Upload box */}
        <div className="orderTracker-UploadEvidenceDiv" style={{ marginTop: 16 }}>
          <label className="orderNumber-Label">SUBIR EVIDENCIA DE PAGO</label>

          {/* {!canUpload && (
            <div style={{ fontSize: 12, opacity: 0.9, margin: "6px 0 10px" }}>
              Este pedido no fue registrado por Alex/Majo o tu usuario no tiene permisos para subir evidencia aquí.
            </div>
          )} */}

          <div className="file-upload-wrapper">
          {/* <div className="file-upload-wrapper" style={{ opacity: canUpload ? 1 : 0.5 }}> */}
            <label htmlFor="evidenceFile" className="custom-file-upload" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <FontAwesomeIcon icon={faUpload} /> Elegir archivo
            </label>
            <input
              id="evidenceFile"
              type="file"
              accept="image/*,application/pdf"
            //   disabled={!canUpload}
              onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
            <span className="file-selected-text">
              {evidenceFile ? evidenceFile.name : "Ningún archivo seleccionado"}
            </span>
          </div>

          <button
            className="uploadPaymentEvidence-Btn"
            type="button"
            // disabled={!canUpload || !evidenceFile || uploadBusy}
            onClick={uploadEvidence}
            title={!evidenceFile ? "Selecciona un archivo" : ""}
            // title={!canUpload ? "No autorizado" : (!evidenceFile ? "Selecciona un archivo" : "")}
          >
            {uploadBusy ? `Subiendo... ${uploadProgress || 0}%` : <>Subir <br />Evidencia</>}
          </button>

          {msg && <div style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}
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

          <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
            <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
            <label className="footerIcon-Name">ENTREGAR</label>
          </div>
        </div>
      </div>
    </body>
  );
}

// import { useEffect, useState } from "react";
// import { useNavigate, useParams } from "react-router-dom";
// import axios from "axios";
// import { faArrowLeftLong, faUpload } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import { API } from "/src/lib/api";

// const ALLOWED_ADMIN_EMAILS = new Set([
//   "ventas@greenimportsol.com",
//   "majo_test@gmail.com",
// ]);

// export default function PendingEvidenceAdmin() {
//   const navigate = useNavigate();
//   const { orderId } = useParams();

//   const [me, setMe] = useState(null);
//   const [order, setOrder] = useState(null);

//   const [evidenceFile, setEvidenceFile] = useState(null);
//   const [uploadBusy, setUploadBusy] = useState(false);
//   const [uploadProgress, setUploadProgress] = useState(0);
//   const [msg, setMsg] = useState("");

//   useEffect(() => {
//     setMe(JSON.parse(localStorage.getItem("userLoginCreds") || "null"));
//   }, []);
//   const myEmail = (me?.correo || "").trim().toLowerCase();
//   const isAllowed = ALLOWED_ADMIN_EMAILS.has(myEmail);

//   useEffect(() => {
//     (async () => {
//       try {
//         const res = await axios.get(`${API}/orders/${orderId}`);
//         setOrder(res.data);
//       } catch (e) {
//         console.error("Error loading order:", e);
//         setOrder(null);
//       }
//     })();
//   }, [orderId]);

//   const adminTag = (() => {
//     const e = (order?.placedByAdmin?.adminEmail || "").toLowerCase();
//     if (e === "ventas@greenimportsol.com") return "Registrado por Alex";
//     if (e === "majo_test@gmail.com") return "Registrado por Majo";
//     return null;
//   })();

//   const canUpload = Boolean(adminTag) && isAllowed;

//   async function uploadEvidence() {
//     if (!canUpload) {
//       setMsg("No autorizado para subir evidencia en este pedido.");
//       return;
//     }
//     if (!evidenceFile || !order?._id) {
//       setMsg("Selecciona una imagen o PDF válido.");
//       return;
//     }
//     const okType = evidenceFile.type.startsWith("image/") || evidenceFile.type === "application/pdf";
//     if (!okType) {
//       setMsg("Formato no permitido. Sube imagen o PDF.");
//       return;
//     }
//     if (evidenceFile.size > 25 * 1024 * 1024) {
//       setMsg("Archivo excede 25MB.");
//       return;
//     }

//     setMsg("");
//     setUploadBusy(true);
//     setUploadProgress(0);

//     try {
//       // 1) upload file
//       const form = new FormData();
//       form.append("file", evidenceFile);
//       const s3Resp = await axios.post(`${API}/orders/${order._id}/evidence/payment`, form, {
//         onUploadProgress: (pe) => {
//           if (!pe.total) return;
//           setUploadProgress(Math.round((pe.loaded / pe.total) * 100));
//         },
//       });

//       const s3Url    = s3Resp?.data?.url || s3Resp?.data?.Location || "";
//       const filename = s3Resp?.data?.filename || evidenceFile.name || "";

//       // 2) mark payment evidence (trigger push, etc.)
//       await fetch(`${API}/orders/${order._id}/evidence/mark-payment`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ s3Url, filename }),
//       });

//       // 3) update order status
//       await fetch(`${API}/order/${order._id}/status`, {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ orderStatus: "Evidencia Subida" }),
//       });

//       setMsg("¡Evidencia cargada y estatus actualizado!");
//       setTimeout(() => navigate("/admin/pending-evidence"), 800);
//     } catch (e) {
//       console.error("Error al subir evidencia:", e);
//       setMsg("No se pudo subir la evidencia. Intenta nuevamente.");
//     } finally {
//       setUploadBusy(false);
//       setTimeout(() => setUploadProgress(0), 800);
//     }
//   }

//   if (!isAllowed) {
//     return (
//       <body className="body-BG-Gradient">
//         <div className="loginLogo-ParentDiv">
//           <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={() => navigate("/adminHome")} />
//         </div>
//         <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
//           <div className="orderNow-AddressDiv" style={{ maxWidth: 520, textAlign: "center" }}>
//             <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Acceso restringido</div>
//             <div>Esta sección solo está disponible para ventas@greenimportsol.com y majo_test@gmail.com.</div>
//           </div>
//           <button className="submitOrder-Btn" style={{ marginTop: 16 }} onClick={() => navigate("/admin/pending-evidence")}>
//             Regresar
//           </button>
//         </div>
//       </body>
//     );
//   }

//   if (!order) {
//     return (
//       <body className="body-BG-Gradient">
//         <div className="loginLogo-ParentDiv">
//           <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={() => navigate("/adminHome")} />
//         </div>
//         <div style={{ padding: 24 }}>Cargando pedido…</div>
//       </body>
//     );
//   }

//   return (
//     <body className="body-BG-Gradient">
//       <div className="loginLogo-ParentDiv">
//         <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={() => navigate("/admin/pending-evidence")} />
//       </div>

//       <div>
//         <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
//           <label className="sectionHeader-Label">Evidencia — Pedido #{String(order._id).slice(-5)}</label>
//           {/* <button
//             className="submitOrder-Btn"
//             type="button"
//             onClick={() => navigate("/admin/pending-evidence")}
//             style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", marginRight: "8%" }}
//           >
//             <FontAwesomeIcon icon={faArrowLeftLong} />
//             Regresar
//           </button> */}
//         </div>

//         <div className="orderQuickDetails-Div" style={{ alignItems: "center" }}>
//           <label className="orderQuick-Label">
//             {order.userName || order.userEmail}
//           </label>
//           {order.userCompany && <label className="orderQuick-Label">{order.userCompany}</label>}
//           <label className="orderQuick-Label">
//             {order.orderDate
//               ? new Date(order.orderDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
//               : "Sin fecha"}
//           </label>
//           <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
//             {adminTag && (
//               <span
//                 style={{
//                   fontSize: 11,
//                   padding: "4px 8px",
//                   borderRadius: 999,
//                   background: "rgba(255,255,255,.15)",
//                   border: "1px solid rgba(255,255,255,.25)",
//                   whiteSpace: "nowrap",
//                 }}
//               >
//                 {adminTag}
//               </span>
//             )}
//             <span style={{ fontSize: 12, opacity: 0.9 }}>Estatus: {order.orderStatus}</span>
//           </div>
//         </div>

//         {/* Items quick summary */}
//         <div className="quoter-wishlistDiv" style={{ marginTop: 10 }}>
//           <ul className="wishlist-ulElement">
//             {(order.items || []).map((it, i) => (
//               <div key={i} className="wishlist-liElement">
//                 {it.amount} x {it.product} ({it.presentation})
//                 {it.packPresentation ? ` — ${it.packPresentation}` : ""} — ${Number(it.price).toFixed(2)} {it.currency} c/u
//               </div>
//             ))}
//           </ul>
//         </div>

//         {/* Upload box */}
//         <div className="orderTracker-UploadEvidenceDiv" style={{ marginTop: 16 }}>
//           <label className="orderNumber-Label">SUBIR EVIDENCIA DE PAGO</label>

//           {!canUpload && (
//             <div style={{ fontSize: 12, opacity: 0.9, margin: "6px 0 10px" }}>
//               Este pedido no fue registrado por Alex/Majo o tu usuario no tiene permisos para subir evidencia aquí.
//             </div>
//           )}

//           <div className="file-upload-wrapper" style={{ opacity: canUpload ? 1 : 0.5 }}>
//             <label htmlFor="evidenceFile" className="custom-file-upload" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
//               <FontAwesomeIcon icon={faUpload} /> Elegir archivo
//             </label>
//             <input
//               id="evidenceFile"
//               type="file"
//               accept="image/*,application/pdf"
//               disabled={!canUpload}
//               onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
//               style={{ display: "none" }}
//             />
//             <span className="file-selected-text">
//               {evidenceFile ? evidenceFile.name : "Ningún archivo seleccionado"}
//             </span>
//           </div>

//           <button
//             className="uploadPaymentEvidence-Btn"
//             type="button"
//             disabled={!canUpload || !evidenceFile || uploadBusy}
//             onClick={uploadEvidence}
//             title={!canUpload ? "No autorizado" : (!evidenceFile ? "Selecciona un archivo" : "")}
//           >
//             {uploadBusy ? `Subiendo... ${uploadProgress || 0}%` : <>Subir <br />Evidencia</>}
//           </button>

//           {msg && <div style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}
//         </div>
//       </div>
//     </body>
//   );
// }
