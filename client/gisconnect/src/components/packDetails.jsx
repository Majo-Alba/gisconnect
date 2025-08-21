import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function PackDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [packer, setPacker] = useState("");
  const [checkedItems, setCheckedItems] = useState([]);

  // NEW: allow up to 3 images
  const [evidenceImages, setEvidenceImages] = useState([]); // File[]
  const [previewUrls, setPreviewUrls] = useState([]);       // for thumbnails

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  useEffect(() => {
    if (!orderId) return;
    axios
      .get(`http://localhost:4000/orders/${orderId}`)
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

  // Custom multiple-file input handler (max 3)
  const handleFilesSelected = (e) => {
    const files = Array.from(e.target.files || []);
    const trimmed = files.slice(0, 3);
    setEvidenceImages(trimmed);

    // Thumbnails
    const urls = trimmed.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
  };

  const handleMarkAsReady = async () => {
    if (!evidenceImages || evidenceImages.length === 0) {
      alert("Selecciona al menos una imagen (hasta 3).");
      return;
    }

    try {
      const formData = new FormData();
      // Append multiple files under the SAME field name
      evidenceImages.forEach((file) => formData.append("packingImages", file)); // <-- backend: upload.array('packingImages', 3)

      formData.append("orderStatus", "Pedido Listo");
      formData.append("packerName", packer);

      await axios.put(`http://localhost:4000/orders/${orderId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      alert("Evidencia subida y pedido marcado como listo.");
      navigate("/deliverReady");
    } catch (error) {
      console.error("Error during order processing:", error);
      alert("Ocurrió un error al procesar el pedido.");
    }
  };

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

      <div className="packingManager-Div">
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
      </div>

      <div className="newQuotesScroll-Div">
        {(order.items || []).map((item, index) => (
          <div key={index} className="productToggle-Div">
            <div className="quoteAndFile-Div">
              <label className="productDetail-Label">{item.product}</label>
              <label className="productDetail-Label">
                <b>SKU:</b> {item.sku || "N/A"}
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

        {/* Custom MULTIPLE file input (Spanish) */}
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

        <div className="packingDetails-ButtonDiv">
          <button className="packDetails-Btn" onClick={handleMarkAsReady}>
            Pedido<br />Listo
          </button>
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