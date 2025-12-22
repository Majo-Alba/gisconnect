import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

import { API } from "/src/lib/api";
import Logo from "/src/assets/images/GIS_Logo.png";
import toDeliverIcon from "/src/assets/images/Icono_porEntregar.png";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function DeliveryDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);

  // delivery meta
  const [insuredAmount, setInsuredAmount] = useState(null); // number | null
  const [deliveryDate, setDeliveryDate] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  // delivery image upload
  const [deliveryImage, setDeliveryImage] = useState(null);

  // UI
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // ===== NEW: Mongo user (by email) =====
  const [mongoUser, setMongoUser] = useState(null);
  const [userLoading, setUserLoading] = useState(false);

  // Helpers
  const fmtMXN = (v) =>
    v == null
      ? ""
      : `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

  const normCur = (v) => String(v ?? "USD").trim().toUpperCase();
  const isUSD = (it) => normCur(it.currency) === "USD";
  const isMXN = (it) => normCur(it.currency) === "MXN";

  const calcInsuredAmountMXN = (ord) => {
    if (!ord) return null;

    // 1) Prefer server-provided combined MXN total if available
    const totalAllMXN = ord?.totals?.totalAllMXN;
    if (Number.isFinite(totalAllMXN)) return Number(totalAllMXN);

    // 2) Recompute from line items (natural sums)
    const items = Array.isArray(ord?.items) ? ord.items : [];
    const rate = Number(ord?.totals?.dofRate) || 0;

    const subtotalUSD = items.reduce(
      (s, it) => s + (isUSD(it) ? (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0) : 0),
      0
    );
    const subtotalMXN = items.reduce(
      (s, it) => s + (isMXN(it) ? (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0) : 0),
      0
    );

    if (subtotalMXN && !subtotalUSD) return subtotalMXN;
    if (!subtotalMXN && subtotalUSD && rate) return subtotalUSD * rate;
    if (subtotalMXN && subtotalUSD && rate) return subtotalMXN + subtotalUSD * rate;

    // If we can't convert (missing rate for USD-only/mixed), return null to avoid wrong amounts
    return null;
  };

  useEffect(() => {
    fetchOrderDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      const { data } = await axios.get(`${API}/orders/${orderId}`);
      setOrder(data);

      // Pre-fill existing meta (if any)
      if (data?.trackingNumber) setTrackingNumber(String(data.trackingNumber));

      if (data?.deliveryDate) {
        const d = new Date(data.deliveryDate);
        const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 10);
        setDeliveryDate(iso);
      }
    } catch (err) {
      console.error("Error fetching order:", err);
      setErrMsg("No se pudo cargar el pedido.");
    }
  };

  // Fetch user from Mongo using order.userEmail
  useEffect(() => {
    const email = (order?.userEmail || "").trim().toLowerCase();
    if (!email) return;

    let cancelled = false;
    setUserLoading(true);

    axios
      .get(`${API}/users/by-email`, { params: { email } })
      .then((res) => {
        if (!cancelled) setMongoUser(res.data || null);
      })
      .catch(() => {
        if (!cancelled) setMongoUser(null);
      })
      .finally(() => !cancelled && setUserLoading(false));

    return () => {
      cancelled = true;
    };
  }, [order?.userEmail]);

  // Auto-set insuredAmount based on order + insure flag
  useEffect(() => {
    const insureShipment =
      mongoUser?.shippingPreferences?.insureShipment ?? mongoUser?.insureShipment ?? null;

    if (insureShipment === true && order) {
      const amt = calcInsuredAmountMXN(order);
      setInsuredAmount(amt);
    } else {
      setInsuredAmount(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mongoUser, order]);

  // UI helpers
  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    if (f && !f.type.startsWith("image/")) {
      alert("Seleccione una imagen válida.");
      return;
    }
    if (f && f.size > 25 * 1024 * 1024) {
      alert("La imagen no debe exceder 25MB.");
      return;
    }
    setDeliveryImage(f);
    setErrMsg("");
    setOkMsg("");
  };

  // const markAsDelivered = async () => {
  //   if (!order?._id) return;
  //   if (!deliveryImage) {
  //     alert("Selecciona una imagen de entrega.");
  //     return;
  //   }
  //   if (!deliveryDate) {
  //     alert("Seleccione la fecha de entrega.");
  //     return;
  //   }

  //   setBusy(true);
  //   setProgress(0);
  //   setErrMsg("");
  //   setOkMsg("");

  //   try {
  //     // 1) Upload delivery evidence
  //     const form = new FormData();
  //     form.append("deliveryImage", deliveryImage);

  //     await axios.post(`${API}/orders/${order._id}/evidence/delivery`, form, {
  //       onUploadProgress: (pe) => {
  //         if (!pe.total) return;
  //         setProgress(Math.round((pe.loaded / pe.total) * 100));
  //       },
  //     });

  //     // 2) Update delivery meta on the order (send numeric insuredAmount if available)
  //     await fetch(`${API}/orders/${order._id}`, {
  //       method: "PATCH",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({
  //         insuredAmount: insuredAmount != null ? Number(insuredAmount) : undefined,
  //         deliveryDate, // yyyy-mm-dd
  //         trackingNumber,
  //       }),
  //     });

  //     // 3) Update status to "Pedido Entregado"
  //     await fetch(`${API}/order/${order._id}/status`, {
  //       method: "PATCH",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ orderStatus: "Pedido Entregado" }),
  //     });

  //     setOkMsg("Evidencia subida y pedido marcado como entregado.");
  //     navigate("/adminHome");
  //   } catch (error) {
  //     console.error("Error marking delivered:", error);
  //     setErrMsg(error?.response?.data?.error || error.message || "Error al procesar la entrega.");
  //   } finally {
  //     setBusy(false);
  //     setTimeout(() => setProgress(0), 800);
  //   }
  // };
  const markAsDelivered = async () => {
    if (!order?._id) return;
    if (!deliveryImage) {
      alert("Selecciona una imagen de entrega.");
      return;
    }
    if (!deliveryDate) {
      alert("Seleccione la fecha de entrega.");
      return;
    }
  
    setBusy(true);
    setProgress(0);
    setErrMsg("");
    setOkMsg("");
  
    try {
      // 1) Upload delivery evidence
      const form = new FormData();
      form.append("deliveryImage", deliveryImage);
  
      await axios.post(`${API}/orders/${order._id}/evidence/delivery`, form, {
        onUploadProgress: (pe) => {
          if (!pe.total) return;
          setProgress(Math.round((pe.loaded / pe.total) * 100));
        },
      });
  
      // Build a safe ISO at local noon to avoid previous-day shifts when stored as UTC
      const safeLocalNoonISO = new Date(`${deliveryDate}T12:00:00`).toISOString();
  
      // 2) Persist delivery meta (use PUT for consistency with your other updates)
      await axios.put(`${API}/orders/${order._id}`, {
        insuredAmount: insuredAmount != null ? Number(insuredAmount) : undefined,
        trackingNumber,
        // Send both a pure YMD and an ISO; server can store either
        deliveryDateYMD: deliveryDate,     // "YYYY-MM-DD" (string)
        deliveryDate: safeLocalNoonISO,    // ISO "YYYY-MM-DDT12:00:00.000Z"
      });
  
      // 3) Update status to "Pedido Entregado"
      await fetch(`${API}/order/${order._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "Pedido Entregado" }),
      });
  
      setOkMsg("Evidencia subida y pedido marcado como entregado.");
      navigate("/adminHome");
    } catch (error) {
      console.error("Error marking delivered:", error);
      setErrMsg(error?.response?.data?.error || error.message || "Error al procesar la entrega.");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  };
  

  if (!order) return <p style={{ padding: 20 }}>Cargando pedido...</p>;

  // ===== Derived fields from Mongo user =====
  const nombre = (mongoUser?.nombre || "").trim();
  const apellido = (mongoUser?.apellido || "").trim();
  const displayName = [nombre, apellido].filter(Boolean).join(" ") || order.userEmail || "Cliente";

  const companyName = (mongoUser?.empresa || "").trim();

  // Shipping preferences from Mongo (preferred carrier + insure flag)
  const carrier =
    (mongoUser?.shippingPreferences?.preferredCarrier ||
      mongoUser?.preferredCarrier ||
      "")?.toString().trim() || "";

  const insureShipment =
    mongoUser?.shippingPreferences?.insureShipment ??
    mongoUser?.insureShipment ??
    null;

  // Shipping object (new structure)
  const s = order.shippingInfo || {};
  const sCalle = s.calleEnvio || "";
  const sExt = s.exteriorEnvio || "";
  const sInt = s.interiorEnvio || "";
  const sCol = s.coloniaEnvio || "";
  const sCiudad = s.ciudadEnvio || "";
  const sEstado = s.estadoEnvio || "";
  const sCP = s.cpEnvio || "";

  return (
    <body className="body-BG-Gradient">
      <div className="loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Logo"
          width="180"
          height="55"
          onClick={goToAdminHome}
        />
      </div>

      <div className="edit-titleIcon-Div">
        <label className="editAddress-headerLabel">Detalles de Entrega</label>
        <img src={toDeliverIcon} alt="Cotiza" width="35" height="35" />
      </div>

      <div className="newQuotesDetail-Div">
        <label>{displayName}</label>
        <label>{companyName || "—"}</label>
        <br />
        <label>Pedido #{String(order._id).slice(-5)}</label>
        {/* Enviado por -> preferredCarrier from Mongo */}
        <label>Enviado por: {carrier || "Sin especificar"}</label>

        <div className="deliveryDetails-Div">
          <div className="paymentDetails-Div">
            {/* Dirección de envío */}
            <div className="deliveryDets-AddressDiv">
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">Dirección de Envío</label>
              </div>
              <div className="existingQuote-Div">
                <div className="quoteAndFile-Div">
                  <label className="productDetail-Label">
                    {sCalle} #{sExt} {sInt ? `Int. ${sInt}` : ""}
                  </label>
                  {sCol && <label className="productDetail-Label">Col. {sCol}</label>}
                  <label className="productDetail-Label">
                    {sCiudad}{sCiudad && sEstado ? ", " : ""}{sEstado}
                  </label>
                  {sCP && <label className="productDetail-Label">C.P.: {sCP}</label>}
                </div>
              </div>
            </div>

            {/* Monto asegurado — auto, read-only (solo si insureShipment === true) */}
            {insureShipment === true && (
              <>
                <div className="headerEditIcon-Div">
                  <label className="newUserData-Label">Monto Asegurado</label>
                </div>
                <input
                  className="deliveryDets-Input"
                  type="text"
                  readOnly
                  value={insuredAmount != null ? fmtMXN(insuredAmount) : "No disponible (falta tipo de cambio)"}
                  title={
                    insuredAmount != null
                      ? "Basado en el total del pedido en MXN"
                      : "No se pudo calcular automáticamente (no hay tipo de cambio para convertir USD→MXN)."
                  }
                />
              </>
            )}

            {/* Fecha de entrega */}
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Fecha de Entrega</label>
            </div>
            <input
              className="deliveryDets-Input"
              type="date"
              required
              placeholder="Seleccione Fecha"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />

            {/* Número de guía */}
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Número de Guía</label>
            </div>
            <input
              className="deliveryDets-Input"
              type="text"
              required
              placeholder="Ingresar número de guía"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />

            {/* Evidencia de envío — archivo (imagen) */}
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Evidencia de Entrega</label>
            </div>
            <div className="shipmentEvidence-Div" style={{ alignItems: "center" }}>
              <div className="file-upload-wrapper" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label htmlFor="deliveryImage" className="custom-file-upload" style={{ cursor: "pointer" }}>
                  Elegir archivo
                </label>
                <input
                  id="deliveryImage"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <span className="file-selected-text">
                  {deliveryImage ? deliveryImage.name : "Ningún archivo seleccionado"}
                </span>
              </div>
              {busy && (
                <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                  Subiendo evidencia… {progress || 0}%
                </div>
              )}
              {errMsg && <div style={{ fontSize: 12, color: "#b00", marginTop: 6 }}>{errMsg}</div>}
              {okMsg && <div style={{ fontSize: 12, color: "#2a7a2a", marginTop: 6 }}>{okMsg}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="generateLabel-Div">
        <button
          className="packDetails-Btn"
          type="button"
          onClick={markAsDelivered}
          disabled={busy || !deliveryImage || !deliveryDate}
          title={
            !deliveryImage
              ? "Seleccione la evidencia"
              : !deliveryDate
              ? "Seleccione la fecha de entrega"
              : ""
          }
        >
          {busy ? `Procesando… ${progress || 0}%` : "Entregado"}
        </button>
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
    </body>
  );
}

