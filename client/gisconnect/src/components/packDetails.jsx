import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

import { API } from "/src/lib/api";
import Logo from "/src/assets/images/GIS_Logo.png";
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function PackDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [packer, setPacker] = useState("");
  const [checkedItems, setCheckedItems] = useState([]);

  // Allow up to 3 images
  const [evidenceImages, setEvidenceImages] = useState([]); // File[]
  const [previewUrls, setPreviewUrls] = useState([]);       // blob URLs

  // UI feedback
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // Claim state
  const [claimState, setClaimState] = useState({
    inProgress: false,
    claimedBy: "",
    status: "idle", // "idle" | "claiming" | "claimed" | "blocked"
    message: "",
  });
  const finishedRef = useRef(false); // set true when marking ready (to avoid releasing on leave)
  const claimedByMe = claimState.inProgress && claimState.claimedBy === packer;
  const actionsDisabled = !claimedByMe || busy;

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  // Load order
  useEffect(() => {
    if (!orderId) return;
    axios
      .get(`${API}/orders/${orderId}`)
      .then((res) => {
        const o = res.data;
        setOrder(o);
        setCheckedItems(new Array((o?.items || []).length).fill(false));
        // Show quick info if already taken
        if (o?.packing?.status === "in_progress" && o?.packing?.claimedBy) {
          setClaimState((s) => ({
            ...s,
            inProgress: true,
            claimedBy: o.packing.claimedBy,
            status: "idle",
            message: "",
          }));
        }
      })
      .catch((err) => console.error("Error loading order:", err));
  }, [orderId]);

  // ---- Claim helpers ----
  const claimOrder = useCallback(async (packerName) => {
    if (!packerName || packerName === "Encargado") return;
    setErrMsg("");
    setClaimState((s) => ({ ...s, status: "claiming", message: "" }));
    try {
      const { data } = await axios.post(`${API}/orders/${orderId}/claim-pack`, { packer: packerName });
      const c = data?.order?.packing || {};
      setClaimState({
        inProgress: c.status === "in_progress",
        claimedBy: c.claimedBy || packerName,
        status: "claimed",
        message: "",
      });
    } catch (e) {
      // 409 → someone else holds it
      const msg = e?.response?.data?.error || "No se pudo tomar el pedido.";
      setClaimState({
        inProgress: false,
        claimedBy: "",
        status: "blocked",
        message: msg,
      });
    }
  }, [orderId]);

  const releaseOrder = useCallback(async (reason = "leave") => {
    if (!orderId || !packer || !claimedByMe) return;
    try {
      // Use sendBeacon when available to avoid losing the request on unload
      const url = `${API}/orders/${orderId}/release-pack`;
      const payload = JSON.stringify({ packer, reason });
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(url, blob);
      } else {
        await axios.post(url, { packer, reason });
      }
    } catch {
      // ignore release errors
    }
  }, [orderId, packer, claimedByMe]);

  // When packer is chosen the first time → claim the order
  useEffect(() => {
    if (!packer || packer === "Encargado") return;
    // If already claimed by me, skip
    if (claimedByMe) return;
    claimOrder(packer);
  }, [packer, claimedByMe, claimOrder]);

  // Release on unmount / navigation / refresh if not finished
  useEffect(() => {
    const beforeUnload = () => {
      if (!finishedRef.current) releaseOrder("unload");
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (!finishedRef.current) releaseOrder("unmount");
      // cleanup blob URLs on unmount
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [releaseOrder, previewUrls]);

  const handleCheckboxToggle = (index) => {
    if (actionsDisabled) return;
    setCheckedItems((prev) => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  };

  // MULTIPLE file input (max 3) — supports camera or gallery
  const handleFilesSelected = (e) => {
    if (actionsDisabled) return;

    const inputEl = e.target;
    const list = inputEl?.files ? Array.from(inputEl.files) : [];
    if (list.length === 0) return;

    const looksImage = (f) =>
      (f.type && f.type.startsWith("image/")) || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name || "");
    const bad = list.find((f) => !looksImage(f) || f.size > 25 * 1024 * 1024);
    if (bad) {
      alert("Solo imágenes y máximo 25MB por archivo.");
      return;
    }

    const merged = [...evidenceImages, ...list].slice(0, 3);
    setEvidenceImages(merged);
    setErrMsg("");
    setOkMsg("");

    setPreviewUrls((old) => {
      old.forEach((u) => URL.revokeObjectURL(u));
      return merged.map((f) => URL.createObjectURL(f));
    });

    setTimeout(() => {
      if (inputEl && inputEl.type === "file") inputEl.value = "";
    }, 200);
  };

  // Upload packing images, update status, mark-ready, then finish (don’t release)
  const handleMarkAsReady = async () => {
    if (!claimedByMe) {
      alert("Debes tomar el pedido antes de continuar (selecciona tu nombre).");
      return;
    }
    if (!evidenceImages || evidenceImages.length === 0) {
      alert("Selecciona al menos una imagen (hasta 3).");
      return;
    }
    if (!packer || packer === "Encargado") {
      alert("Selecciona el encargado de empaque.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setErrMsg("");
    setOkMsg("");

    try {
      // 1) Upload evidence (multiple). Backend: upload.array('files', 3)
      const form = new FormData();
      evidenceImages.forEach((file) => form.append("packingImages", file));
      form.append("packerName", packer);

      await axios.post(`${API}/orders/${orderId}/evidence/packing`, form, {
        onUploadProgress: (pe) => {
          if (!pe.total) return;
          setProgress(Math.round((pe.loaded / pe.total) * 100));
        },
      });

      // 2) Update status to "Preparando Pedido"
      await fetch(`${API}/order/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "Preparando Pedido" }),
      });

      // 3) Mark as ready (persists packing.status = "ready")
      try {
        await axios.post(`${API}/orders/${orderId}/mark-ready`, { packer });
      } catch (_) {
        // non-fatal if this fails; status already advanced
      }

      finishedRef.current = true; // avoid releasing on leave
      setOkMsg("Evidencia subida. Estado actualizado a 'Preparando Pedido'.");
      navigate("/adminHome");
    } catch (error) {
      console.error("Error during packing upload/status:", error);
      setErrMsg(error?.response?.data?.error || error.message || "Ocurrió un error al procesar el pedido.");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  if (!order) return <p style={{ padding: 20 }}>Cargando pedido...</p>;

  // Simple banner logic
  const showBlocked =
    claimState.status === "blocked" ||
    (claimState.inProgress && claimState.claimedBy && claimState.claimedBy !== packer);

  return (
    <body className="body-BG-Gradient">
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

      <label className="sectionHeader-Label">Detalle de Paquete</label>

      {/* Claim status banner */}
      {showBlocked && (
        <div style={{ background: "#fde047", color: "#1f2937", padding: "10px 12px", borderRadius: 8, margin: "8px 16px" }}>
          {claimState.status === "blocked"
            ? (claimState.message || "Este pedido ya fue tomado por otro encargado.")
            : `Este pedido está en proceso por: ${claimState.claimedBy}.`}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={() => navigate(-1)} style={{ padding: "6px 10px", borderRadius: 6 }}>
              Volver
            </button>
            <button onClick={() => navigate("/adminHome")} style={{ padding: "6px 10px", borderRadius: 6 }}>
              Ir a Principal
            </button>
          </div>
        </div>
      )}

      <div className="packingManager-Div">
        <label className="packer-Label">Empacado por:</label>
        <select
          className="packManager-Dropdown"
          value={packer}
          onChange={(e) => setPacker(e.target.value)}
          disabled={packer && packer !== "Encargado"}   // 🔒 lock once selected
        >
          <option value="Encargado">Encargado...</option>
          <option value="Osvaldo">Oswaldo</option>
          <option value="Santiago">Santiago</option>
          <option value="Mauro">Mauro</option>
        </select>
      </div>

      <div className="newQuotesScroll-Div" style={{ opacity: actionsDisabled ? 0.55 : 1, pointerEvents: actionsDisabled ? "none" : "auto" }}>
        {(order.items || []).map((item, index) => (
          <div key={index} className="productToggle-Div">
            <div className="quoteAndFile-Div">
              <label className="productDetail-Label">{item.product}</label>
              <label className="productDetail-Label">
                <b>Presentación:</b> {item.presentation || "N/A"}
              </label>
              <label className="productDetail-Label">
                <b>Cantidad:</b> {item.amount}
              </label>
            </div>

            <div className="paymentEvidence-Div">
              <div className="toggleSwitch-Div">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={checkedItems[index]}
                    onChange={() => handleCheckboxToggle(index)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          </div>
        ))}

        {/* MULTIPLE file input */}
        <div className="packDetails-ImageDiv" style={{ marginTop: 16 }}>
          <label htmlFor="packingImages" className="custom-file-upload">
            Elegir archivos
          </label>
          <input
            id="packingImages"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            style={{ display: "none" }}
            disabled={actionsDisabled}
          />
          <span className="file-selected-text">
            {evidenceImages.length > 0
              ? evidenceImages.map((f) => f.name).join(", ")
              : "Ningún archivo seleccionado"}
          </span>
        </div>

        {/* Thumbnails preview */}
        {previewUrls.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 10,
              alignItems: "center",
            }}
          >
            {previewUrls.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Evidencia ${i + 1}`}
                width={85}
                height={85}
                style={{ objectFit: "cover", borderRadius: 8 }}
              />
            ))}
          </div>
        )}

        {/* Action */}
        <div className="packingDetails-ButtonDiv">
          <button
            className="packDetails-Btn"
            onClick={handleMarkAsReady}
            disabled={actionsDisabled || evidenceImages.length === 0 || !packer || packer === "Encargado"}
            title={
              !claimedByMe ? "Toma el pedido para continuar" :
              !evidenceImages.length ? "Selecciona al menos una imagen" :
              !packer || packer === "Encargado" ? "Selecciona el encargado" : ""
            }
          >
            {busy ? `Subiendo... ${progress || 0}%` : <>Pedido<br />Listo</>}
          </button>
          {errMsg && <div style={{ color: "#b00", marginTop: 8, fontSize: 12 }}>{errMsg}</div>}
          {okMsg && <div style={{ color: "#2a7a2a", marginTop: 8, fontSize: 12 }}>{okMsg}</div>}
        </div>
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

// // Hey chatgpt, going back to pendingPack.jsx and packDetails.jsx, when the packing team gets new orders to pack, they get displayed on pendingPack, where then a packer clicks on any specific order and is sent to this screen (packDetails.jsx), where he (Oswaldo, Santiago, or Mauro) is in charge of getting the order ready. Now we are having the following situation: for some reason, if any of the packers select an order to process, even though he is already working on that order, the order isnstill available for the other packers on pendingPack screen, hence more than one packer could be working on the same order at the same time. How can we avoid having this happening?  
// // For step 5) Respect the claim in PackDetails (guard + release), this is my current packDetails.jsx. Can you direct edit please?
// import { useState, useEffect } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import axios from "axios";

// import { API } from "/src/lib/api";
// import Logo from "/src/assets/images/GIS_Logo.png";
// import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// export default function PackDetails() {
//   const { orderId } = useParams();
//   const navigate = useNavigate();

//   const [order, setOrder] = useState(null);
//   const [packer, setPacker] = useState("");
//   const [checkedItems, setCheckedItems] = useState([]);

//   // Allow up to 3 images
//   const [evidenceImages, setEvidenceImages] = useState([]); // File[]
//   const [previewUrls, setPreviewUrls] = useState([]);       // blob URLs

//   // UI feedback
//   const [busy, setBusy] = useState(false);
//   const [progress, setProgress] = useState(0);
//   const [errMsg, setErrMsg] = useState("");
//   const [okMsg, setOkMsg] = useState("");

//   const goToAdminHome = () => navigate("/adminHome");
//   const goToNewOrders = () => navigate("/newOrders");
//   const goToPackageReady = () => navigate("/deliverReady");
//   const goHomeLogo = () => navigate("/adminHome");

//   useEffect(() => {
//     if (!orderId) return;
//     axios
//       .get(`${API}/orders/${orderId}`)
//       .then((res) => {
//         const o = res.data;
//         setOrder(o);
//         setCheckedItems(new Array((o?.items || []).length).fill(false));
//       })
//       .catch((err) => console.error("Error loading order:", err));
//   }, [orderId]);

//   const handleCheckboxToggle = (index) => {
//     setCheckedItems((prev) => {
//       const updated = [...prev];
//       updated[index] = !updated[index];
//       return updated;
//     });
//   };

//   // MULTIPLE file input (max 3) — supports camera or gallery
//   const handleFilesSelected = (e, { source } = {}) => {
//     const inputEl = e.target;
//     const list = inputEl?.files ? Array.from(inputEl.files) : [];
//     if (list.length === 0) return;
  
//     // Some Android/Google Photos picks may have empty type; allow those if they look like images by name.
//     const looksImage = (f) =>
//       (f.type && f.type.startsWith("image/")) || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name || "");
  
//     const bad = list.find((f) => !looksImage(f) || f.size > 25 * 1024 * 1024);
//     if (bad) {
//       alert("Solo imágenes y máximo 25MB por archivo.");
//       return;
//     }
  
//     const merged = [...evidenceImages, ...list].slice(0, 3);
//     setEvidenceImages(merged);
//     setErrMsg("");
//     setOkMsg("");
  
//     setPreviewUrls((old) => {
//       old.forEach((u) => URL.revokeObjectURL(u));
//       return merged.map((f) => URL.createObjectURL(f));
//     });
  
//     // Android quirk: defer clearing the input so it commits the chosen files.
//     setTimeout(() => {
//       if (inputEl && inputEl.type === "file") inputEl.value = "";
//     }, 200);
//   };

//   // Upload packing images to S3-backed endpoint, then mark status
//   const handleMarkAsReady = async () => {
//     if (!evidenceImages || evidenceImages.length === 0) {
//       alert("Selecciona al menos una imagen (hasta 3).");
//       return;
//     }
//     if (!packer || packer === "Encargado") {
//       alert("Selecciona el encargado de empaque.");
//       return;
//     }

//     setBusy(true);
//     setProgress(0);
//     setErrMsg("");
//     setOkMsg("");

//     try {
//       // 1) Upload evidence (multiple). Backend: upload.array('files', 3)
//       const form = new FormData();
//       evidenceImages.forEach((file) => form.append("packingImages", file));
//       form.append("packerName", packer);

//       await axios.post(`${API}/orders/${orderId}/evidence/packing`, form, {
//         onUploadProgress: (pe) => {
//           if (!pe.total) return;
//           setProgress(Math.round((pe.loaded / pe.total) * 100));
//         },
//       });

//       // 2) Update status to "Preparando Pedido"
//       await fetch(`${API}/order/${orderId}/status`, {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ orderStatus: "Preparando Pedido" }),
//       });

//       setOkMsg("Evidencia subida. Estado actualizado a 'Preparando Pedido'.");
//       // Optional: refresh order or jump to next screen
//       // navigate("/deliverReady");
//       navigate("/adminHome");
//     } catch (error) {
//       console.error("Error during packing upload/status:", error);
//       setErrMsg(error?.response?.data?.error || error.message || "Ocurrió un error al procesar el pedido.");
//     } finally {
//       setBusy(false);
//       setTimeout(() => setProgress(0), 800);
//     }
//   };

//   useEffect(() => {
//     return () => {
//       // cleanup blob URLs on unmount
//       previewUrls.forEach((u) => URL.revokeObjectURL(u));
//     };
//   }, [previewUrls]);

//   if (!order) return <p style={{ padding: 20 }}>Cargando pedido...</p>;

//   return (
//     <body className="body-BG-Gradient">
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

//       <label className="sectionHeader-Label">Detalle de Paquete</label>

//       <div className="packingManager-Div">
//         <label className="packer-Label">Empacado por:</label>
//         <select
//           className="packManager-Dropdown"
//           value={packer}
//           onChange={(e) => setPacker(e.target.value)}
//           disabled={packer && packer !== "Encargado"}   // 🔒 lock once selected
//         >
//           <option value="Encargado">Encargado...</option>
//           <option value="Osvaldo">Oswaldo</option>
//           <option value="Santiago">Santiago</option>
//           <option value="Mauro">Mauro</option>
//         </select>
//       </div>

//       <div className="newQuotesScroll-Div">
//         {(order.items || []).map((item, index) => (
//           <div key={index} className="productToggle-Div">
//             <div className="quoteAndFile-Div">
//               <label className="productDetail-Label">{item.product}</label>
//               <label className="productDetail-Label">
//                 <b>Presentación:</b> {item.presentation || "N/A"}
//               </label>
//               <label className="productDetail-Label">
//                 <b>Cantidad:</b> {item.amount}
//               </label>
//             </div>

//             <div className="paymentEvidence-Div">
//               <div className="toggleSwitch-Div">
//                 <label className="switch">
//                   <input
//                     type="checkbox"
//                     checked={checkedItems[index]}
//                     onChange={() => handleCheckboxToggle(index)}
//                   />
//                   <span className="slider round"></span>
//                 </label>
//               </div>
//             </div>
//           </div>
//         ))}

//         {/* MULTIPLE file input */}
//         {/* CAMERA (single, capture) */}
//         <div className="packDetails-ImageDiv" style={{ marginTop: 16 }}>
//           <label htmlFor="packingImages" className="custom-file-upload">
//             Elegir archivos
//           </label>
//           <input
//             id="packingImages"
//             type="file"
//             accept="image/*"
//             // accept="image/*"
//             // capture="environment"
//             multiple
//             onChange={handleFilesSelected}
//             style={{ 
//               display: "none" 
//             }}
//           />
//           <span className="file-selected-text">
//             {evidenceImages.length > 0
//               ? evidenceImages.map((f) => f.name).join(", ")
//               : "Ningún archivo seleccionado"}
//           </span>
//         </div>
//         {/* Thumbnails preview */}
//         {previewUrls.length > 0 && (
//           <div
//             style={{
//               display: "flex",
//               gap: 10,
//               flexWrap: "wrap",
//               marginTop: 10,
//               alignItems: "center",
//             }}
//           >
//             {previewUrls.map((src, i) => (
//               <img
//                 key={i}
//                 src={src}
//                 alt={`Evidencia ${i + 1}`}
//                 width={85}
//                 height={85}
//                 style={{ objectFit: "cover", borderRadius: 8 }}
//               />
//             ))}
//           </div>
//         )}

//         {/* Action */}
//         <div className="packingDetails-ButtonDiv">
//           <button
//             className="packDetails-Btn"
//             onClick={handleMarkAsReady}
//             disabled={busy || evidenceImages.length === 0 || !packer || packer === "Encargado"}
//             title={
//               !evidenceImages.length
//                 ? "Selecciona al menos una imagen"
//                 : !packer || packer === "Encargado"
//                 ? "Selecciona el encargado"
//                 : ""
//             }
//           >
//             {busy ? `Subiendo... ${progress || 0}%` : <>Pedido<br />Listo</>}
//           </button>
//           {errMsg && <div style={{ color: "#b00", marginTop: 8, fontSize: 12 }}>{errMsg}</div>}
//           {okMsg && <div style={{ color: "#2a7a2a", marginTop: 8, fontSize: 12 }}>{okMsg}</div>}
//         </div>
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
