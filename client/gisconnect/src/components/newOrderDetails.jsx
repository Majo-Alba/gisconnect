// in newOrderdetails.jsx, inside the order summary box we have Total USD and Total MXN, but only show the amount in the prefered currency selected by the user. However, I'd like to show total amount in both currencies. Thus if in MongoDb paymentCurrency is USD, check "currencyExchange" for "rate" in order to also display in MXN and viceversa, if MXN is paymentCurrency, then convert to USD. Here is current newOrderDetails.jsx, please edit
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

  // ✅ NEW: deleting state
  const [deleting, setDeleting] = useState(false);

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
      if (!index.has(key)) index.set(key, row);
    }
    return { index, productsCsv };
  }, [productsCsv]);

  // Try to locate a product row for an order item  ⬅️ NEW
  const findProductRow = useCallback(
    (item) => {
      const norm = (s) => String(s || "").trim().toLowerCase();

      const candidates = [
        norm(item.sku),
        norm(item.code),
        norm(item.product),
        norm(item.presentation),
        norm(`${item.product} ${item.presentation || ""}`),
      ].filter(Boolean);

      for (const c of candidates) {
        if (c && productIndex.index.has(c)) return productIndex.index.get(c);
      }

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
    return csvData.find((r) => norm(r.CORREO_EMPRESA) === norm(order.userEmail)) || null;
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
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order?.userEmail]);

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
      : [{ value: "BBVA *4078", label: "MXN: BBVA *4078" }];

    return [{ value: "Pendiente", label: "Pendiente" }, ...base];
  }, [hasInvoiceBilling]);

  useEffect(() => {
    const allowed = receivingAccountOptions.map((o) => o.value);
    if (!allowed.includes(account)) {
      const preferred = allowed.includes(order?.receivingAccount) ? order?.receivingAccount : "";
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

  const getItemCurrency = (it) => {
    const row = findProductRow(it);
    const prefersUSD = numOr0(row?.PRECIO_UNITARIO_DOLARES) > 0 || numOr0(row?.PRECIO_PIEZA_DOLARES) > 0;
    const prefersMXN = numOr0(row?.PRECIO_UNITARIO_MXN) > 0 || numOr0(row?.PRECIO_PIEZA_MXN) > 0;

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

  const getUnitPrice = (it) => {
    const cur = getItemCurrency(it);
    const fromItem = cur === "USD" ? Number(it.priceUSD ?? it.price ?? 0) : Number(it.priceMXN ?? it.price ?? 0);
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

  const sums = useMemo(() => {
    const list = Array.isArray(order?.items) ? order.items : [];
    let usd = 0;
    let mxn = 0;
    list.forEach((it) => {
      const cur = getItemCurrency(it);
      const qty = Number(it.amount) || 0;
      const unit = getUnitPrice(it);
      if (cur === "USD") usd += qty * unit;
      else mxn += qty * unit;
    });
    return { usd, mxn };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.items, productsLoaded, productsCsv, account, order?.receivingAccount, receivingAccount]);

  const latestTotals = useMemo(() => {
    const t = order?.totals;
    if (Array.isArray(t)) return t[t.length - 1] || {};
    return t && typeof t === "object" ? t : {};
  }, [order?.totals]);

  const payCurrency = useMemo(
    () => normCur(order?.paymentCurrency) || normCur(order?.preferredCurrency) || "",
    [order?.paymentCurrency, order?.preferredCurrency]
  );

  // modif apr23
  // const displayTotals = useMemo(() => {
  //   const usdNative = numOr0(latestTotals.totalUSDNative);
  //   const mxnNative = numOr0(latestTotals.totalMXNNative);
  //   const allMXN = numOr0(latestTotals.totalAllMXN) || numOr0(latestTotals.finalAllMXN);

  //   if (payCurrency === "USD") {
  //     return { showUSD: true, usd: usdNative, showMXN: true, mxn: mxnNative || 0, note: null };
  //   }

  //   if (payCurrency === "MXN") {
  //     return { showUSD: true, usd: 0, showMXN: true, mxn: allMXN, note: null };
  //   }

  //   return { showUSD: true, usd: usdNative, showMXN: true, mxn: mxnNative || allMXN || 0, note: null };
  // }, [latestTotals, payCurrency]);

  const displayTotals = useMemo(() => {
    const usdNative = numOr0(latestTotals.totalUSDNative);
    const mxnNative = numOr0(latestTotals.totalMXNNative);
  
    const rate = Number(order?.currencyExchange?.rate) || null;
  
    let usdFinal = usdNative;
    let mxnFinal = mxnNative;
  
    // 🔥 If one currency is missing → calculate it
    if (rate) {
      if (usdNative > 0 && mxnNative === 0) {
        mxnFinal = usdNative * rate;
      }
  
      if (mxnNative > 0 && usdNative === 0) {
        usdFinal = mxnNative / rate;
      }
  
      // Mixed order but missing combined MXN
      if (usdNative > 0 && mxnNative > 0) {
        mxnFinal = mxnNative + (usdNative * rate);
      }
    }
  
    return {
      usd: usdFinal,
      mxn: mxnFinal,
      rate,
    };
  }, [latestTotals, order?.currencyExchange]);
  // modif apr23

  // Actions
  const handleValidatePayment = async () => {
    try {
      // const updatedData = {
      //   paymentMethod,
      //   paymentAccount: account,
      //   orderStatus: "Pago Verificado",
      // };
      const updatedData = {
        paymentMethod,
        paymentAccount: account,
        orderStatus: "Pago Verificado",
        paymentVerifiedAt: new Date().toISOString(), // optional
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

  // ✅ NEW: delete order
  const handleDeleteOrder = async () => {
    if (!orderId) return;

    const short = String(orderId).slice(-5);
    const ok = window.confirm(
      `¿Seguro que deseas BORRAR el pedido #${short}?\n\nEsta acción NO se puede deshacer.`
    );
    if (!ok) return;

    try {
      setDeleting(true);
      await axios.delete(`${API}/orders/${orderId}`);
      alert(`Pedido #${short} borrado correctamente.`);
      navigate("/newOrders"); // o "/adminHome" si prefieres
    } catch (e) {
      console.error("Delete order error:", e?.response?.data || e.message);
      alert("No se pudo borrar el pedido. Revisa el servidor / endpoint.");
    } finally {
      setDeleting(false);
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
    order?.evidenceFile?.filename || order?.paymentEvidence?.filename || `evidencia_${String(order._id).slice(-5)}.jpg`;

  const displayName = (clientFullName || csvDisplayName || order.userEmail || "").trim();
  const displayCompany = (companyFromMongo || csvCompanyName || "").trim();

  return (
    <body className="body-BG-Gradient">
      {/* LOGO */}
      <div className="loginLogo-ParentDiv">
        <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo} />
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

        {/* new apr28 */}
        <label>
          {order.orderDate
            ? (() => {
              const d = new Date(order.orderDate);

              // ⏰ Time (local device time)
              const time = d.toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              });
              return `${time}`;
            })()
          : "Sin fecha"}
        </label>
        {/* end apr28 */}
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

                    <label className="orderDets-Label">
                      <b>Presentación:</b> {item.presentation || item.packPresentation || "N/A"}
                    </label>

                    <label className="orderDets-Label">
                      <b>Cantidad:</b> {item.amount}
                    </label>

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

          {/* modif apr23 */}
          {/* {displayTotals.showUSD && (
            <label className="newOrderDetsTotal-Label">
              <b>Total USD:</b> ${fmtNum(displayTotals.usd, "en-US")}
            </label>
          )}
          {displayTotals.showMXN && (
            <label className="newOrderDetsTotal-Label">
              <b>Total MXN:</b> ${fmtNum(displayTotals.mxn, "es-MX")}
            </label>
          )} */}
          <label className="newOrderDetsTotal-Label">
            <b>Total USD:</b> ${fmtNum(displayTotals.usd, "en-US")} USD
          </label>

          <label className="newOrderDetsTotal-Label">
            <b>Total MXN:</b> ${fmtNum(displayTotals.mxn, "es-MX")} MXN
          </label>

          {/* 🔥 Show FX used */}
          {displayTotals.rate && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 10 }}>
              Tipo de cambio aplicado: {displayTotals.rate} MXN/USD
            </div>
          )}

          {payCurrency && (
            <div style={{ fontWeight: "bold", fontSize:"12px", fontStyle:"italic", marginTop: 10 }}>
              Moneda elegida por cliente: {payCurrency}
            </div>
          )}
          {/* modif apr23 */}
          {/* {displayTotals.note && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{displayTotals.note}</div>}
          {!displayTotals.showUSD && !displayTotals.showMXN && (
            <label className="newOrderDetsTotal-Label" style={{ color: "#b45309" }}>
              (Totales no disponibles en el registro actual)
            </label>
          )} */}
        </div>

        {/* Payment details */}
        <div className="paymentDetails-Div">
          <div className="paymentDets-Dropdown">
            <div className="headerEditIcon-Div">
              <label className="newUserData-Label">Método de Pago</label>
            </div>
            <select className="paymentDets-Select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
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

          <div className="paymentEvidence-Div" style={{ gap: 12, alignItems: "center" }}>
            <img
              src={evidenceUrl}
              alt=""
              style={{ cursor: evidenceUrl ? "zoom-in" : "default", objectFit: "cover" }}
              onClick={evidenceUrl ? () => setIsLightboxOpen(true) : undefined}
            />
          </div>
        </div>

        {/* ✅ Validate + Delete (aligned) */}
        <div style={{ display: "grid", gridTemplateColumns: "50% 50%", gap: 10, marginBottom:"15%", marginLeft: "10%" }}>
        {/* <div className="validatePaymentSubmitBtn-Div" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}> */}
          <button className="submitOrder-Btn" type="button" onClick={handleValidatePayment} disabled={deleting}>
            Validar Pago
          </button>

          <button
            className="submitOrder-Btn"
            type="button"
            onClick={handleDeleteOrder}
            disabled={deleting}
            style={{ background: "#b91c1c" }} // rojo (si tu CSS lo sobreescribe, lo quitamos)
          >
            {deleting ? "Borrando…" : "Borrar"}
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
// // in newOrderDetails.jsx I'd like the ability to delete orders. Im thinking of adding a button at the bottom (aligned with existing "Validar Pago" button) "Borrar". Im guessing we'll also need to add an endpoint to make sure this order gets deleted from mongodb cluster "new_orders". Here is my current newOrderDetails.jsx, please direct edit
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
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

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
//       csvData.find((r) => norm(r.CORREO_EMPRESA) === norm(order.userEmail)) || null
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

//     return () => {
//       cancelled = true;
//     };
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

//   useEffect(() => {
//     load();
//   }, [orderId]);

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

//   const receivingAccountOptions = useMemo(() => {
//     const base = hasInvoiceBilling
//       ? [
//           { value: "BBVA *1207", label: "MXN: BBVA *1207" },
//           { value: "MONEX *8341", label: "USD: MONEX *8341" },
//           { value: "INVEX *4234", label: "USD: INVEX *4234" },
//         ]
//       : [
//           { value: "BBVA *4078", label: "MXN: BBVA *4078" },
//         ];
  
//     // NEW: always include "Pendiente" at the top
//     return [{ value: "Pendiente", label: "Pendiente" }, ...base];
//   }, [hasInvoiceBilling]);

//   // Keep selected account valid when options change; prefer order.receivingAccount if valid
//   useEffect(() => {
//     const allowed = receivingAccountOptions.map((o) => o.value);
//     if (!allowed.includes(account)) {
//       const preferred = allowed.includes(order?.receivingAccount) 
//       ? order?.receivingAccount 
//       : "";
//       setAccount(preferred);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [receivingAccountOptions, order?.receivingAccount]);

//   // Navigation
//   function goToAdminHome() {
//     navigate("/adminHome");
//   }
//   function goToNewOrders() {
//     navigate("/newOrders");
//   }
//   function goToDeliverReady() {
//     navigate("/deliverReady");
//   }
//   function goHomeLogo() {
//     navigate("/adminHome");
//   }

//   // --------- FORMAT HELPERS ----------
//   const fmtNum = (v, locale = "es-MX") =>
//     (Number(v) || 0).toLocaleString(locale, {
//       minimumFractionDigits: 2,
//       maximumFractionDigits: 2,
//     });

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
//       const src = `${account || order?.receivingAccount || receivingAccount}`.toUpperCase();
//       if (src.includes("USD") || src.includes("MONEX") || src.includes("INVEX")) return "USD";
//       return "MXN";
//     }

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
//       const usd = numOr0(row.PRECIO_UNITARIO_DOLARES) || numOr0(row.PRECIO_PIEZA_DOLARES);
//       return usd;
//     } else {
//       const mxn = numOr0(row.PRECIO_UNITARIO_MXN) || numOr0(row.PRECIO_PIEZA_MXN);
//       return mxn;
//     }
//   };

//   // --------- Legacy sums kept only for per-item display (not for totals box anymore) ----------
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

//   // ⬅️ NEW: normalize the latest totals snapshot from Mongo (array or object)
//   const latestTotals = useMemo(() => {
//     const t = order?.totals;
//     if (Array.isArray(t)) return t[t.length - 1] || {};
//     return t && typeof t === "object" ? t : {};
//   }, [order?.totals]);

//   // ⬅️ NEW: decide from Mongo's paymentCurrency (fallback to preferredCurrency if needed)
//   const payCurrency = useMemo(
//     () =>
//       normCur(order?.paymentCurrency) ||
//       normCur(order?.preferredCurrency) ||
//       "",
//     [order?.paymentCurrency, order?.preferredCurrency]
//   );

//   // ⬅️ NEW: Display totals based ONLY on Mongo fields
//   const displayTotals = useMemo(() => {
//     const usdNative = numOr0(latestTotals.totalUSDNative);
//     const mxnNative = numOr0(latestTotals.totalMXNNative);
//     const allMXN = numOr0(latestTotals.totalAllMXN) || numOr0(latestTotals.finalAllMXN);

//     if (payCurrency === "USD") {
//       // Show USD from totalUSDNative.
//       // MXN shows totalMXNNative if present, else 0.
//       return {
//         showUSD: true,
//         usd: usdNative,
//         showMXN: true,
//         mxn: mxnNative || 0,
//         note: null,
//       };
//     }

//     if (payCurrency === "MXN") {
//       // USD remains 0; MXN comes from totalAllMXN (or finalAllMXN as fallback).
//       return {
//         showUSD: true,
//         usd: 0,
//         showMXN: true,
//         mxn: allMXN,
//         note: null,
//       };
//     }

//     // Fallback if paymentCurrency missing: show whatever is available
//     return {
//       showUSD: true,
//       usd: usdNative,
//       showMXN: true,
//       mxn: mxnNative || allMXN || 0,
//       note: null,
//     };
//   }, [latestTotals, payCurrency]);

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

//           {/* Totals per Mongo rules */}
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
//             <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{displayTotals.note}</div>
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
//               <option value="Transferencia electrónica de fondos">03: Transferencia electrónica de fondos</option>
//               <option value="Crédito">04: Crédito</option>
//             </select>
//           </div>

//           <div className="paymentDets-Dropdown">
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Cuenta de Recepción</label>
//             </div>
//             <select className="paymentDets-Select" value={account} onChange={(e) => setAccount(e.target.value)}>
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
//                   <EvidenceGallery orderId={orderId} evidenceFileExt={order.evidenceFileExt} />
//                 ) : (
//                   <div style={{ fontSize: 12, color: "#666" }}>Aún no hay evidencia de pago cargada por el cliente.</div>
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
