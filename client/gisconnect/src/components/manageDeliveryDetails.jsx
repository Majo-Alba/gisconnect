import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

import jsPDF from "jspdf";
import "jspdf-autotable";

import Logo from "/src/assets/images/GIS_Logo.png";
import quoterIcon from "/src/assets/images/Icono_Cotiza.png";

import { API } from "/src/lib/api";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { docDesign } from "/src/components/documentDesign"; // Adjust path if needed

export default function ManageDeliveryDetails() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);

  // ===== NEW: Mongo user data (by email) =====
  const [mongoUser, setMongoUser] = useState(null);
  const [mongoError, setMongoError] = useState(null);

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

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      const response = await axios.get(`${API}/orders/${orderId}`);
      setOrder(response.data);
    } catch (err) {
      console.error("Error fetching order:", err);
    }
  };

  // Fetch Mongo user once we know the order (need order.userEmail)
  useEffect(() => {
    const email = (order?.userEmail || "").trim().toLowerCase();
    if (!email) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/users/by-email`, { params: { email } });
        if (cancelled) return;
        setMongoUser(res.data || null);
        setMongoError(null);
      } catch (e) {
        if (cancelled) return;
        console.error("GET /users/by-email error:", e);
        setMongoUser(null);
        setMongoError("No se pudo obtener el usuario de Mongo.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.userEmail]);

  // Convenience getters from Mongo
  const displayName = useMemo(() => {
    const nombre = (mongoUser?.nombre || "").trim();
    const apellido = (mongoUser?.apellido || "").trim();
    const full = [nombre, apellido].filter(Boolean).join(" ");
    return full || order?.userEmail || "";
  }, [mongoUser, order?.userEmail]);

  const preferredCarrier = useMemo(() => {
    return (
      (mongoUser?.shippingPreferences?.preferredCarrier ||
        mongoUser?.preferredCarrier ||
        "")?.toString()
        .trim()
    );
  }, [mongoUser]);

  const insureShipmentLabel = useMemo(() => {
    const val =
      mongoUser?.shippingPreferences?.insureShipment ??
      mongoUser?.insureShipment;
    if (typeof val === "boolean") return val ? "Sí" : "No";
    // Fallback if not boolean (undefined/null) → empty string
    return "";
  }, [mongoUser]);

  if (!order) return <p>Cargando pedido...</p>;

  // ===== NEW: object-based shipping/billing with array fallback =====
  const shipRaw = order?.shippingInfo;
  const billRaw = order?.billingInfo;

  const shipIsArray = Array.isArray(shipRaw);
  const billIsArray = Array.isArray(billRaw);

  // Shipping (object first, array fallback)
  const sCalle = shipIsArray ? (shipRaw?.[0] || "") : (shipRaw?.calleEnvio || "");
  const sExt   = shipIsArray ? (shipRaw?.[1] || "") : (shipRaw?.exteriorEnvio || "");
  const sInt   = shipIsArray ? (shipRaw?.[2] || "") : (shipRaw?.interiorEnvio || "");
  const sCol   = shipIsArray ? (shipRaw?.[3] || "") : (shipRaw?.coloniaEnvio || "");
  const sCiudad= shipIsArray ? (shipRaw?.[4] || "") : (shipRaw?.ciudadEnvio || "");
  const sEstado= shipIsArray ? (shipRaw?.[5] || "") : (shipRaw?.estadoEnvio || "");
  const sCP    = shipIsArray ? (shipRaw?.[6] || "") : (shipRaw?.cpEnvio || "");

  // Billing (object first, array fallback) — not displayed below yet, but ready if you add it
  const bRazon = billIsArray ? (billRaw?.[0] || "") : (billRaw?.razonSocial || "");
  const bRFC   = billIsArray ? (billRaw?.[1] || "") : (billRaw?.rfcEmpresa || "");
  const bCalle = billIsArray ? (billRaw?.[2] || "") : (billRaw?.calleFiscal || "");
  const bExt   = billIsArray ? (billRaw?.[4] || "") : (billRaw?.exteriorFiscal || "");
  const bInt   = billIsArray ? (billRaw?.[5] || "") : (billRaw?.interiorFiscal || "");
  const bCol   = billIsArray ? (billRaw?.[6] || "") : (billRaw?.coloniaFiscal || "");
  const bCiudad= billIsArray ? (billRaw?.[7] || "") : (billRaw?.ciudadFiscal || "");
  const bEstado= billIsArray ? (billRaw?.[8] || "") : (billRaw?.estadoFiscal || "");
  const bCP    = billIsArray ? (billRaw?.[9] || "") : (billRaw?.cpFiscal || "");

  // ===== SHIPPING LABEL =====
  const generateShippingLabel = async (order) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [100, 150] });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Pedido #: ${String(order._id).slice(-5)}`, 65, 7);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-MX")}`, 65, 12);

    doc.setFont("helvetica", "bold");
    doc.text("Remitente:", 10, 20);
    doc.setFont("helvetica", "normal");
    doc.text("GREEN IMPORT SOLUTIONS", 10, 25);
    doc.text("Monte Everest #2428", 10, 30);
    doc.text("Col. La Federacha", 10, 35);
    doc.text("Guadalajara, Jalisco", 10, 40);
    doc.text("C.P. 44300", 10, 45);
    doc.text("Tel. 01 (33) 2016 8274", 10, 52);

    doc.setFont("helvetica", "bold");
    doc.text("Destinatario:", 10, 62);
    doc.setFont("helvetica", "normal");

    // Recipient name from Mongo; address from order shippingInfo
    const recName = displayName || "";
    const recStreet = `${sCalle} #${sExt}${sInt ? ` Int. ${sInt}` : ""}`;
    const recCol = sCol;
    const recCityState = `${sCiudad}${sCiudad && sEstado ? ", " : ""}${sEstado}`;
    const recCP = sCP;

    doc.text(recName, 10, 67);
    doc.text(recStreet, 10, 72);
    if (recCol) doc.text(`Col. ${recCol}`, 10, 77);
    if (recCityState) doc.text(recCityState, 10, 82);
    if (recCP) doc.text(`C.P. ${recCP}`, 10, 87);

    doc.setFont("helvetica", "bold");
    doc.text("Transportista:", 10, 104);
    doc.setFont("helvetica", "normal");
    doc.text(`${preferredCarrier || ""}`, 10, 109);

    if (insureShipmentLabel === "Sí") {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 0, 0);
      doc.text(["¡ENVIAR PAQUETE", "ASEGURADO!"], 55, 104);
      doc.setTextColor(0, 0, 0);
    }

    doc.setDrawColor(0);
    doc.setFillColor(200, 200, 200);
    doc.rect(10, 115, 80, 20, "F");
    doc.setFontSize(8);
    doc.text("Código de rastreo", 30, 128);

    doc.save(`Etiqueta_Pedido_${String(order._id).slice(-5)}.pdf`);

    // sep10
    try {
      await axios.patch(
        `${API}/orders/${order._id}`,
        { orderStatus: "Etiqueta Generada" },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
          withCredentials: false,
        }
      );
    } catch (error) {
      console.error("PATCH /orders/:orderId failed:", error?.response?.data || error.message);
      alert("Error al actualizar el estado del pedido.");
      return; // stop if we couldn't update on the server
    }
    
    // 2) Then save the PDF (after server success)
    doc.save(`Etiqueta_Pedido_${String(order._id).slice(-5)}.pdf`);
    
    alert("Etiqueta generada y estado actualizado.");
    navigate("/deliverReady");
    // try {
    //   await axios.put(`${API}/orders/${order._id}`, {
    //     orderStatus: "Etiqueta Generada",
    //   });
    //   alert("Etiqueta generada y estado actualizado.");
    //   navigate("/deliverReady");
    // } catch (error) {
    //   console.error("Error updating order status:", error);
    //   alert("Error al actualizar el estado del pedido.");
    // }
    // sep10
  };

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
      {/* LOGOS END*/}

      <div className="edit-titleIcon-Div">
        <label className="editAddress-headerLabel">Detalles de Envío</label>
        <img src={quoterIcon} alt="Home Icon" width="35" height="35" />
      </div>

      <div className="newQuotesDetail-Div">
        <label>Datos de Envío</label>
        <label>Pedido #{String(order._id).slice(-5)}</label>
      </div>

      <div className="newQuotesScroll-Div">
        {/* SHIPPING (object-based, with array fallback) */}
        <div className="shippingDetails-Div">
          <label className="productDetail-Label">{displayName || order.userEmail}</label>
          <br />
          <label className="productDetail-Label">
            {sCalle} #{sExt} {sInt ? `Int. ${sInt}` : ""}
          </label>
          {sCol && <label className="productDetail-Label">Col. {sCol}</label>}
          <label className="productDetail-Label">
            {sCiudad}{sCiudad && sEstado ? ", " : ""}{sEstado}
          </label>
          {sCP && <label className="productDetail-Label">C.P.: {sCP}</label>}
          <br />
        </div>

        <div className="shippingMethod-Div">
          <label>Detalles de Envío</label>
        </div>

        <div className="shippingDetails-Div">
          <label className="shippingMethod-Label">Paquetería</label>
          <label className="productDetail-Label">
            {preferredCarrier || "No especificado"}
          </label>
          <br />
          <label className="shippingMethod-Label">Mercancía Asegurada</label>
          <label className="productDetail-Label">
            {insureShipmentLabel || "No especificado"}
          </label>
          <br />
        </div>

        {/* BUTTONS DIV */}
        <div className="generateLabel-Div">
          <button
            className="packDetails-Btn"
            type="button"
            onClick={() => generateShippingLabel(order)}
          >
            Generar Etiqueta
          </button>
        </div>
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