// // Following on the same concept, I'd like for the "Monto Asegurado" field to be automatically based on the information from manageDeliveryDetails.jsx. Here is my current deliveryDetails.jsx, please direct edit
// import { useState, useEffect } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import axios from "axios";

// import { API } from "/src/lib/api";
// import Logo from "/src/assets/images/GIS_Logo.png";
// import toDeliverIcon from "/src/assets/images/Icono_porEntregar.png";

// import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// export default function DeliveryDetails() {
//   const { orderId } = useParams();
//   const navigate = useNavigate();

//   const [order, setOrder] = useState(null);

//   // delivery meta
//   const [insuredAmount, setInsuredAmount] = useState("");
//   const [deliveryDate, setDeliveryDate] = useState("");
//   const [trackingNumber, setTrackingNumber] = useState("");

//   // delivery image upload
//   const [deliveryImage, setDeliveryImage] = useState(null);

//   // UI
//   const [busy, setBusy] = useState(false);
//   const [progress, setProgress] = useState(0);
//   const [errMsg, setErrMsg] = useState("");
//   const [okMsg, setOkMsg] = useState("");

//   // ===== NEW: Mongo user (by email) =====
//   const [mongoUser, setMongoUser] = useState(null);
//   const [userLoading, setUserLoading] = useState(false);

