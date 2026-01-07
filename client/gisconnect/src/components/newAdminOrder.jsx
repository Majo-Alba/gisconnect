import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { faHouse, faCartShopping, faBan, faTrash } from "@fortawesome/free-solid-svg-icons";
import { faCheckToSlot } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import { API } from "/src/lib/api";

const ALLOWED_ADMIN_EMAILS = new Set([
  "ventas@greenimportsol.com",
  "majo_test@gmail.com",
]);

export default function NewAdminOrder() {
  const navigate = useNavigate();

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  // ===== Gatekeeping for Alex/Majo only
  const [me, setMe] = useState(null);
  useEffect(() => {
    const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    setMe(creds || null);
  }, []);
  const myEmail = (me?.correo || "").trim().toLowerCase();
  const isAllowed = ALLOWED_ADMIN_EMAILS.has(myEmail);

  // ====== Customer identity (required)
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");

  // ====== Shipping & billing (per-order only, not saved to DB user records)
  const [shipping, setShipping] = useState({
    apodo: "",
    calleEnvio: "",
    exteriorEnvio: "",
    interiorEnvio: "",
    coloniaEnvio: "",
    ciudadEnvio: "",
    estadoEnvio: "",
    cpEnvio: "",
  });

  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [billing, setBilling] = useState({
    razonSocial: "",
    rfcEmpresa: "",
    correoFiscal: "",
    calleFiscal: "",
    exteriorFiscal: "",
    interiorFiscal: "",
    coloniaFiscal: "",
    ciudadFiscal: "",
    estadoFiscal: "",
    cpFiscal: "",
  });

  // ====== Product selection (reuse user-side logic, minus per-client special pricing)
  const [csvProducts, setCsvProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [presentation, setPresentation] = useState("");
  const presentationOptions = useMemo(
    () =>
      csvProducts
        .filter((r) => r.NOMBRE_PRODUCTO === selectedProduct)
        .map((r) => (r.PESO_PRODUCTO || "") + (r.UNIDAD_MEDICION || "")),
    [csvProducts, selectedProduct]
  );

  const [packPresentation, setPackPresentation] = useState("");
  const [priceCurrency, setPriceCurrency] = useState(""); // USD|MXN
  const [price, setPrice] = useState("");                 // numeric string
  const [stock, setStock] = useState("");                 // numeric string
  const [stockReady, setStockReady] = useState(false);
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState([]);

  // DOF rate
  const [dofRate, setDofRate] = useState(null);
  const [dofDate, setDofDate] = useState(null);
  const [fxError, setFxError] = useState(null);

  // Preferred currency for summary
  const [preferredCurrency, setPreferredCurrency] = useState("USD");

  // Utils
  const normalize = (s) =>
    (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
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

  // CSV URLs (same used on user side)
  const PRODUCTS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";
  const INVENTORY_LATEST_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3w6YJjBrIDz56fkcJmjeBNlsfI55v9ilSXOzmnJBLi4h97ePj433ibiqXIRQ1KHOae-mYb21zydwS/pub?gid=0&single=true&output=csv";

  // Stock by product (sum)
  const [stockByKey, setStockByKey] = useState({});

  useEffect(() => {
    // products
    axios
      .get(PRODUCTS_CSV_URL)
      .then((res) => {
        const rows = parseCSV(res.data);
        setCsvProducts(rows);
      })
      .catch((err) => console.error("Error fetching products CSV:", err));

    // inventory latest
    axios
      .get(INVENTORY_LATEST_CSV_URL)
      .then((res) => {
        const rows = parseCSV(res.data);
        const by = {};
        rows.forEach((r) => {
          const prod = normalize(r.NOMBRE_PRODUCTO || "").toLowerCase();
          const ex = n(r.EXISTENCIA ?? r.EXISTENCIAS ?? r.STOCK ?? "0");
          if (!prod || !Number.isFinite(ex)) return;
          by[prod] = (by[prod] || 0) + ex;
        });
        setStockByKey(by);
      })
      .catch((err) => console.error("Error fetching inventory CSV:", err));
  }, []);

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

  function parseCSV(csvText) {
    const rows = String(csvText || "").split(/\r\n/).filter(Boolean);
    if (rows.length === 0) return [];
    const headers = rows[0].split(",").map((h) => h.trim());
    return rows.slice(1).map((line) => {
      const cols = line.split(",");
      const obj = {};
      headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
      return obj;
    });
  }

  // Resolve presentation stock and price (general price only; no per-client special price)
  useEffect(() => {
    setStockReady(false);
    const row = csvProducts.find(
      (r) =>
        r.NOMBRE_PRODUCTO === selectedProduct &&
        (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
    );

    if (!row) {
      setPackPresentation("");
      setPrice("");
      setPriceCurrency("");
      setStock("");
      setStockReady(false);
      return;
    }

    setPackPresentation(row.PRESENTACION_EMPAQUE || "");

    // price fallback (prefer USD from products sheet, else MXN)
    const usd = n(row.PRECIO_PIEZA_DOLARES);
    const mxn = n(row.PRECIO_PIEZA_MXN);
    if (Number.isFinite(usd) && usd > 0) {
      setPrice(String(usd));
      setPriceCurrency("USD");
    } else if (Number.isFinite(mxn) && mxn > 0) {
      setPrice(String(mxn));
      setPriceCurrency("MXN");
    } else {
      setPrice("");
      setPriceCurrency("");
    }

    // stock by product name only (latest)
    const key = normalize(selectedProduct).toLowerCase();
    const latest = stockByKey[key];
    const fallback = n(row.CANTIDAD_EXISTENCIA) ?? 0;
    setStock(
      Number.isFinite(latest) ? String(latest) : String(fallback)
    );

    setTimeout(() => setStockReady(true), 0);
  }, [selectedProduct, presentation, csvProducts, stockByKey]);

  const qty = asQty(amount);
  const stockNum = n(stock);
  const hasFiniteStock = Number.isFinite(stockNum);
  const outOfStock = hasFiniteStock && qty > 0 && qty > stockNum;

  const handleAddItem = () => {
    const row = csvProducts.find(
      (r) =>
        r.NOMBRE_PRODUCTO === selectedProduct &&
        (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
    );
    if (!row) return;

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
        weight: Number(row.PESO_PRODUCTO || 0),
      },
    ]);

    setSelectedProduct("");
    setPresentation("");
    setPackPresentation("");
    setAmount("");
    setPrice("");
    setPriceCurrency("");
    setStock("");
    setStockReady(false);
  };

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // Totals
  const normalizeCur = (val) => (String(val || "").trim().toUpperCase() === "MXN" ? "MXN" : "USD");
  const usdItems = items.filter((it) => normalizeCur(it.currency) === "USD");
  const mxnItems = items.filter((it) => normalizeCur(it.currency) === "MXN");

  const totalUSD = usdItems.reduce((s, it) => s + it.amount * it.price, 0);
  const totalMXN = mxnItems.reduce((s, it) => s + it.amount * it.price, 0);

  const allUSD = dofRate ? totalUSD + totalMXN / Number(dofRate) : null;
  const allMXN = dofRate ? totalMXN + totalUSD * Number(dofRate) : null;

  const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
  const fmtMXN = (v) =>
    `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

  // ===== Submit: create order directly (no navigation into user-side flow)
  const handleCreateOrder = async () => {
    if (!isAllowed) {
      alert("No autorizado.");
      return;
    }
    if (!customerName.trim() || !customerEmail.trim()) {
      alert("Cliente: nombre y correo son obligatorios.");
      return;
    }
    if (items.length === 0) {
      alert("Agrega al menos un producto al pedido.");
      return;
    }

    const totals = {
      totalUSDNative: Number(totalUSD.toFixed(2)),
      totalMXNNative: Number(totalMXN.toFixed(2)),
      totalAllUSD: allUSD != null ? Number(allUSD.toFixed(2)) : null,
      totalAllMXN: allMXN != null ? Number(allMXN.toFixed(2)) : null,
      dofRate: Number.isFinite(dofRate) ? Number(dofRate) : null,
      dofDate,
      discountUSD: 0, // admin-side doesn't apply discount here (can be edited later if needed)
    };

    const orderInfo = {
      userEmail: customerEmail.trim(),          // IMPORTANT: tag the real customer here
      userName: customerName.trim(),
      userCompany: customerCompany.trim(),
      items,
      requestBill: !!wantsInvoice,
      shippingInfo: { ...shipping },
      billingInfo: wantsInvoice ? { ...billing } : {},
      shippingPreferences: { preferredCarrier: "", insureShipment: false },
      orderDate: new Date().toISOString(),
      orderStatus: "Pedido Realizado",
      totals,
      placedByAdmin: {
        adminEmail: myEmail,
        at: new Date().toISOString(),
      },
      preferredCurrency, // for downstream UI
    };

    try {
      const form = new FormData();
      form.append("order", JSON.stringify(orderInfo));

      // 1) Save order
      let createdOrderId = null;
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort("timeout"), 20000);
        const res = await fetch(`${API}/orderDets`, {
          method: "POST",
          body: form,
          mode: "cors",
          cache: "no-store",
          credentials: "omit",
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
        const data = await res.json().catch(() => ({}));
        createdOrderId =
          data?.id || data?.data?._id || data?._id || data?.order?._id || null;
      } catch (fetchErr) {
        const { data } = await axios.post(`${API}/orderDets`, form, {
          withCredentials: false,
          timeout: 20000,
        });
        createdOrderId =
          data?.id || data?.data?._id || data?._id || data?.order?._id || null;
      }

      // 2) Reserve inventory (optional best-effort)
      try {
        const holdLines = items.map((it) => {
          const m = String(it.presentation || "").trim().toUpperCase().replace(/\s+/g, "").match(/^(\d+(?:[.,]\d+)?)([A-Z]+)$/);
          const peso = m ? m[1].replace(",", ".") : it.presentation;
          const unidad = m ? m[2] : "";
          return { product: it.product, peso, unidad, quantity: Number(it.amount) || 0 };
        });

        if (createdOrderId && holdLines.length > 0) {
          await axios.post(
            `${API}/inventory/hold`,
            { orderId: createdOrderId, holdMinutes: 120, lines: holdLines },
            { withCredentials: false, timeout: 15000 }
          );
        }
      } catch (holdErr) {
        console.error("Error reservando inventario:", holdErr);
      }

      alert("Orden creada exitosamente en nombre del cliente.");
      navigate("/newOrders");
    } catch (error) {
      console.error("Error al crear la orden:", error);
      alert("No se pudo crear la orden. Intenta nuevamente.");
    }
  };

  if (!isAllowed) {
    return (
      <body className="body-BG-Gradient">
        <div className="loginLogo-ParentDiv">
          <img
            className="secondaryPages-GISLogo"
            src={Logo}
            alt="Home Icon"
            width="180"
            height="55"
            onClick={() => navigate("/adminHome")}
          />
        </div>

        <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
          <div className="orderNow-AddressDiv" style={{ maxWidth: 480, textAlign: "center" }}>
            <FontAwesomeIcon icon={faBan} style={{ fontSize: 28, marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Acceso restringido</div>
            <div style={{ fontSize: 14 }}>
              Esta sección solo está disponible para ventas@greenimportsol.com y majo_test@gmail.com.
            </div>
          </div>

          <button className="submitOrder-Btn" style={{ marginTop: 16 }} onClick={() => navigate("/adminHome")}>
            Regresar
          </button>
        </div>
      </body>
    );
  }

  return (
    <body className="app-shell body-BG-Gradient">
      {/* Header */}
      <div className="app-header loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Home Icon"
          width="180"
          height="55"
          onClick={() => navigate("/adminHome")}
        />
      </div>

      <div className="app-main">
        <label className="sectionHeader-Label">Crea Una Nueva Orden</label>

        {/* ===== Customer identity ===== */}
        <div className="quoterBody-Div">
          <label className="newUserData-Label">Datos del cliente</label>

          <input
            className="productInfo-Input"
            type="text"
            placeholder="Nombre del cliente"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />

          <input
            className="productInfo-Input"
            type="email"
            placeholder="Correo del cliente"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />

          <input
            className="productInfo-Input"
            type="text"
            placeholder="Empresa (opcional)"
            value={customerCompany}
            onChange={(e) => setCustomerCompany(e.target.value)}
          />

          {/* ===== Shipping address ===== */}
          <label className="newUserData-Label" style={{ marginTop: 10 }}>Dirección de Envío</label>
          {/* <input className="productInfo-Input" placeholder="Apodo (opcional)" value={shipping.apodo} onChange={(e)=>setShipping(s=>({...s,apodo:e.target.value}))}/> */}
          <input className="productInfo-Input" placeholder="Calle" value={shipping.calleEnvio} onChange={(e)=>setShipping(s=>({...s,calleEnvio:e.target.value}))}/>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "82%", marginLeft: "9%" }}>
            <input className="productInfo-Input" placeholder="# Ext." value={shipping.exteriorEnvio} onChange={(e)=>setShipping(s=>({...s,exteriorEnvio:e.target.value}))}/>
            <input className="productInfo-Input" placeholder="# Int." value={shipping.interiorEnvio} onChange={(e)=>setShipping(s=>({...s,interiorEnvio:e.target.value}))}/>
          </div>
          <input className="productInfo-Input" placeholder="Colonia" value={shipping.coloniaEnvio} onChange={(e)=>setShipping(s=>({...s,coloniaEnvio:e.target.value}))}/>
          {/* <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}> */}
            <input className="productInfo-Input" placeholder="Ciudad" value={shipping.ciudadEnvio} onChange={(e)=>setShipping(s=>({...s,ciudadEnvio:e.target.value}))}/>
            <input className="productInfo-Input" placeholder="Estado" value={shipping.estadoEnvio} onChange={(e)=>setShipping(s=>({...s,estadoEnvio:e.target.value}))}/>
            <input className="productInfo-Input" placeholder="C.P." value={shipping.cpEnvio} onChange={(e)=>setShipping(s=>({...s,cpEnvio:e.target.value}))}/>
          {/* </div> */}

          {/* ===== Billing ===== */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <span className="newUserData-Label" style={{ marginLeft: "15%" }}>¿Desea factura?</span>
            {/* <span className="newUserData-Label" style={{ margin: 0 }}>¿Desea factura?</span> */}
            <select
              className="productInfo-Input"
              style={{ maxWidth: 100, marginRight: "15%" }}
              value={String(wantsInvoice)}
              onChange={(e) => setWantsInvoice(e.target.value === "true")}
            >
              <option value="false">No</option>
              <option value="true">Sí</option>
            </select>
          </div>

          {wantsInvoice && (
            <>
              <input className="productInfo-Input" placeholder="Razón Social" value={billing.razonSocial} onChange={(e)=>setBilling(b=>({...b,razonSocial:e.target.value}))}/>
              <input className="productInfo-Input" placeholder="RFC" value={billing.rfcEmpresa} onChange={(e)=>setBilling(b=>({...b,rfcEmpresa:e.target.value}))}/>
              <input className="productInfo-Input" placeholder="Correo fiscal" value={billing.correoFiscal} onChange={(e)=>setBilling(b=>({...b,correoFiscal:e.target.value}))}/>
              <input className="productInfo-Input" placeholder="Calle fiscal" value={billing.calleFiscal} onChange={(e)=>setBilling(b=>({...b,calleFiscal:e.target.value}))}/>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "82%", marginLeft: "9%" }}>
                <input className="productInfo-Input" placeholder="# Ext." value={billing.exteriorFiscal} onChange={(e)=>setBilling(b=>({...b,exteriorFiscal:e.target.value}))}/>
                <input className="productInfo-Input" placeholder="# Int." value={billing.interiorFiscal} onChange={(e)=>setBilling(b=>({...b,interiorFiscal:e.target.value}))}/>
              </div>
              <input className="productInfo-Input" placeholder="Colonia fiscal" value={billing.coloniaFiscal} onChange={(e)=>setBilling(b=>({...b,coloniaFiscal:e.target.value}))}/>
              {/* <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}> */}
                <input className="productInfo-Input" placeholder="Ciudad fiscal" value={billing.ciudadFiscal} onChange={(e)=>setBilling(b=>({...b,ciudadFiscal:e.target.value}))}/>
                <input className="productInfo-Input" placeholder="Estado fiscal" value={billing.estadoFiscal} onChange={(e)=>setBilling(b=>(({...b}),{estadoFiscal:e.target.value}))}/>
                <input className="productInfo-Input" placeholder="C.P. fiscal" value={billing.cpFiscal} onChange={(e)=>setBilling(b=>({...b,cpFiscal:e.target.value}))}/>
              {/* </div> */}
            </>
          )}

          {/* ===== Product picker ===== */}
          <label className="newUserData-Label" style={{ marginTop: 12 }}>Productos</label>

          <select
            className="productInfo-Input"
            value={selectedProduct}
            onChange={(e) => {
              setSelectedProduct(e.target.value);
              setPresentation("");
              setAmount("");
              setPrice("");
              setPriceCurrency("");
              setStock("");
              setStockReady(false);
            }}
          >
            <option value="">Selecciona producto</option>
            {[...new Set(csvProducts.map((i) => i.NOMBRE_PRODUCTO))].map((p, idx) => (
              <option key={idx} value={p}>{p}</option>
            ))}
          </select>

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
              <option key={idx} value={pres}>{pres}</option>
            ))}
          </select>

          <input
            className="productInfo-Input"
            placeholder="Presentación empaque"
            value={packPresentation}
            readOnly
          />

          <input
            className="productInfo-Input"
            placeholder={`Precio ${priceCurrency ? `(${priceCurrency})` : ""}`}
            value={price ? `${price} ${priceCurrency}` : ""}
            readOnly
          />

          <input
            className="productInfo-Input"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            placeholder="Cantidad"
            value={amount}
            onChange={(e) => {
              const q = asQty(e.target.value);
              setAmount(q === 0 && e.target.value === "" ? "" : String(q));
            }}
          />

          {stockReady && hasFiniteStock && qty > 0 && outOfStock && (
            <label className="stockAvailability-Label">
              Lo sentimos, no hay suficiente inventario para esta cantidad.
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
          >
            +
          </button>

          {/* Cart */}
          <label className="newUserData-Label">Resumen del pedido</label>
          <div className="quoter-wishlistDiv">
            <ul className="wishlist-ulElement">
              {items.map((it, i) => (
                <div key={i} className="wishlist-liElement">
                  {it.amount} x {it.product} ({it.presentation})
                  {it.packPresentation ? ` — ${it.packPresentation}` : ""} — ${it.price} {it.currency} c/u
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

          {/* Preferred currency toggle */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "6px 0 10px 55px" }}>
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
                disabled={!dofRate}
              />
              MXN
            </label>
          </div>

          {/* Financial summary */}
          {(() => {
            const hasUSD = totalUSD > 0;
            const hasMXN = totalMXN > 0;
            const mixed = hasUSD && hasMXN;
            const fx = Number.isFinite(dofRate) ? Number(dofRate) : null;

            if (!mixed) {
              if (hasUSD) {
                return (
                  <div className="quoter-summaryDiv">
                    <label className="summary-Label">
                      <b>Subtotal en USD:</b> {fmtUSD(totalUSD)}
                    </label>
                    {preferredCurrency === "USD" ? (
                      <label className="summaryTotal-Label">
                        <b>Total a pagar en USD:</b> {fmtUSD(totalUSD)}
                      </label>
                    ) : (
                      <>
                        <label className="summary-Label">
                          <b>Tipo de cambio:</b> {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando…")}
                        </label>
                        <label className="summaryTotal-Label">
                          <b>Total a pagar en MXN:</b> {fx ? fmtMXN(totalUSD * fx) : "—"}
                        </label>
                      </>
                    )}
                  </div>
                );
              }
              if (hasMXN) {
                return (
                  <div className="quoter-summaryDiv">
                    <label className="summary-Label">
                      <b>Subtotal en MXN:</b> {fmtMXN(totalMXN)}
                    </label>
                    <label className="summaryTotal-Label">
                      <b>Total a pagar en MXN:</b> {fmtMXN(totalMXN)}
                    </label>
                  </div>
                );
              }
              return null;
            }

            // Mixed
            if (preferredCurrency === "USD") {
              return (
                <div className="quoter-summaryDiv">
                  <label className="summary-Label">
                    <b>Subtotal USD:</b> {fmtUSD(totalUSD)}
                  </label>
                  <label className="summary-Label">
                    <b>Subtotal MXN:</b> {fmtMXN(totalMXN)}
                  </label>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
                    En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.
                  </div>
                </div>
              );
            }
            return (
              <div className="quoter-summaryDiv">
                <label className="summary-Label">
                  <b>Subtotal USD:</b> {fmtUSD(totalUSD)}
                </label>
                <label className="summary-Label">
                  <b>Subtotal MXN:</b> {fmtMXN(totalMXN)}
                </label>
                <label className="summary-Label">
                  <b>Tipo de cambio:</b> {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando…")}
                </label>
                <label className="summaryTotal-Label">
                  <b>Total combinado (MXN):</b> {fx ? fmtMXN(totalUSD * fx + totalMXN) : "—"}
                </label>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="newOrderActionButtons-Div" style={{ marginTop: 10 }}>
            <button className="submitOrder-Btn" type="button" onClick={handleCreateOrder}>
              Crear Orden
            </button>
            {/* <button
              className="submitOrder-Btn"
              type="button"
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,.3)" }}
              onClick={() => navigate("/newOrders")}
            >
              Cancelar
            </button> */}
          </div>
        </div>
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

          <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
            <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
            <label className="footerIcon-Name">ENTREGAR</label>
          </div>
        </div>
      </div>
    </body>
  );
}
