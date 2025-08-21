import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";
import summaryIcon from "/src/assets/images/Icono_fileDownload.png";
import { faHouse, faCartShopping, faCheckToSlot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import ShippingAddress from "../../../../server/models/ShippingAddress";

export default function DeliveredSummary() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);

  // Client DB (Google Sheet)
  const [csvClientData, setCsvClientData] = useState([]);
  const [displayCustomer, setDisplayCustomer] = useState("");
  const [displayCompany, setDisplayCompany] = useState("");

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const CLIENT_DB_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";

  // ===== Fetch order =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrMsg("");
      try {
        const { data } = await axios.get(`http://localhost:4000/orders/${orderId}`);
        if (cancelled) return;
        setOrder(data);
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching order:", err);
        setErrMsg("No pudimos cargar el pedido. Intenta de nuevo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  // ===== Client DB CSV =====
  useEffect(() => {
    axios
      .get(CLIENT_DB_URL)
      .then((res) => setCsvClientData(parseCSV(res.data)))
      .catch((err) => console.error("Error fetching CLIENT DB CSV:", err));
  }, []);

  // Resolve names from client DB (by email)
  useEffect(() => {
    if (!order) return;

    const fbName = (order.customerName || order.userName || order.userEmail || "").toString().trim();
    const fbCompany = (order.companyName || "").toString().trim();
    if (fbName && !displayCustomer) setDisplayCustomer(fbName);
    if (fbCompany && !displayCompany) setDisplayCompany(fbCompany);

    if (csvClientData.length === 0) return;

    const row = findClientRowByEmail(order.userEmail, csvClientData);
    if (row) {
      const fullName =
        row.NOMBRE_APELLIDO || row.NOMBRE_COMPLETO || row.FULL_NAME || "";
      const company =
        row.NOMBRE_EMPRESA || row.EMPRESA || row.RAZON_SOCIAL || row.EMPRESA_CLIENTE || "";
      if (fullName) setDisplayCustomer(fullName.toString().trim());
      if (company) setDisplayCompany(company.toString().trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, csvClientData]);

  // ===== Navigation =====
  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");

  // ===== Helpers =====
  function parseCSV(csvText) {
    const rows = csvText.split(/\r\n/).filter(Boolean);
    const headers = rows[0].split(",").map((h) => h.trim());
    return rows.slice(1).map((line) => {
      const cols = line.split(",");
      const obj = {};
      headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
      return obj;
    });
  }
  const normalize = (s) => (s ?? "").toString().trim().toLowerCase();
  function findClientRowByEmail(email, rows) {
    if (!email) return null;
    return rows.find((r) => normalize(r.CORREO_EMPRESA) === normalize(email)) || null;
  }
  const formatDate = (value) => {
    if (!value) return "Sin fecha";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "Sin fecha";
    const day = d.getDate().toString().padStart(2, "0");
    const month = d.toLocaleString("es-MX", { month: "short" });
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };
  const asCurrency = (amount, currency = "MXN") => {
    const num = Number(amount);
    if (!Number.isFinite(num)) return `— ${currency}`;
    const opts =
      currency === "USD"
        ? { style: "currency", currency: "USD", maximumFractionDigits: 2 }
        : { style: "currency", currency: "MXN", maximumFractionDigits: 2 };
    return num.toLocaleString("es-MX", opts);
  };
  const asNumber = (amount) => {
    const num = Number(amount);
    if (!Number.isFinite(num)) return "—";
    return num.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  function isProbablyUrl(s) {
    if (!s || typeof s !== "string") return false;
    try { const u = new URL(s); return !!u.protocol && !!u.host; } catch { return false; }
  }

  // Address extractor (OBJECT-first, legacy array fallback)
  function extractAddress(addr) {
    if (!addr) return {};
    if (Array.isArray(addr)) {
      const [street, extNo, intNo, colony, city, state, postalCode] = addr;
      return {
        street: street || "",
        exteriorNumber: extNo || "",
        interiorNumber: intNo || "",
        colony: colony || "",
        city: city || "",
        state: state || "",
        postalCode: postalCode || "",
      };
    }
    const firstNonEmpty = (...ks) => {
      for (const k of ks) {
        const v = addr?.[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
      return "";
    };
    return {
      street: firstNonEmpty("street", "calle", "addressLine1", "direccion", "calleEnvio"),
      exteriorNumber: firstNonEmpty("exteriorNumber", "extNumber", "numeroExterior", "noExterior", "numero", "exteriorEnvio"),
      interiorNumber: firstNonEmpty("interiorNumber", "intNumber", "numeroInterior", "noInterior", "interior", "interiorEnvio"),
      colony: firstNonEmpty("colony", "colonia", "neighborhood", "barrio", "coloniaEnvio"),
      city: firstNonEmpty("city", "municipality", "municipio", "localidad", "ciudadEnvio"),
      state: firstNonEmpty("state", "estado", "region", "estadoEnvio"),
      postalCode: firstNonEmpty("postalCode", "cp", "zip", "zipcode", "codigoPostal", "cpEnvio"),
      country: firstNonEmpty("country", "pais"),
      
      contactName: firstNonEmpty("contactName", "contactoNombre"),
      phone: firstNonEmpty("phone", "telefono"),
      email: firstNonEmpty("email", "correo", "correoFiscal"),
      rfc: firstNonEmpty("rfc", "RFC", "rfcEmpresa"),
      businessName: firstNonEmpty("businessName", "razonSocial", "razon_social"),
      taxRegime: firstNonEmpty("taxRegime", "regimenFiscal", "regimen_fiscal"),

      billingStreet: firstNonEmpty("calleFiscal"),
      billingExterior: firstNonEmpty("exteriorFiscal"),
      billingInterior: firstNonEmpty("interiorFiscal"),
      billingColony: firstNonEmpty("coloniaFiscal"),
      billingCity: firstNonEmpty("ciudadFiscal"),
      billingState: firstNonEmpty("estadoFiscal"),
      billingCP: firstNonEmpty("cpFiscal"),
    };
  }

  // Evidence download URLs (adjust to your Express routes if different)
  const fileUrl = (kind, idx) => {
    // Suggested routes:
    //  GET /orders/:orderId/evidence/payment
    //  GET /orders/:orderId/evidence/delivery
    //  GET /orders/:orderId/evidence/packing/:index
    switch (kind) {
      case "payment": return `http://localhost:4000/orders/${orderId}/evidence/payment`;
      case "delivery": return `http://localhost:4000/orders/${orderId}/evidence/delivery`;
      case "packing": return `http://localhost:4000/orders/${orderId}/evidence/packing/${idx ?? 0}`;
      default: return "#";
    }
  };

  // ===== Derivations =====
  const shipping = extractAddress(order?.shippingInfo);
  const billing = extractAddress(order?.billingInfo);

  const items = useMemo(() => (Array.isArray(order?.items) ? order.items : []), [order]);
  const normItems = useMemo(() => {
    return items.map((it) => {
      const qty = Number(it?.amount) || 0;
      const unit = Number(it?.price) || 0; // schema: price is Number (no currency)
      return {
        ...it,
        _qty: qty,
        _unit: unit,
        _lineTotal: qty * unit,
      };
    });
  }, [items]);

  // Pull totals from schema (first entry)
  const T = order?.totals && order.totals.length > 0 ? order.totals[0] : null;
  const requestBill = !!order?.requestBill;

  if (loading) return <p>Cargando resumen de entrega...</p>;
  if (errMsg) return <p>{errMsg}</p>;
  if (!order) return <p>No se encontró el pedido.</p>;

  return (
    <body className="body-BG-Gradient">
      {/* LOGO */}
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

      {/* TITLE */}
      <div className="edit-titleIcon-Div">
        <label className="editAddress-headerLabel">Resumen del Pedido Entregado</label>
        <img src={summaryIcon} alt="Resumen" width="35" height="35" />
      </div>

      <div className="orderDelivered-screenScroll">
        <div className="newQuotesDetail-Div">
          <label><b>{displayCustomer || order.userEmail || "Cliente"}</b></label>
          <label><b>{displayCompany || "—"}</b></label><br/>

          <label><b>Pedido:</b> #{String(order?._id || "").slice(-5)}</label>
          <label><b>Fecha de Pedido: </b><label>{formatDate(order?.orderDate)}</label></label>
          <br/>

          {/* ================== Productos ================== */}
          <div className="orderDelivered-GeneralSummary">
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Productos</label>
            </div>

            <div className="orderDelivered-ProductsDiv">
              {normItems.length > 0 ? (
                <>
                  {normItems.map((item, index) => (
                    <div key={index} className="newOrderDets-Div">
                      <div className="orderDetails-Div">
                        <label className="orderDets-Label"><b>{item.product}</b></label>
                        <label className="orderDets-Label"><b>Cantidad:</b> {item._qty}</label>
                        <label className="orderDets-Label"><b>Precio Unitario:</b> {asNumber(item._unit)}</label>
                        <label className="newOrderDetsTotal-Label"><b>Total línea:</b> {asNumber(item._lineTotal)}</label>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p>No hay productos en este pedido.</p>
              )}
            </div>

            {/* ========== Totales (desde order.totals[0]) ========== */}
            {T && (
              <div className="newOrderDets-Div" style={{ marginTop: 8 }}>
                <div className="orderDetails-Div">
                  <label className="orderDets-Label">
                    <b>Subtotal USD (nativo):</b> {asCurrency(T.totalUSDNative, "USD")} USD
                  </label>
                  <label className="orderDets-Label">
                    <b>Subtotal MXN (nativo):</b> {asCurrency(T.totalMXNNative, "MXN")} MXN
                  </label>

                  <label className="orderDets-Label">
                    <b>Total USD (unificado):</b> {asCurrency(T.totalAllUSD, "USD")} USD
                  </label>
                  <label className="orderDets-Label">
                    <b>Total MXN (unificado):</b> {asCurrency(T.totalAllMXN, "MXN")} MXN
                  </label>

                  <label className="newOrderDetsTotal-Label">
                    <b>Final USD{requestBill ? " (con IVA)" : ""}:</b>{" "}
                    {asCurrency(requestBill ? T.finalAllUSD : T.totalAllUSD, "USD")} USD
                  </label>
                  <label className="newOrderDetsTotal-Label">
                    <b>Final MXN{requestBill ? " (con IVA)" : ""}:</b>{" "}
                    {asCurrency(requestBill ? T.finalAllMXN : T.totalAllMXN, "MXN")} MXN
                  </label>

                  <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
                    {T?.dofRate
                      ? `Tipo de cambio DOF ${T.dofDate || ""}: $${Number(T.dofRate).toFixed(2)} MXN/USD`
                      : "Tipo de cambio DOF no disponible"}
                  </div>
                </div>
              </div>
            )}

            {/* ========== Dirección de Envío ========== */}
            <div className="deliveryDets-AddressDiv">
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">Dirección de Envío</label>
              </div>
              <div className="existingQuote-Div">
                <div className="quoteAndFile-Div">
                  {(shipping.street || shipping.exteriorNumber || shipping.interiorNumber) && (
                    <label className="productDetail-Label">
                      {shipping.street} {shipping.exteriorNumber}
                      {shipping.interiorNumber ? ` Int. ${shipping.interiorNumber}` : ""}
                    </label>
                  )}
                  {shipping.colony && <label className="productDetail-Label">Col. {shipping.colony}</label>}
                  {(shipping.city || shipping.state) && (
                    <label className="productDetail-Label">
                      {shipping.city}{shipping.city && shipping.state ? ", " : ""}{shipping.state}
                    </label>
                  )}
                  {shipping.postalCode && <label className="productDetail-Label">C.P.: {shipping.postalCode}</label>}
                  {shipping.country && <label className="productDetail-Label">{shipping.country}</label>}
                </div>
              </div>
            </div>

            {/* ========== Datos de Facturación ========== */}
            {(billing.businessName || billing.rfc || billing.billingStreet || billing.email) && (
              <div className="deliveryDets-AddressDiv">
                <div className="headerEditIcon-Div">
                  <label className="newUserData-Label">Datos de Facturación</label>
                </div>
                <div className="existingQuote-Div">
                  <div className="quoteAndFile-Div">
                    {billing.businessName && (<label className="productDetail-Label"><b>Razón Social:</b> {billing.businessName}</label>)}
                    {billing.rfc && (<label className="productDetail-Label"><b>RFC:</b> {billing.rfc}</label>)}
                    {billing.email && (<label className="productDetail-Label"><b>Correo:</b> {billing.email}</label>)}
                    {billing.phone && (<label className="productDetail-Label"><b>Teléfono:</b> {billing.phone}</label>)}<br></br>
                    {(billing.billingStreet || billing.billingExterior || billing.billingInterior) && (
                      <label className="productDetail-Label">
                        {billing.billingStreet} {billing.billingExterior}
                        {billing.billingInterior ? ` Int. ${billing.billingInterior}` : ""}
                      </label>
                    )}
                    {billing.billingColony && <label className="productDetail-Label">Col. {billing.billingColony}</label>}
                    {(billing.billingCity || billing.billingState) && (
                      <label className="productDetail-Label">
                        {billing.billingCity}{billing.billingCity && billing.billingState ? ", " : ""}{billing.billingState}
                      </label>
                    )}
                    {billing.billingCP && <label className="productDetail-Label">C.P.: {billing.billingCP}</label>}
                    {billing.country && <label className="productDetail-Label">{billing.country}</label>}
                    {billing.taxRegime && (<label className="productDetail-Label"><b>Régimen Fiscal:</b> {billing.taxRegime}</label>)}
                  </div>
                </div>
              </div>
            )}

            {/* ========== Detalles de Pago ========== */}
            <div className="deliveryDets-AddressDiv">
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">Detalles de Pago</label>
              </div>
              <div className="existingQuote-Div">
                <div className="quoteAndFile-Div">
                  {order?.paymentOption && (
                    <label className="productDetail-Label">
                      <b>Opción de pago:</b> {order.paymentOption}
                    </label>
                  )}
                  {order?.creditTermDays && (
                    <label className="productDetail-Label">
                      <b>Crédito (días):</b> {order.creditTermDays}
                    </label>
                  )}
                  {order?.creditDueDate && (
                    <label className="productDetail-Label">
                      <b>Vencimiento:</b> {formatDate(order.creditDueDate)}
                    </label>
                  )}
                  {order?.paymentMethod && (
                    <label className="productDetail-Label"><b>Método de pago:</b> {order.paymentMethod}</label>
                  )}
                  {order?.paymentAccount && (
                    <label className="productDetail-Label">Cuenta de recepción de pago: {order.paymentAccount}</label>
                  )}
                </div>
              </div>
            </div>

            {/* ========== Evidencias ========== */}
            <div className="deliveryDets-AddressDiv">
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">Evidencias</label>
              </div>
              <div className="existingQuote-Div">
                <div className="quoteAndFile-Div">
                  {/* Payment evidence (single) */}
                  {order?.evidenceFile?.filename && (
                    <a
                      href={fileUrl("payment")}
                      target="_blank"
                      rel="noreferrer"
                      className="productDetail-Label"
                      style={{ textDecoration: "underline" }}
                    >
                      <b>Pago:</b> {order.evidenceFile.filename}
                    </a>
                  )}

                  {/* Packing evidence (multiple) */}
                  {Array.isArray(order?.packingEvidence) && order.packingEvidence.length > 0 && (
                    <>
                      <label className="productDetail-Label"><b>Empaque:</b></label>
                      {order.packingEvidence.map((f, idx) =>
                        f?.filename ? (
                          <a
                            key={idx}
                            href={fileUrl("packing", idx)}
                            target="_blank"
                            rel="noreferrer"
                            className="productDetail-Label"
                            style={{ textDecoration: "underline", display: "block", marginLeft: 12 }}
                          >
                            • {f.filename}
                          </a>
                        ) : null
                      )}
                    </>
                  )}

                  {/* Delivery evidence (single) */}
                  {order?.deliveryEvidence?.filename && (
                    <a
                      href={fileUrl("delivery")}
                      target="_blank"
                      rel="noreferrer"
                      className="productDetail-Label"
                      style={{ textDecoration: "underline" }}
                    >
                      <b>Entrega:</b> {order.deliveryEvidence.filename}
                    </a>
                  )}

                  {/* Legacy fallbacks */}
                  {order?.packEvidenceImage && !order?.packingEvidence?.length && (
                    isProbablyUrl(order.packEvidenceImage) ? (
                      <a
                        href={order.packEvidenceImage}
                        target="_blank"
                        rel="noreferrer"
                        className="productDetail-Label"
                        style={{ textDecoration: "underline" }}
                      >
                        (legacy) Evidencia de empaque
                      </a>
                    ) : (
                      <label className="productDetail-Label">(legacy) Evidencia de empaque: {order.packEvidenceImage}</label>
                    )
                  )}
                  {order?.evidenceURL && (
                    <a
                      href={order.evidenceURL}
                      target="_blank"
                      rel="noreferrer"
                      className="productDetail-Label"
                      style={{ textDecoration: "underline" }}
                    >
                      (legacy) Evidencia
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* ========== Detalles de Entrega ========== */}
            <div className="deliveryDets-AddressDiv">
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">Detalles Entrega</label>
              </div>
              <div className="existingQuote-Div">
                <div className="quoteAndFile-Div">
                  <label className="productDetail-Label">
                    Fecha de entrega: <label>{formatDate(order?.deliveryDate)}</label>
                  </label>
                  {order?.trackingNumber && (
                    <label className="productDetail-Label">Número de guía: {order.trackingNumber}</label>
                  )}
                  {order?.insuredAmount != null && order?.insuredAmount !== "" && (
                    <label className="productDetail-Label"><b>Monto asegurado:</b> {asCurrency(order.insuredAmount, "MXN")}</label>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* FOOTER NAV */}
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