//   useEffect(() => {
//     fetchOrderDetails();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [orderId]);

//   const fetchOrderDetails = async () => {
//     try {
//       const { data } = await axios.get(`${API}/orders/${orderId}`);
//       setOrder(data);
//       // Pre-fill existing meta (if any)
//       // setInsuredAmount(data?.insuredAmount ?? "");
//       // setTrackingNumber(data?.trackingNumber ?? "");
//       // normalize deliveryDate to yyyy-mm-dd for input[type=date]
//       if (data?.deliveryDate) {
//         const d = new Date(data.deliveryDate);
//         const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
//           .toISOString()
//           .slice(0, 10);
//         setDeliveryDate(iso);
//       }
//     } catch (err) {
//       console.error("Error fetching order:", err);
//       setErrMsg("No se pudo cargar el pedido.");
//     }
//   };

//   // Fetch user from Mongo using order.userEmail
//   useEffect(() => {
//     const email = (order?.userEmail || "").trim().toLowerCase();
//     if (!email) return;

//     let cancelled = false;
//     setUserLoading(true);

//     axios
//       .get(`${API}/users/by-email`, { params: { email } })
//       .then((res) => {
//         if (!cancelled) setMongoUser(res.data || null);
//       })
//       .catch(() => {
//         if (!cancelled) setMongoUser(null);
//       })
//       .finally(() => !cancelled && setUserLoading(false));

