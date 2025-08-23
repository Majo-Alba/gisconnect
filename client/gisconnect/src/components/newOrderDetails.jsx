import EvidenceGallery from "/src/components/EvidenceGallery";
import axios from "axios";
import { API } from "/src/lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useMemo } from "react";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import CotizaIcon from "/src/assets/images/Icono_Cotiza.png";
import TicketFallback from "/src/assets/images/ticketExample.jpg";

export default function NewOrderDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  const [paymentMethod, setPaymentMethod] = useState("");
  const [receivingAccount, setReceivingAccount] = useState("");
  const [account, setAccount] = useState("");
  const [isValidated, setIsValidated] = useState(false);

  // Evidence image url + lightbox
  const [evidenceUrl, setEvidenceUrl] = useState(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // ======== NEW: Google Sheets client DB ========
  const [csvData, setCsvData] = useState([]);

  useEffect(() => {
    fetchCSVData(); // run once on mount
  }, []);

  const fetchCSVData = () => {
    const csvUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";

    axios
      .get(csvUrl)
      .then((response) => {
        const parsedCsvData = parseCSV(response.data);
        setCsvData(parsedCsvData || []);
      })
      .catch((error) => {
        console.error("Error fetching CSV data:", error);
      });
  };

  function parseCSV(csvText) {
    const rows = csvText.split(/\r?\n/).filter(Boolean);
    if (rows.length === 0) return [];
    const headers = rows[0].split(",");
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const line = rows[i];
      const cols = line.split(",");
      const obj = {};
      headers.forEach((h, j) => {
        obj[h] = cols[j] ?? "";
      });
      data.push(obj);
    }
    return data;
  }

  // Lookup: match order.userEmail → CORREO_EMPRESA
  const clientInfo = useMemo(() => {
    if (!order?.userEmail || csvData.length === 0) return null;
    const norm = (s) => String(s || "").trim().toLowerCase();
    return (
      csvData.find(
        (r) => norm(r.CORREO_EMPRESA) === norm(order.userEmail)
      ) || null
    );
  }, [csvData, order?.userEmail]);

  const displayName = clientInfo?.NOMBRE_APELLIDO || "";
  const companyName = clientInfo?.NOMBRE_EMPRESA || "";
  // ==============================================

  const bufferToObjectUrl = (fileObj) => {
    try {
      if (!fileObj) return null;
      const raw = fileObj.data?.data || fileObj.data;
      if (!raw || !Array.isArray(raw)) return null;
      const mime = fileObj.mimetype || "image/*";
      const bytes = new Uint8Array(raw);
      const blob = new Blob([bytes], { type: mime });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn("Failed to build object URL from evidence buffer:", e);
      return null;
    }
  };

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        const res = await fetch(`http://localhost:4000/orders/${orderId}`);
        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || "Failed to fetch order details");
        }
        const data = await res.json();
        setPaymentMethod(data.paymentMethod || "");
        setReceivingAccount(data.receivingAccount || "");
        setOrder(data);
        setError(null);

        let url = null;
        if (data?.evidenceFile?.data) {
          url = bufferToObjectUrl(data.evidenceFile);
        } else if (data?.paymentEvidence?.data) {
          // legacy field name fallback
          url = bufferToObjectUrl(data.paymentEvidence);
        }

        setEvidenceUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (err) {
        console.error(err);
        setError("Error loading order details.");
      }
    };

    fetchOrderDetails();

    return () => {
      if (evidenceUrl) URL.revokeObjectURL(evidenceUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Lightbox handlers
  const openLightbox = useCallback(() => {
    if (evidenceUrl) setIsLightboxOpen(true);
  }, [evidenceUrl]);

  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  useEffect(() => {
    if (!isLightboxOpen) return;
    const onKey = (e) => e.key === "Escape" && closeLightbox();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLightboxOpen, closeLightbox]);

  useEffect(() => { load(); }, [orderId]);

  async function load() {
    try {
      const res = await axios.get(`${API}/orders/${orderId}`);
      setOrder(res.data);
    } catch (e) {
      console.error("Load order error:", e);
    }
  }

  // Navigation
  function goToAdminHome() {
    navigate("/adminHome");
  }
  function goToNewOrders() {
    navigate("/newOrders");
  }
  function goToDeliverReady() {
    navigate("/deliverReady");
  }
  function goHomeLogo() {
    navigate("/adminHome");
  }

  // Actions
  const handleValidatePayment = async () => {
    try {
      const updatedData = {
        paymentMethod,
        paymentAccount: account,
        orderStatus: "Pago Verificado",
      };
      await axios.put(`http://localhost:4000/orders/${orderId}`, updatedData);
      setIsValidated(true);
      alert("Pago validado exitosamente.");
      navigate("/newOrders");
    } catch (error) {
      console.error("Error updating order:", error);
      alert("Error al validar el pago.");
    }
  };

  if (!order) {
    return (
      <div className="body-BG-Gradient">
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
        <label className="sectionHeader-Label">Detalle de Pedido</label>
        {error ? (
          <p style={{ color: "red", textAlign: "center" }}>{error}</p>
        ) : (
          <p style={{ textAlign: "center" }}>Cargando detalles del pedido...</p>
        )}
      </div>
    );
  }

  const downloadName =
    order?.evidenceFile?.filename ||
    order?.paymentEvidence?.filename ||
    `evidencia_${String(order._id).slice(-5)}.jpg`;

  return (
    <body className="body-BG-Gradient">
      {/* LOGO */}
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

      <div className="edit-titleIcon-Div">
        <label className="editAddress-headerLabel">Validación de Pago</label>
        <img src={CotizaIcon} alt="Home Icon" width="35" height="35" />
      </div>

      {/* Top summary now uses client DB name + company */}
      <div className="newQuotesDetail-Div">
        <label>{displayName || order.userEmail}</label>
        <label>{companyName || ""}</label>
      </div>

      <div className="newQuotesDetail-Div">
        <label>No. {String(order._id).slice(-5)}</label>
        <label>
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
      </div>

      <div className="newOrderDets-Scroll">
        {/* Items */}
        <div className="paymentValidationProducts-Div">
          {order.items && order.items.length > 0 ? (
            order.items.map((item, index) => (
              <div key={index} className="newOrderDets-Div">
                <div className="orderDetails-Div">
                  <label className="orderDets-Label">
                    <b>{item.product}</b>
                  </label>
                  <label className="orderDets-Label">
                    <b>Cantidad:</b> {item.amount}
                  </label>
                  <label className="orderDets-Label">
                    <b>Precio Unitario:</b> ${item.price}
                  </label>
                  <label className="newOrderDetsTotal-Label">
                     <b>Total USD:</b> ${order.totals?.[0]?.finalAllUSD ?? "0.00"}
                  </label>
                  <label className="newOrderDetsTotal-Label">
                     <b>Total MXN:</b> ${order.totals?.[0]?.finalAllMXN ?? "0.00"}
                  </label>
                </div>
              </div>
            ))
          ) : (
            <p>No hay productos en este pedido.</p>
          )}
        </div>

        {/* Payment details */}
        <div className="paymentDetails-Div">
          <div className="paymentDets-Dropdown">
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Método de Pago</label>
            </div>
            <select
              className="paymentDets-Select"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="">Selecciona método</option>
              <option value="Efectivo">01: Efectivo</option>
              <option value="Cheque Nominativo">02: Cheque Nominativo</option>
              <option value="Transferencia electrónica de fondos">
                03: Transferencia electrónica de fondos
              </option>
              <option value="Tarjeta de crédito">04: Tarjeta de crédito</option>
            </select>
          </div>

          <div className="paymentDets-Dropdown">
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Cuenta de Recepción</label>
            </div>
            <select
              className="paymentDets-Select"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">Selecciona cuenta</option>
              <option value="BBVA *1207">MXN: BBVA *1207</option>
              <option value="BBVA *4078">MXN: BBVA *4078</option>
              <option value="MONEX *8341">USD: MONEX *8341</option>
              <option value="INVEX *4234">USD: INVEX *4234</option>
            </select>
          </div>

          <div className="paymentDets-Dropdown">
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Evidencia de Pago</label>
              <div className="existingQuote-Div">
                {order?.evidenceFileExt ? (
                  <EvidenceGallery
                    orderId={orderId}
                    evidenceFileExt={order.evidenceFileExt}
                  />
                ) : (
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Aún no hay evidencia de pago cargada por el cliente.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Evidence preview + actions */}
          <div className="paymentEvidence-Div" style={{ gap: 12, alignItems: "center" }}>
            <img
              src={evidenceUrl}
              // src={evidenceUrl || TicketFallback}
              // alt="Evidencia de pago"
              // width="85"
              // height="85"
              style={{ cursor: evidenceUrl ? "zoom-in" : "default", objectFit: "cover" }}
              onClick={evidenceUrl ? () => setIsLightboxOpen(true) : undefined}
              // onError={(e) => {
              //   e.currentTarget.src = TicketFallback;
              // }}
            />

            {/* <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <a
                href={evidenceUrl || "#"}
                download={
                  order?.evidenceFile?.filename ||
                  order?.paymentEvidence?.filename ||
                  `evidencia_${String(order._id).slice(-5)}.jpg`
                }
                style={{ pointerEvents: evidenceUrl ? "auto" : "none", color: evidenceUrl ? "#1976d2" : "#999" }}
              >
                Descargar evidencia
              </a>
            </div> */}
          </div>
        </div>

        {/* Validate */}
        <div className="validatePaymentSubmitBtn-Div">
          <button className="submitOrder-Btn" type="submit" onClick={handleValidatePayment}>
            Validar Pago
          </button>
        </div>

        {isValidated && <p style={{ color: "green" }}>Estado actualizado a "Pago Verificado"</p>}
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

      {/* LIGHTBOX */}
      {isLightboxOpen && evidenceUrl && (
        <div
          onClick={closeLightbox}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "95vw", maxHeight: "95vh" }}>
            <img
              src={evidenceUrl}
              alt="Evidencia de pago (ampliada)"
              style={{ maxWidth: "95vw", maxHeight: "90vh", display: "block", borderRadius: 8 }}
            />
            <button
              onClick={closeLightbox}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "rgba(0,0,0,0.6)",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 14,
              }}
              aria-label="Cerrar"
              title="Cerrar (Esc)"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </body>
  );
}