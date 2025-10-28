// Hey chatgpt, in my packDetails.jsx file, the person packing the order is prompted to upload an image. When uploading using an iphone, everything works smoothly, but when trying to upload through android, it allows me to select a photo but it doesnt actually attach it (as if i hadnt selected anything)
import { useEffect, useState } from "react";
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

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  useEffect(() => {
    if (!orderId) return;
    axios
      .get(`${API}/orders/${orderId}`)
      .then((res) => {
        const o = res.data;
        setOrder(o);
        setCheckedItems(new Array((o?.items || []).length).fill(false));
      })
      .catch((err) => console.error("Error loading order:", err));
  }, [orderId]);

  const handleCheckboxToggle = (index) => {
    setCheckedItems((prev) => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  };

  // MULTIPLE file input (max 3)
  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || []);
    const trimmed = files.slice(0, 3);

    // Basic validation (images only, <= 25MB each)
    const bad = trimmed.find(
      (f) => !f.type.startsWith("image/") || f.size > 25 * 1024 * 1024
    );
    if (bad) {
      alert("Solo imágenes y máximo 25MB por archivo.");
      return;
    }

    setEvidenceImages(trimmed);
    setErrMsg("");
    setOkMsg("");

    // Thumbnails
    const urls = trimmed.map((f) => URL.createObjectURL(f));
    setPreviewUrls((old) => {
      old.forEach((u) => URL.revokeObjectURL(u));
      return urls;
    });
  };

  // Upload packing images to S3-backed endpoint, then mark status
  const handleMarkAsReady = async () => {
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
      // evidenceImages.forEach((file) => {
      //   form.append("files", file);           // preferred new field
      //   form.append("packingImages", file);   // backward-compat if your route still expects this
      // });
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

      setOkMsg("Evidencia subida. Estado actualizado a 'Preparando Pedido'.");
      // Optional: refresh order or jump to next screen
      navigate("/deliverReady");
    } catch (error) {
      console.error("Error during packing upload/status:", error);
      setErrMsg(error?.response?.data?.error || error.message || "Ocurrió un error al procesar el pedido.");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  useEffect(() => {
    return () => {
      // cleanup blob URLs on unmount
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [previewUrls]);

  if (!order) return <p style={{ padding: 20 }}>Cargando pedido...</p>;

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

      {/* <div className="packingManager-Div">
        <label className="packer-Label">Empacado por:</label>
        <select
          className="packManager-Dropdown"
          value={packer}
          onChange={(e) => setPacker(e.target.value)}
        >
          <option value="Encargado">Encargado...</option>
          <option value="Osvaldo">Osvaldo</option>
          <option value="Santiago">Santiago</option>
          <option value="Mauro">Mauro</option>
        </select>
      </div> */}
      {/* sep07 */}
      <div className="packingManager-Div">
        <label className="packer-Label">Empacado por:</label>
        <select
          className="packManager-Dropdown"
          value={packer}
          onChange={(e) => setPacker(e.target.value)}
          disabled={packer && packer !== "Encargado"}   // 🔒 lock once selected
        >
          <option value="Encargado">Encargado...</option>
          <option value="Osvaldo">Osvaldo</option>
          <option value="Santiago">Santiago</option>
          <option value="Mauro">Mauro</option>
        </select>
      </div>

      {/* sep07 */}

      <div className="newQuotesScroll-Div">
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
            capture="environment"
            multiple
            onChange={handleFilesSelected}
            style={{
              position: "absolute",
              opacity: 0,
              width: "100%",
              height: "100%",
              zIndex: -1,  
              // display: "none" 
            }}
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
            disabled={busy || evidenceImages.length === 0 || !packer || packer === "Encargado"}
            title={
              !evidenceImages.length
                ? "Selecciona al menos una imagen"
                : !packer || packer === "Encargado"
                ? "Selecciona el encargado"
                : ""
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

// import EvidenceUploader from "/src/components/EvidenceUploader";
// import EvidenceGallery from "/src/components/EvidenceGallery";
// import axios from "axios";
// import { API } from "/src/lib/api";
// import { useParams, useNavigate } from "react-router-dom";
// import { useEffect, useState } from "react";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// export default function PackDetails() {
//   const { orderId } = useParams();
//   const navigate = useNavigate();

//   const [order, setOrder] = useState(null);
//   const [packer, setPacker] = useState("");
//   const [checkedItems, setCheckedItems] = useState([]);

//   // NEW: allow up to 3 images
//   const [evidenceImages, setEvidenceImages] = useState([]); // File[]
//   const [previewUrls, setPreviewUrls] = useState([]);       // for thumbnails

//   const goToAdminHome = () => navigate("/adminHome");
//   const goToNewOrders = () => navigate("/newOrders");
//   const goToPackageReady = () => navigate("/deliverReady");
//   const goHomeLogo = () => navigate("/adminHome");

//   useEffect(() => {
//     if (!orderId) return;
//     axios
//       .then((res) => {
//         const o = res.data;
//         setOrder(o);
//         setCheckedItems(new Array((o?.items || []).length).fill(false));
//       })
//       .catch((err) => console.error("Error loading order:", err));
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

//   const handleCheckboxToggle = (index) => {
//     setCheckedItems((prev) => {
//       const updated = [...prev];
//       updated[index] = !updated[index];
//       return updated;
//     });
//   };

//   // Custom multiple-file input handler (max 3)
//   const handleFilesSelected = (e) => {
//     const files = Array.from(e.target.files || []);
//     const trimmed = files.slice(0, 3);
//     setEvidenceImages(trimmed);

//     // Thumbnails
//     const urls = trimmed.map((f) => URL.createObjectURL(f));
//     setPreviewUrls(urls);
//   };

//   const handleMarkAsReady = async () => {
//     if (!evidenceImages || evidenceImages.length === 0) {
//       alert("Selecciona al menos una imagen (hasta 3).");
//       return;
//     }

//     try {
//       const formData = new FormData();
//       // Append multiple files under the SAME field name
//       evidenceImages.forEach((file) => formData.append("packingImages", file)); // <-- backend: upload.array('packingImages', 3)

//       formData.append("orderStatus", "Pedido Listo");
//       formData.append("packerName", packer);

//         headers: { "Content-Type": "multipart/form-data" },
//       });

//       alert("Evidencia subida y pedido marcado como listo.");
//       navigate("/deliverReady");
//     } catch (error) {
//       console.error("Error during order processing:", error);
//       alert("Ocurrió un error al procesar el pedido.");
//     }
//   };

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
//         >
//           <option value="Encargado">Encargado...</option>
//           <option value="Osvaldo">Osvaldo</option>
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
//                 <b>SKU:</b> {item.sku || "N/A"}
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

//         {/* aug22 */}
//         <h3 className="newUserData-Label">Evidencia de Empaque</h3>
//         <EvidenceUploader
//           orderId={orderId}
//           kind="packing"
//           multiple
//           max={3}
//           buttonLabel="Subir fotos de empaque"
//           onUploaded={() => load()}
//         />
//         {order && <EvidenceGallery orderId={orderId} packingEvidenceExt={order.packingEvidenceExt} />}
//         {/* aug22 */}

//         {/* Custom MULTIPLE file input (Spanish) */}
//         <div className="packDetails-ImageDiv" style={{ marginTop: 16 }}>
//           <label htmlFor="packingImages" className="custom-file-upload">
//             Elegir archivos
//           </label>
//           <input
//             id="packingImages"
//             type="file"
//             accept="image/*"
//             multiple
//             onChange={handleFilesSelected}
//             style={{ display: "none" }}
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

//         <div className="packingDetails-ButtonDiv">
//           <button className="packDetails-Btn" onClick={handleMarkAsReady}>
//             Pedido<br />Listo
//           </button>
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