//     return () => {
//       cancelled = true;
//     };
//   }, [order?.userEmail]);

//   // UI helpers
//   const goToAdminHome = () => navigate("/adminHome");
//   const goToNewOrders = () => navigate("/newOrders");
//   const goToPackageReady = () => navigate("/deliverReady");

//   const handleFileChange = (e) => {
//     const f = e.target.files?.[0] || null;
//     if (f && !f.type.startsWith("image/")) {
//       alert("Seleccione una imagen válida.");
//       return;
//     }
//     if (f && f.size > 25 * 1024 * 1024) {
//       alert("La imagen no debe exceder 25MB.");
//       return;
//     }
//     setDeliveryImage(f);
//     setErrMsg("");
//     setOkMsg("");
//   };

//   const markAsDelivered = async () => {
//     if (!order?._id) return;
//     if (!deliveryImage) {
//       alert("Selecciona una imagen de entrega.");
//       return;
//     }
//     if (!deliveryDate) {
//       alert("Seleccione la fecha de entrega.");
//       return;
//     }

//     setBusy(true);
//     setProgress(0);
//     setErrMsg("");
//     setOkMsg("");

//     try {
//       // 1) Upload delivery evidence to S3-backed endpoint
//       const form = new FormData();
//       form.append("deliveryImage", deliveryImage); // <-- backend must accept 'deliveryImage'

