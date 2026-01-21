// hey chatgpt, in newOrder, in "Total a pagar (MXN)" and "Total a pagar en MXN" we are using 4 decimals for the FIX currency convertion but I'd like to only use 2 decimal places. Here is current newOrder.jsx, please direct edit
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { faHouse, faUser, faCartShopping, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { docDesign } from "/src/components/documentDesign";

import iconBuilding from "../assets/images/iconBuilding.png";
import iconContact from "../assets/images/iconContact.png";
import iconLocation from "../assets/images/iconLocation.png";
import iconPhone from "../assets/images/iconPhone.png";
import iconEmail from "../assets/images/iconEmail.png";

import Logo from "/src/assets/images/GIS_Logo.png";

import { API } from "/src/lib/api";

export default function ExpressQuote() {
  const navigate = useNavigate();

  const [selectedProduct, setSelectedProduct] = useState("");
  const [presentation, setPresentation] = useState("");
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState([]);

  const [price, setPrice] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("");
  const [weight, setWeight] = useState("");
  const [stock, setStock] = useState("");
  const [stockReady, setStockReady] = useState(false);
  const [specialApplied, setSpecialApplied] = useState(false);
  const [packPresentation, setPackPresentation] = useState("");

  const [csvData, setCsvData] = useState([]);             // Products
  const [csvClientData, setCsvClientData] = useState([]); // (kept but no longer used for addr)
  const [specialPrices, setSpecialPrices] = useState([]);
  const [specialHeaders, setSpecialHeaders] = useState([]); // headers present in SPECIAL_PRICES sheet

  const [stockByKey, setStockByKey] = useState({});

  const [user, setUser] = useState(null);
  const [mongoProfile, setMongoProfile] = useState(null);   // << new
  const [isActive, setIsActive] = useState(false);

  const [dofRate, setDofRate] = useState(null);
  const [dofDate, setDofDate] = useState(null);
  const [fxError, setFxError] = useState(null);

  const [preferredCurrency, setPreferredCurrency] = useState("USD");

  // ===== NEW: pull latest shipping/billing from Mongo =====
  const [shippingAddr, setShippingAddr] = useState(null);
  const [billingAddr, setBillingAddr] = useState(null);

  const normalize = (s) =>
    (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const n = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().replace(/\s+/g, "");
    if (!s) return null;
    const cleaned = s.replace(/(?<=\d)[,\s](?=\d{3}\b)/g, "").replace(/,/g, ".");
    const x = Number(cleaned);
    return Number.isFinite(x) ? x : null;
  };
  const asQty = (v) => {
    const num = n(v);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.floor(num));
  };

  // Helper to get timestamp from Mongo _id
  const _idToMs = (id) => {
    try {
      return parseInt(String(id).slice(0, 8), 16) * 1000;
    } catch {
      return 0;
    }
  };
  const pickNewest = (arr) =>
    Array.isArray(arr) && arr.length
      ? [...arr].sort((a, b) => _idToMs(b?._id) - _idToMs(a?._id))[0]
      : null;

  // Fetch DOF
  useEffect(() => {
    const getDofRate = async () => {
      try {
        const res = await fetch(`${API}/fx/usd-dof`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Error al obtener tipo de cambio DOF");
        setDofRate(Number(data.rate));
        setDofDate(data.date);
        setFxError(null);
      } catch (err) {
        console.error("DOF fetch error:", err);
        setFxError("No se pudo obtener el tipo de cambio DOF.");
      }
    };
    getDofRate();
  }, []);

  const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

  // Logged-in user
  useEffect(() => {
    const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    setUser(creds);
  }, []);

  // Fetch Mongo profile to get nombre, apellido, empresa
  useEffect(() => {
    const email = user?.correo;
    if (!email) return;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/users/by-email`, { params: { email } });
        setMongoProfile(data || null);
      } catch {
        setMongoProfile(null);
      }
    })();
  }, [user?.correo]);

  // CSV URLs (left as-is for product/pricing logic)
  const PRODUCTS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";
  const CLIENT_DB_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
  const SPECIAL_PRICES_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=231220133&single=true&output=csv";
  const INVENTORY_LATEST_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3w6YJjBrIDz56fkcJmjeBNlsfI55v9ilSXOzmnJBLi4h97ePj433ibiqXIRQ1KHOae-mYb21zydwS/pub?gid=0&single=true&output=csv";

  // Fetch product CSVs (unchanged)
  useEffect(() => {
    fetchCSV(PRODUCTS_CSV_URL, setCsvData);
    fetchCSV(CLIENT_DB_URL, setCsvClientData);
    fetchCSV(SPECIAL_PRICES_URL, setSpecialPrices);

    axios
      .get(INVENTORY_LATEST_CSV_URL)
      .then((res) => {
        const rows = parseCSV(res.data);
        const byName = {};
        rows.forEach((r) => {
          const prod = normalize(r.NOMBRE_PRODUCTO || "");
          const ex = n(r.EXISTENCIA ?? r.EXISTENCIAS ?? r.STOCK ?? "0");
          if (!prod || !Number.isFinite(ex)) return;
          byName[prod] = (byName[prod] || 0) + ex;
        });
        setStockByKey(byName);
      })
      .catch((err) => console.error("Error fetching LATEST inventory CSV:", err));
  }, []);

  // ===== NEW: fetch user addresses from Mongo =====
  useEffect(() => {
    const email = user?.correo;
    if (!email) return;

    const fetchAddrs = async () => {
      try {
        const [sRes, bRes] = await Promise.all([
          axios.get(`${API}/shipping-address/${encodeURIComponent(email)}`),
          axios.get(`${API}/billing-address/${encodeURIComponent(email)}`),
        ]);
        setShippingAddr(pickNewest(sRes.data));
        setBillingAddr(pickNewest(bRes.data));
      } catch (err) {
        console.error("Error fetching addresses:", err);
        setShippingAddr(null);
        setBillingAddr(null);
      }
    };
    fetchAddrs();
  }, [user?.correo]);

  function fetchCSV(url, setter) {
    axios.get(url)
      .then((res) => {
        const parsed = parseCSV(res.data);
        setter(parsed);
        // If this is SPECIAL_PRICES_URL, store headers once
        if (url === SPECIAL_PRICES_URL && Array.isArray(parsed) && parsed.length) {
          setSpecialHeaders(Object.keys(parsed[0] || {}));
        }
      })
      .catch((err) => console.error("Error fetching CSV:", err));
  }

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

  // (pricing logic uses CSVs — unchanged except unrelated client address removal)
  const toClientHeader = (name) => {
    if (!name) return "";
    const noAccents = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return noAccents.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  };

  // Clean common MX company suffixes for better matches
  const stripCompanySuffixes = (s) => {
    if (!s) return s;
    let t = s.toString();
    t = t.replace(/\bS\.?A\.?\s*D?E?\s*C\.?V\.?\b/gi, ""); // SA de CV variants
    t = t.replace(/\bS\.? DE R\.?L\.? DE C\.?V\.?\b/gi, ""); // S de RL de CV
    t = t.replace(/\bS\.?C\.?A\.??\b/gi, "");
    t = t.replace(/\bS\.?C\.?\b/gi, "");
    t = t.replace(/\bA\.?C\.?\b/gi, "");
    t = t.replace(/\bDE\s+M[EÉ]XICO\b/gi, "");
    t = t.replace(/\s+/g, " ").trim();
    return t;
  };

  // Build a prioritized list of possible client columns to try in SPECIAL_PRICES
  const getCandidateClientCols = () => {
    const candidates = [];
    // 1) Existing mapping via CLIENT_DB_URL (if present)
    const viaClientDb = getClientColumnName(user, csvClientData);
    if (viaClientDb) candidates.push(viaClientDb);

    // 2) From Mongo profile
    const nombre = mongoProfile?.nombre || "";
    const apellido = mongoProfile?.apellido || "";
    const empresa = mongoProfile?.empresa || "";
    const razonSocial = billingAddr?.razonSocial || ""; // sometimes more “official”

    const fullName = [nombre, apellido].filter(Boolean).join(" ");
    const empresaClean = stripCompanySuffixes(empresa);
    const razonClean = stripCompanySuffixes(razonSocial);

    [fullName, empresa, empresaClean, razonSocial, razonClean].forEach((s) => {
      const h = toClientHeader(s);
      if (h) candidates.push(h);
    });

    // 3) Dedup while preserving order
    const uniq = [];
    const seen = new Set();
    for (const c of candidates) {
      if (!seen.has(c)) { seen.add(c); uniq.push(c); }
    }
    // Filter to only headers that actually exist in SPECIAL_PRICES sheet
    const allowed = new Set((specialHeaders || []).map(String));
    return uniq.filter((c) => allowed.has(c));
  };

  const getClientColumnName = (user, clientRows) => {
    if (!user?.correo || clientRows.length === 0) return "";
    const hit = clientRows.find(
      (r) => normalize(r.CORREO_EMPRESA) === normalize(user.correo)
    );
    return toClientHeader(hit?.NOMBRE_APELLIDO);
  };

  useEffect(() => {
    setStockReady(false);

    const baseRow = csvData.find(
      (r) =>
        r.NOMBRE_PRODUCTO === selectedProduct &&
        (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
    );

    if (!baseRow) {
      setWeight("");
      setStock("");
      setPrice("");
      setPackPresentation("");
      setSpecialApplied(false);
      setPriceCurrency("");
      setStockReady(false);
      return;
    }

    setWeight(baseRow.PESO_PRODUCTO || "");
    setPackPresentation(baseRow.PRESENTACION_EMPAQUE || "");

    const prodKey = normalize(selectedProduct);
    const latestStock = stockByKey[prodKey];
    const fallbackStock = n(baseRow.CANTIDAD_EXISTENCIA) ?? 0;
    setStock(Number.isFinite(latestStock) ? String(latestStock) : String(fallbackStock));
    setTimeout(() => setStockReady(true), 0);

    const clientCol = getClientColumnName(user, csvClientData);

    const spRow = specialPrices.find(
      (row) =>
        normalize(row.NOMBRE_PRODUCTO) === normalize(selectedProduct) &&
        normalize(row.PESO_PRODUCTO) === normalize(baseRow.PESO_PRODUCTO) &&
        normalize(row.UNIDAD_MEDICION) === normalize(baseRow.UNIDAD_MEDICION)
    );

    let resolvedPrice = null;
    let resolvedCurrency = "USD";
    let applied = false;

    // Try multiple candidate columns: CLIENT_DB mapping first, then Mongo-based variants
    if (spRow) {
      const candidates = getCandidateClientCols();
      for (const col of candidates) {
        const v = n(spRow[col]);
        if (v && v > 0) {
          resolvedPrice = v;
          resolvedCurrency = "USD"; // all client columns are USD-priced in your sheet
          applied = true;
          break;
        }
      }
    }

    // if (spRow && clientCol) {
    //   const clientVal = n(spRow[clientCol]);
    //   if (clientVal && clientVal > 0) {
    //     resolvedPrice = clientVal;
    //     resolvedCurrency = "USD";
    //     applied = true;
    //   }
    // }

    if (resolvedPrice === null) {
      const usdFallback =
        n(spRow?.PRECIO_UNITARIO_DOLARES) ??
        n(spRow?.PRECIO_PIEZA_DOLARES) ??
        n(baseRow.PRECIO_PIEZA_DOLARES);
      if (usdFallback && usdFallback > 0) {
        resolvedPrice = usdFallback;
        resolvedCurrency = "USD";
      }
    }

    if (resolvedPrice === null) {
      const mxnVal = n(spRow?.PRECIO_PIEZA_MXN) ?? n(baseRow.PRECIO_PIEZA_MXN);
      if (mxnVal && mxnVal > 0) {
        resolvedPrice = mxnVal;
        resolvedCurrency = "MXN";
      }
    }

    if (resolvedPrice === null) {
      setPrice("");
      setPriceCurrency("");
      setSpecialApplied(false);
      return;
    }

    setPrice(String(resolvedPrice));
    setPriceCurrency(resolvedCurrency);
    setSpecialApplied(applied);
  }, [selectedProduct, presentation, csvData, specialPrices, csvClientData, user, stockByKey]);

  console.log(csvClientData)

  const presentationOptions = csvData
    .filter((r) => r.NOMBRE_PRODUCTO === selectedProduct)
    .map((r) => (r.PESO_PRODUCTO || "") + (r.UNIDAD_MEDICION || ""));

  const qty = asQty(amount);
  const stockNum = n(stock);
  const hasFiniteStock = Number.isFinite(stockNum);
  const outOfStock = hasFiniteStock && qty > 0 && qty > stockNum;

  const handleAddItem = () => {
    const baseRow = csvData.find(
      (r) =>
        r.NOMBRE_PRODUCTO === selectedProduct &&
        (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
    );
    if (!baseRow) return;

    if (!stockReady || !hasFiniteStock) {
      alert("Esperando disponibilidad de inventario. Intenta en un momento…");
      return;
    }
    if (qty <= 0) {
      alert("Ingrese una cantidad válida.");
      return;
    }
    if (outOfStock) {
      alert(`Solo hay ${stockNum} unidades disponibles.`);
      return;
    }
    const unitPrice = n(price) || 0;
    if (!unitPrice) {
      alert("Precio no disponible para esta presentación.");
      return;
    }

    const cur = (priceCurrency || "").toUpperCase() === "MXN" ? "MXN" : "USD";

    setItems((prev) => [
      ...prev,
      {
        product: selectedProduct,
        presentation,
        packPresentation,
        amount: qty,
        price: unitPrice,
        currency: cur,
        weight: Number(baseRow.PESO_PRODUCTO || 0),
      },
    ]);

    setSelectedProduct("");
    setPresentation("");
    setPackPresentation("");
    setAmount("");
    setPrice("");
    setPriceCurrency("");
    setWeight("");
    setStock("");
    setStockReady(false);
    setSpecialApplied(false);
  };

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const normalizeCur = (val) => {
    const c = String(val || "").trim().toUpperCase();
    return c === "MXN" ? "MXN" : "USD";
  };
  const usdItems = items.filter((it) => normalizeCur(it.currency) === "USD");
  const mxnItems = items.filter((it) => normalizeCur(it.currency) === "MXN");

  const totalUSD = usdItems.reduce((sum, it) => sum + it.amount * it.price, 0);
  const totalMXN = mxnItems.reduce((sum, it) => sum + it.amount * it.price, 0);

  const allUSD = dofRate ? totalUSD + totalMXN / Number(dofRate) : null;
  const allMXN = dofRate ? totalMXN + totalUSD * Number(dofRate) : null;

  const ivaAllUSD = isActive && allUSD != null ? +(allUSD * 0.16).toFixed(2) : null;
  const ivaAllMXN = isActive && allMXN != null ? +(allMXN * 0.16).toFixed(2) : null;

  const allUSDWithIVA = ivaAllUSD != null ? +(allUSD + ivaAllUSD).toFixed(2) : null;
  const allMXNWithIVA = ivaAllMXN != null ? +(allMXN + ivaAllMXN).toFixed(2) : null;

  // const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
  const fmtUSD = (v) => `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  const fmtMXN = (v) =>
    `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  
  const submitOrder = () => {
    localStorage.setItem("discountTotal", "0");
    localStorage.setItem("billRequest", JSON.stringify(isActive));
    navigate("/orderNow", { state: { items, preferredCurrency } });
  };

  return (
    <body className="app-shell body-BG-Gradient">
      <div className="app-header loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Home Icon"
          width="180"
          height="55"
          onClick={() => navigate("/userHome")}
        />
      </div>

      <div className="app-main">
        <label className="sectionHeader-Label">¡Haz tu pedido!</label>

        <div className="quoterBody-Div">
          <div>
            <label className="newUserData-Label">Encuentra tu producto</label>
            <select
              className="productInfo-Input"
              value={selectedProduct}
              onChange={(e) => {
                setSelectedProduct(e.target.value);
                setPresentation("");
                setAmount("");
                setStock("");
                setStockReady(false);
              }}
            >
              <option value="">Selecciona producto</option>
              {[...new Set(csvData.map((i) => i.NOMBRE_PRODUCTO))].map((prod, idx) => (
                <option key={idx} value={prod}>
                  {prod}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="newUserData-Label">Presentación</label>
            <select
              className="productInfo-Input"
              value={presentation}
              onChange={(e) => {
                setPresentation(e.target.value);
                setAmount("");
                setStock("");
                setStockReady(false);
              }}
            >
              <option value="">Selecciona presentación</option>
              {[...new Set(presentationOptions)].map((pres, idx) => (
                <option key={idx} value={pres}>
                  {pres}
                </option>
              ))}
            </select>
          </div>

          {/* Package Presentation (auto) */}
          <div>
            <label className="newUserData-Label">Presentación Empaque</label>
            <input
              className="productInfo-Input"
              type="text"
              placeholder="Presentación empaque"
              value={packPresentation}
              readOnly
            />
          </div>

          <div>
            <label className="newUserData-Label">
              Precio {priceCurrency ? `(${priceCurrency})` : ""}
            </label>
            <input
              className="productInfo-Input"
              type="text"
              placeholder="Precio"
              value={price ? `${price} ${priceCurrency}` : ""}
              readOnly
            />
          </div>

          <div>
            <label className="newUserData-Label">Cantidad deseada</label>
            <input
              className="productInfo-Input"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              onChange={(e) => {
                const q = asQty(e.target.value);
                setAmount(q === 0 && e.target.value === "" ? "" : String(q));
              }}
              placeholder="Ingrese cantidad deseada"
              value={amount}
            />
          </div>

          {/* Unified & guarded stock warning */}
          {stockReady && hasFiniteStock && qty > 0 && outOfStock && (
            <label className="stockAvailability-Label">
              Lo sentimos, por el momento no contamos con suficiente disponibilidad de este producto.
            </label>
          )}

          <button
            className="quoter-AddMoreButton"
            onClick={handleAddItem}
            disabled={
              !price ||
              !stockReady ||
              !hasFiniteStock ||
              qty <= 0 ||
              outOfStock ||
              !selectedProduct ||
              !presentation
            }
            title={
              !price
                ? "Precio no disponible."
                : !stockReady
                ? "Cargando disponibilidad…"
                : !hasFiniteStock
                ? "Inventario no disponible."
                : qty <= 0
                ? "Ingrese una cantidad válida."
                : outOfStock
                ? "Cantidad excede el inventario."
                : (!selectedProduct || !presentation)
                ? "Seleccione producto y presentación."
                : ""
            }
          >
            +
          </button>

          <label className="newUserData-Label">Resumen del pedido</label>
          <div className="quoter-wishlistDiv">
            <ul className="wishlist-ulElement">
              {items.map((item, i) => (
                <div key={i} className="wishlist-liElement">
                  {item.amount} x {item.product} ({item.presentation})
                  {item.packPresentation ? ` — ${item.packPresentation}` : ""} — ${item.price} {item.currency} c/u
                  <FontAwesomeIcon
                    className="expressQuote-TrashIt"
                    onClick={() => removeItem(i)}
                    icon={faTrash}
                    style={{ marginLeft: 8, cursor: "pointer" }}
                  />
                </div>
              ))}
            </ul>
          </div>

          {/* ===== Financial Summary (unchanged content) ===== */}
          <label className="newUserData-Label">Resumen financiero</label>

          {/* Toggle */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, marginLeft: 55, marginTop: 5 }}>
            <span style={{ fontSize: 13, color: "#333" }}>Moneda preferida:</span>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="prefCurrency"
                value="USD"
                checked={preferredCurrency === "USD"}
                onChange={() => setPreferredCurrency("USD")}
              />
              USD
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="radio"
                name="prefCurrency"
                value="MXN"
                checked={preferredCurrency === "MXN"}
                onChange={() => setPreferredCurrency("MXN")}
                disabled={!dofRate} // need FX to combine/convert
              />
              MXN
            </label>
          </div>

          {(() => {
            const hasUSD = totalUSD > 0;
            const hasMXN = totalMXN > 0;
            const onlyUSD = hasUSD && !hasMXN;
            const mixed = hasUSD && hasMXN;

            const fx = Number.isFinite(dofRate) ? Number(dofRate) : null;

            const withIVA = (v) => (isActive ? v * 1.16 : v);

            const usdSubtotal = totalUSD;
            const mxnSubtotal = totalMXN;

            const usdSubtotalIVA = withIVA(usdSubtotal);
            const mxnSubtotalIVA = withIVA(mxnSubtotal);

            // For MXN totals that come from USD via FX, force 2-dec rounding at each step
            const fxRounded = fx != null ? round2(fx) : null;

            // combined MXN (when user prefers MXN on mixed carts)
            const combinedMXN =
              fxRounded != null ? round2(round2(usdSubtotal) * fxRounded + mxnSubtotal) : null;
            const combinedMXNIVA =
              combinedMXN != null ? round2(withIVA(combinedMXN)) : null;

            // const combinedMXN = fx ? usdSubtotal * fx + mxnSubtotal : null;
            // const combinedMXNIVA = fx ? withIVA(combinedMXN) : null;

            if (onlyUSD) {
              return (
                <div className="quoter-summaryDiv">
                  <label className="summary-Label">
                    <b>Subtotal artículos en USD:</b> {fmtUSD(usdSubtotal)}
                  </label>

                  {preferredCurrency === "USD" ? (
                    <label className="summaryTotal-Label">
                      <b>Total a pagar en USD:</b> {fmtUSD(usdSubtotalIVA)}
                    </label>
                  ) : (
                    <>
                      <label className="summary-Label">
                        <b>Tipo de cambio:</b>{" "}
                        {fxRounded != null ? `$${fxRounded.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")}
                        {/* {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")} */}
                      </label>
                      <label className="summaryTotal-Label">
                        <b>Total a pagar en MXN:</b>{' '}
                        {fxRounded != null ? fmtMXN(round2(round2(usdSubtotalIVA) * fxRounded)) : "—"}
                        {/* {fx ? fmtMXN(usdSubtotalIVA * fx) : "—"} */}
                      </label>
                    </>
                  )}
                </div>
              );
            }

            if (mixed) {
              if (preferredCurrency === "USD") {
                return (
                  <div className="quoter-summaryDiv">
                    <label className="summary-Label">
                      <b>Subtotal artículos en USD:</b> {fmtUSD(usdSubtotal)}
                    </label>
                    <label className="summary-Label">
                      <b>Subtotal artículos en MXN:</b> {fmtMXN(mxnSubtotal)}
                    </label>

                    <label className="summaryTotal-Label">
                      <b>Total a pagar en USD:</b> {fmtUSD(usdSubtotalIVA)}
                    </label>
                    <label className="summaryTotal-Label">
                      <b>Total a pagar en MXN:</b> {fmtMXN(mxnSubtotalIVA)}
                    </label>

                    <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
                      En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="quoter-summaryDiv">
                    <label className="summary-Label">
                      <b>Subtotal artículos en USD:</b> {fmtUSD(usdSubtotal)}
                    </label>
                    <label className="summary-Label">
                      <b>Subtotal artículos en MXN:</b> {fmtMXN(mxnSubtotal)}
                    </label>
                    <label className="summary-Label">
                      <b>Tipo de cambio:</b>{" "}
                      {fxRounded != null ? `$${fxRounded.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")}
                      {/* {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")} */}
                    </label>

                    <label className="summaryTotal-Label">
                      <b>Total a pagar (MXN):</b>{" "}
                      {fxRounded != null ? fmtMXN(combinedMXNIVA) : "—"}
                      {/* {fx ? fmtMXN(combinedMXNIVA) : "—"} */}
                    </label>
                  </div>
                );
              }
            }

            // Only MXN
            return (
              <div className="quoter-summaryDiv">
                <label className="summary-Label">
                  <b>Subtotal MXN (artículos en MXN):</b> {fmtMXN(mxnSubtotal)}
                </label>
                <label className="summaryTotal-Label">
                  <b>Total a pagar (MXN):</b> {fmtMXN(mxnSubtotalIVA)}
                </label>
              </div>
            );
          })()}

          <div className="newOrderActionButtons-Div">
            <button className="submitOrder-Btn" type="button" onClick={submitOrder}>
              Hacer Pedido
            </button>
          </div>
        </div>
      </div>

      <div className="app-footer footerMenuDiv">
        <div className="footerHolder">
          <div className="footerIcon-NameDiv" onClick={() => navigate("/userHome")}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons" />
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={() => navigate("/userProfile")}>
            <FontAwesomeIcon icon={faUser} className="footerIcons" />
            <label className="footerIcon-Name">MI PERFIL</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={() => navigate("/newOrder")}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
            <label className="footerIcon-Name">ORDENA</label>
          </div>
        </div>
      </div>
    </body>
  );
}

// import { useState, useEffect } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import axios from "axios";
// import jsPDF from "jspdf";
// import autoTable from "jspdf-autotable";
// import { faHouse, faUser, faCartShopping, faTrash } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import { docDesign } from "/src/components/documentDesign";

// import iconBuilding from "../assets/images/iconBuilding.png";
// import iconContact from "../assets/images/iconContact.png";
// import iconLocation from "../assets/images/iconLocation.png";
// import iconPhone from "../assets/images/iconPhone.png";
// import iconEmail from "../assets/images/iconEmail.png";

// import Logo from "/src/assets/images/GIS_Logo.png";

// import { API } from "/src/lib/api";

// export default function NewOrder() {
//   const navigate = useNavigate();

//   const [selectedProduct, setSelectedProduct] = useState("");
//   const [presentation, setPresentation] = useState("");
//   const [amount, setAmount] = useState(""); // kept as string for input, normalized for logic
//   const [items, setItems] = useState([]);

//   const [price, setPrice] = useState("");                 // numeric string
//   const [priceCurrency, setPriceCurrency] = useState(""); // "USD" | "MXN"
//   const [weight, setWeight] = useState("");
//   const [stock, setStock] = useState("");                 // raw string
//   const [stockReady, setStockReady] = useState(false);    // NEW: guards comparisons
//   const [specialApplied, setSpecialApplied] = useState(false);
//   const [packPresentation, setPackPresentation] = useState(""); // PRESENTACION_EMPAQUE

//   const [csvData, setCsvData] = useState([]);             // Products
//   const [csvClientData, setCsvClientData] = useState([]); // Client DB (for name/email → client column)
//   const [specialPrices, setSpecialPrices] = useState([]);  // Special prices sheet

//   // NEW: LATEST inventory by PRODUCT NAME ONLY → { "<normalized product>": totalExistencia }
//   const [stockByKey, setStockByKey] = useState({});

//   const [user, setUser] = useState(null);
//   const [isActive, setIsActive] = useState(false);

//   // DOF rate (MXN per USD)
//   const [dofRate, setDofRate] = useState(null);
//   const [dofDate, setDofDate] = useState(null);
//   const [fxError, setFxError] = useState(null);

//   // Preferred currency for the summary box
//   const [preferredCurrency, setPreferredCurrency] = useState("USD");

//   // ---------- helpers ----------
//   const normalize = (s) =>
//     (s ?? "")
//       .toString()
//       .normalize("NFD")
//       .replace(/[\u0300-\u036f]/g, "")
//       .trim()
//       .toLowerCase()
//       .replace(/\s+/g, " "); // collapse multiple spaces

//   function toClientHeader(name) {
//     if (!name) return "";
//     const noAccents = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
//     return noAccents.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
//   }
//   function getClientColumnName(user, clientRows) {
//     if (!user?.correo || clientRows.length === 0) return "";
//     const hit = clientRows.find(
//       (r) => normalize(r.CORREO_EMPRESA) === normalize(user.correo)
//     );
//     return toClientHeader(hit?.NOMBRE_APELLIDO);
//   }
//   // Robust number parser for CSV / inputs ("1,234.50" → 1234.5)
//   const n = (v) => {
//     if (v === null || v === undefined) return null;
//     const s = String(v).trim().replace(/\s+/g, "");
//     if (!s) return null;
//     // remove thousands separators like "1,234" or "1 234"
//     const cleaned = s.replace(/(?<=\d)[,\s](?=\d{3}\b)/g, "").replace(/,/g, ".");
//     const x = Number(cleaned);
//     return Number.isFinite(x) ? x : null;
//   };
//   // Integer qty from input
//   const asQty = (v) => {
//     const num = n(v);
//     if (!Number.isFinite(num)) return 0;
//     return Math.max(0, Math.floor(num));
//   };

//   // Fetch DOF rate once
//   useEffect(() => {
//     const getDofRate = async () => {
//       try {
//         const res = await fetch(`${API}/fx/usd-dof`);
//         const data = await res.json();
//         if (!res.ok) throw new Error(data?.error || "Error al obtener tipo de cambio DOF");
//         setDofRate(Number(data.rate)); // e.g. 18.23 (MXN per USD)
//         setDofDate(data.date);
//         setFxError(null);
//       } catch (err) {
//         console.error("DOF fetch error:", err);
//         setFxError("No se pudo obtener el tipo de cambio DOF.");
//       }
//     };
//     getDofRate();
//   }, []);

//   // Logged-in user (expects localStorage.userLoginCreds with { correo })
//   useEffect(() => {
//     const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     setUser(creds);
//   }, []);

//   // CSV URLs
//   const PRODUCTS_CSV_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

//   const CLIENT_DB_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";

//   const SPECIAL_PRICES_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=231220133&single=true&output=csv";

//   // 🔗 LIVE "LATEST" inventory CSV (publish LATEST sheet as CSV and paste that link here)
//   const INVENTORY_LATEST_CSV_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3w6YJjBrIDz56fkcJmjeBNlsfI55v9ilSXOzmnJBLi4h97ePj433ibiqXIRQ1KHOae-mYb21zydwS/pub?gid=0&single=true&output=csv";

//   useEffect(() => {
//     fetchCSV(PRODUCTS_CSV_URL, setCsvData);
//     fetchCSV(CLIENT_DB_URL, setCsvClientData);
//     fetchCSV(SPECIAL_PRICES_URL, setSpecialPrices);

//     // ==== LATEST inventory by PRODUCT NAME ONLY ====
//     axios
//       .get(INVENTORY_LATEST_CSV_URL)
//       .then((res) => {
//         const rows = parseCSV(res.data);
//         const byName = {};
//         rows.forEach((r) => {
//           const prod = normalize(r.NOMBRE_PRODUCTO || "");
//           // Try multiple common column names; parse robustly
//           const ex = n(r.EXISTENCIA ?? r.EXISTENCIAS ?? r.STOCK ?? "0");
//           if (!prod || !Number.isFinite(ex)) return;
//           byName[prod] = (byName[prod] || 0) + ex; // sum if repeated rows
//         });
//         setStockByKey(byName);
//       })
//       .catch((err) => console.error("Error fetching LATEST inventory CSV:", err));
//   }, []);

//   function fetchCSV(url, setter) {
//     axios
//       .get(url)
//       .then((res) => setter(parseCSV(res.data)))
//       .catch((err) => console.error("Error fetching CSV:", err));
//   }

//   function parseCSV(csvText) {
//     const rows = csvText.split(/\r\n/).filter(Boolean);
//     const headers = rows[0].split(",").map((h) => h.trim());
//     return rows.slice(1).map((line) => {
//       const cols = line.split(",");
//       const obj = {};
//       headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
//       return obj;
//     });
//   }

//   // Resolve product data & price whenever selection or stock map changes
//   useEffect(() => {
//     // reset stock readiness while recomputing
//     setStockReady(false);

//     const baseRow = csvData.find(
//       (r) =>
//         r.NOMBRE_PRODUCTO === selectedProduct &&
//         (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
//     );

//     if (!baseRow) {
//       setWeight("");
//       setStock("");
//       setPrice("");
//       setPackPresentation("");
//       setSpecialApplied(false);
//       setPriceCurrency("");
//       setStockReady(false);
//       return;
//     }

//     // Common attributes
//     setWeight(baseRow.PESO_PRODUCTO || "");
//     setPackPresentation(baseRow.PRESENTACION_EMPAQUE || "");

//     // STOCK SOURCE: LATEST CSV (by product only) with fallback to products CSV
//     const prodKey = normalize(selectedProduct);
//     const latestStock = stockByKey[prodKey];
//     const fallbackStock = n(baseRow.CANTIDAD_EXISTENCIA) ?? 0;

//     // store raw, but we will compare with robust parsers
//     setStock(
//       Number.isFinite(latestStock)
//         ? String(latestStock)
//         : String(fallbackStock)
//     );

//     // mark as ready next tick to avoid using stale state in render
//     setTimeout(() => setStockReady(true), 0);

//     const clientCol = getClientColumnName(user, csvClientData);

//     // Match in special sheet by product + presentation
//     const spRow = specialPrices.find(
//       (row) =>
//         normalize(row.NOMBRE_PRODUCTO) === normalize(selectedProduct) &&
//         normalize(row.PESO_PRODUCTO) === normalize(baseRow.PESO_PRODUCTO) &&
//         normalize(row.UNIDAD_MEDICION) === normalize(baseRow.UNIDAD_MEDICION)
//     );

//     // Decide price WITHOUT converting MXN→USD
//     let resolvedPrice = null;
//     let resolvedCurrency = "USD";
//     let applied = false;

//     // 1) Client-specific price (assume client-column is USD)
//     if (spRow && clientCol) {
//       const clientVal = n(spRow[clientCol]);
//       if (clientVal && clientVal > 0) {
//         resolvedPrice = clientVal;
//         resolvedCurrency = "USD";
//         applied = true;
//       }
//     }

//     // 2) Fallback to general USD on special sheet, then products sheet
//     if (resolvedPrice === null) {
//       const usdFallback =
//         n(spRow?.PRECIO_UNITARIO_DOLARES) ??
//         n(spRow?.PRECIO_PIEZA_DOLARES) ??
//         n(baseRow.PRECIO_PIEZA_DOLARES);
//       if (usdFallback && usdFallback > 0) {
//         resolvedPrice = usdFallback;
//         resolvedCurrency = "USD";
//       }
//     }

//     // 3) If still nothing in USD, try MXN columns (special first, then products) — DO NOT CONVERT
//     if (resolvedPrice === null) {
//       const mxnVal = n(spRow?.PRECIO_PIEZA_MXN) ?? n(baseRow.PRECIO_PIEZA_MXN);
//       if (mxnVal && mxnVal > 0) {
//         resolvedPrice = mxnVal;
//         resolvedCurrency = "MXN";
//       }
//     }

//     if (resolvedPrice === null) {
//       setPrice("");
//       setPriceCurrency("");
//       setSpecialApplied(false);
//       return;
//     }

//     setPrice(String(resolvedPrice));
//     setPriceCurrency(resolvedCurrency);
//     setSpecialApplied(applied);
//   }, [selectedProduct, presentation, csvData, specialPrices, csvClientData, user, stockByKey]);

//   // Presentation list for the chosen product
//   const presentationOptions = csvData
//     .filter((r) => r.NOMBRE_PRODUCTO === selectedProduct)
//     .map((r) => (r.PESO_PRODUCTO || "") + (r.UNIDAD_MEDICION || ""));

//   // === NEW: unified numeric derivations for UI & guards ===
//   const qty = asQty(amount);           // integer >= 0
//   const stockNum = n(stock);           // finite or null
//   const hasFiniteStock = Number.isFinite(stockNum);
//   const outOfStock = hasFiniteStock && qty > 0 && qty > stockNum;

//   // Add item (uses the SAME guards as UI)
//   const handleAddItem = () => {
//     const baseRow = csvData.find(
//       (r) =>
//         r.NOMBRE_PRODUCTO === selectedProduct &&
//         (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
//     );
//     if (!baseRow) return;

//     if (!stockReady || !hasFiniteStock) {
//       alert("Esperando disponibilidad de inventario. Intenta en un momento…");
//       return;
//     }
//     if (qty <= 0) {
//       alert("Ingrese una cantidad válida.");
//       return;
//     }
//     if (outOfStock) {
//       alert(`Solo hay ${stockNum} unidades disponibles.`);
//       return;
//     }
//     const unitPrice = n(price) || 0;
//     if (!unitPrice) {
//       alert("Precio no disponible para esta presentación.");
//       return;
//     }

//     const cur = (priceCurrency || "").toUpperCase() === "MXN" ? "MXN" : "USD";

//     setItems((prev) => [
//       ...prev,
//       {
//         product: selectedProduct,
//         presentation,
//         packPresentation,
//         amount: qty,
//         price: unitPrice,
//         currency: cur,
//         weight: Number(baseRow.PESO_PRODUCTO || 0),
//       },
//     ]);

//     // Reset inputs
//     setSelectedProduct("");
//     setPresentation("");
//     setPackPresentation("");
//     setAmount("");
//     setPrice("");
//     setPriceCurrency(""); // reset
//     setWeight("");
//     setStock("");
//     setStockReady(false);
//     setSpecialApplied(false);
//   };

//   const removeItem = (idx) => {
//     setItems((prev) => prev.filter((_, i) => i !== idx));
//   };

//   // ===== Totals (unchanged) =====
//   const normalizeCur = (val) => {
//     const c = String(val || "").trim().toUpperCase();
//     return c === "MXN" ? "MXN" : "USD";
//   };
//   const usdItems = items.filter((it) => normalizeCur(it.currency) === "USD");
//   const mxnItems = items.filter((it) => normalizeCur(it.currency) === "MXN");

//   const totalUSD = usdItems.reduce((sum, it) => sum + it.amount * it.price, 0);
//   const totalMXN = mxnItems.reduce((sum, it) => sum + it.amount * it.price, 0);

//   const allUSD = dofRate ? totalUSD + totalMXN / Number(dofRate) : null;
//   const allMXN = dofRate ? totalMXN + totalUSD * Number(dofRate) : null;

//   const ivaAllUSD = isActive && allUSD != null ? +(allUSD * 0.16).toFixed(2) : null;
//   const ivaAllMXN = isActive && allMXN != null ? +(allMXN * 0.16).toFixed(2) : null;

//   const allUSDWithIVA = ivaAllUSD != null ? +(allUSD + ivaAllUSD).toFixed(2) : null;
//   const allMXNWithIVA = ivaAllMXN != null ? +(allMXN + ivaAllMXN).toFixed(2) : null;

//   const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//   const fmtMXN = (v) =>
//     `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

//   const submitOrder = () => {
//     localStorage.setItem("discountTotal", "0");
//     localStorage.setItem("billRequest", JSON.stringify(isActive));
//     navigate("/orderNow", { state: { items, preferredCurrency } });
//   };

//   return (
//     <body className="app-shell body-BG-Gradient">
//       <div className="app-header loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src={Logo}
//           alt="Home Icon"
//           width="180"
//           height="55"
//           onClick={() => navigate("/userHome")}
//         />
//       </div>

//       <div className="app-main">
//         <label className="sectionHeader-Label">¡Haz tu pedido!</label>

//         <div className="quoterBody-Div">
//           <div>
//             <label className="newUserData-Label">Encuentra tu producto</label>
//             <select
//               className="productInfo-Input"
//               value={selectedProduct}
//               onChange={(e) => {
//                 setSelectedProduct(e.target.value);
//                 setPresentation("");
//                 setAmount("");
//                 setStock("");
//                 setStockReady(false);
//               }}
//             >
//               <option value="">Selecciona producto</option>
//               {[...new Set(csvData.map((i) => i.NOMBRE_PRODUCTO))].map((prod, idx) => (
//                 <option key={idx} value={prod}>
//                   {prod}
//                 </option>
//               ))}
//             </select>
//           </div>

//           <div>
//             <label className="newUserData-Label">Presentación</label>
//             <select
//               className="productInfo-Input"
//               value={presentation}
//               onChange={(e) => {
//                 setPresentation(e.target.value);
//                 setAmount("");
//                 setStock("");
//                 setStockReady(false);
//               }}
//             >
//               <option value="">Selecciona presentación</option>
//               {[...new Set(presentationOptions)].map((pres, idx) => (
//                 <option key={idx} value={pres}>
//                   {pres}
//                 </option>
//               ))}
//             </select>
//           </div>

//           {/* Package Presentation (auto) */}
//           <div>
//             <label className="newUserData-Label">Presentación Empaque</label>
//             <input
//               className="productInfo-Input"
//               type="text"
//               placeholder="Presentación empaque"
//               value={packPresentation}
//               readOnly
//             />
//           </div>

//           <div>
//             <label className="newUserData-Label">
//               Precio {priceCurrency ? `(${priceCurrency})` : ""}
//             </label>
//             <input
//               className="productInfo-Input"
//               type="text"
//               placeholder="Precio"
//               value={price ? `${price} ${priceCurrency}` : ""}
//               readOnly
//             />
//           </div>

//           <div>
//             <label className="newUserData-Label">Cantidad deseada</label>
//             <input
//               className="productInfo-Input"
//               type="number"
//               inputMode="numeric"
//               min="0"
//               step="1"
//               onChange={(e) => {
//                 const q = asQty(e.target.value);
//                 setAmount(q === 0 && e.target.value === "" ? "" : String(q));
//               }}
//               placeholder="Ingrese cantidad deseada"
//               value={amount}
//             />
//           </div>

//           {/* Unified & guarded stock warning */}
//           {stockReady && hasFiniteStock && qty > 0 && outOfStock && (
//             <label className="stockAvailability-Label">
//               Lo sentimos, por el momento no contamos con suficiente disponibilidad de este producto.
//             </label>
//           )}

//           <button
//             className="quoter-AddMoreButton"
//             onClick={handleAddItem}
//             disabled={
//               !price ||
//               !stockReady ||
//               !hasFiniteStock ||
//               qty <= 0 ||
//               outOfStock ||
//               !selectedProduct ||
//               !presentation
//             }
//             title={
//               !price
//                 ? "Precio no disponible."
//                 : !stockReady
//                 ? "Cargando disponibilidad…"
//                 : !hasFiniteStock
//                 ? "Inventario no disponible."
//                 : qty <= 0
//                 ? "Ingrese una cantidad válida."
//                 : outOfStock
//                 ? "Cantidad excede el inventario."
//                 : (!selectedProduct || !presentation)
//                 ? "Seleccione producto y presentación."
//                 : ""
//             }
//           >
//             +
//           </button>

//           <label className="newUserData-Label">Resumen del pedido</label>
//           <div className="quoter-wishlistDiv">
//             <ul className="wishlist-ulElement">
//               {items.map((item, i) => (
//                 <div key={i} className="wishlist-liElement">
//                   {item.amount} x {item.product} ({item.presentation})
//                   {item.packPresentation ? ` — ${item.packPresentation}` : ""} — ${item.price} {item.currency} c/u
//                   <FontAwesomeIcon
//                     className="expressQuote-TrashIt"
//                     onClick={() => removeItem(i)}
//                     icon={faTrash}
//                     style={{ marginLeft: 8, cursor: "pointer" }}
//                   />
//                 </div>
//               ))}
//             </ul>
//           </div>

//           {/* ===== Financial Summary (unchanged content) ===== */}
//           <label className="newUserData-Label">Resumen financiero</label>

//           {/* Toggle */}
//           <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, marginLeft: 55, marginTop: 5 }}>
//             <span style={{ fontSize: 13, color: "#333" }}>Moneda preferida:</span>

//             <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
//               <input
//                 type="radio"
//                 name="prefCurrency"
//                 value="USD"
//                 checked={preferredCurrency === "USD"}
//                 onChange={() => setPreferredCurrency("USD")}
//               />
//               USD
//             </label>

//             <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
//               <input
//                 type="radio"
//                 name="prefCurrency"
//                 value="MXN"
//                 checked={preferredCurrency === "MXN"}
//                 onChange={() => setPreferredCurrency("MXN")}
//                 disabled={!dofRate} // need FX to combine/convert
//               />
//               MXN
//             </label>
//           </div>

//           {(() => {
//             const hasUSD = totalUSD > 0;
//             const hasMXN = totalMXN > 0;
//             const onlyUSD = hasUSD && !hasMXN;
//             const mixed = hasUSD && hasMXN;

//             const fx = Number.isFinite(dofRate) ? Number(dofRate) : null;

//             const withIVA = (v) => (isActive ? v * 1.16 : v);

//             const usdSubtotal = totalUSD;
//             const mxnSubtotal = totalMXN;

//             const usdSubtotalIVA = withIVA(usdSubtotal);
//             const mxnSubtotalIVA = withIVA(mxnSubtotal);

//             const combinedMXN = fx ? usdSubtotal * fx + mxnSubtotal : null;
//             const combinedMXNIVA = fx ? withIVA(combinedMXN) : null;

//             if (onlyUSD) {
//               return (
//                 <div className="quoter-summaryDiv">
//                   <label className="summary-Label">
//                     <b>Subtotal artículos en USD:</b> {fmtUSD(usdSubtotal)}
//                   </label>

//                   {preferredCurrency === "USD" ? (
//                     <label className="summaryTotal-Label">
//                       <b>Total a pagar en USD:</b> {fmtUSD(usdSubtotalIVA)}
//                     </label>
//                   ) : (
//                     <>
//                       <label className="summary-Label">
//                         <b>Tipo de cambio:</b>{" "}
//                         {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")}
//                       </label>
//                       <label className="summaryTotal-Label">
//                         <b>Total a pagar en MXN:</b>{' '}
//                         {fx ? fmtMXN(usdSubtotalIVA * fx) : "—"}
//                       </label>
//                     </>
//                   )}
//                 </div>
//               );
//             }

//             if (mixed) {
//               if (preferredCurrency === "USD") {
//                 return (
//                   <div className="quoter-summaryDiv">
//                     <label className="summary-Label">
//                       <b>Subtotal artículos en USD:</b> {fmtUSD(usdSubtotal)}
//                     </label>
//                     <label className="summary-Label">
//                       <b>Subtotal artículos en MXN:</b> {fmtMXN(mxnSubtotal)}
//                     </label>

//                     <label className="summaryTotal-Label">
//                       <b>Total a pagar en USD:</b> {fmtUSD(usdSubtotalIVA)}
//                     </label>
//                     <label className="summaryTotal-Label">
//                       <b>Total a pagar en MXN:</b> {fmtMXN(mxnSubtotalIVA)}
//                     </label>

//                     <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
//                       En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.
//                     </div>
//                   </div>
//                 );
//               } else {
//                 return (
//                   <div className="quoter-summaryDiv">
//                     <label className="summary-Label">
//                       <b>Subtotal artículos en USD:</b> {fmtUSD(usdSubtotal)}
//                     </label>
//                     <label className="summary-Label">
//                       <b>Subtotal artículos en MXN:</b> {fmtMXN(mxnSubtotal)}
//                     </label>
//                     <label className="summary-Label">
//                       <b>Tipo de cambio:</b>{" "}
//                       {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")}
//                     </label>

//                     <label className="summaryTotal-Label">
//                       <b>Total a pagar (MXN):</b>{" "}
//                       {fx ? fmtMXN(combinedMXNIVA) : "—"}
//                     </label>
//                   </div>
//                 );
//               }
//             }

//             // Only MXN
//             return (
//               <div className="quoter-summaryDiv">
//                 <label className="summary-Label">
//                   <b>Subtotal MXN (artículos en MXN):</b> {fmtMXN(mxnSubtotal)}
//                 </label>
//                 <label className="summaryTotal-Label">
//                   <b>Total a pagar (MXN):</b> {fmtMXN(mxnSubtotalIVA)}
//                 </label>
//               </div>
//             );
//           })()}

//           <div className="newOrderActionButtons-Div">
//               <button className="submitOrder-Btn" type="button" onClick={submitOrder}>
//                 Hacer Pedido
//               </button>
//           </div>
//         </div>
//       </div>

//       <div className="app-footer footerMenuDiv">
//         <div className="footerHolder">
//           <div className="footerIcon-NameDiv" onClick={() => navigate("/userHome")}>
//             <FontAwesomeIcon icon={faHouse} className="footerIcons" />
//             <label className="footerIcon-Name">PRINCIPAL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={() => navigate("/userProfile")}>
//             <FontAwesomeIcon icon={faUser} className="footerIcons" />
//             <label className="footerIcon-Name">MI PERFIL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={() => navigate("/newOrder")}>
//             <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
//             <label className="footerIcon-Name">ORDENA</label>
//           </div>
//         </div>
//       </div>
//     </body>
//   );
// }


