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

  // ===== NEW: Mongo Billing data =====
  const [billingData, setBillingData] = useState(null);

  // ===== Shipping method selector =====
  // "Enviar" (default) | "Recoger en matriz"
  const [shipMethod, setShipMethod] = useState("Enviar");
  const isPickup = shipMethod === "Recoger en matriz";

  // ✅ NEW: Payment method for shipping (only when "Enviar")

  const shippingPaymentMethod = useMemo(() => {
    return String(order?.shipPayMethod || "").trim();
  }, [order?.shipPayMethod]);


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

      // ✅ Recognize the string form ("Recoger en Matriz") and the object flags
      const pickupByString =
        typeof o?.shippingInfo === "string" &&
        o.shippingInfo.trim().toLowerCase() === "recoger en matriz";

      const pickupByObject =
        !!(o?.shippingInfo && (o.shippingInfo.pickup === true || o.shippingInfo?.method === "pickup"));

      const pickupFlag = pickupByString || pickupByObject;

      setShipMethod(pickupFlag ? "Recoger en matriz" : "Enviar");

      // ✅ NEW: preload shipping payment method if you later persist it (optional)
      // Try to read it from order.shippingInfo.shipPayMethod or order.shipPayMethod if exists.
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
        // USER
        const userRes = await axios.get(`${API}/users/by-email`, {
          params: { email },
        });
  
        if (!cancelled) {
          setMongoUser(userRes.data || null);
        }
  
        // BILLING ADDRESS
        try {
          const billingRes = await axios.get(`${API}/by-email`, {
            params: { email },
          });
  
          if (!cancelled) {
            setBillingData(billingRes.data || null);
          }
        } catch (billingErr) {
          console.error("Billing fetch error:", billingErr);
          if (!cancelled) setBillingData(null);
        }
  
        if (!cancelled) setMongoError(null);
  
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

  // ✅ If switch to pickup, clear payment method (since it doesn't apply)

  // Convenience getters from Mongo
  const displayName = useMemo(() => {
    const nombre = (mongoUser?.nombre || "").trim();
    const apellido = (mongoUser?.apellido || "").trim();
    const full = [nombre, apellido].filter(Boolean).join(" ");
    return full || order?.userEmail || "";
  }, [mongoUser, order?.userEmail]);  

  const preferredCarrier = useMemo(() => {
    return (order?.preferredCarrier || "").toString().trim();
  }, [order?.preferredCarrier]);
  
  const insureShipmentLabel = useMemo(() => {
    const val = order?.insureShipment; // ✅ schema field is insureShipment
    if (val === true) return "Sí";
    if (val === false) return "No";
    return "";
  }, [order?.insureShipment]);

  // ===== pick latest totals snapshot (object or last array element)
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

  // ===== Insured amount in MXN (robust)
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

    let usd = 0,
      mxn = 0;
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
    return mxn || 0;
  }, [totalsSnap, order?.items, order?.totals]);

  if (!order) return <p>Cargando pedido...</p>;

  // ===== object-based shipping/billing with array fallback =====
  const shipRaw = order?.shippingInfo;
  const billRaw = order?.billingInfo;

  const shipIsArray = Array.isArray(shipRaw);
  const billIsArray = Array.isArray(billRaw);

  // Shipping (object first, array fallback)
  const sCalle = shipIsArray ? shipRaw?.[0] || "" : shipRaw?.calleEnvio || "";
  const sExt = shipIsArray ? shipRaw?.[1] || "" : shipRaw?.exteriorEnvio || "";
  const sInt = shipIsArray ? shipRaw?.[2] || "" : shipRaw?.interiorEnvio || "";
  const sCol = shipIsArray ? shipRaw?.[3] || "" : shipRaw?.coloniaEnvio || "";
  const sCiudad = shipIsArray ? shipRaw?.[4] || "" : shipRaw?.ciudadEnvio || "";
  const sEstado = shipIsArray ? shipRaw?.[5] || "" : shipRaw?.estadoEnvio || "";
  const sCP = shipIsArray ? shipRaw?.[6] || "" : shipRaw?.cpEnvio || "";

  // Billing (object first, array fallback)
  const bRazon = billIsArray ? billRaw?.[0] || "" : billRaw?.razonSocial || "";
  const bRFC = billIsArray ? billRaw?.[1] || "" : billRaw?.rfcEmpresa || "";
  const bCalle = billIsArray ? billRaw?.[2] || "" : billRaw?.calleFiscal || "";
  const bExt = billIsArray ? billRaw?.[4] || "" : billRaw?.exteriorFiscal || "";
  const bInt = billIsArray ? billRaw?.[5] || "" : billRaw?.interiorFiscal || "";
  const bCol = billIsArray ? billRaw?.[6] || "" : billRaw?.coloniaFiscal || "";
  const bCiudad = billIsArray ? billRaw?.[7] || "" : billRaw?.ciudadFiscal || "";
  const bEstado = billIsArray ? billRaw?.[8] || "" : billRaw?.estadoFiscal || "";
  const bCP = billIsArray ? billRaw?.[9] || "" : billRaw?.cpFiscal || "";

  // ==== Pickup rendering helpers (handle string "Recoger en Matriz") ====
  const isPickupFromString =
    typeof shipRaw === "string" && shipRaw.trim().toLowerCase() === "recoger en matriz";

  const pickupDetails = order?.pickupDetails || null;

  const fmtDMY = (isoLike) => {
    if (!isoLike) return "";
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return String(isoLike);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const pickupLine = (() => {
    if (!pickupDetails) return "";
    const d = fmtDMY(pickupDetails.date);
    const t = (pickupDetails.time || "").trim();
    if (d && t) return `${d} • ${t}`;
    return d || t || "";
  })();

  // ===== SHIPPING LABEL =====
  const generateShippingLabel = async (order) => {
    // ✅ CHANGE SIZE: 13.5cm x 16cm => 135mm x 160mm
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [135, 160] });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

    const fmtMXN = (v) =>
      `$${(Number(v) || 0).toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} MXN`;

    // Insured amount (robust)
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
        const items = Array.isArray(order?.items) ? order.items : [];
        const rate = Number(snap.dofRate ?? order?.totals?.dofRate);
        const normCur = (v) => String(v ?? "USD").trim().toUpperCase();
        let usd = 0,
          mxn = 0;
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
        insuredAmountMXN = hasRate ? mxn + usd * rate : mxn || 0;
      }
    }

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Pedido #: ${String(order._id).slice(-5)}`, pageWidth - 45, 7);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-MX")}`, pageWidth - 45, 12);

    doc.setFont("helvetica", "bold");
  
    doc.setFontSize(7.5);
    doc.text("Remitente:", 10, 20);
 
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");

    doc.text("GREEN IMPORT SOLUTIONS", 10, 24);
    doc.text("Monte Everest #2428", 10, 28);
    doc.text("Col. La Federacha", 10, 32);
    doc.text("Guadalajara, Jalisco", 10, 36);
    doc.text("C.P. 44300", 10, 40);
    doc.text("Tel. 01 (33) 2016 8274", 10, 44);

    doc.setFont("helvetica", "bold");
  
    doc.setFontSize(7.5);
    doc.text("Destinatario:", 10, 52);
  
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");

    const recName = displayName || "";
    const recStreet = `${sCalle}${sCalle ? " " : ""}${sExt ? `#${sExt}` : ""}${sInt ? ` Int. ${sInt}` : ""}`.trim();
    const recCol = sCol;
    const recCityState = `${sCiudad}${sCiudad && sEstado ? ", " : ""}${sEstado}`;
    const recCP = sCP;

    doc.text(recName, 10, 56);
    if (recStreet) doc.text(recStreet, 10, 60);
    if (recCol) doc.text(`Col. ${recCol}`, 10, 64);
    if (recCityState) doc.text(recCityState, 10, 68);
    if (recCP) doc.text(`C.P. ${recCP}`, 10, 72);

    // NEW MAY19
    // ==========================
    // DATOS DE FACTURACIÓN
    // ==========================

    const fact = billingData || {};

    const razonSocial = fact?.razonSocial || "";
    const rfcEmpresa = fact?.rfcEmpresa || "";
    const calleFiscal = fact?.calleFiscal || "";
    const exteriorFiscal = fact?.exteriorFiscal || "";
    const interiorFiscal = fact?.interiorFiscal || "";
    const coloniaFiscal = fact?.coloniaFiscal || "";
    const ciudadFiscal = fact?.ciudadFiscal || "";
    const estadoFiscal = fact?.estadoFiscal || "";
    const cpFiscal = fact?.cpFiscal || "";

    doc.setFont("helvetica", "bold");
  
    doc.setFontSize(7.5);

    doc.text("Datos de Facturación:", 10, 80);
 
    doc.setFontSize(6.5);

    doc.setFont("helvetica", "normal");

    let fy = 84;

    if (razonSocial) {
      doc.text(razonSocial, 10, fy);
      fy += 3.5;
    }

    if (rfcEmpresa) {
      doc.text(`RFC: ${rfcEmpresa}`, 10, fy);
      fy += 3.5;
    }

    const fiscalStreet =
      `${calleFiscal}${calleFiscal ? " " : ""}` +
      `${exteriorFiscal ? `# ${exteriorFiscal}` : ""}` +
      `${interiorFiscal ? ` Int. ${interiorFiscal}` : ""}`;

    if (fiscalStreet.trim()) {
      doc.text(fiscalStreet.trim(), 10, fy);
      fy += 3.5;
    }

    if (coloniaFiscal) {
      doc.text(`Col. ${coloniaFiscal}`, 10, fy);
      fy += 3.5;
    }

    const fiscalCityState =
      `${ciudadFiscal}${ciudadFiscal && estadoFiscal ? ", " : ""}${estadoFiscal}`;

    if (fiscalCityState.trim()) {
      doc.text(fiscalCityState, 10, fy);
      fy += 3.5;
    }

    if (cpFiscal) {
      doc.text(`C.P. ${cpFiscal}`, 10, fy);
      fy += 3.5;
    }

    doc.setFont("helvetica", "bold");
 
    doc.setFontSize(7.5);
    doc.text("Transportista:", 75, 80);

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");

    doc.text(`${preferredCarrier || ""}`, 75, 84);

    // ✅ NEW: Print shipping payment method on label (only if set and not pickup)
    if (!isPickup && shippingPaymentMethod) {
      doc.setFont("helvetica", "bold");
  
      doc.setFontSize(7.5);
      doc.text("Método pago envío:", 75, 91);
     
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.text(String(shippingPaymentMethod), 75, 95);
    }

    if (insureShipmentLabel === "Sí") {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 0, 0);
      doc.text(["¡ENVIAR PAQUETE", "ASEGURADO!"], 75, 38);
      doc.setFontSize(9);
      doc.text("Monto Asegurado:", 75, 46);
      doc.text(`${fmtMXN(insuredAmountMXN)}`, 75, 50);
      doc.setTextColor(0, 0, 0);
    }

    const existing = (order.trackingNumber || "").trim();
    const generated = `GIS-${String(order._id).slice(-5)}-${Date.now().toString().slice(-6)}`;
    const trackingToUse = existing || generated;

    try {
      // ✅ If you want to persist shipPayMethod, we attach it into shippingInfo object (when possible)
      const nextShippingInfo =
        typeof order.shippingInfo === "object" && order.shippingInfo !== null
          ? { ...order.shippingInfo, shipPayMethod: shippingPaymentMethod }
          : order.shippingInfo;

      // MODIF AUG/05 @ 16:13
      // await axios.patch(
      //   `${API}/orders/${order._id}`,
      //   {
      //     trackingNumber: trackingToUse,
      //     orderStatus: "Etiqueta Generada",
      //     shipPayMethod: shippingPaymentMethod || "",
      //   },
      //   {
      //     headers: {
      //       "Content-Type": "application/json",
      //     },
      
      //     // The endpoint should now respond quickly,
      //     // but this gives it a reasonable safety margin.
      //     timeout: 30000,
      
      //     withCredentials: false,
      //   }
      // );
      await axios.patch(
        `${API}/orders/${order._id}`,
        {
          // Save label/tracking preparation only.
          // Packing completion will move the order to Etiqueta Generada.
          trackingNumber: trackingToUse,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 30000,
          withCredentials: false,
        }
      );
      // MODIF END AUG/05 @ 16:13

    } catch (error) {
      console.error("PATCH /orders/:orderId failed:", error?.response?.data || error.message);
      alert("Error al actualizar el estado del pedido.");
      return;
    }

    doc.save(`Etiqueta_Pedido_${String(order._id).slice(-5)}.pdf`);

    // MODIF AUG/05 @ 16:15
    // alert("Etiqueta generada y estado actualizado.");
    // navigate("/adminHome");
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            trackingNumber: trackingToUse,
          }
        : prev
    );
    
    alert(
      "Etiqueta generada correctamente. El pedido permanecerá en preparación hasta que empaque lo marque como listo."
    );
    
    navigate("/adminHome");
    // MODIF END AUG/05 @ 16:15
  };

  // ===== Mark ready without label (pickup flow) =====
  // MODIF AUG/05 @ 16:15
  // const markReadyPickup = async () => {
  //   if (!order?._id) return;
  //   try {
  //     const nextShipping = {
  //       ...(order.shippingInfo || {}),
  //       pickup: true,
  //       method: "pickup",
  //     };

  //     await axios.patch(
  //       `${API}/orders/${order._id}`,
  //       {
  //         shippingInfo: nextShipping,
  //         orderStatus: "Etiqueta Generada",
  //       },
  //       { headers: { "Content-Type": "application/json" } }
  //     );

  //     alert("Pedido listo para entregar en matriz.");
  //     navigate("/deliverReady");
  //   } catch (e) {
  //     console.error("Pickup ready failed:", e?.response?.data || e.message);
  //     alert("No se pudo marcar como listo para entregar.");
  //   }
  // };
  const markReadyPickup = async () => {
    alert(
      "Este pedido será enviado a 'Por Entregar' cuando el equipo de empaque termine y lo marque como listo."
    );
  
    navigate("/adminHome");
  };
  // MODIF END AUG/05 @ 16:15

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

      <div className="edit-titleIcon-Div">
        <label className="editAddress-headerLabel">Detalles de Envío</label>
        <img src={quoterIcon} alt="Home Icon" width="35" height="35" />
      </div>

      <div className="newQuotesDetail-Div">
        <label>Datos de Envío</label>
        <label>Pedido #{String(order._id).slice(-5)}</label>
      </div>

      <div className="newQuotesScroll-Div">
        {/* SHIPPING */}
        <div className="shippingDetails-Div">
          <label className="productDetail-Label">{displayName || order.userEmail}</label>
          <br />

          {isPickupFromString ? (
            <>
              <label className="productDetail-Label" style={{ fontWeight: 600 }}>
                Recoger en Matriz
              </label>
              {pickupLine && <label className="productDetail-Label">{pickupLine}</label>}
              <br />
            </>
          ) : (
            <>
              {(sCalle || sExt || sInt) && (
                <label className="productDetail-Label">
                  {[
                    sCalle || "",
                    [sExt && `#${sExt}`, sInt && `Int. ${sInt}`].filter(Boolean).join(" "),
                  ]
                    .filter(Boolean)
                    .join(" ")
                    .trim()}
                </label>
              )}
              {sCol && <label className="productDetail-Label">Col. {sCol}</label>}
              {(sCiudad || sEstado) && (
                <label className="productDetail-Label">
                  {sCiudad}
                  {sCiudad && sEstado ? ", " : ""}
                  {sEstado}
                </label>
              )}
              {sCP && <label className="productDetail-Label">C.P.: {sCP}</label>}
              <br />
            </>
          )}
        </div>

        {/* Shipping Method Choice */}
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

          {/* ✅ NEW: Método de pago de envío (only when shipping) */}
          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", marginBottom: 6 }}>
              Método de pago de envío
            </label>

            <div
              className="shippingDetails-Div"
              style={{
                margin: 0,
                padding: "10px 12px",
              }}
            >
              <label className="productDetail-Label">
                {isPickup
                  ? "No aplica — recoger en matriz"
                  : shippingPaymentMethod || "No especificado por el cliente"}
              </label>
            </div>
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
          <label className="productDetail-Label">{preferredCarrier || "No especificado"}</label>
          <br />
          <label className="shippingMethod-Label">Mercancía Asegurada</label>
          <label className="productDetail-Label">{insureShipmentLabel || "No especificado"}</label>
          <br />

          {insureShipmentLabel === "Sí" && (
            <>
              <label className="shippingMethod-Label">Monto Asegurado</label>
              <label className="productDetail-Label">{fmtMXNScreen(insuredAmountMXN)}</label>
              <br />
            </>
          )}
          <br />
        </div>

        {/* BUTTONS */}
        <div className="generateLabel-Div" style={{ display: "flex", gap: 12 }}>
          {!isPickup && (
            <button
              className="packDetails-Btn"
              type="button"
              onClick={() => generateShippingLabel(order)}
            >
              Generar Etiqueta
            </button>
          )}

          {/* MODIF AUG/05 @ 16:18 */}
          {/* {isPickup && (
            <button className="packDetails-Btn" type="button" onClick={markReadyPickup}>
              Listo para Entregar
            </button>
          )} */}
          {isPickup && (
            <button
              className="packDetails-Btn"
              type="button"
              onClick={() => navigate("/adminHome")}
            >
              Volver
            </button>
          )}
          {/* MODIF END AUG/05 @ 16:18 */}
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
    </body>
  );
}