//       await axios.post(`${API}/orders/${order._id}/evidence/delivery`, form, {
//         onUploadProgress: (pe) => {
//           if (!pe.total) return;
//           setProgress(Math.round((pe.loaded / pe.total) * 100));
//         },
//       });

//       // 2) Update delivery meta on the order
//       await fetch(`${API}/orders/${order._id}`, {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           insuredAmount,
//           deliveryDate,     // yyyy-mm-dd string; backend should Date() it
//           trackingNumber,
//         }),
//       });

//       // 3) Update status to "Pedido Entregado"
//       await fetch(`${API}/order/${order._id}/status`, {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ orderStatus: "Pedido Entregado" }),
//       });

//       setOkMsg("Evidencia subida y pedido marcado como entregado.");
//       // navigate("/delivered");
//       navigate("/adminHome");
//     } catch (error) {
//       console.error("Error marking delivered:", error);
//       setErrMsg(error?.response?.data?.error || error.message || "Error al procesar la entrega.");
//     } finally {
//       setBusy(false);
//       setTimeout(() => setProgress(0), 800);
//     }
//   };

//   if (!order) return <p style={{ padding: 20 }}>Cargando pedido...</p>;

//   // ===== Derived fields from Mongo user =====
//   const nombre = (mongoUser?.nombre || "").trim();
//   const apellido = (mongoUser?.apellido || "").trim();
//   const displayName = [nombre, apellido].filter(Boolean).join(" ") || order.userEmail || "Cliente";

//   const companyName = (mongoUser?.empresa || "").trim();

//   // Shipping preferences from Mongo (preferred carrier + insure flag)
//   const carrier =
//     (mongoUser?.shippingPreferences?.preferredCarrier ||
//       mongoUser?.preferredCarrier ||
//       "")?.toString().trim() || "";

//   const insureShipment =
//     mongoUser?.shippingPreferences?.insureShipment ??
//     mongoUser?.insureShipment ??
//     null; // boolean or null if not set

//   // Shipping object (new structure)
//   const s = order.shippingInfo || {};
//   const sCalle = s.calleEnvio || "";
//   const sExt = s.exteriorEnvio || "";
//   const sInt = s.interiorEnvio || "";
//   const sCol = s.coloniaEnvio || "";
//   const sCiudad = s.ciudadEnvio || "";
//   const sEstado = s.estadoEnvio || "";
//   const sCP = s.cpEnvio || "";

//   return (
//     <body className="body-BG-Gradient">
//       <div className="loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src={Logo}
//           alt="Logo"
//           width="180"
//           height="55"
//           onClick={goToAdminHome}
//         />
//       </div>

//       <div className="edit-titleIcon-Div">
//         <label className="editAddress-headerLabel">Detalles de Entrega</label>
//         <img src={toDeliverIcon} alt="Cotiza" width="35" height="35" />
//       </div>

