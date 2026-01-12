// in my manageDeliveryDetails.jsx, I'd like to add the amount for which the order is insured, which equals to the orders total. For this piece of info, we'll be using MongoDb's field "totalAllMXN". Show this amount in the following places: within the screen, right under "Mercancía Asegurada" add field "Monto Asegurado". As well when generating label, bring the "Enviar Paquete Asegurado!" text a but up and right underneath that text, in red as well, add text "Monto Asegurado" and the same amount. Here is my manageDeliveryDetails.jsx, please direct edit
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

  // MXN money formatter (screen)
  const fmtMXNScreen = (v) =>
    `$${(Number(v) || 0).toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
  })} MXN`;

  // ===== NEW: Mongo user data (by email) =====
  const [mongoUser, setMongoUser] = useState(null);
  const [mongoError, setMongoError] = useState(null);

  // ===== NEW: Shipping method selector =====
  // "Enviar" (default) | "Recoger en matriz"
  const [shipMethod, setShipMethod] = useState("Enviar");

  const isPickup = shipMethod === "Recoger en matriz";

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
      const o = response.data;
      setOrder(o);

      // Preselect method from order.shippingInfo.pickup if available
      const pickupFlag =
        (o?.shippingInfo && (o.shippingInfo.pickup === true || o.shippingInfo?.method === "pickup")) ? true : false;
      setShipMethod(pickupFlag ? "Recoger en matriz" : "Enviar");
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
    return "";
  }, [mongoUser]);

  // ===== NEW: pick latest totals snapshot (object or last array element)
  const totalsSnap = useMemo(() => {
    const t = order?.totals;
      if (!t) return null;
      if (Array.isArray(t)) {
        for (let i = t.length - 1; i >= 0; i--) {
          const s = t[i];
          if (s && typeof s === "object") return s;
        }
        return null;
      }
      if (typeof t === "object") return t;
      return null;
  }, [order?.totals]);
  
  // ===== NEW: Insured amount in MXN (robust)
  const insuredAmountMXN = useMemo(() => {
    const snap = totalsSnap || {};

    // 1) Preferred keys
    const fromTotalAllMXN = Number(snap.totalAllMXN);
    if (Number.isFinite(fromTotalAllMXN) && fromTotalAllMXN > 0) return fromTotalAllMXN;
  
    // 2) Alternate keys sometimes used
    const alt = Number(snap.finalAllMXN ?? snap.totalMXNNative);
    if (Number.isFinite(alt) && alt > 0) return alt;
  
    // 3) Fallback: compute from items + dofRate
    const rate = Number(snap.dofRate ?? order?.totals?.dofRate);
    const items = Array.isArray(order?.items) ? order.items : [];
    const normCur = (v) => String(v ?? "USD").trim().toUpperCase();
  
    let usd = 0, mxn = 0;
    for (const it of items) {
      const qty = Number(it?.amount) || 0;
      const cur = normCur(it?.currency);
      if (cur === "MXN") {
        const unit = Number(it?.priceMXN ?? it?.price) || 0;
        mxn += qty * unit;
      } else {
        const unit = Number(it?.priceUSD ?? it?.price) || 0;
        usd += qty * unit;
      }
    }
    const hasRate = Number.isFinite(rate) && rate > 0;
    if (hasRate) return mxn + usd * rate;
    // No FX: at least return the MXN native subtotal
    return mxn || 0;
  }, [totalsSnap, order?.items, order?.totals]);

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

  // Billing (object first, array fallback)
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

    // dec21
    const fmtMXN = (v) =>
      `$${(Number(v) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

    // // Compute insured amount in MXN (order total expressed in MXN)
    // const rate = Number(order?.totals?.dofRate) || 0;
    // const items = Array.isArray(order?.items) ? order.items : [];
    // const normCur = (v) => String(v ?? "USD").trim().toUpperCase();
    // const isUSD = (it) => normCur(it.currency) === "USD";
    // const isMXN = (it) => normCur(it.currency) === "MXN";
    
    // // Prefer server-computed combined MXN if available
    // let insuredAmountMXN = Number.isFinite(order?.totals?.totalAllMXN)
    //   ? Number(order.totals.totalAllMXN)
    //   : null;
    
    // if (insuredAmountMXN == null) {
    //   const subtotalUSD = items.reduce(
    //     (s, it) => s + (isUSD(it) ? (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0) : 0),
    //     0
    //   );
    //   const subtotalMXN = items.reduce(
    //     (s, it) => s + (isMXN(it) ? (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0) : 0),
    //     0
    //   );
    //   if (subtotalMXN && !subtotalUSD) {
    //     insuredAmountMXN = subtotalMXN;
    //   } else if (!subtotalMXN && subtotalUSD && rate) {
    //     insuredAmountMXN = subtotalUSD * rate;
    //   } else if (subtotalMXN && subtotalUSD && rate) {
    //     insuredAmountMXN = subtotalMXN + subtotalUSD * rate;
    //   } else {
    //     insuredAmountMXN = null;
    //   }
    // }
    
    // Insured amount (robust): pick latest totals snapshot, try multiple keys, fallback to compute
    const pickTotalsSnap = (t) => {
      if (!t) return null;
      if (Array.isArray(t)) {
        for (let i = t.length - 1; i >= 0; i--) {
          const s = t[i];
          if (s && typeof s === "object") return s;
        }
        return null;
      }
      if (typeof t === "object") return t;
      return null;
    };
    const snap = pickTotalsSnap(order?.totals) || {};
    let insuredAmountMXN = Number(snap.totalAllMXN);
    if (!(Number.isFinite(insuredAmountMXN) && insuredAmountMXN > 0)) {
      const alt = Number(snap.finalAllMXN ?? snap.totalMXNNative);
      if (Number.isFinite(alt) && alt > 0) {
        insuredAmountMXN = alt;
      } else {
        // Compute fallback from items + dofRate
        const items = Array.isArray(order?.items) ? order.items : [];
        const rate = Number(snap.dofRate ?? order?.totals?.dofRate);
        const normCur = (v) => String(v ?? "USD").trim().toUpperCase();
        let usd = 0, mxn = 0;
        for (const it of items) {
          const qty = Number(it?.amount) || 0;
          const cur = normCur(it?.currency);
          if (cur === "MXN") {
            const unit = Number(it?.priceMXN ?? it?.price) || 0;
            mxn += qty * unit;
          } else {
            const unit = Number(it?.priceUSD ?? it?.price) || 0;
            usd += qty * unit;
          }
        }
        const hasRate = Number.isFinite(rate) && rate > 0;
        insuredAmountMXN = hasRate ? (mxn + usd * rate) : mxn || 0;
      }
    }
  
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
      // doc.text(["¡ENVIAR PAQUETE", "ASEGURADO!"], 55, 104);
      // doc.setTextColor(0, 0, 0);
      // Move the heading a bit UP
      doc.text(["¡ENVIAR PAQUETE", "ASEGURADO!"], 55, 80);
      // Red Monto Asegurado right UNDER the heading
      doc.setFontSize(9);
      // doc.text(`Monto Asegurado: ${fmtMXN(insuredAmountMXN)}`, 55, 112);
      doc.text("Monto Asegurado:", 55, 90);
      doc.text(`${fmtMXN(insuredAmountMXN)}`, 55, 95);

      doc.setTextColor(0, 0, 0);
    }
  
    // Gray box for tracking
    doc.setDrawColor(0);
    doc.setFillColor(200, 200, 200);
    doc.rect(10, 115, 80, 20, "F");
    doc.setFontSize(8);
    doc.text("Código de rastreo", 30, 122);
  
    // Ensure tracking number + ETIQUETA_GENERADA on server
    const existing = (order.trackingNumber || "").trim();
    const generated = `GIS-${String(order._id).slice(-5)}-${Date.now().toString().slice(-6)}`;
    const trackingToUse = existing || generated;
  
    try {
      await axios.patch(
        `${API}/orders/${order._id}`,
        { trackingNumber: trackingToUse, orderStatus: "Etiqueta Generada" },
        { headers: { "Content-Type": "application/json" }, timeout: 15000, withCredentials: false }
      );
    } catch (error) {
      console.error("PATCH /orders/:orderId failed:", error?.response?.data || error.message);
      alert("Error al actualizar el estado del pedido.");
      return;
    }
  
    doc.save(`Etiqueta_Pedido_${String(order._id).slice(-5)}.pdf`);
  
    alert("Etiqueta generada y estado actualizado.");
    navigate("/adminHome");
  };

  // ===== NEW: Mark ready without label (pickup flow) =====
  const markReadyPickup = async () => {
    if (!order?._id) return;
    try {
      // Persist pickup flag into shippingInfo, keep other fields
      const nextShipping = {
        ...(order.shippingInfo || {}),
        pickup: true,
        method: "pickup",
      };

      await axios.patch(
        `${API}/orders/${order._id}`,
        {
          shippingInfo: nextShipping,
          orderStatus: "Etiqueta Generada",
        },
        { headers: { "Content-Type": "application/json" } }
      );

      alert("Pedido listo para entregar en matriz.");
      navigate("/deliverReady");
    } catch (e) {
      console.error("Pickup ready failed:", e?.response?.data || e.message);
      alert("No se pudo marcar como listo para entregar.");
    }
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

        {/* ===== NEW: Shipping Method Choice ===== */}
        <div className="shippingMethod-Div">
          <label>Detalles de Envío</label>
          <div style={{ marginTop: 8 }}>
            <select
              className="sectionFilter-Dropdown"
              value={shipMethod}
              onChange={(e) => setShipMethod(e.target.value)}
            >
              <option>Enviar</option>
              <option>Recoger en matriz</option>
            </select>
          </div>
        </div>

        {/* Paquetería / Asegurada block — gray & disabled when pickup */}
        <div
          className="shippingDetails-Div"
          style={{
            opacity: isPickup ? 0.45 : 1,
            pointerEvents: isPickup ? "none" : "auto",
            filter: isPickup ? "grayscale(100%)" : "none",
            transition: "opacity .2s ease",
          }}
        >
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
          {/* NEW: Monto Asegurado (from Mongo totals.totalAllMXN) */}
          <label className="shippingMethod-Label">Monto Asegurado</label>
          <label className="productDetail-Label">
            {fmtMXNScreen(insuredAmountMXN)}
          </label>
          <br />
        </div>

        {/* BUTTONS DIV */}
        <div className="generateLabel-Div" style={{ display: "flex", gap: 12 }}>
          {/* Hide "Generar Etiqueta" if pickup */}
          {!isPickup && (
            <button
              className="packDetails-Btn"
              type="button"
              onClick={() => generateShippingLabel(order)}
            >
              Generar Etiqueta
            </button>
          )}

          {/* Show "Listo para Entregar" if pickup */}
          {isPickup && (
            <button
              className="packDetails-Btn"
              type="button"
              onClick={markReadyPickup}
            >
              Listo para Entregar
            </button>
          )}
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







// // In manageDeliveryDetails.jsx, currently we only have the option of handling shipping address. I'd like to add option of admin selecting "Recoger en Matriz", as to signal that the order will be picked up by the customer directly at the store. Under "Detalles de Envío" lets place a dropdown menu with options "Recoger en matriz" & "Enviar". If "recoger en matriz" is selected, then "gray out" or turn off the div that displays "Paqueteria" & "Mercancia Asegurada", as well as the "Generar Etiqueta" button. Instead, just add a button "listo para entregar", which marks this order as "Etiqueta Generada" and sends it to the next step within the flow without actually generating a label, since its not needed. If admin selects "Enviar", then keep everything as it currently is. This is my current manageDeliveryDetails.jsx file, please direct edit. 
// import { useEffect, useState, useMemo } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import axios from "axios";

// import jsPDF from "jspdf";
// import "jspdf-autotable";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import quoterIcon from "/src/assets/images/Icono_Cotiza.png";

// import { API } from "/src/lib/api";

// import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import { docDesign } from "/src/components/documentDesign"; // Adjust path if needed

// export default function ManageDeliveryDetails() {
//   const { orderId } = useParams();
//   const navigate = useNavigate();

//   const [order, setOrder] = useState(null);

//   // ===== NEW: Mongo user data (by email) =====
//   const [mongoUser, setMongoUser] = useState(null);
//   const [mongoError, setMongoError] = useState(null);

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

//   useEffect(() => {
//     fetchOrderDetails();
//   }, [orderId]);

//   const fetchOrderDetails = async () => {
//     try {
//       const response = await axios.get(`${API}/orders/${orderId}`);
//       setOrder(response.data);
//     } catch (err) {
//       console.error("Error fetching order:", err);
//     }
//   };

//   // Fetch Mongo user once we know the order (need order.userEmail)
//   useEffect(() => {
//     const email = (order?.userEmail || "").trim().toLowerCase();
//     if (!email) return;

//     let cancelled = false;
//     (async () => {
//       try {
//         const res = await axios.get(`${API}/users/by-email`, { params: { email } });
//         if (cancelled) return;
//         setMongoUser(res.data || null);
//         setMongoError(null);
//       } catch (e) {
//         if (cancelled) return;
//         console.error("GET /users/by-email error:", e);
//         setMongoUser(null);
//         setMongoError("No se pudo obtener el usuario de Mongo.");
//       }
//     })();
//     return () => {
//       cancelled = true;
//     };
//   }, [order?.userEmail]);

//   // Convenience getters from Mongo
//   const displayName = useMemo(() => {
//     const nombre = (mongoUser?.nombre || "").trim();
//     const apellido = (mongoUser?.apellido || "").trim();
//     const full = [nombre, apellido].filter(Boolean).join(" ");
//     return full || order?.userEmail || "";
//   }, [mongoUser, order?.userEmail]);

//   const preferredCarrier = useMemo(() => {
//     return (
//       (mongoUser?.shippingPreferences?.preferredCarrier ||
//         mongoUser?.preferredCarrier ||
//         "")?.toString()
//         .trim()
//     );
//   }, [mongoUser]);

//   const insureShipmentLabel = useMemo(() => {
//     const val =
//       mongoUser?.shippingPreferences?.insureShipment ??
//       mongoUser?.insureShipment;
//     if (typeof val === "boolean") return val ? "Sí" : "No";
//     // Fallback if not boolean (undefined/null) → empty string
//     return "";
//   }, [mongoUser]);

//   if (!order) return <p>Cargando pedido...</p>;

//   // ===== NEW: object-based shipping/billing with array fallback =====
//   const shipRaw = order?.shippingInfo;
//   const billRaw = order?.billingInfo;

//   const shipIsArray = Array.isArray(shipRaw);
//   const billIsArray = Array.isArray(billRaw);

//   // Shipping (object first, array fallback)
//   const sCalle = shipIsArray ? (shipRaw?.[0] || "") : (shipRaw?.calleEnvio || "");
//   const sExt   = shipIsArray ? (shipRaw?.[1] || "") : (shipRaw?.exteriorEnvio || "");
//   const sInt   = shipIsArray ? (shipRaw?.[2] || "") : (shipRaw?.interiorEnvio || "");
//   const sCol   = shipIsArray ? (shipRaw?.[3] || "") : (shipRaw?.coloniaEnvio || "");
//   const sCiudad= shipIsArray ? (shipRaw?.[4] || "") : (shipRaw?.ciudadEnvio || "");
//   const sEstado= shipIsArray ? (shipRaw?.[5] || "") : (shipRaw?.estadoEnvio || "");
//   const sCP    = shipIsArray ? (shipRaw?.[6] || "") : (shipRaw?.cpEnvio || "");

//   // Billing (object first, array fallback) — not displayed below yet, but ready if you add it
//   const bRazon = billIsArray ? (billRaw?.[0] || "") : (billRaw?.razonSocial || "");
//   const bRFC   = billIsArray ? (billRaw?.[1] || "") : (billRaw?.rfcEmpresa || "");
//   const bCalle = billIsArray ? (billRaw?.[2] || "") : (billRaw?.calleFiscal || "");
//   const bExt   = billIsArray ? (billRaw?.[4] || "") : (billRaw?.exteriorFiscal || "");
//   const bInt   = billIsArray ? (billRaw?.[5] || "") : (billRaw?.interiorFiscal || "");
//   const bCol   = billIsArray ? (billRaw?.[6] || "") : (billRaw?.coloniaFiscal || "");
//   const bCiudad= billIsArray ? (billRaw?.[7] || "") : (billRaw?.ciudadFiscal || "");
//   const bEstado= billIsArray ? (billRaw?.[8] || "") : (billRaw?.estadoFiscal || "");
//   const bCP    = billIsArray ? (billRaw?.[9] || "") : (billRaw?.cpFiscal || "");

//   // ===== SHIPPING LABEL =====
//   const generateShippingLabel = async (order) => {
//     const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [100, 150] });
//     const pageWidth = doc.internal.pageSize.getWidth();
//     const pageHeight = doc.internal.pageSize.getHeight();
//     doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

//     // dec21
//     const fmtMXN = (v) =>
//       `$${(Number(v) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

//     // Compute insured amount in MXN (order total expressed in MXN)
//     const rate = Number(order?.totals?.dofRate) || 0; // DOF rate if available
//     const items = Array.isArray(order?.items) ? order.items : [];
//     const normCur = (v) => String(v ?? "USD").trim().toUpperCase();
//     const isUSD = (it) => normCur(it.currency) === "USD";
//     const isMXN = (it) => normCur(it.currency) === "MXN";
    
//     // Prefer server-computed combined MXN if available
//     let insuredAmountMXN = Number.isFinite(order?.totals?.totalAllMXN)
//     ? Number(order.totals.totalAllMXN)
//     : null;
    
//     if (insuredAmountMXN == null) {
//     // Recompute per currency from line items (natural sums)
//     const subtotalUSD = items.reduce(
//       (s, it) => s + (isUSD(it) ? (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0) : 0),
//       0
//     );
//     const subtotalMXN = items.reduce(
//       (s, it) => s + (isMXN(it) ? (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0) : 0),
//       0
//     );
//     if (subtotalMXN && !subtotalUSD) {
//       insuredAmountMXN = subtotalMXN;
//     } else if (!subtotalMXN && subtotalUSD && rate) {
//       insuredAmountMXN = subtotalUSD * rate;
//     } else if (subtotalMXN && subtotalUSD && rate) {
//       insuredAmountMXN = subtotalMXN + subtotalUSD * rate;
//     } else {
//       insuredAmountMXN = null; // can't compute without rate for USD-only / mixed
//     }
//     }
  
//     doc.setFontSize(9);
//     doc.setFont("helvetica", "normal");
//     doc.text(`Pedido #: ${String(order._id).slice(-5)}`, 65, 7);
//     doc.text(`Fecha: ${new Date().toLocaleDateString("es-MX")}`, 65, 12);
  
//     doc.setFont("helvetica", "bold");
//     doc.text("Remitente:", 10, 20);
//     doc.setFont("helvetica", "normal");
//     doc.text("GREEN IMPORT SOLUTIONS", 10, 25);
//     doc.text("Monte Everest #2428", 10, 30);
//     doc.text("Col. La Federacha", 10, 35);
//     doc.text("Guadalajara, Jalisco", 10, 40);
//     doc.text("C.P. 44300", 10, 45);
//     doc.text("Tel. 01 (33) 2016 8274", 10, 52);
  
//     doc.setFont("helvetica", "bold");
//     doc.text("Destinatario:", 10, 62);
//     doc.setFont("helvetica", "normal");
  
//     const recName = displayName || "";
//     const recStreet = `${sCalle} #${sExt}${sInt ? ` Int. ${sInt}` : ""}`;
//     const recCol = sCol;
//     const recCityState = `${sCiudad}${sCiudad && sEstado ? ", " : ""}${sEstado}`;
//     const recCP = sCP;
  
//     doc.text(recName, 10, 67);
//     doc.text(recStreet, 10, 72);
//     if (recCol) doc.text(`Col. ${recCol}`, 10, 77);
//     if (recCityState) doc.text(recCityState, 10, 82);
//     if (recCP) doc.text(`C.P. ${recCP}`, 10, 87);
  
//     doc.setFont("helvetica", "bold");
//     doc.text("Transportista:", 10, 104);
//     doc.setFont("helvetica", "normal");
//     doc.text(`${preferredCarrier || ""}`, 10, 109);
  
//     if (insureShipmentLabel === "Sí") {
//       doc.setFont("helvetica", "bold");
//       doc.setTextColor(255, 0, 0);
//       doc.text(["¡ENVIAR PAQUETE", "ASEGURADO!"], 55, 104);
//       doc.setTextColor(0, 0, 0);
//     }
  
//     // Gray box for tracking
//     doc.setDrawColor(0);
//     doc.setFillColor(200, 200, 200);
//     doc.rect(10, 115, 80, 20, "F");
//     doc.setFontSize(8);
//     doc.text("Código de rastreo", 30, 122);
  
//     // ✅ Ensure we have /change/ set a tracking number to trigger ETIQUETA_GENERADA
//     // Reuse existing if present; otherwise generate one
//     const existing = (order.trackingNumber || "").trim();
//     const generated = `GIS-${String(order._id).slice(-5)}-${Date.now().toString().slice(-6)}`;
//     const trackingToUse = existing || generated;
  
//     // Print the tracking code inside the gray box
//     // doc.setFont("helvetica", "bold");
//     // doc.setFontSize(11);
//     // doc.text(trackingToUse, 20, 130); // centered-ish visually in your box
  
//     // ---- Server update FIRST (this triggers the push) ----
//     try {
//       await axios.patch(
//         `${API}/orders/${order._id}`,
//         {
//           // ⬇️ This is the key: sending trackingNumber so the backend triggers ETIQUETA_GENERADA
//           trackingNumber: trackingToUse,
//           // keep your cosmetic status for UI/filters
//           orderStatus: "Etiqueta Generada",
//         },
//         {
//           headers: { "Content-Type": "application/json" },
//           timeout: 15000,
//           withCredentials: false,
//         }
//       );
//     } catch (error) {
//       console.error("PATCH /orders/:orderId failed:", error?.response?.data || error.message);
//       alert("Error al actualizar el estado del pedido.");
//       return; // stop if we couldn't update on the server
//     }
  
//     // ---- Then save the PDF locally ----
//     doc.save(`Etiqueta_Pedido_${String(order._id).slice(-5)}.pdf`);
  
//     alert("Etiqueta generada y estado actualizado.");
//     // navigate("/deliverReady");
//     navigate("/adminHome");

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
//       {/* LOGOS END*/}

//       <div className="edit-titleIcon-Div">
//         <label className="editAddress-headerLabel">Detalles de Envío</label>
//         <img src={quoterIcon} alt="Home Icon" width="35" height="35" />
//       </div>

//       <div className="newQuotesDetail-Div">
//         <label>Datos de Envío</label>
//         <label>Pedido #{String(order._id).slice(-5)}</label>
//       </div>

//       <div className="newQuotesScroll-Div">
//         {/* SHIPPING (object-based, with array fallback) */}
//         <div className="shippingDetails-Div">
//           <label className="productDetail-Label">{displayName || order.userEmail}</label>
//           <br />
//           <label className="productDetail-Label">
//             {sCalle} #{sExt} {sInt ? `Int. ${sInt}` : ""}
//           </label>
//           {sCol && <label className="productDetail-Label">Col. {sCol}</label>}
//           <label className="productDetail-Label">
//             {sCiudad}{sCiudad && sEstado ? ", " : ""}{sEstado}
//           </label>
//           {sCP && <label className="productDetail-Label">C.P.: {sCP}</label>}
//           <br />
//         </div>

//         <div className="shippingMethod-Div">
//           <label>Detalles de Envío</label>
//         </div>

//         <div className="shippingDetails-Div">
//           <label className="shippingMethod-Label">Paquetería</label>
//           <label className="productDetail-Label">
//             {preferredCarrier || "No especificado"}
//           </label>
//           <br />
//           <label className="shippingMethod-Label">Mercancía Asegurada</label>
//           <label className="productDetail-Label">
//             {insureShipmentLabel || "No especificado"}
//           </label>
//           <br />
//         </div>

//         {/* BUTTONS DIV */}
//         <div className="generateLabel-Div">
//           <button
//             className="packDetails-Btn"
//             type="button"
//             onClick={() => generateShippingLabel(order)}
//           >
//             Generar Etiqueta
//           </button>
//         </div>
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