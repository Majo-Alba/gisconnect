// and to conclude, the "Crédito", in newOrderDetails.jsx under the "Método de Pago", lets add "Crédito" to the options.Let me know if we need to make any modifictions so this also shows and gets stored correctly to mongodb's "paymentMethod". As well, for "Cuenta de Recepción" dropdown, add "Pendiente" as an option and, as well, tell me if anything else needs to be modified for it to be stored in mongodb's "paymentAccount". Here is my current newOrderDetails.jsx 
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

  // ======== Google Sheets client DB (fallbacks) ========
  const [csvData, setCsvData] = useState([]);

  // ======== Product DB (Google Sheets) ========  ⬅️ NEW
  const PRODUCTS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

  const [productsCsv, setProductsCsv] = useState([]);
  const [productsLoaded, setProductsLoaded] = useState(false);

  // ======== MongoDB user fields ========
  const [clientFullName, setClientFullName] = useState(""); // nombre + apellido
  const [companyFromMongo, setCompanyFromMongo] = useState(""); // empresa

  useEffect(() => {
    fetchCSVData(); // run once on mount (client DB)
    fetchProductsCSV(); // ⬅️ NEW: load product database
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

  // ⬅️ NEW: fetch products CSV
  const fetchProductsCSV = () => {
    if (!PRODUCTS_CSV_URL) {
      console.warn("PRODUCTS_CSV_URL not defined");
      setProductsLoaded(true);
      return;
    }
    axios
      .get(PRODUCTS_CSV_URL)
      .then((res) => {
        const rows = parseCSV(res.data);
        setProductsCsv(rows || []);
      })
      .catch((err) => {
        console.error("Error fetching products CSV:", err);
      })
      .finally(() => setProductsLoaded(true));
  };

  function parseCSV(csvText) {
    const rows = csvText.split(/\r?\n/).filter(Boolean);
    if (rows.length === 0) return [];
    const headers = rows[0].split(",").map((h) => h.trim());
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const line = rows[i];
      const cols = line.split(",");
      const obj = {};
      headers.forEach((h, j) => {
        obj[h] = (cols[j] ?? "").trim();
      });
      data.push(obj);
    }
    return data;
  }

  // 🔎 Build a quick index to find product rows fast  ⬅️ NEW
  const productIndex = useMemo(() => {
    // Try multiple possible name/sku columns
    const NAME_KEYS = ["NOMBRE_PRODUCTO", "DESCRIPCION", "DESCRIPCIÓN", "NOMBRE", "PRODUCTO"];
    const KEY_KEYS = ["CLAVE", "SKU", "CODIGO", "CÓDIGO"];

    const norm = (s) => String(s || "").trim().toLowerCase();

    const index = new Map();
    for (const row of productsCsv) {
      // Determine an anchor key
      let key = "";
      for (const k of KEY_KEYS) {
        if (row[k]) {
          key = norm(row[k]);
          break;
        }
      }
      // fallback to name
      if (!key) {
        for (const k of NAME_KEYS) {
          if (row[k]) {
            key = norm(row[k]);
            break;
          }
        }
      }
      if (!key) continue;
      // If duplicates appear, first one wins (or last—doesn't matter much)
      if (!index.has(key)) index.set(key, row);
    }
    return { index, productsCsv };
  }, [productsCsv]);

  // Try to locate a product row for an order item  ⬅️ NEW
  const findProductRow = useCallback(
    (item) => {
      const norm = (s) => String(s || "").trim().toLowerCase();

      // Common item identifiers we have in orders
      const candidates = [
        norm(item.sku),
        norm(item.code),
        norm(item.product),
        norm(item.presentation),
        norm(`${item.product} ${item.presentation || ""}`),
      ].filter(Boolean);

      // 1) try direct map hits
      for (const c of candidates) {
        if (c && productIndex.index.has(c)) return productIndex.index.get(c);
      }

      // 2) fallback: loose contains search across name columns
      const NAME_KEYS = ["NOMBRE_PRODUCTO", "DESCRIPCION", "DESCRIPCIÓN", "NOMBRE", "PRODUCTO"];
      for (const row of productIndex.productsCsv) {
        for (const k of NAME_KEYS) {
          if (row[k] && norm(row[k]).includes(norm(item.product || ""))) {
            return row;
          }
        }
      }
      return null;
    },
    [productIndex]
  );

  // Lookup: match order.userEmail → CORREO_EMPRESA (CSV fallbacks)
  const clientInfo = useMemo(() => {
    if (!order?.userEmail || csvData.length === 0) return null;
    const norm = (s) => String(s || "").trim().toLowerCase();
    return (
      csvData.find((r) => norm(r.CORREO_EMPRESA) === norm(order.userEmail)) || null
    );
  }, [csvData, order?.userEmail]);

  const csvDisplayName = clientInfo?.NOMBRE_APELLIDO || "";
  const csvCompanyName = clientInfo?.NOMBRE_EMPRESA || "";

  // ======== Fetch nombre, apellido, empresa from Mongo after order loads ========
  useEffect(() => {
    const email = String(order?.userEmail || "").trim().toLowerCase();
    if (!email) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/users/by-email`, { params: { email } });
        const u = res?.data || {};
        const nombre = (u.nombre || "").toString().trim();
        const apellido = (u.apellido || "").toString().trim();
        const empresa = (u.empresa || "").toString().trim();
        const full = [nombre, apellido].filter(Boolean).join(" ");

        if (!cancelled) {
          setClientFullName(full);
          setCompanyFromMongo(empresa);
        }
      } catch (_err) {
        // ignore; fallbacks will be used
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order?.userEmail]);
  // ============================================================================

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
        const res = await fetch(`${API}/orders/${orderId}`);
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

  useEffect(() => {
    load();
  }, [orderId]);

  async function load() {
    try {
      const res = await axios.get(`${API}/orders/${orderId}`);
      setOrder(res.data);
    } catch (e) {
      console.error("Load order error:", e);
    }
  }

  // ======== RECEIVING ACCOUNT OPTIONS (based on billingInfo) ========
  const hasInvoiceBilling = useMemo(() => {
    const bi = order?.billingInfo;
    if (!bi || typeof bi !== "object") return false;
    const vals = Object.values(bi);
    if (vals.length === 0) return false;
    return vals.some((v) => String(v ?? "").trim() !== "");
  }, [order?.billingInfo]);

  const receivingAccountOptions = useMemo(() => {
    const base = hasInvoiceBilling
      ? [
          { value: "BBVA *1207", label: "MXN: BBVA *1207" },
          { value: "MONEX *8341", label: "USD: MONEX *8341" },
          { value: "INVEX *4234", label: "USD: INVEX *4234" },
        ]
      : [
          { value: "BBVA *4078", label: "MXN: BBVA *4078" },
        ];
  
    // NEW: always include "Pendiente" at the top
    return [{ value: "Pendiente", label: "Pendiente" }, ...base];
  }, [hasInvoiceBilling]);

  // Keep selected account valid when options change; prefer order.receivingAccount if valid
  useEffect(() => {
    const allowed = receivingAccountOptions.map((o) => o.value);
    if (!allowed.includes(account)) {
      const preferred = allowed.includes(order?.receivingAccount) 
      ? order?.receivingAccount 
      : "";
      setAccount(preferred);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivingAccountOptions, order?.receivingAccount]);

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

  // --------- FORMAT HELPERS ----------
  const fmtNum = (v, locale = "es-MX") =>
    (Number(v) || 0).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const unitFmt = (n, cur) => {
    if (cur === "USD") return `$${fmtNum(n, "en-US")} USD`;
    return `$${fmtNum(n, "es-MX")} MXN`;
  };

  const normCur = (v) => String(v || "").trim().toUpperCase();
  const numOr0 = (v) => {
    const n = Number(String(v).replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  // ⬅️ NEW: currency & price from PRODUCTS_CSV_URL when DB doesn't store currency
  const getItemCurrency = (it) => {
    const row = findProductRow(it);
    const prefersUSD =
      numOr0(row?.PRECIO_UNITARIO_DOLARES) > 0 || numOr0(row?.PRECIO_PIEZA_DOLARES) > 0;
    const prefersMXN =
      numOr0(row?.PRECIO_UNITARIO_MXN) > 0 || numOr0(row?.PRECIO_PIEZA_MXN) > 0;

    if (prefersUSD && !prefersMXN) return "USD";
    if (prefersMXN && !prefersUSD) return "MXN";
    if (prefersUSD && prefersMXN) {
      const src = `${account || order?.receivingAccount || receivingAccount}`.toUpperCase();
      if (src.includes("USD") || src.includes("MONEX") || src.includes("INVEX")) return "USD";
      return "MXN";
    }

    if (it.priceUSD != null) return "USD";
    if (it.priceMXN != null) return "MXN";
    const src = `${account || order?.receivingAccount || receivingAccount}`.toUpperCase();
    if (src.includes("USD") || src.includes("MONEX") || src.includes("INVEX")) return "USD";
    return "MXN";
  };

  // ⬅️ NEW: unit price preferring CSV when order item lacks a clean value
  const getUnitPrice = (it) => {
    const cur = getItemCurrency(it);
    const fromItem =
      cur === "USD" ? Number(it.priceUSD ?? it.price ?? 0) : Number(it.priceMXN ?? it.price ?? 0);
    if (fromItem > 0) return fromItem;

    const row = findProductRow(it);
    if (!row) return 0;

    if (cur === "USD") {
      const usd = numOr0(row.PRECIO_UNITARIO_DOLARES) || numOr0(row.PRECIO_PIEZA_DOLARES);
      return usd;
    } else {
      const mxn = numOr0(row.PRECIO_UNITARIO_MXN) || numOr0(row.PRECIO_PIEZA_MXN);
      return mxn;
    }
  };

  // --------- Legacy sums kept only for per-item display (not for totals box anymore) ----------
  const sums = useMemo(() => {
    const list = Array.isArray(order?.items) ? order.items : [];
    let usd = 0;
    let mxn = 0;
    list.forEach((it) => {
      const cur = getItemCurrency(it);
      const qty = Number(it.amount) || 0;
      const unit = getUnitPrice(it);
      if (cur === "USD") {
        usd += qty * unit;
      } else {
        mxn += qty * unit;
      }
    });
    return { usd, mxn };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.items, productsLoaded, productsCsv, account, order?.receivingAccount, receivingAccount]);

  // ⬅️ NEW: normalize the latest totals snapshot from Mongo (array or object)
  const latestTotals = useMemo(() => {
    const t = order?.totals;
    if (Array.isArray(t)) return t[t.length - 1] || {};
    return t && typeof t === "object" ? t : {};
  }, [order?.totals]);

  // ⬅️ NEW: decide from Mongo's paymentCurrency (fallback to preferredCurrency if needed)
  const payCurrency = useMemo(
    () =>
      normCur(order?.paymentCurrency) ||
      normCur(order?.preferredCurrency) ||
      "",
    [order?.paymentCurrency, order?.preferredCurrency]
  );

  // ⬅️ NEW: Display totals based ONLY on Mongo fields
  const displayTotals = useMemo(() => {
    const usdNative = numOr0(latestTotals.totalUSDNative);
    const mxnNative = numOr0(latestTotals.totalMXNNative);
    const allMXN = numOr0(latestTotals.totalAllMXN) || numOr0(latestTotals.finalAllMXN);

    if (payCurrency === "USD") {
      // Show USD from totalUSDNative.
      // MXN shows totalMXNNative if present, else 0.
      return {
        showUSD: true,
        usd: usdNative,
        showMXN: true,
        mxn: mxnNative || 0,
        note: null,
      };
    }

    if (payCurrency === "MXN") {
      // USD remains 0; MXN comes from totalAllMXN (or finalAllMXN as fallback).
      return {
        showUSD: true,
        usd: 0,
        showMXN: true,
        mxn: allMXN,
        note: null,
      };
    }

    // Fallback if paymentCurrency missing: show whatever is available
    return {
      showUSD: true,
      usd: usdNative,
      showMXN: true,
      mxn: mxnNative || allMXN || 0,
      note: null,
    };
  }, [latestTotals, payCurrency]);

  // Actions
  const handleValidatePayment = async () => {
    try {
      const updatedData = {
        paymentMethod,
        paymentAccount: account,
        orderStatus: "Pago Verificado",
      };
      await axios.put(`${API}/orders/${orderId}`, updatedData);
      setIsValidated(true);
      alert("Pago validado exitosamente.");
      navigate("/adminHome");
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

  const displayName = (clientFullName || csvDisplayName || order.userEmail || "").trim();
  const displayCompany = (companyFromMongo || csvCompanyName || "").trim();

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

      {/* Top summary */}
      <div className="newQuotesDetail-Div">
        <label>{displayName}</label>
        <label>{displayCompany || "—"}</label>
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
        {/* Items + Totals */}
        <div className="paymentValidationProducts-Div">
          {order.items && order.items.length > 0 ? (
            order.items.map((item, index) => {
              const cur = getItemCurrency(item);
              const unit = getUnitPrice(item);
              return (
                <div key={index} className="newOrderDets-Div">
                  <div className="orderDetails-Div">
                    <label className="orderDets-Label">
                      <b>{item.product}</b>
                    </label>

                    {/* Presentación */}
                    <label className="orderDets-Label">
                      <b>Presentación:</b> {item.presentation || item.packPresentation || "N/A"}
                    </label>

                    <label className="orderDets-Label">
                      <b>Cantidad:</b> {item.amount}
                    </label>

                    {/* Precio unitario with currency + thousands separators */}
                    <label className="orderDets-Label">
                      <b>Precio Unitario:</b> {unitFmt(unit, cur)}
                    </label>
                  </div>
                </div>
              );
            })
          ) : (
            <p>No hay productos en este pedido.</p>
          )}

          {/* Totals per Mongo rules */}
          {displayTotals.showUSD && (
            <label className="newOrderDetsTotal-Label">
              <b>Total USD:</b> ${fmtNum(displayTotals.usd, "en-US")}
            </label>
          )}
          {displayTotals.showMXN && (
            <label className="newOrderDetsTotal-Label">
              <b>Total MXN:</b> ${fmtNum(displayTotals.mxn, "es-MX")}
            </label>
          )}
          {displayTotals.note && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{displayTotals.note}</div>
          )}
          {!displayTotals.showUSD && !displayTotals.showMXN && (
            <label className="newOrderDetsTotal-Label" style={{ color: "#b45309" }}>
              (Totales no disponibles en el registro actual)
            </label>
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
              <option value="Transferencia electrónica de fondos">03: Transferencia electrónica de fondos</option>
              <option value="Crédito">04: Crédito</option>
            </select>
          </div>

          <div className="paymentDets-Dropdown">
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Cuenta de Recepción</label>
            </div>
            <select className="paymentDets-Select" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Selecciona cuenta</option>
              {receivingAccountOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="paymentDets-Dropdown">
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Evidencia de Pago</label>
              <div className="existingQuote-Div">
                {order?.evidenceFileExt ? (
                  <EvidenceGallery orderId={orderId} evidenceFileExt={order.evidenceFileExt} />
                ) : (
                  <div style={{ fontSize: 12, color: "#666" }}>Aún no hay evidencia de pago cargada por el cliente.</div>
                )}
              </div>
            </div>
          </div>

          {/* Evidence preview + actions */}
          <div className="paymentEvidence-Div" style={{ gap: 12, alignItems: "center" }}>
            <img
              src={evidenceUrl}
              alt=""
              style={{ cursor: evidenceUrl ? "zoom-in" : "default", objectFit: "cover" }}
              onClick={evidenceUrl ? () => setIsLightboxOpen(true) : undefined}
            />
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

// // Rather than using the DOF to display "Total USD" and "Total MXN", letts do rhe following. In MongoDb we have a field "paymentCurrency". If this is set to "USD", for "Total USD" get info from mongDB field "totalUSDNative" and check if there's data for "totalMXNNative". If data exists, then this will be "Total MXN". If no data exists, leave "Total MXN" in zeros. Now, if "paymentCurrency" is MXN, then "Total USD" will remain in zeros and data for "Total MXN" will come from "totalAllMXN". Please handle these changes and direct edit 
// import EvidenceGallery from "/src/components/EvidenceGallery";
// import axios from "axios";
// import { API } from "/src/lib/api";
// import { useParams, useNavigate } from "react-router-dom";
// import { useState, useEffect, useCallback, useMemo } from "react";

// import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import CotizaIcon from "/src/assets/images/Icono_Cotiza.png";
// import TicketFallback from "/src/assets/images/ticketExample.jpg";

// export default function NewOrderDetails() {
//   const { orderId } = useParams();
//   const navigate = useNavigate();

//   const [order, setOrder] = useState(null);
//   const [error, setError] = useState(null);

//   const [paymentMethod, setPaymentMethod] = useState("");
//   const [receivingAccount, setReceivingAccount] = useState("");
//   const [account, setAccount] = useState("");
//   const [isValidated, setIsValidated] = useState(false);

//   // Evidence image url + lightbox
//   const [evidenceUrl, setEvidenceUrl] = useState(null);
//   const [isLightboxOpen, setIsLightboxOpen] = useState(false);

//   // ======== Google Sheets client DB (fallbacks) ========
//   const [csvData, setCsvData] = useState([]);

//   // ======== Product DB (Google Sheets) ========  ⬅️ NEW
//   const PRODUCTS_CSV_URL =
//   "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";
  
//   const [productsCsv, setProductsCsv] = useState([]);
//   const [productsLoaded, setProductsLoaded] = useState(false);

//   // ======== MongoDB user fields ========
//   const [clientFullName, setClientFullName] = useState(""); // nombre + apellido
//   const [companyFromMongo, setCompanyFromMongo] = useState(""); // empresa

//   useEffect(() => {
//     fetchCSVData(); // run once on mount (client DB)
//     fetchProductsCSV(); // ⬅️ NEW: load product database
//   }, []);

//   const fetchCSVData = () => {
//     const csvUrl =
//       "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";

//     axios
//       .get(csvUrl)
//       .then((response) => {
//         const parsedCsvData = parseCSV(response.data);
//         setCsvData(parsedCsvData || []);
//       })
//       .catch((error) => {
//         console.error("Error fetching CSV data:", error);
//       });
//   };

//   // ⬅️ NEW: fetch products CSV
//   const fetchProductsCSV = () => {
//     if (!PRODUCTS_CSV_URL) {
//       console.warn("PRODUCTS_CSV_URL not defined");
//       setProductsLoaded(true);
//       return;
//     }
//     axios
//       .get(PRODUCTS_CSV_URL)
//       .then((res) => {
//         const rows = parseCSV(res.data);
//         setProductsCsv(rows || []);
//       })
//       .catch((err) => {
//         console.error("Error fetching products CSV:", err);
//       })
//       .finally(() => setProductsLoaded(true));
//   };

//   function parseCSV(csvText) {
//     const rows = csvText.split(/\r?\n/).filter(Boolean);
//     if (rows.length === 0) return [];
//     const headers = rows[0].split(",").map((h) => h.trim());
//     const data = [];
//     for (let i = 1; i < rows.length; i++) {
//       const line = rows[i];
//       const cols = line.split(",");
//       const obj = {};
//       headers.forEach((h, j) => {
//         obj[h] = (cols[j] ?? "").trim();
//       });
//       data.push(obj);
//     }
//     return data;
//   }

//   // 🔎 Build a quick index to find product rows fast  ⬅️ NEW
//   const productIndex = useMemo(() => {
//     // Try multiple possible name/sku columns
//     const NAME_KEYS = ["NOMBRE_PRODUCTO", "DESCRIPCION", "DESCRIPCIÓN", "NOMBRE", "PRODUCTO"];
//     const KEY_KEYS = ["CLAVE", "SKU", "CODIGO", "CÓDIGO"];

//     const norm = (s) => String(s || "").trim().toLowerCase();

//     const index = new Map();
//     for (const row of productsCsv) {
//       // Determine an anchor key
//       let key = "";
//       for (const k of KEY_KEYS) {
//         if (row[k]) {
//           key = norm(row[k]);
//           break;
//         }
//       }
//       // fallback to name
//       if (!key) {
//         for (const k of NAME_KEYS) {
//           if (row[k]) {
//             key = norm(row[k]);
//             break;
//           }
//         }
//       }
//       if (!key) continue;
//       // If duplicates appear, first one wins (or last—doesn't matter much)
//       if (!index.has(key)) index.set(key, row);
//     }
//     return { index, productsCsv };
//   }, [productsCsv]);

//   // Try to locate a product row for an order item  ⬅️ NEW
//   const findProductRow = useCallback(
//     (item) => {
//       const norm = (s) => String(s || "").trim().toLowerCase();

//       // Common item identifiers we have in orders
//       const candidates = [
//         norm(item.sku),
//         norm(item.code),
//         norm(item.product),
//         norm(item.presentation),
//         norm(`${item.product} ${item.presentation || ""}`),
//       ].filter(Boolean);

//       // 1) try direct map hits
//       for (const c of candidates) {
//         if (c && productIndex.index.has(c)) return productIndex.index.get(c);
//       }

//       // 2) fallback: loose contains search across name columns
//       const NAME_KEYS = ["NOMBRE_PRODUCTO", "DESCRIPCION", "DESCRIPCIÓN", "NOMBRE", "PRODUCTO"];
//       for (const row of productIndex.productsCsv) {
//         for (const k of NAME_KEYS) {
//           if (row[k] && norm(row[k]).includes(norm(item.product || ""))) {
//             return row;
//           }
//         }
//       }
//       return null;
//     },
//     [productIndex]
//   );

//   // Lookup: match order.userEmail → CORREO_EMPRESA (CSV fallbacks)
//   const clientInfo = useMemo(() => {
//     if (!order?.userEmail || csvData.length === 0) return null;
//     const norm = (s) => String(s || "").trim().toLowerCase();
//     return (
//       csvData.find(
//         (r) => norm(r.CORREO_EMPRESA) === norm(order.userEmail)
//       ) || null
//     );
//   }, [csvData, order?.userEmail]);

//   const csvDisplayName = clientInfo?.NOMBRE_APELLIDO || "";
//   const csvCompanyName = clientInfo?.NOMBRE_EMPRESA || "";

//   // ======== Fetch nombre, apellido, empresa from Mongo after order loads ========
//   useEffect(() => {
//     const email = String(order?.userEmail || "").trim().toLowerCase();
//     if (!email) return;

//     let cancelled = false;
//     (async () => {
//       try {
//         const res = await axios.get(`${API}/users/by-email`, { params: { email } });
//         const u = res?.data || {};
//         const nombre = (u.nombre || "").toString().trim();
//         const apellido = (u.apellido || "").toString().trim();
//         const empresa = (u.empresa || "").toString().trim();
//         const full = [nombre, apellido].filter(Boolean).join(" ");

//         if (!cancelled) {
//           setClientFullName(full);
//           setCompanyFromMongo(empresa);
//         }
//       } catch (_err) {
//         // ignore; fallbacks will be used
//       }
//     })();

//     return () => { cancelled = true; };
//   }, [order?.userEmail]);
//   // ============================================================================

//   const bufferToObjectUrl = (fileObj) => {
//     try {
//       if (!fileObj) return null;
//       const raw = fileObj.data?.data || fileObj.data;
//       if (!raw || !Array.isArray(raw)) return null;
//       const mime = fileObj.mimetype || "image/*";
//       const bytes = new Uint8Array(raw);
//       const blob = new Blob([bytes], { type: mime });
//       return URL.createObjectURL(blob);
//     } catch (e) {
//       console.warn("Failed to build object URL from evidence buffer:", e);
//       return null;
//     }
//   };

//   useEffect(() => {
//     const fetchOrderDetails = async () => {
//       try {
//         const res = await fetch(`${API}/orders/${orderId}`);
//         if (!res.ok) {
//           const message = await res.text();
//           throw new Error(message || "Failed to fetch order details");
//         }
//         const data = await res.json();
//         setPaymentMethod(data.paymentMethod || "");
//         setReceivingAccount(data.receivingAccount || "");
//         setOrder(data);
//         setError(null);

//         let url = null;
//         if (data?.evidenceFile?.data) {
//           url = bufferToObjectUrl(data.evidenceFile);
//         } else if (data?.paymentEvidence?.data) {
//           // legacy field name fallback
//           url = bufferToObjectUrl(data.paymentEvidence);
//         }

//         setEvidenceUrl((prev) => {
//           if (prev) URL.revokeObjectURL(prev);
//           return url;
//         });
//       } catch (err) {
//         console.error(err);
//         setError("Error loading order details.");
//       }
//     };

//     fetchOrderDetails();

//     return () => {
//       if (evidenceUrl) URL.revokeObjectURL(evidenceUrl);
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [orderId]);

//   // Lightbox handlers
//   const openLightbox = useCallback(() => {
//     if (evidenceUrl) setIsLightboxOpen(true);
//   }, [evidenceUrl]);

//   const closeLightbox = useCallback(() => {
//     setIsLightboxOpen(false);
//   }, []);

//   useEffect(() => {
//     if (!isLightboxOpen) return;
//     const onKey = (e) => e.key === "Escape" && closeLightbox();
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, [isLightboxOpen, closeLightbox]);

//   useEffect(() => { load(); }, [orderId]);

//   async function load() {
//     try {
//       const res = await axios.get(`${API}/orders/${orderId}`);
//       setOrder(res.data);
//     } catch (e) {
//       console.error("Load order error:", e);
//     }
//   }

//   // ======== RECEIVING ACCOUNT OPTIONS (based on billingInfo) ========
//   const hasInvoiceBilling = useMemo(() => {
//     const bi = order?.billingInfo;
//     if (!bi || typeof bi !== "object") return false;
//     const vals = Object.values(bi);
//     if (vals.length === 0) return false;
//     return vals.some((v) => String(v ?? "").trim() !== "");
//   }, [order?.billingInfo]);

//   const receivingAccountOptions = useMemo(
//     () =>
//       hasInvoiceBilling
//         ? [
//             { value: "BBVA *1207", label: "MXN: BBVA *1207" },
//             { value: "MONEX *8341", label: "USD: MONEX *8341" },
//             { value: "INVEX *4234", label: "USD: INVEX *4234" },
//           ]
//         : [{ value: "BBVA *4078", label: "MXN: BBVA *4078" }],
//     [hasInvoiceBilling]
//   );

//   // Keep selected account valid when options change; prefer order.receivingAccount if valid
//   useEffect(() => {
//     const allowed = receivingAccountOptions.map((o) => o.value);
//     if (!allowed.includes(account)) {
//       const preferred = allowed.includes(order?.receivingAccount)
//         ? order.receivingAccount
//         : "";
//       setAccount(preferred);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [receivingAccountOptions, order?.receivingAccount]);

//   // Navigation
//   function goToAdminHome() { navigate("/adminHome"); }
//   function goToNewOrders() { navigate("/newOrders"); }
//   function goToDeliverReady() { navigate("/deliverReady"); }
//   function goHomeLogo() { navigate("/adminHome"); }

//   // --------- FORMAT HELPERS ----------
//   const fmtNum = (v, locale = "es-MX") =>
//     (Number(v) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

//   const unitFmt = (n, cur) => {
//     if (cur === "USD") return `$${fmtNum(n, "en-US")} USD`;
//     return `$${fmtNum(n, "es-MX")} MXN`;
//   };

//   const normCur = (v) => String(v || "").trim().toUpperCase();
//   const numOr0 = (v) => {
//     const n = Number(String(v).replace(/[, ]/g, ""));
//     return Number.isFinite(n) ? n : 0;
//   };

//   // ⬅️ NEW: currency & price from PRODUCTS_CSV_URL when DB doesn't store currency
//   const getItemCurrency = (it) => {
//     const row = findProductRow(it);
//     const prefersUSD =
//       numOr0(row?.PRECIO_UNITARIO_DOLARES) > 0 || numOr0(row?.PRECIO_PIEZA_DOLARES) > 0;
//     const prefersMXN =
//       numOr0(row?.PRECIO_UNITARIO_MXN) > 0 || numOr0(row?.PRECIO_PIEZA_MXN) > 0;

//     if (prefersUSD && !prefersMXN) return "USD";
//     if (prefersMXN && !prefersUSD) return "MXN";
//     if (prefersUSD && prefersMXN) {
//       // If both appear (data issue), fall back to receiving account / prior heuristic
//       const src = `${account || order?.receivingAccount || receivingAccount}`.toUpperCase();
//       if (src.includes("USD") || src.includes("MONEX") || src.includes("INVEX")) return "USD";
//       return "MXN";
//     }

//     // Fallbacks (rare)
//     if (it.priceUSD != null) return "USD";
//     if (it.priceMXN != null) return "MXN";
//     const src = `${account || order?.receivingAccount || receivingAccount}`.toUpperCase();
//     if (src.includes("USD") || src.includes("MONEX") || src.includes("INVEX")) return "USD";
//     return "MXN";
//   };

//   // ⬅️ NEW: unit price preferring CSV when order item lacks a clean value
//   const getUnitPrice = (it) => {
//     const cur = getItemCurrency(it);
//     const fromItem =
//       cur === "USD" ? Number(it.priceUSD ?? it.price ?? 0) : Number(it.priceMXN ?? it.price ?? 0);
//     if (fromItem > 0) return fromItem;

//     const row = findProductRow(it);
//     if (!row) return 0;

//     if (cur === "USD") {
//       const usd =
//         numOr0(row.PRECIO_UNITARIO_DOLARES) || numOr0(row.PRECIO_PIEZA_DOLARES);
//       return usd;
//     } else {
//       const mxn =
//         numOr0(row.PRECIO_UNITARIO_MXN) || numOr0(row.PRECIO_PIEZA_MXN);
//       return mxn;
//     }
//   };

//   // --------- TOTALS (native sums + DOF conversion per rules) ----------
//   const sums = useMemo(() => {
//     const list = Array.isArray(order?.items) ? order.items : [];
//     let usd = 0;
//     let mxn = 0;
//     list.forEach((it) => {
//       const cur = getItemCurrency(it);
//       const qty = Number(it.amount) || 0;
//       const unit = getUnitPrice(it);
//       if (cur === "USD") {
//         usd += qty * unit;
//       } else {
//         mxn += qty * unit;
//       }
//     });
//     return { usd, mxn };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [order?.items, productsLoaded, productsCsv, account, order?.receivingAccount, receivingAccount]);

//   // Determine the user's selected paying currency
//   const payPref = useMemo(() => {
//     const explicit = normCur(order?.preferredCurrency);
//     if (explicit === "USD" || explicit === "MXN") return explicit;
//     const src = `${account || order?.receivingAccount || receivingAccount}`.toUpperCase();
//     if (src.includes("USD") || src.includes("MONEX") || src.includes("INVEX")) return "USD";
//     return "MXN";
//   }, [order?.preferredCurrency, account, order?.receivingAccount, receivingAccount]);

//   const dofRate = useMemo(() => {
//     const t = order?.totals;
//     const tryNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
//     if (t && typeof t === "object") {
//       return tryNum(t.dofRate ?? t.dof2 ?? order?.dofRate ?? 0);
//     }
//     return 0;
//   }, [order]);

//   // ✅ Siempre mostramos totales nativos disponibles.
//   // Si hay DOF y existen USD, el Total MXN incluye conversión de USD.
//   // Si NO hay DOF pero existen USD, Total MXN NO incluye conversión y lo aclaramos en la nota.
//   const displayTotals = useMemo(() => {
//     const hasUSD = sums.usd > 0;
//     const hasMXN = sums.mxn > 0;

//     const convertedUSDinMXN = hasUSD && dofRate ? (sums.usd * dofRate) : 0;

//     // Siempre mostramos Total USD si hay partidas en USD
//     const showUSD = hasUSD;
//     const usd = hasUSD ? sums.usd : 0;

//     // Siempre mostramos Total MXN (al menos el nativo)
//     // Si hay DOF, sumamos conversión de USD; si no hay DOF, mostramos solo el nativo
//     const showMXN = hasMXN || hasUSD; // si solo hay USD también mostramos MXN (conversión si existe DOF)
//     const mxn = hasMXN
//       ? sums.mxn + convertedUSDinMXN
//       : convertedUSDinMXN; // si no hay MXN nativo y sí hay USD, Total MXN sólo será la conversión cuando exista DOF

//     let note = null;
//     if (hasUSD && !dofRate) {
//       // No bloqueamos totales. Solo avisamos que el Total MXN no incluye conversión de USD.
//       note = "Sin tipo de cambio DOF; el Total MXN no incluye conversión de USD.";
//     } else if (hasUSD && dofRate) {
//       note = `Incluye conversión: USD ${fmtNum(sums.usd, "en-US")} × ${dofRate.toFixed(2)} = MXN ${fmtNum(convertedUSDinMXN)}`;
//     }

//     return { showUSD, usd, showMXN, mxn, note };
//   }, [sums, dofRate]);

//   // const displayTotals = useMemo(() => {
//   //   const onlyUSD = sums.usd > 0 && sums.mxn === 0;
//   //   const onlyMXN = sums.mxn > 0 && sums.usd === 0;
//   //   const mixed = sums.usd > 0 && sums.mxn > 0;

//   //   if (payPref === "USD") {
//   //     if (onlyUSD) {
//   //       return { showUSD: true, usd: sums.usd, showMXN: false, mxn: 0, note: null };
//   //     }
//   //     if (mixed) {
//   //       return { showUSD: true, usd: sums.usd, showMXN: true, mxn: sums.mxn, note: null };
//   //     }
//   //     return { showUSD: false, usd: 0, showMXN: true, mxn: sums.mxn, note: "(Orden solo en MXN; el pago debe realizarse en MXN.)" };
//   //   } else {
//   //     if (onlyMXN) {
//   //       return { showUSD: false, usd: 0, showMXN: true, mxn: sums.mxn, note: null };
//   //     }
//   //     const conv = dofRate ? sums.usd * dofRate : 0;
//   //     const grand = (dofRate ? conv : 0) + sums.mxn;
//   //     const note = dofRate
//   //       ? `Incluye conversión: USD ${fmtNum(sums.usd, "en-US")} × ${dofRate.toFixed(2)} = MXN ${fmtNum(conv)}`
//   //       : "No se cuenta con tipo de cambio DOF; no es posible convertir USD a MXN.";
//   //     return { showUSD: false, usd: 0, showMXN: true, mxn: grand, note };
//   //   }
//   // }, [payPref, sums, dofRate]);

//   // Actions
//   const handleValidatePayment = async () => {
//     try {
//       const updatedData = {
//         paymentMethod,
//         paymentAccount: account,
//         orderStatus: "Pago Verificado",
//       };
//       await axios.put(`${API}/orders/${orderId}`, updatedData);
//       setIsValidated(true);
//       alert("Pago validado exitosamente.");
//       navigate("/adminHome");
//     } catch (error) {
//       console.error("Error updating order:", error);
//       alert("Error al validar el pago.");
//     }
//   };

//   if (!order) {
//     return (
//       <div className="body-BG-Gradient">
//         <div className="loginLogo-ParentDiv">
//           <img
//             className="secondaryPages-GISLogo"
//             src={Logo}
//             alt="Logo"
//             width="180"
//             height="55"
//             onClick={goToAdminHome}
//           />
//         </div>
//         <label className="sectionHeader-Label">Detalle de Pedido</label>
//         {error ? (
//           <p style={{ color: "red", textAlign: "center" }}>{error}</p>
//         ) : (
//           <p style={{ textAlign: "center" }}>Cargando detalles del pedido...</p>
//         )}
//       </div>
//     );
//   }

//   const downloadName =
//     order?.evidenceFile?.filename ||
//     order?.paymentEvidence?.filename ||
//     `evidencia_${String(order._id).slice(-5)}.jpg`;

//   const displayName = (clientFullName || csvDisplayName || order.userEmail || "").trim();
//   const displayCompany = (companyFromMongo || csvCompanyName || "").trim();

//   return (
//     <body className="body-BG-Gradient">
//       {/* LOGO */}
//       <div className="loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src={Logo}
//           alt="Home Icon"
//           width="180"
//           height="55"
//           onClick={goHomeLogo}
//         />
//       </div>

//       <div className="edit-titleIcon-Div">
//         <label className="editAddress-headerLabel">Validación de Pago</label>
//         <img src={CotizaIcon} alt="Home Icon" width="35" height="35" />
//       </div>

//       {/* Top summary */}
//       <div className="newQuotesDetail-Div">
//         <label>{displayName}</label>
//         <label>{displayCompany || "—"}</label>
//       </div>

//       <div className="newQuotesDetail-Div">
//         <label>No. {String(order._id).slice(-5)}</label>
//         <label>
//           {order.orderDate
//             ? (() => {
//                 const date = new Date(order.orderDate);
//                 const day = date.getDate().toString().padStart(2, "0");
//                 const month = date.toLocaleString("en-MX", { month: "short" });
//                 const year = date.getFullYear();
//                 return `${day}/${month}/${year}`;
//               })()
//             : "Sin fecha"}
//         </label>
//       </div>

//       <div className="newOrderDets-Scroll">
//         {/* Items + Totals */}
//         <div className="paymentValidationProducts-Div">
//           {order.items && order.items.length > 0 ? (
//             order.items.map((item, index) => {
//               const cur = getItemCurrency(item);
//               const unit = getUnitPrice(item);
//               return (
//                 <div key={index} className="newOrderDets-Div">
//                   <div className="orderDetails-Div">
//                     <label className="orderDets-Label">
//                       <b>{item.product}</b>
//                     </label>

//                     {/* Presentación */}
//                     <label className="orderDets-Label">
//                       <b>Presentación:</b> {item.presentation || item.packPresentation || "N/A"}
//                     </label>

//                     <label className="orderDets-Label">
//                       <b>Cantidad:</b> {item.amount}
//                     </label>

//                     {/* Precio unitario with currency + thousands separators */}
//                     <label className="orderDets-Label">
//                       <b>Precio Unitario:</b> {unitFmt(unit, cur)}
//                     </label>
//                   </div>
//                 </div>
//               );
//             })
//           ) : (
//             <p>No hay productos en este pedido.</p>
//           )}

//           {/* Totals per rules */}
//           {displayTotals.showUSD && (
//             <label className="newOrderDetsTotal-Label">
//               <b>Total USD:</b> ${fmtNum(displayTotals.usd, "en-US")}
//             </label>
//           )}
//           {displayTotals.showMXN && (
//             <label className="newOrderDetsTotal-Label">
//               <b>Total MXN:</b> ${fmtNum(displayTotals.mxn, "es-MX")}
//             </label>
//           )}
//           {displayTotals.note && (
//             <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
//               {displayTotals.note}
//             </div>
//           )}
//           {!displayTotals.showUSD && !displayTotals.showMXN && (
//             <label className="newOrderDetsTotal-Label" style={{ color: "#b45309" }}>
//               (Totales no disponibles en el registro actual)
//             </label>
//           )}
//         </div>

//         {/* Payment details */}
//         <div className="paymentDetails-Div">
//           <div className="paymentDets-Dropdown">
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Método de Pago</label>
//             </div>
//             <select
//               className="paymentDets-Select"
//               value={paymentMethod}
//               onChange={(e) => setPaymentMethod(e.target.value)}
//             >
//               <option value="">Selecciona método</option>
//               <option value="Efectivo">01: Efectivo</option>
//               <option value="Cheque Nominativo">02: Cheque Nominativo</option>
//               <option value="Transferencia electrónica de fondos">
//                 03: Transferencia electrónica de fondos
//               </option>
//             </select>
//           </div>

//           <div className="paymentDets-Dropdown">
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Cuenta de Recepción</label>
//             </div>
//             <select
//               className="paymentDets-Select"
//               value={account}
//               onChange={(e) => setAccount(e.target.value)}
//             >
//               <option value="">Selecciona cuenta</option>
//               {receivingAccountOptions.map((opt) => (
//                 <option key={opt.value} value={opt.value}>
//                   {opt.label}
//                 </option>
//               ))}
//             </select>
//           </div>

//           <div className="paymentDets-Dropdown">
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Evidencia de Pago</label>
//               <div className="existingQuote-Div">
//                 {order?.evidenceFileExt ? (
//                   <EvidenceGallery
//                     orderId={orderId}
//                     evidenceFileExt={order.evidenceFileExt}
//                   />
//                 ) : (
//                   <div style={{ fontSize: 12, color: "#666" }}>
//                     Aún no hay evidencia de pago cargada por el cliente.
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>

//           {/* Evidence preview + actions */}
//           <div className="paymentEvidence-Div" style={{ gap: 12, alignItems: "center" }}>
//             <img
//               src={evidenceUrl}
//               alt=""
//               style={{ cursor: evidenceUrl ? "zoom-in" : "default", objectFit: "cover" }}
//               onClick={evidenceUrl ? () => setIsLightboxOpen(true) : undefined}
//             />
//           </div>
//         </div>

//         {/* Validate */}
//         <div className="validatePaymentSubmitBtn-Div">
//           <button className="submitOrder-Btn" type="submit" onClick={handleValidatePayment}>
//             Validar Pago
//           </button>
//         </div>

//         {isValidated && <p style={{ color: "green" }}>Estado actualizado a "Pago Verificado"</p>}
//       </div>

//       {/* FOOTER */}
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
//           <div className="footerIcon-NameDiv" onClick={goToDeliverReady}>
//             <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
//             <label className="footerIcon-Name">ENTREGAR</label>
//           </div>
//         </div>
//       </div>

//       {/* LIGHTBOX */}
//       {isLightboxOpen && evidenceUrl && (
//         <div
//           onClick={closeLightbox}
//           style={{
//             position: "fixed",
//             inset: 0,
//             background: "rgba(0,0,0,0.8)",
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "center",
//             zIndex: 9999,
//             padding: 16,
//           }}
//         >
//           <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "95vw", maxHeight: "95vh" }}>
//             <img
//               src={evidenceUrl}
//               alt="Evidencia de pago (ampliada)"
//               style={{ maxWidth: "95vw", maxHeight: "90vh", display: "block", borderRadius: 8 }}
//             />
//             <button
//               onClick={closeLightbox}
//               style={{
//                 position: "absolute",
//                 top: 8,
//                 right: 8,
//                 background: "rgba(0,0,0,0.6)",
//                 color: "#fff",
//                 border: "none",
//                 borderRadius: 4,
//                 padding: "6px 10px",
//                 cursor: "pointer",
//                 fontSize: 14,
//               }}
//               aria-label="Cerrar"
//               title="Cerrar (Esc)"
//             >
//               ✕
//             </button>
//           </div>
//         </div>
//       )}
//     </body>
//   );
// }