//       <div className="newQuotesDetail-Div">
//         <label>{displayName}</label>
//         <label>{companyName || "—"}</label>
//         <br />
//         <label>Pedido #{String(order._id).slice(-5)}</label>
//         {/* Enviado por -> preferredCarrier from Mongo */}
//         <label>Enviado por: {carrier || "Sin especificar"}</label>

//         <div className="deliveryDetails-Div">
//           <div className="paymentDetails-Div">
//             {/* Dirección de envío (desde objeto) */}
//             <div className="deliveryDets-AddressDiv">
//               <div className="headerEditIcon-Div">
//                 <label className="newUserData-Label">Dirección de Envío</label>
//               </div>
//               <div className="existingQuote-Div">
//                 <div className="quoteAndFile-Div">
//                   <label className="productDetail-Label">
//                     {sCalle} #{sExt} Int. {sInt}
//                   </label>
//                   <label className="productDetail-Label">Col. {sCol}</label>
//                   <label className="productDetail-Label">
//                     {sCiudad}, {sEstado}
//                   </label>
//                   <label className="productDetail-Label">C.P.: {sCP}</label>
//                 </div>
//               </div>
//             </div>

//             {/* Monto asegurado — only if insureShipment === true */}
//             {insureShipment === true && (
//               <>
//                 <div className="headerEditIcon-Div">
//                   <label className="newUserData-Label">Monto Asegurado</label>
//                 </div>
//                 <input
//                   className="deliveryDets-Input"
//                   type="text"
//                   placeholder="Ingresar monto"
//                   value={insuredAmount}
//                   onChange={(e) => setInsuredAmount(e.target.value)}
//                 />
//               </>
//             )}

//             {/* Fecha de entrega */}
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Fecha de Entrega</label>
//             </div>
//             <input
//               className="deliveryDets-Input"
//               type="date"
//               required
//               placeholder="Seleccione Fecha"
//               value={deliveryDate}
//               onChange={(e) => setDeliveryDate(e.target.value)}
//             />

//             {/* Número de guía */}
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Número de Guía</label>
//             </div>
//             <input
//               className="deliveryDets-Input"
//               type="text"
//               required
//               placeholder="Ingresar número de guía"
//               value={trackingNumber}
//               onChange={(e) => setTrackingNumber(e.target.value)}
//             />

//             {/* Evidencia de envío — archivo (imagen) */}
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Evidencia de Entrega</label>
//             </div>
//             <div className="shipmentEvidence-Div" style={{ alignItems: "center" }}>
//               <div className="file-upload-wrapper" style={{ display: "flex", alignItems: "center", gap: 12 }}>
//                 <label htmlFor="deliveryImage" className="custom-file-upload" style={{ cursor: "pointer" }}>
//                   Elegir archivo
//                 </label>
//                 <input
//                   id="deliveryImage"
//                   type="file"
//                   accept="image/*"
//                   onChange={handleFileChange}
//                   style={{ display: "none" }}
//                 />
//                 <span className="file-selected-text">
//                   {deliveryImage ? deliveryImage.name : "Ningún archivo seleccionado"}
//                 </span>
//               </div>
//               {busy && (
//                 <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
//                   Subiendo evidencia… {progress || 0}%
//                 </div>
//               )}
//               {errMsg && <div style={{ fontSize: 12, color: "#b00", marginTop: 6 }}>{errMsg}</div>}
//               {okMsg && <div style={{ fontSize: 12, color: "#2a7a2a", marginTop: 6 }}>{okMsg}</div>}
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Submit */}
//       <div className="generateLabel-Div">
//         <button
//           className="packDetails-Btn"
//           type="button"
//           onClick={markAsDelivered}
//           disabled={busy || !deliveryImage || !deliveryDate}
//           title={
//             !deliveryImage
//               ? "Seleccione la evidencia"
//               : !deliveryDate
//               ? "Seleccione la fecha de entrega"
//               : ""
//           }
//         >
//           {busy ? `Procesando… ${progress || 0}%` : "Entregado"}
//         </button>
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
//     </body>
//   );
// }
