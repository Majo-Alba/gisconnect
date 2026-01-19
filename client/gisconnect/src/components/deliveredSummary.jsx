import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";
import summaryIcon from "/src/assets/images/Icono_fileDownload.png";
import { faHouse, faCartShopping, faCheckToSlot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { API } from "/src/lib/api";

// === Products catalog (CSV) ===
const PRODUCTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

// === Who can see "Resumen Financiero" ===
const ALLOWED_ADMIN_EMAILS = new Set([
  "majo_test@gmail.com",
  "info@greenimportsol.com",
  "ventas@greenimportsol.com",
]);

export default function DeliveredSummary() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);

  // === Mongo user fields
  const [displayCustomer, setDisplayCustomer] = useState("");
  const [displayCompany, setDisplayCompany] = useState("");

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  // === Products CSV (Map keyed by NOMBRE_PRODUCTO)
  const [catalog, setCatalog] = useState(null);

  // === Current logged-in email (for financial visibility)
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  useEffect(() => {
    const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    const email = (creds?.correo || "").trim().toLowerCase();
    setCurrentUserEmail(email);
  }, []);
  const canSeeFinancial = ALLOWED_ADMIN_EMAILS.has(currentUserEmail);

  // ===== Fetch order =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrMsg("");
      try {
        const { data } = await axios.get(`${API}/orders/${orderId}`);
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

  // ===== Fetch user (Mongo)
  useEffect(() => {
    if (!order?.userEmail) return;
    const email = String(order.userEmail || "").trim().toLowerCase();
    if (!email) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: user } = await axios.get(`${API}/users/by-email`, {
          params: { email },
        });
        if (cancelled) return;

        const nombre = (user?.nombre || "").trim();
        const apellido = (user?.apellido || "").trim();
        const fullName = [nombre, apellido].filter(Boolean).join(" ");
        const empresa = (user?.empresa || "").trim();

        setDisplayCustomer(fullName || order.userEmail || "");
        setDisplayCompany(empresa || "—");
      } catch (_err) {
        setDisplayCustomer(order.userEmail || "Cliente");
        setDisplayCompany("—");
      }
    })();

    return () => { cancelled = true; };
  }, [order?.userEmail]);

  // ===== Helpers for CSV parsing / matching (NOMBRE_PRODUCTO only) =====
  const stripAccents = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const norm = (s) =>
    stripAccents(s)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const baseName = (s) => {
    let t = String(s || "");
    t = t.replace(/\s*—\s*.*$/u, "");
    t = t.replace(/\(.*?\)/g, "");
    return norm(t);
  };

  const normHeader = (s) => norm(s).replace(/[^a-z0-9]/g, "");

  const parseMoney = (v) => {
    const cleaned = String(v ?? "")
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .replace(/\s+/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  function parseCSVQuoted(csvText) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const ch = csvText[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = csvText[i + 1];
          if (next === '"') {
            cell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cell += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(cell);
          cell = "";
        } else if (ch === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else if (ch === "\r") {
          // ignore
        } else {
          cell += ch;
        }
      }
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    return rows;
  }

  // ===== Fetch products CSV once (strict NOMBRE_PRODUCTO rules) =====
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await axios.get(PRODUCTS_CSV_URL, { responseType: "text" });
        if (cancelled) return;

        const table = parseCSVQuoted(data);
        if (!table.length) { setCatalog(new Map()); return; }

        const headerRow = table[0];
        const H = {};
        headerRow.forEach((h, i) => { H[normHeader(h)] = i; });

        const idx = (...variants) => {
          for (const v of variants) {
            const k = normHeader(v);
            if (Object.prototype.hasOwnProperty.call(H, k)) return H[k];
          }
          return -1;
        };

        const iName = idx("NOMBRE_PRODUCTO", "PRODUCTO", "NOMBRE");
        const iUSD1 = idx("PRECIO_UNITARIO_DOLARES");
        const iUSD2 = idx("PRECIO_PIEZA_DOLARES");
        const iMXN1 = idx("PRECIO_UNITARIO_MXN");
        const iMXN2 = idx("PRECIO_PIEZA_MXN");

        const map = new Map();

        for (let r = 1; r < table.length; r++) {
          const row = table[r];
          const nameRaw = iName >= 0 ? row[iName] : "";

          const keyName = norm(nameRaw);
          const keyBase = baseName(nameRaw);

          const usd = Math.max(
            iUSD1 >= 0 ? parseMoney(row[iUSD1]) : 0,
            iUSD2 >= 0 ? parseMoney(row[iUSD2]) : 0
          );
          const mxn = Math.max(
            iMXN1 >= 0 ? parseMoney(row[iMXN1]) : 0,
            iMXN2 >= 0 ? parseMoney(row[iMXN2]) : 0
          );

          let currency;
          if (usd > 0) currency = "USD";
          else if (mxn > 0) currency = "MXN";
          else currency = "MXN";

          const entry = {
            currency,
            unitUSD: usd || null,
            unitMXN: mxn || null,
          };

          if (keyName) map.set(`name:${keyName}`, entry);
          if (keyBase) map.set(`base:${keyBase}`, entry);
        }

        setCatalog(map);
      } catch (e) {
        console.warn("Failed to load PRODUCTS_CSV_URL:", e);
        setCatalog(new Map());
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ===== Navigation =====
  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");

  const formatDate = (value) => {
    if (!value) return "Sin fecha";
    const s = String(value);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const [Y, M, D] = m[1].split("-").map(Number);
      const d = new Date(Y, M - 1, D);
      const day = d.getDate().toString().padStart(2, "0");
      const month = d.toLocaleString("es-MX", { month: "short" });
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }
    const d2 = new Date(s);
    if (isNaN(d2.getTime())) return "Sin fecha";
    const day = d2.getDate().toString().padStart(2, "0");
    const month = d2.toLocaleString("es-MX", { month: "short" });
    const year = d2.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const fmtMoney = (n, locale = "es-MX") =>
    (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isProbablyUrl = (s) => {
    if (!s || typeof s !== "string") return false;
    try { const u = new URL(s); return !!u.protocol && !!u.host; } catch { return false; }
  };

  function isImageMime(m) {
    return /^image\//i.test(m || "");
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

  // Evidence URLs (legacy endpoints remain as fallback)
  const fileUrl = (kind, idx) => {
    switch (kind) {
      case "payment": return `${API}/orders/${orderId}/evidence/payment`;
      case "delivery": return `${API}/orders/${orderId}/evidence/delivery`;
      case "packing": return `${API}/orders/${orderId}/evidence/packing/${idx ?? 0}`;
      default: return "#";
    }
  };

  // ===== Derivations =====
  const shipping = extractAddress(order?.shippingInfo);
  const billing = extractAddress(order?.billingInfo);

  // Detect pickup orders
  const isPickupOrder = (() => {
    const si = order?.shippingInfo;
    if (typeof si === "string") {
      return si.trim().toLowerCase() === "recoger en matriz";
    }
    if (si && typeof si === "object") {
      return si.pickup === true || si.method === "pickup";
    }
    return false;
  })();

  // Safe pickupDetails (date & time)
  const pickupDetails = order?.pickupDetails || null;
  const pickupDate = pickupDetails?.date || "";
  const pickupTime = pickupDetails?.time || "";

  const packerName =
    order?.packerName ||
    order?.packing?.packerName ||
    order?.packedBy ||
    order?.packingManager ||
    "";

  const items = useMemo(() => (Array.isArray(order?.items) ? order.items : []), [order]);

  // Decorate items (kept for currency detection if needed in future)
  const decoratedItems = useMemo(() => {
    const map = catalog;
    const toNum = (v) => (Number(v) || 0);
    return items.map((it) => {
      const qty = Number(it?.amount) || 0;

      const nameFull = norm(it.product || it.name || it.nombre);
      const nameBase = baseName(it.product || it.name || it.nombre);

      let cat = null;
      if (map) {
        cat = map.get(`name:${nameFull}`) || map.get(`base:${nameBase}`) || null;
      }

      const detectedCurrency = (cat?.currency || "MXN").toUpperCase();
      const unit = toNum(it?.price ?? it?.priceUSD ?? it?.priceMXN);

      return {
        ...it,
        _currency: detectedCurrency,
        _unit: unit,
        _qty: qty,
        _lineTotal: qty * unit,
      };
    });
  }, [items, catalog]);

  const totalsObj = useMemo(() => {
    const t = order?.totals;
    if (!t) return null;
    if (Array.isArray(t)) {
      for (let i = t.length - 1; i >= 0; i--) {
        if (t[i] && typeof t[i] === "object") return t[i];
      }
      return t[0] || null;
    }
    if (typeof t === "object") return t;
    return null;
  }, [order]);

  const requestBill = !!order?.requestBill;
  const dofRate =
    Number(totalsObj?.dofRate) > 0 ? Number(totalsObj.dofRate) :
    Number(order?.dofRate) > 0 ? Number(order.dofRate) :
    undefined;
  const dofDate = totalsObj?.dofDate || order?.dofDate || "";
  const totalUSDNative  = Number.isFinite(Number(totalsObj?.totalUSDNative))  ? Number(totalsObj.totalUSDNative)  : undefined;
  const totalMXNNative  = Number.isFinite(Number(totalsObj?.totalMXNNative))  ? Number(totalsObj.totalMXNNative)  : undefined;
  const totalAllMXN     = Number.isFinite(Number(totalsObj?.totalAllMXN))     ? Number(totalsObj.totalAllMXN)     : undefined;

  const preferred = String(order?.preferredCurrency || "USD").toUpperCase();
  const paymentCurrency = String(order?.paymentCurrency || order?.preferredCurrency || "USD").toUpperCase();

  const buckets = decoratedItems.reduce(
    (acc, it) => {
      if (it._currency === "USD") acc.usd += it._lineTotal;
      else acc.mxn += it._lineTotal;
      return acc;
    },
    { usd: 0, mxn: 0 }
  );

  const isMixed = buckets.usd > 0 && buckets.mxn > 0;
  const canConvert = Number.isFinite(dofRate) && dofRate > 0;

  const addIVA = (n) => (requestBill ? n * 1.16 : n);

  const finalUSD = addIVA(buckets.usd);
  let finalMXNValue;
  let mxnNote = "";
  if (preferred === "MXN") {
    if (isMixed && canConvert) {
      finalMXNValue = addIVA(buckets.mxn + buckets.usd * dofRate);
    } else if (isMixed && !canConvert) {
      finalMXNValue = addIVA(buckets.mxn);
      mxnNote = "* No hay TC DOF guardado; se muestran subtotales por divisa.";
    } else {
      finalMXNValue = addIVA(buckets.mxn);
    }
  } else {
    finalMXNValue = addIVA(buckets.mxn);
  }

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
              {decoratedItems.length > 0 ? (
                <>
                  {decoratedItems.map((item, index) => (
                    <div key={index} className="newOrderDets-Div">
                      <div className="orderDetails-Div">
                        <label className="orderDets-Label"><b>{item.product}</b></label>
                        {item.presentation && (
                          <label className="orderDets-Label">
                            <b>Presentación:</b> {item.presentation}
                          </label>
                        )}
                        <label className="orderDets-Label"><b>Cantidad:</b> {item._qty}</label>
                        {/* Removed Precio Unitario & Total del producto for all users */}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p>No hay productos en este pedido.</p>
              )}
            </div>

            {/* ========== Totales financieros (visible solo para correos permitidos) ========== */}
            {canSeeFinancial && (
              <>
                <div className="headerEditIcon-Div">
                  <label className="newUserData-Label">Resumen Financiero</label>
                </div>

                <div className="orderDelivered-ProductsDiv" style={{ marginTop: 8 }}>
                  <div className="orderDetails-Div">
                    <label className="orderDets-Label" style={{ fontSize: 12, marginBottom: 4 }}>
                      <b>Subtotal productos USD:</b> ${fmtMoney(buckets.usd, "en-US")} USD
                    </label>
                    <label className="orderDets-Label" style={{ fontSize: 12 }}>
                      <b>Subtotal productos MXN:</b> ${fmtMoney(buckets.mxn, "es-MX")} MXN
                    </label>

                    <label className="orderDets-Label" style={{ fontSize: 12, marginTop: 6 }}>
                      <b>Divisa de pago:</b> {paymentCurrency}
                    </label>

                    {paymentCurrency === "USD" ? (
                      <>
                        <label className="newOrderDetsTotal-Label" style={{ marginTop: 6 }}>
                          <b>Total pagado (USD):</b>{" "}
                          {totalUSDNative != null ? `$${fmtMoney(totalUSDNative, "en-US")} USD` : "—"}
                        </label>
                        {Number.isFinite(totalMXNNative) && totalMXNNative > 0 && (
                          <label className="newOrderDetsTotal-Label">
                            <b>Total pagado (MXN):</b> ${fmtMoney(totalMXNNative, "es-MX")} MXN
                          </label>
                        )}
                      </>
                    ) : (
                      <>
                        <label className="newOrderDetsTotal-Label" style={{ marginTop: 6 }}>
                          <b>Total pagado (MXN):</b>{" "}
                          {totalAllMXN != null ? `$${fmtMoney(totalAllMXN, "es-MX")} MXN` : "—"}
                        </label>
                      </>
                    )}

                    <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
                      {`Tipo de cambio utilizado para la transacción: ${
                        Number.isFinite(dofRate) && dofRate > 0 ? fmtMoney(dofRate, "es-MX") : "—"
                      }${dofDate ? `  (DOF ${dofDate})` : ""}`}
                    </div>

                    {order?.evidenceFileExt && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
                          <b>Evidencia de pago:</b>
                        </div>
                        <a href={fileUrl("payment")} target="_blank" rel="noreferrer">
                          {isImageMime(order.evidenceFileExt.mimetype) ? (
                            <img
                              src={fileUrl("payment")}
                              alt={order.evidenceFileExt.filename || "evidencia_de_pago"}
                              style={{ maxWidth: "100%", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,.12)" }}
                            />
                          ) : (
                            <span>Descargar: {order.evidenceFileExt.filename || "pago"}</span>
                          )}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ========== Dirección de Envío / Detalles de Pedido (Pickup) ========== */}
            <div className="deliveryDets-AddressDiv">
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">
                  {isPickupOrder ? "Detalles de Pedido" : "Dirección de Envío"}
                </label>
              </div>
              <div className="existingQuote-Div">
                <div className="quoteAndFile-Div">
                  {isPickupOrder ? (
                    <>
                      <label className="productDetail-Label">
                        <b>Pedido recogido en matriz</b>
                      </label>
                      <label className="productDetail-Label">
                        <b>Fecha:</b> {pickupDate ? formatDate(pickupDate) : "—"}
                      </label>
                      {pickupTime && (
                        <label className="productDetail-Label">
                          <b>Hora:</b> {pickupTime}
                        </label>
                      )}
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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
                    {billing.phone && (<label className="productDetail-Label"><b>Teléfono:</b> {billing.phone}</label>)}<br/>
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

            {/* ========== Preparación de Pedido ========== */}
            <div className="deliveryDets-AddressDiv">
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">Preparación de Pedido</label>
              </div>
              <div className="existingQuote-Div">
                <div className="quoteAndFile-Div">
                  <label className="productDetail-Label">
                    <b>Pedido preparado por:</b> {packerName || "—"}
                  </label>

                  {/* Fotos de empaque */}
                  {Array.isArray(order?.packingEvidenceExt) && order.packingEvidenceExt.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginTop: 10 }}>
                      {order.packingEvidenceExt.map((f, idx) =>
                        f ? (
                          <a key={`p-img-${idx}`} href={fileUrl("packing", idx)} target="_blank" rel="noreferrer" title={f.filename || `evidencia_${idx + 1}`}>
                            {isImageMime(f.mimetype) ? (
                              <img
                                src={fileUrl("packing", idx)}
                                alt={f.filename || `evidencia_${idx + 1}`}
                                style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,.12)" }}
                              />
                            ) : (
                              <div style={{ width: "100%", height: 120, display: "grid", placeItems: "center", border: "1px solid #ddd", borderRadius: 8 }}>
                                {f.filename || `archivo-${idx + 1}`}
                              </div>
                            )}
                          </a>
                        ) : null
                      )}
                    </div>
                  ) : (
                    <label className="productDetail-Label" style={{ color: "#6b7280", marginTop: 6 }}>
                      (Sin fotos de preparación registradas)
                    </label>
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
                    Fecha de entrega: <label>{formatDate(order?.deliveryDateYMD || order?.deliveryDate)}</label>
                  </label>
                  {order?.trackingNumber && (
                    <label className="productDetail-Label">Número de guía: {order.trackingNumber}</label>
                  )}
                  {order?.insuredAmount != null && order?.insuredAmount !== "" && (
                    <label className="productDetail-Label"><b>Monto asegurado:</b> ${fmtMoney(order.insuredAmount, "es-MX")} MXN</label>
                  )}
                  {order?.deliveryEvidenceExt && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
                        <b>Evidencia de entrega:</b>
                      </div>
                      <a href={fileUrl("delivery")} target="_blank" rel="noreferrer">
                        {isImageMime(order.deliveryEvidenceExt.mimetype) ? (
                          <img
                            src={fileUrl("delivery")}
                            alt={order.deliveryEvidenceExt.filename || "evidencia_de_entrega"}
                            style={{ maxWidth: "100%", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,.12)" }}
                          />
                        ) : (
                          <span>Descargar: {order.deliveryEvidenceExt.filename || "entrega"}</span>
                        )}
                      </a>
                    </div>
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

// // hey chatgpt, in deliveredSummary.jsx I'd like to add the following feature that allows only certain admin user accounts to see the "Resumen Financiero" div. Make that div only visible for the following admin users: majo_test@gmail.com, info@greenimportsol.com, and ventas@greenimportsol.com. For all other user accounts, do not show "Resumen Financiero". As well, for this same screen, in "Productos" lets remove (for all users) the "Precio Unitario" field (for all products) and the "Total del producto". Here is my current deliveredSummary.jsx, please direct edit
// import { useEffect, useMemo, useState } from "react";
// import { useParams, useNavigate } from "react-router-dom";
// import axios from "axios";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import summaryIcon from "/src/assets/images/Icono_fileDownload.png";
// import { faHouse, faCartShopping, faCheckToSlot } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import { API } from "/src/lib/api";

// // === Products catalog (CSV) ===
// const PRODUCTS_CSV_URL =
//   "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

// export default function DeliveredSummary() {
//   const { orderId } = useParams();
//   const navigate = useNavigate();

//   const [order, setOrder] = useState(null);

//   // === Mongo user fields
//   const [displayCustomer, setDisplayCustomer] = useState("");
//   const [displayCompany, setDisplayCompany] = useState("");

//   const [loading, setLoading] = useState(true);
//   const [errMsg, setErrMsg] = useState("");

//   // === Products CSV (Map keyed by NOMBRE_PRODUCTO)
//   const [catalog, setCatalog] = useState(null);

//   // ===== Fetch order =====
//   useEffect(() => {
//     let cancelled = false;
//     (async () => {
//       setLoading(true);
//       setErrMsg("");
//       try {
//         const { data } = await axios.get(`${API}/orders/${orderId}`);
//         if (cancelled) return;
//         setOrder(data);
//       } catch (err) {
//         if (cancelled) return;
//         console.error("Error fetching order:", err);
//         setErrMsg("No pudimos cargar el pedido. Intenta de nuevo.");
//       } finally {
//         if (!cancelled) setLoading(false);
//       }
//     })();
//     return () => { cancelled = true; };
//   }, [orderId]);

//   // ===== Fetch user (Mongo)
//   useEffect(() => {
//     if (!order?.userEmail) return;
//     const email = String(order.userEmail || "").trim().toLowerCase();
//     if (!email) return;

//     let cancelled = false;

//     (async () => {
//       try {
//         const { data: user } = await axios.get(`${API}/users/by-email`, {
//           params: { email },
//         });
//         if (cancelled) return;

//         const nombre = (user?.nombre || "").trim();
//         const apellido = (user?.apellido || "").trim();
//         const fullName = [nombre, apellido].filter(Boolean).join(" ");
//         const empresa = (user?.empresa || "").trim();

//         setDisplayCustomer(fullName || order.userEmail || "");
//         setDisplayCompany(empresa || "—");
//       } catch (_err) {
//         setDisplayCustomer(order.userEmail || "Cliente");
//         setDisplayCompany("—");
//       }
//     })();

//     return () => { cancelled = true; };
//   }, [order?.userEmail]);

//   // ===== Helpers for CSV parsing / matching (NOMBRE_PRODUCTO only) =====
//   const stripAccents = (s) =>
//     String(s ?? "")
//       .normalize("NFD")
//       .replace(/[\u0300-\u036f]/g, "");

//   const norm = (s) =>
//     stripAccents(s)
//       .replace(/\s+/g, " ")
//       .trim()
//       .toLowerCase();

//   // Optionally remove presentation bits from names to improve hits, but we still
//   // ONLY use NOMBRE_PRODUCTO column from CSV (no SKU)
//   const baseName = (s) => {
//     let t = String(s || "");
//     t = t.replace(/\s*—\s*.*$/u, ""); // drop “ — …”
//     t = t.replace(/\(.*?\)/g, "");    // drop (…)
//     return norm(t);
//   };

//   const normHeader = (s) => norm(s).replace(/[^a-z0-9]/g, "");

//   const parseMoney = (v) => {
//     const cleaned = String(v ?? "")
//       .replace(/\$/g, "")
//       .replace(/,/g, "")
//       .replace(/\s+/g, "");
//     const n = Number(cleaned);
//     return Number.isFinite(n) ? n : 0;
//   };

//   // Quote-aware CSV parser
//   function parseCSVQuoted(csvText) {
//     const rows = [];
//     let row = [];
//     let cell = "";
//     let inQuotes = false;

//     for (let i = 0; i < csvText.length; i++) {
//       const ch = csvText[i];
//       if (inQuotes) {
//         if (ch === '"') {
//           const next = csvText[i + 1];
//           if (next === '"') {
//             cell += '"';
//             i++;
//           } else {
//             inQuotes = false;
//           }
//         } else {
//           cell += ch;
//         }
//       } else {
//         if (ch === '"') {
//           inQuotes = true;
//         } else if (ch === ",") {
//           row.push(cell);
//           cell = "";
//         } else if (ch === "\n") {
//           row.push(cell);
//           rows.push(row);
//           row = [];
//           cell = "";
//         } else if (ch === "\r") {
//           // ignore
//         } else {
//           cell += ch;
//         }
//       }
//     }
//     row.push(cell);
//     if (row.length > 1 || row[0] !== "") rows.push(row);
//     return rows;
//   }

//   // ===== Fetch products CSV once (strict NOMBRE_PRODUCTO rules) =====
//   useEffect(() => {
//     let cancelled = false;

//     (async () => {
//       try {
//         const { data } = await axios.get(PRODUCTS_CSV_URL, { responseType: "text" });
//         if (cancelled) return;

//         const table = parseCSVQuoted(data);
//         if (!table.length) { setCatalog(new Map()); return; }

//         const headerRow = table[0];
//         const H = {};
//         headerRow.forEach((h, i) => { H[normHeader(h)] = i; });

//         const idx = (...variants) => {
//           for (const v of variants) {
//             const k = normHeader(v);
//             if (Object.prototype.hasOwnProperty.call(H, k)) return H[k];
//           }
//           return -1;
//         };

//         const iName = idx("NOMBRE_PRODUCTO", "PRODUCTO", "NOMBRE");
//         const iUSD1 = idx("PRECIO_UNITARIO_DOLARES");
//         const iUSD2 = idx("PRECIO_PIEZA_DOLARES");
//         const iMXN1 = idx("PRECIO_UNITARIO_MXN");
//         const iMXN2 = idx("PRECIO_PIEZA_MXN");

//         const map = new Map();

//         for (let r = 1; r < table.length; r++) {
//           const row = table[r];
//           const nameRaw = iName >= 0 ? row[iName] : "";

//           const keyName = norm(nameRaw);
//           const keyBase = baseName(nameRaw);

//           // === Currency detection: USD first, else MXN ===
//           const usd = Math.max(
//             iUSD1 >= 0 ? parseMoney(row[iUSD1]) : 0,
//             iUSD2 >= 0 ? parseMoney(row[iUSD2]) : 0
//           );
//           const mxn = Math.max(
//             iMXN1 >= 0 ? parseMoney(row[iMXN1]) : 0,
//             iMXN2 >= 0 ? parseMoney(row[iMXN2]) : 0
//           );

//           let currency;
//           if (usd > 0) currency = "USD";
//           else if (mxn > 0) currency = "MXN";
//           else currency = "MXN"; // default if neither present

//           const entry = {
//             currency,
//             unitUSD: usd || null,
//             unitMXN: mxn || null,
//           };

//           if (keyName) map.set(`name:${keyName}`, entry);
//           if (keyBase) map.set(`base:${keyBase}`, entry);
//         }

//         setCatalog(map);
//       } catch (e) {
//         console.warn("Failed to load PRODUCTS_CSV_URL:", e);
//         setCatalog(new Map());
//       }
//     })();

//     return () => { cancelled = true; };
//   }, []);

//   // ===== Navigation =====
//   const goToAdminHome = () => navigate("/adminHome");
//   const goToNewOrders = () => navigate("/newOrders");
//   const goToPackageReady = () => navigate("/deliverReady");

//   const formatDate = (value) => {
//     if (!value) return "Sin fecha";
//     const s = String(value);
//     const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
//     if (m) {
//       const [Y, M, D] = m[1].split("-").map(Number);
//       const d = new Date(Y, M - 1, D);
//       const day = d.getDate().toString().padStart(2, "0");
//       const month = d.toLocaleString("es-MX", { month: "short" });
//       const year = d.getFullYear();
//       return `${day}/${month}/${year}`;
//     }
//     const d2 = new Date(s);
//     if (isNaN(d2.getTime())) return "Sin fecha";
//     const day = d2.getDate().toString().padStart(2, "0");
//     const month = d2.toLocaleString("es-MX", { month: "short" });
//     const year = d2.getFullYear();
//     return `${day}/${month}/${year}`;
//   };

//   const fmtMoney = (n, locale = "es-MX") =>
//     (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

//   const isProbablyUrl = (s) => {
//     if (!s || typeof s !== "string") return false;
//     try { const u = new URL(s); return !!u.protocol && !!u.host; } catch { return false; }
//   };

//   function isImageMime(m) {
//     return /^image\//i.test(m || "");
//   }

//   // Address extractor (OBJECT-first, legacy array fallback)
//   function extractAddress(addr) {
//     if (!addr) return {};
//     if (Array.isArray(addr)) {
//       const [street, extNo, intNo, colony, city, state, postalCode] = addr;
//       return {
//         street: street || "",
//         exteriorNumber: extNo || "",
//         interiorNumber: intNo || "",
//         colony: colony || "",
//         city: city || "",
//         state: state || "",
//         postalCode: postalCode || "",
//       };
//     }
//     const firstNonEmpty = (...ks) => {
//       for (const k of ks) {
//         const v = addr?.[k];
//         if (v != null && String(v).trim() !== "") return String(v).trim();
//       }
//       return "";
//     };
//     return {
//         street: firstNonEmpty("street", "calle", "addressLine1", "direccion", "calleEnvio"),
//         exteriorNumber: firstNonEmpty("exteriorNumber", "extNumber", "numeroExterior", "noExterior", "numero", "exteriorEnvio"),
//         interiorNumber: firstNonEmpty("interiorNumber", "intNumber", "numeroInterior", "noInterior", "interior", "interiorEnvio"),
//         colony: firstNonEmpty("colony", "colonia", "neighborhood", "barrio", "coloniaEnvio"),
//         city: firstNonEmpty("city", "municipality", "municipio", "localidad", "ciudadEnvio"),
//         state: firstNonEmpty("state", "estado", "region", "estadoEnvio"),
//         postalCode: firstNonEmpty("postalCode", "cp", "zip", "zipcode", "codigoPostal", "cpEnvio"),
//         country: firstNonEmpty("country", "pais"),
        
//         contactName: firstNonEmpty("contactName", "contactoNombre"),
//         phone: firstNonEmpty("phone", "telefono"),
//         email: firstNonEmpty("email", "correo", "correoFiscal"),
//         rfc: firstNonEmpty("rfc", "RFC", "rfcEmpresa"),
//         businessName: firstNonEmpty("businessName", "razonSocial", "razon_social"),
//         taxRegime: firstNonEmpty("taxRegime", "regimenFiscal", "regimen_fiscal"),

//         billingStreet: firstNonEmpty("calleFiscal"),
//         billingExterior: firstNonEmpty("exteriorFiscal"),
//         billingInterior: firstNonEmpty("interiorFiscal"),
//         billingColony: firstNonEmpty("coloniaFiscal"),
//         billingCity: firstNonEmpty("ciudadFiscal"),
//         billingState: firstNonEmpty("estadoFiscal"),
//         billingCP: firstNonEmpty("cpFiscal"),
//     };
//   }

//   // Evidence URLs (legacy endpoints remain as fallback)
//   const fileUrl = (kind, idx) => {
//     switch (kind) {
//       case "payment": return `${API}/orders/${orderId}/evidence/payment`;
//       case "delivery": return `${API}/orders/${orderId}/evidence/delivery`;
//       case "packing": return `${API}/orders/${orderId}/evidence/packing/${idx ?? 0}`;
//       default: return "#";
//     }
//   };

//   // ===== Derivations =====
//   const shipping = extractAddress(order?.shippingInfo);
//   const billing = extractAddress(order?.billingInfo);

//   // ✅ Detect pickup orders (string "Recoger en Matriz" or object flags)
//   const isPickupOrder = (() => {
//     const si = order?.shippingInfo;
//     if (typeof si === "string") {
//       return si.trim().toLowerCase() === "recoger en matriz";
//     }
//     if (si && typeof si === "object") {
//       return si.pickup === true || si.method === "pickup";
//     }
//     return false;
//   })();

//   // Safe pickupDetails (date & time)
//   const pickupDetails = order?.pickupDetails || null;
//   const pickupDate = pickupDetails?.date || "";
//   const pickupTime = pickupDetails?.time || "";

//   const packerName =
//     order?.packerName ||
//     order?.packing?.packerName ||
//     order?.packedBy ||
//     order?.packingManager ||
//     "";

//   const items = useMemo(() => (Array.isArray(order?.items) ? order.items : []), [order]);

//   // Decorate items (unchanged) …
//   const decoratedItems = useMemo(() => {
//     const map = catalog;
//     const toNum = (v) => (Number(v) || 0);
//     return items.map((it) => {
//       const qty = Number(it?.amount) || 0;

//       const nameFull = norm(it.product || it.name || it.nombre);
//       const nameBase = baseName(it.product || it.name || it.nombre);

//       let cat = null;
//       if (map) {
//         cat = map.get(`name:${nameFull}`) || map.get(`base:${nameBase}`) || null;
//       }

//       const detectedCurrency = (cat?.currency || "MXN").toUpperCase();
//       const unit = toNum(it?.price ?? it?.priceUSD ?? it?.priceMXN);

//       return {
//         ...it,
//         _currency: detectedCurrency,
//         _unit: unit,
//         _qty: qty,
//         _lineTotal: qty * unit,
//       };
//     });
//   }, [items, catalog]);

//   const totalsObj = useMemo(() => {
//     const t = order?.totals;
//     if (!t) return null;
//     if (Array.isArray(t)) {
//       for (let i = t.length - 1; i >= 0; i--) {
//         if (t[i] && typeof t[i] === "object") return t[i];
//       }
//       return t[0] || null;
//     }
//     if (typeof t === "object") return t;
//     return null;
//   }, [order]);

//   const requestBill = !!order?.requestBill;
//   const dofRate =
//     Number(totalsObj?.dofRate) > 0 ? Number(totalsObj.dofRate) :
//     Number(order?.dofRate) > 0 ? Number(order.dofRate) :
//     undefined;
//   const dofDate = totalsObj?.dofDate || order?.dofDate || "";
//   const totalUSDNative  = Number.isFinite(Number(totalsObj?.totalUSDNative))  ? Number(totalsObj.totalUSDNative)  : undefined;
//   const totalMXNNative  = Number.isFinite(Number(totalsObj?.totalMXNNative))  ? Number(totalsObj.totalMXNNative)  : undefined;
//   const totalAllMXN     = Number.isFinite(Number(totalsObj?.totalAllMXN))     ? Number(totalsObj.totalAllMXN)     : undefined;

//   const preferred = String(order?.preferredCurrency || "USD").toUpperCase();
//   const paymentCurrency = String(order?.paymentCurrency || order?.preferredCurrency || "USD").toUpperCase();

//   const buckets = decoratedItems.reduce(
//     (acc, it) => {
//       if (it._currency === "USD") acc.usd += it._lineTotal;
//       else acc.mxn += it._lineTotal;
//       return acc;
//     },
//     { usd: 0, mxn: 0 }
//   );

//   const isMixed = buckets.usd > 0 && buckets.mxn > 0;
//   const canConvert = Number.isFinite(dofRate) && dofRate > 0;

//   const addIVA = (n) => (requestBill ? n * 1.16 : n);

//   const finalUSD = addIVA(buckets.usd);
//   let finalMXNValue;
//   let mxnNote = "";
//   if (preferred === "MXN") {
//     if (isMixed && canConvert) {
//       finalMXNValue = addIVA(buckets.mxn + buckets.usd * dofRate);
//     } else if (isMixed && !canConvert) {
//       finalMXNValue = addIVA(buckets.mxn);
//       mxnNote = "* No hay TC DOF guardado; se muestran subtotales por divisa.";
//     } else {
//       finalMXNValue = addIVA(buckets.mxn);
//     }
//   } else {
//     finalMXNValue = addIVA(buckets.mxn);
//   }

//   if (loading) return <p>Cargando resumen de entrega...</p>;
//   if (errMsg) return <p>{errMsg}</p>;
//   if (!order) return <p>No se encontró el pedido.</p>;

//   return (
//     <body className="body-BG-Gradient">
//       {/* LOGO */}
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

//       {/* TITLE */}
//       <div className="edit-titleIcon-Div">
//         <label className="editAddress-headerLabel">Resumen del Pedido Entregado</label>
//         <img src={summaryIcon} alt="Resumen" width="35" height="35" />
//       </div>

//       <div className="orderDelivered-screenScroll">
//         <div className="newQuotesDetail-Div">
//           <label><b>{displayCustomer || order.userEmail || "Cliente"}</b></label>
//           <label><b>{displayCompany || "—"}</b></label><br/>

//           <label><b>Pedido:</b> #{String(order?._id || "").slice(-5)}</label>
//           <label><b>Fecha de Pedido: </b><label>{formatDate(order?.orderDate)}</label></label>
//           <br/>

//           {/* ================== Productos ================== */}
//           <div className="orderDelivered-GeneralSummary">
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Productos</label>
//             </div>

//             <div className="orderDelivered-ProductsDiv">
//               {decoratedItems.length > 0 ? (
//                 <>
//                   {decoratedItems.map((item, index) => (
//                     <div key={index} className="newOrderDets-Div">
//                       <div className="orderDetails-Div">
//                         <label className="orderDets-Label"><b>{item.product}</b></label>
//                         {item.presentation && (
//                           <label className="orderDets-Label">
//                             <b>Presentación:</b> {item.presentation}
//                           </label>
//                         )}
//                         <label className="orderDets-Label"><b>Cantidad:</b> {item._qty}</label>
//                         <label className="orderDets-Label">
//                           <b>Precio Unitario:</b> ${fmtMoney(item._unit, item._currency === "USD" ? "en-US" : "es-MX")} {item._currency}
//                         </label>
//                         <label className="newOrderDetsTotal-Label">
//                           <b>Total del producto:</b> ${fmtMoney(item._lineTotal, item._currency === "USD" ? "en-US" : "es-MX")} {item._currency}
//                         </label>
//                       </div>
//                     </div>
//                   ))}
//                 </>
//               ) : (
//                 <p>No hay productos en este pedido.</p>
//               )}
//             </div>

//             {/* ========== Totales financieros ========== */}
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Resumen Financiero</label>
//             </div>

//             <div className="orderDelivered-ProductsDiv" style={{ marginTop: 8 }}>
//               <div className="orderDetails-Div">
//                 <label className="orderDets-Label" style={{ fontSize: 12, marginBottom: 4 }}>
//                   <b>Subtotal productos USD:</b> ${fmtMoney(buckets.usd, "en-US")} USD
//                 </label>
//                 <label className="orderDets-Label" style={{ fontSize: 12 }}>
//                   <b>Subtotal productos MXN:</b> ${fmtMoney(buckets.mxn, "es-MX")} MXN
//                 </label>

//                 <label className="orderDets-Label" style={{ fontSize: 12, marginTop: 6 }}>
//                   <b>Divisa de pago:</b> {paymentCurrency}
//                 </label>

//                 {paymentCurrency === "USD" ? (
//                   <>
//                     <label className="newOrderDetsTotal-Label" style={{ marginTop: 6 }}>
//                       <b>Total pagado (USD):</b>{" "}
//                       {totalUSDNative != null ? `$${fmtMoney(totalUSDNative, "en-US")} USD` : "—"}
//                     </label>
//                     {Number.isFinite(totalMXNNative) && totalMXNNative > 0 && (
//                       <label className="newOrderDetsTotal-Label">
//                         <b>Total pagado (MXN):</b> ${fmtMoney(totalMXNNative, "es-MX")} MXN
//                       </label>
//                     )}
//                   </>
//                 ) : (
//                   <>
//                     <label className="newOrderDetsTotal-Label" style={{ marginTop: 6 }}>
//                       <b>Total pagado (MXN):</b>{" "}
//                       {totalAllMXN != null ? `$${fmtMoney(totalAllMXN, "es-MX")} MXN` : "—"}
//                     </label>
//                   </>
//                 )}

//                 <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
//                   {`Tipo de cambio utilizado para la transacción: ${
//                     Number.isFinite(dofRate) && dofRate > 0 ? fmtMoney(dofRate, "es-MX") : "—"
//                   }${dofDate ? `  (DOF ${dofDate})` : ""}`}
//                 </div>

//                 {order?.evidenceFileExt && (
//                   <div style={{ marginTop: 10 }}>
//                     <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
//                       <b>Evidencia de pago:</b>
//                     </div>
//                     <a href={fileUrl("payment")} target="_blank" rel="noreferrer">
//                       {isImageMime(order.evidenceFileExt.mimetype) ? (
//                         <img
//                           src={fileUrl("payment")}
//                           alt={order.evidenceFileExt.filename || "evidencia_de_pago"}
//                           style={{ maxWidth: "100%", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,.12)" }}
//                         />
//                       ) : (
//                         <span>Descargar: {order.evidenceFileExt.filename || "pago"}</span>
//                       )}
//                     </a>
//                   </div>
//                 )}
//               </div>
//             </div>

//             {/* ========== Dirección de Envío / Detalles de Pedido (Pickup) ========== */}
//             <div className="deliveryDets-AddressDiv">
//               <div className="headerEditIcon-Div">
//                 <label className="newUserData-Label">
//                   {isPickupOrder ? "Detalles de Pedido" : "Dirección de Envío"}
//                 </label>
//               </div>
//               <div className="existingQuote-Div">
//                 <div className="quoteAndFile-Div">
//                   {isPickupOrder ? (
//                     <>
//                       <label className="productDetail-Label">
//                         <b>Pedido recogido en matriz</b>
//                       </label>
//                       <label className="productDetail-Label">
//                         <b>Fecha:</b> {pickupDate ? formatDate(pickupDate) : "—"}
//                       </label>
//                       {pickupTime && (
//                         <label className="productDetail-Label">
//                           <b>Hora:</b> {pickupTime}
//                         </label>
//                       )}
//                     </>
//                   ) : (
//                     <>
//                       {(shipping.street || shipping.exteriorNumber || shipping.interiorNumber) && (
//                         <label className="productDetail-Label">
//                           {shipping.street} {shipping.exteriorNumber}
//                           {shipping.interiorNumber ? ` Int. ${shipping.interiorNumber}` : ""}
//                         </label>
//                       )}
//                       {shipping.colony && <label className="productDetail-Label">Col. {shipping.colony}</label>}
//                       {(shipping.city || shipping.state) && (
//                         <label className="productDetail-Label">
//                           {shipping.city}{shipping.city && shipping.state ? ", " : ""}{shipping.state}
//                         </label>
//                       )}
//                       {shipping.postalCode && <label className="productDetail-Label">C.P.: {shipping.postalCode}</label>}
//                       {shipping.country && <label className="productDetail-Label">{shipping.country}</label>}
//                     </>
//                   )}
//                 </div>
//               </div>
//             </div>

//             {/* ========== Datos de Facturación ========== */}
//             {(billing.businessName || billing.rfc || billing.billingStreet || billing.email) && (
//               <div className="deliveryDets-AddressDiv">
//                 <div className="headerEditIcon-Div">
//                   <label className="newUserData-Label">Datos de Facturación</label>
//                 </div>
//                 <div className="existingQuote-Div">
//                   <div className="quoteAndFile-Div">
//                     {billing.businessName && (<label className="productDetail-Label"><b>Razón Social:</b> {billing.businessName}</label>)}
//                     {billing.rfc && (<label className="productDetail-Label"><b>RFC:</b> {billing.rfc}</label>)}
//                     {billing.email && (<label className="productDetail-Label"><b>Correo:</b> {billing.email}</label>)}
//                     {billing.phone && (<label className="productDetail-Label"><b>Teléfono:</b> {billing.phone}</label>)}<br/>
//                     {(billing.billingStreet || billing.billingExterior || billing.billingInterior) && (
//                       <label className="productDetail-Label">
//                         {billing.billingStreet} {billing.billingExterior}
//                         {billing.billingInterior ? ` Int. ${billing.billingInterior}` : ""}
//                       </label>
//                     )}
//                     {billing.billingColony && <label className="productDetail-Label">Col. {billing.billingColony}</label>}
//                     {(billing.billingCity || billing.billingState) && (
//                       <label className="productDetail-Label">
//                         {billing.billingCity}{billing.billingCity && billing.billingState ? ", " : ""}{billing.billingState}
//                       </label>
//                     )}
//                     {billing.billingCP && <label className="productDetail-Label">C.P.: {billing.billingCP}</label>}
//                     {billing.country && <label className="productDetail-Label">{billing.country}</label>}
//                     {billing.taxRegime && (<label className="productDetail-Label"><b>Régimen Fiscal:</b> {billing.taxRegime}</label>)}
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* ========== Detalles de Pago ========== */}
//             <div className="deliveryDets-AddressDiv">
//               <div className="headerEditIcon-Div">
//                 <label className="newUserData-Label">Detalles de Pago</label>
//               </div>
//               <div className="existingQuote-Div">
//                 <div className="quoteAndFile-Div">
//                   {order?.paymentOption && (
//                     <label className="productDetail-Label">
//                       <b>Opción de pago:</b> {order.paymentOption}
//                     </label>
//                   )}
//                   {order?.creditTermDays && (
//                     <label className="productDetail-Label">
//                       <b>Crédito (días):</b> {order.creditTermDays}
//                     </label>
//                   )}
//                   {order?.creditDueDate && (
//                     <label className="productDetail-Label">
//                       <b>Vencimiento:</b> {formatDate(order.creditDueDate)}
//                     </label>
//                   )}
//                   {order?.paymentMethod && (
//                     <label className="productDetail-Label"><b>Método de pago:</b> {order.paymentMethod}</label>
//                   )}
//                   {order?.paymentAccount && (
//                     <label className="productDetail-Label">Cuenta de recepción de pago: {order.paymentAccount}</label>
//                   )}
//                 </div>
//               </div>
//             </div>

//             {/* ========== Preparación de Pedido ========== */}
//             <div className="deliveryDets-AddressDiv">
//               <div className="headerEditIcon-Div">
//                 <label className="newUserData-Label">Preparación de Pedido</label>
//               </div>
//               <div className="existingQuote-Div">
//                 <div className="quoteAndFile-Div">
//                   <label className="productDetail-Label">
//                     <b>Pedido preparado por:</b> {packerName || "—"}
//                   </label>

//                   {/* Fotos de empaque */}
//                   {Array.isArray(order?.packingEvidenceExt) && order.packingEvidenceExt.length > 0 ? (
//                     <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginTop: 10 }}>
//                       {order.packingEvidenceExt.map((f, idx) =>
//                         f ? (
//                           <a key={`p-img-${idx}`} href={fileUrl("packing", idx)} target="_blank" rel="noreferrer" title={f.filename || `evidencia_${idx + 1}`}>
//                             {isImageMime(f.mimetype) ? (
//                               <img
//                                 src={fileUrl("packing", idx)}
//                                 alt={f.filename || `evidencia_${idx + 1}`}
//                                 style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,.12)" }}
//                               />
//                             ) : (
//                               <div style={{ width: "100%", height: 120, display: "grid", placeItems: "center", border: "1px solid #ddd", borderRadius: 8 }}>
//                                 {f.filename || `archivo-${idx + 1}`}
//                               </div>
//                             )}
//                           </a>
//                         ) : null
//                       )}
//                     </div>
//                   ) : (
//                     <label className="productDetail-Label" style={{ color: "#6b7280", marginTop: 6 }}>
//                       (Sin fotos de preparación registradas)
//                     </label>
//                   )}
//                 </div>
//               </div>
//             </div>

//             {/* ========== Detalles de Entrega ========== */}
//             <div className="deliveryDets-AddressDiv">
//               <div className="headerEditIcon-Div">
//                 <label className="newUserData-Label">Detalles Entrega</label>
//               </div>
//               <div className="existingQuote-Div">
//                 <div className="quoteAndFile-Div">
//                   <label className="productDetail-Label">
//                     Fecha de entrega: <label>{formatDate(order?.deliveryDateYMD || order?.deliveryDate)}</label>
//                   </label>
//                   {order?.trackingNumber && (
//                     <label className="productDetail-Label">Número de guía: {order.trackingNumber}</label>
//                   )}
//                   {order?.insuredAmount != null && order?.insuredAmount !== "" && (
//                     <label className="productDetail-Label"><b>Monto asegurado:</b> ${fmtMoney(order.insuredAmount, "es-MX")} MXN</label>
//                   )}
//                   {order?.deliveryEvidenceExt && (
//                     <div style={{ marginTop: 10 }}>
//                       <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
//                         <b>Evidencia de entrega:</b>
//                       </div>
//                       <a href={fileUrl("delivery")} target="_blank" rel="noreferrer">
//                         {isImageMime(order.deliveryEvidenceExt.mimetype) ? (
//                           <img
//                             src={fileUrl("delivery")}
//                             alt={order.deliveryEvidenceExt.filename || "evidencia_de_entrega"}
//                             style={{ maxWidth: "100%", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,.12)" }}
//                           />
//                         ) : (
//                           <span>Descargar: {order.deliveryEvidenceExt.filename || "entrega"}</span>
//                         )}
//                       </a>
//                     </div>
//                   )}
//                 </div>
//               </div>
//             </div>

//           </div>
//         </div>
//       </div>

//       {/* FOOTER NAV */}
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





