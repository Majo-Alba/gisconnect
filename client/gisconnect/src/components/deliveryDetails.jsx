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
  const [insuredAmount, setInsuredAmount] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  // delivery image upload
  const [deliveryImage, setDeliveryImage] = useState(null);

  // UI
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // ===== Google Sheets client DB (email → name/company) =====
  const [csvData, setCsvData] = useState([]);

  useEffect(() => {
    fetchOrderDetails();
    fetchClientCSV();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      const { data } = await axios.get(`${API}/orders/${orderId}`);
      setOrder(data);
      // Pre-fill existing meta (if any)
      setInsuredAmount(data?.insuredAmount ?? "");
      setTrackingNumber(data?.trackingNumber ?? "");
      // normalize deliveryDate to yyyy-mm-dd for input[type=date]
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

  // Pull from your Google Sheets DB (same sheet used elsewhere)
  const fetchClientCSV = () => {
    const csvUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
    axios
      .get(csvUrl)
      .then((response) => setCsvData(parseCSV(response.data)))
      .catch((error) => console.error("Error fetching CSV data:", error));
  };

  function parseCSV(csvText) {
    const rows = csvText.split(/\r?\n/).filter(Boolean);
    const headers = (rows[0] || "").split(",");
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(",");
      const row = {};
      headers.forEach((h, idx) => (row[h] = cols[idx]));
      data.push(row);
    }
    return data;
  }

  // Build a quick lookup: email → { name, company }
  const clientLookup = useMemo(() => {
    const map = new Map();
    csvData.forEach((r) => {
      const email = (r.CORREO_EMPRESA || "").trim().toLowerCase();
      if (!email) return;
      map.set(email, {
        name: (r.NOMBRE_APELLIDO || "").trim(),
        company: (r.NOMBRE_EMPRESA || "").trim(),
      });
    });
    return map;
  }, [csvData]);

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
      // 1) Upload delivery evidence to S3-backed endpoint
      const form = new FormData();
      form.append("deliveryImage", deliveryImage); // <-- backend must accept 'deliveryImage'

      await axios.post(`${API}/orders/${order._id}/evidence/delivery`, form, {
        onUploadProgress: (pe) => {
          if (!pe.total) return;
          setProgress(Math.round((pe.loaded / pe.total) * 100));
        },
      });

      // 2) Update delivery meta on the order
      await fetch(`${API}/orders/${order._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insuredAmount,
          deliveryDate,     // yyyy-mm-dd string; backend should Date() it
          trackingNumber,
        }),
      });

      // 3) Update status to "Pedido Entregado"
      await fetch(`${API}/order/${order._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "Pedido Entregado" }),
      });

      setOkMsg("Evidencia subida y pedido marcado como entregado.");
      navigate("/delivered");
    } catch (error) {
      console.error("Error marking delivered:", error);
      setErrMsg(error?.response?.data?.error || error.message || "Error al procesar la entrega.");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  if (!order) return <p style={{ padding: 20 }}>Cargando pedido...</p>;

  // Map email → friendly name & company
  const email = (order.userEmail || "").trim().toLowerCase();
  const meta = clientLookup.get(email);
  const displayName = meta?.name || order.userEmail || "Cliente";
  const companyName = meta?.company || "";

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
        <label>Enviado por: {order.shippingPreference || "Sin especificar"}</label>

        <div className="deliveryDetails-Div">
          <div className="paymentDetails-Div">
            {/* Dirección de envío (desde objeto) */}
            <div className="deliveryDets-AddressDiv">
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">Dirección de Envío</label>
              </div>
              <div className="existingQuote-Div">
                <div className="quoteAndFile-Div">
                  <label className="productDetail-Label">
                    {sCalle} #{sExt} Int. {sInt}
                  </label>
                  <label className="productDetail-Label">Col. {sCol}</label>
                  <label className="productDetail-Label">
                    {sCiudad}, {sEstado}
                  </label>
                  <label className="productDetail-Label">C.P.: {sCP}</label>
                </div>
              </div>
            </div>

            {/* Monto asegurado */}
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Monto Asegurado</label>
            </div>
            <input
              className="deliveryDets-Input"
              type="text"
              required
              placeholder="Ingresar monto"
              value={insuredAmount}
              onChange={(e) => setInsuredAmount(e.target.value)}
            />

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

// import EvidenceUploader from "/src/components/EvidenceUploader";
// import EvidenceGallery from "/src/components/EvidenceGallery";
// import axios from "axios";
// import { API } from "/src/lib/api";
// import { useParams, useNavigate } from "react-router-dom";
// import { useState, useEffect, useMemo } from "react";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import toDeliverIcon from "/src/assets/images/Icono_porEntregar.png";
// import uploadFile from "/src/assets/images/Icono_fileUpload.png";

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

//   // ===== Google Sheets client DB (email → name/company) =====
//   const [csvData, setCsvData] = useState([]);

//   useEffect(() => {
//     fetchOrderDetails();
//     fetchClientCSV();
//   }, [orderId]);

//   useEffect(() => { load(); }, [orderId]);

//   async function load() {
//     try {
//       const res = await axios.get(`${API}/orders/${orderId}`); // your existing order detail endpoint
//       setOrder(res.data);
//     } catch (e) {
//       console.error("Load order error:", e);
//     }
//   }

//   const fetchOrderDetails = async () => {
//     try {
//       setOrder(response.data);
//     } catch (err) {
//       console.error("Error fetching order:", err);
//     }
//   };

//   // Pull from your Google Sheets DB (same sheet you’ve used in other screens)
//   const fetchClientCSV = () => {
//     const csvUrl =
//       "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
//     axios
//       .get(csvUrl)
//       .then((response) => {
//         const parsed = parseCSV(response.data);
//         setCsvData(parsed);
//       })
//       .catch((error) => {
//         console.error("Error fetching CSV data:", error);
//       });
//   };

//   function parseCSV(csvText) {
//     const rows = csvText.split(/\r?\n/);
//     const headers = rows[0]?.split(",") || [];
//     const data = [];
//     for (let i = 1; i < rows.length; i++) {
//       if (!rows[i]) continue;
//       const rowData = rows[i].split(",");
//       const rowObject = {};
//       for (let j = 0; j < headers.length; j++) {
//         rowObject[headers[j]] = rowData[j];
//       }
//       data.push(rowObject);
//     }
//     return data;
//   }

//   // Build a quick lookup: email → { name, company }
//   const clientLookup = useMemo(() => {
//     const map = new Map();
//     csvData.forEach((r) => {
//       const email = (r.CORREO_EMPRESA || "").trim().toLowerCase();
//       if (!email) return;
//       map.set(email, {
//         name: (r.NOMBRE_APELLIDO || "").trim(),
//         company: (r.NOMBRE_EMPRESA || "").trim(),
//       });
//     });
//     return map;
//   }, [csvData]);

//   // UI helpers
//   const goToAdminHome = () => navigate("/adminHome");
//   const goToNewOrders = () => navigate("/newOrders");
//   const goToPackageReady = () => navigate("/deliverReady");

//   const handleFileChange = (e) => {
//     const f = e.target.files?.[0] || null;
//     setDeliveryImage(f);
//   };

//   const markAsDelivered = async () => {
//     if (!order) return;

//     try {
//       // Build multipart form-data so we can send the image binary
//       const form = new FormData();
//       form.append("orderStatus", "Pedido Entregado");
//       form.append("insuredAmount", insuredAmount);
//       form.append("deliveryDate", deliveryDate);
//       form.append("trackingNumber", trackingNumber);
//       if (deliveryImage) {
//         form.append("deliveryImage", deliveryImage); // <-- backend should accept this field
//       }

//         headers: { "Content-Type": "multipart/form-data" },
//       });

//       alert("Pedido marcado como entregado.");
//       navigate("/delivered");
//     } catch (error) {
//       console.error("Error updating order status:", error);
//       alert("Error al actualizar el estado del pedido.");
//     }
//   };

//   if (!order) return <p>Cargando pedido...</p>;

//   // Map email → friendly name & company
//   const email = (order.userEmail || "").trim().toLowerCase();
//   const meta = clientLookup.get(email);
//   const displayName = meta?.name || order.userEmail || "Cliente";
//   const companyName = meta?.company || ""; // fallback empty if not found

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
//         <label>Enviado por: {order.shippingPreference || "Sin especificar"}</label>

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

//             {/* Monto asegurado */}
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Monto Asegurado</label>
//             </div>
//             <input
//               className="deliveryDets-Input"
//               type="text"
//               required
//               placeholder="Ingresar monto"
//               value={insuredAmount}
//               onChange={(e) => setInsuredAmount(e.target.value)}
//             />

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
//               {/* <label className="newUserData-Label">Evidencia de Envío</label> */}
//               <h3 className="newUserData-Label">Evidencia de Entrega</h3>
//               <EvidenceUploader
//                 orderId={orderId}
//                 kind="delivery"
//                 multiple={false}
//                 buttonLabel="Subir evidencia de entrega"
//                 onUploaded={() => load()}
//               />
//               {order && <EvidenceGallery orderId={orderId} deliveryEvidenceExt={order.deliveryEvidenceExt} />}

//             </div>
//             <div className="shipmentEvidence-Div" style={{ alignItems: "center" }}>
//               {/* Custom “Choose File” in Spanish */}
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
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Submit */}
//       <div className="generateLabel-Div">
//         <button className="packDetails-Btn" type="submit" onClick={markAsDelivered}>
//           Entregado
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