import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { faHouse, faCartShopping, faBan, faTrash } from "@fortawesome/free-solid-svg-icons";
import { faCheckToSlot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import { API } from "/src/lib/api";

const ALLOWED_ADMIN_EMAILS = new Set([
  "ventas@greenimportsol.com",
  "info@greenimportsol.com",
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

  // ====== Customer identity (split nombre / apellido)
  const [customerNombre, setCustomerNombre] = useState("");
  const [customerApellido, setCustomerApellido] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");

  // ====== Shipping
  const [pickupAtHQ, setPickupAtHQ] = useState(false);          // "Recoger en Matriz"
  const [useDifferentShipping, setUseDifferentShipping] = useState(false); // override stored addr (don't save)
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
  // Remember original auto-filled shipping to restore if they uncheck "Usar otra dirección"
  const [prefilledShipping, setPrefilledShipping] = useState(null);

  // ====== Billing
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
    usoCFDI: "",
    regimenFiscal: "",
  });
  const [prefilledBilling, setPrefilledBilling] = useState(null);

  // ====== Product selection (same)
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
  const _idToMs = (id) => {
    try { return parseInt(String(id).slice(0,8),16) * 1000; } catch { return 0; }
  };
  const pickNewest = (arr) =>
    Array.isArray(arr) && arr.length
      ? [...arr].sort((a,b) => _idToMs(b?._id) - _idToMs(a?._id))[0]
      : null;

  // CSV URLs
  const PRODUCTS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";
  const INVENTORY_LATEST_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3w6YJjBrIDz56fkcJmjeBNlsfI55v9ilSXOzmnJBLi4h97ePj433ibiqXIRQ1KHOae-mYb21zydwS/pub?gid=0&single=true&output=csv";

  // Stock by product (sum)
  const [stockByKey, setStockByKey] = useState({});

  useEffect(() => {
    // products
    axios.get(PRODUCTS_CSV_URL).then((res) => {
      const rows = parseCSV(res.data);
      setCsvProducts(rows);
    }).catch((err) => console.error("Error fetching products CSV:", err));

    // inventory latest
    axios.get(INVENTORY_LATEST_CSV_URL).then((res) => {
      const rows = parseCSV(res.data);
      const by = {};
      rows.forEach((r) => {
        const prod = normalize(r.NOMBRE_PRODUCTO || "").toLowerCase();
        const ex = n(r.EXISTENCIA ?? r.EXISTENCIAS ?? r.STOCK ?? "0");
        if (!prod || !Number.isFinite(ex)) return;
        by[prod] = (by[prod] || 0) + ex;
      });
      setStockByKey(by);
    }).catch((err) => console.error("Error fetching inventory CSV:", err));
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

  // Auto-fill on email: newusers + shippingaddresses + billingaddresses
  useEffect(() => {
    const email = (customerEmail || "").trim().toLowerCase();
    if (!email) {
      setPrefilledShipping(null);
      setPrefilledBilling(null);
      return;
    }

    (async () => {
      try {
        // User
        const usr = await axios.get(`${API}/users/by-email`, { params: { email } }).catch(() => ({ data: null }));
        const nombre = usr?.data?.nombre?.trim?.() || "";
        const apellido = usr?.data?.apellido?.trim?.() || "";
        const empresa = usr?.data?.empresa?.trim?.() || "";

        if (nombre || apellido) {
          if (!customerNombre) setCustomerNombre(nombre);
          if (!customerApellido) setCustomerApellido(apellido);
        }
        if (empresa && !customerCompany) setCustomerCompany(empresa);

        // Shipping (pick newest)
        const sRes = await axios.get(`${API}/shipping-address/${encodeURIComponent(email)}`).catch(() => ({ data: [] }));
        const s = pickNewest(sRes?.data || []);
        if (s) {
          setPrefilledShipping(s);
          if (!useDifferentShipping) {
            setShipping({
              apodo: "",
              calleEnvio: s.calleEnvio || "",
              exteriorEnvio: s.exteriorEnvio || "",
              interiorEnvio: s.interiorEnvio || "",
              coloniaEnvio: s.coloniaEnvio || "",
              ciudadEnvio: s.ciudadEnvio || "",
              estadoEnvio: s.estadoEnvio || "",
              cpEnvio: s.cpEnvio || "",
            });
          }
        }

        // Billing (pick newest)
        const bRes = await axios.get(`${API}/billing-address/${encodeURIComponent(email)}`).catch(() => ({ data: [] }));
        const b = pickNewest(bRes?.data || []);
        if (b) {
          setPrefilledBilling(b);
          setBilling((prev) => ({
            ...prev,
            razonSocial: b.razonSocial || prev.razonSocial,
            rfcEmpresa: b.rfcEmpresa || prev.rfcEmpresa,
            correoFiscal: b.correoFiscal || prev.correoFiscal,
            calleFiscal: b.calleFiscal || prev.calleFiscal,
            exteriorFiscal: b.exteriorFiscal || prev.exteriorFiscal,
            interiorFiscal: b.interiorFiscal || prev.interiorFiscal,
            coloniaFiscal: b.coloniaFiscal || prev.coloniaFiscal,
            ciudadFiscal: b.ciudadFiscal || prev.ciudadFiscal,
            estadoFiscal: b.estadoFiscal || prev.estadoFiscal,
            cpFiscal: b.cpFiscal || prev.cpFiscal,
            usoCFDI: b.usoCFDI || prev.usoCFDI,
            regimenFiscal: b.regimenFiscal || prev.regimenFiscal,
          }));
        }
      } catch (e) {
        console.error("Autofill error:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerEmail]);

  // Resolve presentation stock and price (general price only)
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

    const key = normalize(selectedProduct).toLowerCase();
    const latest = stockByKey[key];
    const fallback = n(row.CANTIDAD_EXISTENCIA) ?? 0;
    setStock(Number.isFinite(latest) ? String(latest) : String(fallback));

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

  // ===== helpers: upserts (best-effort; adjust endpoints to your API if needed)
  async function upsertNewUser({ nombre, apellido, empresa, correo }) {
    try {
      await axios.post(`${API}/users/upsert`, { nombre, apellido, empresa, correo });
    } catch {
      // fallback attempt
      try { await axios.post(`${API}/users`, { nombre, apellido, empresa, correo }); } catch {}
    }
  }
  async function upsertShippingAddress(email, addr) {
    // do not save if override or pickup
    if (pickupAtHQ || useDifferentShipping) return;
    try {
      await axios.post(`${API}/shipping-address`, { userEmail: email, ...addr });
    } catch {}
  }
  async function upsertBillingAddress(email, bill) {
    if (!wantsInvoice) return;
    try {
      await axios.post(`${API}/billing-address`, { userEmail: email, ...bill });
    } catch {}
  }

  // ===== Submit: create order + upserts
  const handleCreateOrder = async () => {
    if (!isAllowed) {
      alert("No autorizado.");
      return;
    }
    if (!customerNombre.trim() || !customerApellido.trim() || !customerEmail.trim()) {
      alert("Cliente: nombre, apellido y correo son obligatorios.");
      return;
    }
    if (items.length === 0) {
      alert("Agrega al menos un producto al pedido.");
      return;
    }

    // Compose display name for order
    const displayName = [customerNombre.trim(), customerApellido.trim()].filter(Boolean).join(" ");

    const totals = {
      totalUSDNative: Number(totalUSD.toFixed(2)),
      totalMXNNative: Number(totalMXN.toFixed(2)),
      totalAllUSD: allUSD != null ? Number(allUSD.toFixed(2)) : null,
      totalAllMXN: allMXN != null ? Number(allMXN.toFixed(2)) : null,
      dofRate: Number.isFinite(dofRate) ? Number(dofRate) : null,
      dofDate,
      discountUSD: 0,
    };

    // Decide shippingInfo for the order
    let shippingInfoForOrder;
    if (pickupAtHQ) {
      shippingInfoForOrder = { entrega: "Recoger en Matriz" };
    } else {
      shippingInfoForOrder = { ...shipping };
    }

    const orderInfo = {
      userEmail: customerEmail.trim(),
      userName: displayName,
      userCompany: customerCompany.trim(),
      items,
      requestBill: !!wantsInvoice,
      shippingInfo: shippingInfoForOrder,
      billingInfo: wantsInvoice ? { ...billing } : {},
      shippingPreferences: { preferredCarrier: "", insureShipment: false },
      orderDate: new Date().toISOString(),
      orderStatus: "Pedido Realizado",
      totals,
      placedByAdmin: {
        adminEmail: myEmail,
        at: new Date().toISOString(),
      },
      preferredCurrency,
    };

    try {
      // 0) Best-effort upserts so future orders auto-fill
      await upsertNewUser({
        nombre: customerNombre.trim(),
        apellido: customerApellido.trim(),
        empresa: customerCompany.trim(),
        correo: customerEmail.trim(),
      });
      await upsertShippingAddress(customerEmail.trim(), shipping);
      await upsertBillingAddress(customerEmail.trim(), billing);

      // 1) Save order
      const form = new FormData();
      form.append("order", JSON.stringify(orderInfo));

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
        createdOrderId = data?.id || data?.data?._id || data?._id || data?.order?._id || null;
      } catch (fetchErr) {
        const { data } = await axios.post(`${API}/orderDets`, form, {
          withCredentials: false,
          timeout: 20000,
        });
        createdOrderId = data?.id || data?.data?._id || data?._id || data?.order?._id || null;
      }

      // 2) Reserve inventory (optional)
      try {
        const holdLines = items.map((it) => {
          const m = String(it.presentation || "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "")
            .match(/^(\d+(?:[.,]\d+)?)([A-Z]+)$/);
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
              Esta sección solo está disponible para ventas@greenimportsol.com, info@greenimportsol.com y majo_test@gmail.com.
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, width: "82%", marginLeft: "9%", marginTop: "3%" }}>
            {/* <input
              className="productInfo-Input"
              type="text"
              placeholder="Nombre"
              value={customerNombre}
              onChange={(e) => setCustomerNombre(e.target.value)}
            />
            <input
              className="productInfo-Input"
              type="text"
              placeholder="Apellido"
              value={customerApellido}
              onChange={(e) => setCustomerApellido(e.target.value)}
            /> */}
          </div>

          <input
              className="productInfo-Input"
              type="text"
              placeholder="Nombre"
              value={customerNombre}
              onChange={(e) => setCustomerNombre(e.target.value)}
            />
            <input
              className="productInfo-Input"
              type="text"
              placeholder="Apellido"
              value={customerApellido}
              onChange={(e) => setCustomerApellido(e.target.value)}
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
          <label className="newUserData-Label">Dirección de Envío</label>

          {/* <span className="newUserData-Label" style={{ margin: 0 }}>Dirección de Envío</span> */}

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, marginLeft: "15%" }}>
            {/* <span className="newUserData-Label" style={{ margin: 0 }}>Dirección de Envío</span> */}
            <label style={{ fontFamily: "FiraSans", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={pickupAtHQ}
                onChange={(e) => setPickupAtHQ(e.target.checked)}
              />
              Recoger en Matriz
            </label>
            {!!prefilledShipping && (
              <label style={{ fontFamily: "FiraSans", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={useDifferentShipping}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setUseDifferentShipping(v);
                    if (v) {
                      // clear fields for a different (one-off) address
                      setShipping({
                        apodo: "",
                        calleEnvio: "",
                        exteriorEnvio: "",
                        interiorEnvio: "",
                        coloniaEnvio: "",
                        ciudadEnvio: "",
                        estadoEnvio: "",
                        cpEnvio: "",
                      });
                    } else if (prefilledShipping) {
                      // restore prefilled
                      setShipping({
                        apodo: "",
                        calleEnvio: prefilledShipping.calleEnvio || "",
                        exteriorEnvio: prefilledShipping.exteriorEnvio || "",
                        interiorEnvio: prefilledShipping.interiorEnvio || "",
                        coloniaEnvio: prefilledShipping.coloniaEnvio || "",
                        ciudadEnvio: prefilledShipping.ciudadEnvio || "",
                        estadoEnvio: prefilledShipping.estadoEnvio || "",
                        cpEnvio: prefilledShipping.cpEnvio || "",
                      });
                    }
                  }}
                />
                Usar otra dirección
              </label>
            )}
          </div>

          {!pickupAtHQ && (
            <>
              <input className="productInfo-Input" placeholder="Calle" value={shipping.calleEnvio} onChange={(e)=>setShipping(s=>({...s,calleEnvio:e.target.value}))}/>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "82%", marginLeft: "9%" }}>
                <input className="productInfo-Input" placeholder="# Ext." value={shipping.exteriorEnvio} onChange={(e)=>setShipping(s=>({...s,exteriorEnvio:e.target.value}))}/>
                <input className="productInfo-Input" placeholder="# Int." value={shipping.interiorEnvio} onChange={(e)=>setShipping(s=>({...s,interiorEnvio:e.target.value}))}/>
              </div>
              <input className="productInfo-Input" placeholder="Colonia" value={shipping.coloniaEnvio} onChange={(e)=>setShipping(s=>({...s,coloniaEnvio:e.target.value}))}/>
              <input className="productInfo-Input" placeholder="Ciudad" value={shipping.ciudadEnvio} onChange={(e)=>setShipping(s=>({...s,ciudadEnvio:e.target.value}))}/>
              <input className="productInfo-Input" placeholder="Estado" value={shipping.estadoEnvio} onChange={(e)=>setShipping(s=>({...s,estadoEnvio:e.target.value}))}/>
              <input className="productInfo-Input" placeholder="C.P." value={shipping.cpEnvio} onChange={(e)=>setShipping(s=>({...s,cpEnvio:e.target.value}))}/>
            </>
          )}

          {/* ===== Billing ===== */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <span className="newUserData-Label" style={{ marginLeft: "15%" }}>¿Desea factura?</span>
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
              <input className="productInfo-Input" placeholder="Ciudad fiscal" value={billing.ciudadFiscal} onChange={(e)=>setBilling(b=>({...b,ciudadFiscal:e.target.value}))}/>
              <input className="productInfo-Input" placeholder="Estado fiscal" value={billing.estadoFiscal} onChange={(e)=>setBilling(b=>({...b,estadoFiscal:e.target.value}))}/>
              <input className="productInfo-Input" placeholder="C.P. fiscal" value={billing.cpFiscal} onChange={(e)=>setBilling(b=>({...b,cpFiscal:e.target.value}))}/>

              {/* NUEVOS: usoCFDI / regimenFiscal */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, width: "82%", marginLeft: "9%" }}>
                <select
                  className="productInfo-Input"
                  value={billing.usoCFDI}
                  onChange={(e)=>setBilling(b=>({...b,usoCFDI:e.target.value}))}
                >
                  <option value="">{`Escoger uso CFDI`}</option>
                  <option value="G01">G01: Adquisición de mercancías</option>
                  <option value="G03">G03: Gastos en general</option>
                  <option value="P01">P01: Por definir</option>
                  <option value="S01">S01: Sin efectos fiscales</option>
                </select>

                <select
                  className="productInfo-Input"
                  value={billing.regimenFiscal}
                  onChange={(e)=>setBilling(b=>({...b,regimenFiscal:e.target.value}))}
                >
                  <option value="">{`Escoger Régimen Fiscal`}</option>
                  <option value="601">601: General de Ley Personas Morales</option>
                  <option value="603">603: Personas Morales con Fines no Lucrativos</option>
                  <option value="605">605: Sueldos y Salarios e Ingresos Asimilados a Salarios</option>
                  <option value="607">607: Régimen de Enajenación o Adquisición de Bienes</option>
                  <option value="611">611: Ingresos por Dividendos - Socios y accionistas</option>
                  <option value="612">612: Personas Físicas con Actividades Empresariales y Profesionales</option>
                  <option value="616">616: Sin obligaciones fiscales</option>
                  <option value="620">620: Sociedades Cooperativas de Producción que optan por diferir sus ingreso</option>
                  <option value="621">621: Incorporación Fiscal</option>
                  <option value="622">622: Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras</option>
                  <option value="626">626: Régimen Simplificado de Confianza</option>
                </select>
              </div>
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

// import { useEffect, useMemo, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import axios from "axios";
// import { faHouse, faCartShopping, faBan, faTrash } from "@fortawesome/free-solid-svg-icons";
// import { faCheckToSlot } from "@fortawesome/free-solid-svg-icons"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import { API } from "/src/lib/api";

// const ALLOWED_ADMIN_EMAILS = new Set([
//   "ventas@greenimportsol.com",
//   "info@greenimportsol.com",
//   "majo_test@gmail.com",
// ]);

// export default function NewAdminOrder() {
//   const navigate = useNavigate();

//   const goToAdminHome = () => navigate("/adminHome");
//   const goToNewOrders = () => navigate("/newOrders");
//   const goToPackageReady = () => navigate("/deliverReady");
//   const goHomeLogo = () => navigate("/adminHome");

//   // ===== Gatekeeping for Alex/Majo only
//   const [me, setMe] = useState(null);
//   useEffect(() => {
//     const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     setMe(creds || null);
//   }, []);
//   const myEmail = (me?.correo || "").trim().toLowerCase();
//   const isAllowed = ALLOWED_ADMIN_EMAILS.has(myEmail);

//   // ====== Customer identity (required)
//   const [customerName, setCustomerName] = useState("");
//   const [customerEmail, setCustomerEmail] = useState("");
//   const [customerCompany, setCustomerCompany] = useState("");

//   // ====== Shipping & billing (per-order only, not saved to DB user records)
//   const [shipping, setShipping] = useState({
//     apodo: "",
//     calleEnvio: "",
//     exteriorEnvio: "",
//     interiorEnvio: "",
//     coloniaEnvio: "",
//     ciudadEnvio: "",
//     estadoEnvio: "",
//     cpEnvio: "",
//   });

//   const [wantsInvoice, setWantsInvoice] = useState(false);
//   const [billing, setBilling] = useState({
//     razonSocial: "",
//     rfcEmpresa: "",
//     correoFiscal: "",
//     calleFiscal: "",
//     exteriorFiscal: "",
//     interiorFiscal: "",
//     coloniaFiscal: "",
//     ciudadFiscal: "",
//     estadoFiscal: "",
//     cpFiscal: "",
//   });

//   // ====== Product selection (reuse user-side logic, minus per-client special pricing)
//   const [csvProducts, setCsvProducts] = useState([]);
//   const [selectedProduct, setSelectedProduct] = useState("");
//   const [presentation, setPresentation] = useState("");
//   const presentationOptions = useMemo(
//     () =>
//       csvProducts
//         .filter((r) => r.NOMBRE_PRODUCTO === selectedProduct)
//         .map((r) => (r.PESO_PRODUCTO || "") + (r.UNIDAD_MEDICION || "")),
//     [csvProducts, selectedProduct]
//   );

//   const [packPresentation, setPackPresentation] = useState("");
//   const [priceCurrency, setPriceCurrency] = useState(""); // USD|MXN
//   const [price, setPrice] = useState("");                 // numeric string
//   const [stock, setStock] = useState("");                 // numeric string
//   const [stockReady, setStockReady] = useState(false);
//   const [amount, setAmount] = useState("");
//   const [items, setItems] = useState([]);

//   // DOF rate
//   const [dofRate, setDofRate] = useState(null);
//   const [dofDate, setDofDate] = useState(null);
//   const [fxError, setFxError] = useState(null);

//   // Preferred currency for summary
//   const [preferredCurrency, setPreferredCurrency] = useState("USD");

//   // Utils
//   const normalize = (s) =>
//     (s ?? "")
//       .toString()
//       .normalize("NFD")
//       .replace(/[\u0300-\u036f]/g, "")
//       .trim();
//   const n = (v) => {
//     if (v === null || v === undefined) return null;
//     const s = String(v).trim().replace(/\s+/g, "");
//     if (!s) return null;
//     const cleaned = s.replace(/(?<=\d)[,\s](?=\d{3}\b)/g, "").replace(/,/g, ".");
//     const x = Number(cleaned);
//     return Number.isFinite(x) ? x : null;
//   };
//   const asQty = (v) => {
//     const num = n(v);
//     if (!Number.isFinite(num)) return 0;
//     return Math.max(0, Math.floor(num));
//   };

//   // CSV URLs (same used on user side)
//   const PRODUCTS_CSV_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";
//   const INVENTORY_LATEST_CSV_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3w6YJjBrIDz56fkcJmjeBNlsfI55v9ilSXOzmnJBLi4h97ePj433ibiqXIRQ1KHOae-mYb21zydwS/pub?gid=0&single=true&output=csv";

//   // Stock by product (sum)
//   const [stockByKey, setStockByKey] = useState({});

//   useEffect(() => {
//     // products
//     axios
//       .get(PRODUCTS_CSV_URL)
//       .then((res) => {
//         const rows = parseCSV(res.data);
//         setCsvProducts(rows);
//       })
//       .catch((err) => console.error("Error fetching products CSV:", err));

//     // inventory latest
//     axios
//       .get(INVENTORY_LATEST_CSV_URL)
//       .then((res) => {
//         const rows = parseCSV(res.data);
//         const by = {};
//         rows.forEach((r) => {
//           const prod = normalize(r.NOMBRE_PRODUCTO || "").toLowerCase();
//           const ex = n(r.EXISTENCIA ?? r.EXISTENCIAS ?? r.STOCK ?? "0");
//           if (!prod || !Number.isFinite(ex)) return;
//           by[prod] = (by[prod] || 0) + ex;
//         });
//         setStockByKey(by);
//       })
//       .catch((err) => console.error("Error fetching inventory CSV:", err));
//   }, []);

//   useEffect(() => {
//     const getDofRate = async () => {
//       try {
//         const res = await fetch(`${API}/fx/usd-dof`);
//         const data = await res.json();
//         if (!res.ok) throw new Error(data?.error || "Error al obtener tipo de cambio DOF");
//         setDofRate(Number(data.rate));
//         setDofDate(data.date);
//         setFxError(null);
//       } catch (err) {
//         console.error("DOF fetch error:", err);
//         setFxError("No se pudo obtener el tipo de cambio DOF.");
//       }
//     };
//     getDofRate();
//   }, []);

//   function parseCSV(csvText) {
//     const rows = String(csvText || "").split(/\r\n/).filter(Boolean);
//     if (rows.length === 0) return [];
//     const headers = rows[0].split(",").map((h) => h.trim());
//     return rows.slice(1).map((line) => {
//       const cols = line.split(",");
//       const obj = {};
//       headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
//       return obj;
//     });
//   }

//   // Resolve presentation stock and price (general price only; no per-client special price)
//   useEffect(() => {
//     setStockReady(false);
//     const row = csvProducts.find(
//       (r) =>
//         r.NOMBRE_PRODUCTO === selectedProduct &&
//         (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
//     );

//     if (!row) {
//       setPackPresentation("");
//       setPrice("");
//       setPriceCurrency("");
//       setStock("");
//       setStockReady(false);
//       return;
//     }

//     setPackPresentation(row.PRESENTACION_EMPAQUE || "");

//     // price fallback (prefer USD from products sheet, else MXN)
//     const usd = n(row.PRECIO_PIEZA_DOLARES);
//     const mxn = n(row.PRECIO_PIEZA_MXN);
//     if (Number.isFinite(usd) && usd > 0) {
//       setPrice(String(usd));
//       setPriceCurrency("USD");
//     } else if (Number.isFinite(mxn) && mxn > 0) {
//       setPrice(String(mxn));
//       setPriceCurrency("MXN");
//     } else {
//       setPrice("");
//       setPriceCurrency("");
//     }

//     // stock by product name only (latest)
//     const key = normalize(selectedProduct).toLowerCase();
//     const latest = stockByKey[key];
//     const fallback = n(row.CANTIDAD_EXISTENCIA) ?? 0;
//     setStock(
//       Number.isFinite(latest) ? String(latest) : String(fallback)
//     );

//     setTimeout(() => setStockReady(true), 0);
//   }, [selectedProduct, presentation, csvProducts, stockByKey]);

//   const qty = asQty(amount);
//   const stockNum = n(stock);
//   const hasFiniteStock = Number.isFinite(stockNum);
//   const outOfStock = hasFiniteStock && qty > 0 && qty > stockNum;

//   const handleAddItem = () => {
//     const row = csvProducts.find(
//       (r) =>
//         r.NOMBRE_PRODUCTO === selectedProduct &&
//         (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
//     );
//     if (!row) return;

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
//         weight: Number(row.PESO_PRODUCTO || 0),
//       },
//     ]);

//     setSelectedProduct("");
//     setPresentation("");
//     setPackPresentation("");
//     setAmount("");
//     setPrice("");
//     setPriceCurrency("");
//     setStock("");
//     setStockReady(false);
//   };

//   const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

//   // Totals
//   const normalizeCur = (val) => (String(val || "").trim().toUpperCase() === "MXN" ? "MXN" : "USD");
//   const usdItems = items.filter((it) => normalizeCur(it.currency) === "USD");
//   const mxnItems = items.filter((it) => normalizeCur(it.currency) === "MXN");

//   const totalUSD = usdItems.reduce((s, it) => s + it.amount * it.price, 0);
//   const totalMXN = mxnItems.reduce((s, it) => s + it.amount * it.price, 0);

//   const allUSD = dofRate ? totalUSD + totalMXN / Number(dofRate) : null;
//   const allMXN = dofRate ? totalMXN + totalUSD * Number(dofRate) : null;

//   const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//   const fmtMXN = (v) =>
//     `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

//   // ===== Submit: create order directly (no navigation into user-side flow)
//   const handleCreateOrder = async () => {
//     if (!isAllowed) {
//       alert("No autorizado.");
//       return;
//     }
//     if (!customerName.trim() || !customerEmail.trim()) {
//       alert("Cliente: nombre y correo son obligatorios.");
//       return;
//     }
//     if (items.length === 0) {
//       alert("Agrega al menos un producto al pedido.");
//       return;
//     }

//     const totals = {
//       totalUSDNative: Number(totalUSD.toFixed(2)),
//       totalMXNNative: Number(totalMXN.toFixed(2)),
//       totalAllUSD: allUSD != null ? Number(allUSD.toFixed(2)) : null,
//       totalAllMXN: allMXN != null ? Number(allMXN.toFixed(2)) : null,
//       dofRate: Number.isFinite(dofRate) ? Number(dofRate) : null,
//       dofDate,
//       discountUSD: 0, // admin-side doesn't apply discount here (can be edited later if needed)
//     };

//     const orderInfo = {
//       userEmail: customerEmail.trim(),          // IMPORTANT: tag the real customer here
//       userName: customerName.trim(),
//       userCompany: customerCompany.trim(),
//       items,
//       requestBill: !!wantsInvoice,
//       shippingInfo: { ...shipping },
//       billingInfo: wantsInvoice ? { ...billing } : {},
//       shippingPreferences: { preferredCarrier: "", insureShipment: false },
//       orderDate: new Date().toISOString(),
//       orderStatus: "Pedido Realizado",
//       totals,
//       placedByAdmin: {
//         adminEmail: myEmail,
//         at: new Date().toISOString(),
//       },
//       preferredCurrency, // for downstream UI
//     };

//     try {
//       const form = new FormData();
//       form.append("order", JSON.stringify(orderInfo));

//       // 1) Save order
//       let createdOrderId = null;
//       try {
//         const ac = new AbortController();
//         const timer = setTimeout(() => ac.abort("timeout"), 20000);
//         const res = await fetch(`${API}/orderDets`, {
//           method: "POST",
//           body: form,
//           mode: "cors",
//           cache: "no-store",
//           credentials: "omit",
//           signal: ac.signal,
//         });
//         clearTimeout(timer);
//         if (!res.ok) {
//           const text = await res.text().catch(() => "");
//           throw new Error(text || `HTTP ${res.status}`);
//         }
//         const data = await res.json().catch(() => ({}));
//         createdOrderId =
//           data?.id || data?.data?._id || data?._id || data?.order?._id || null;
//       } catch (fetchErr) {
//         const { data } = await axios.post(`${API}/orderDets`, form, {
//           withCredentials: false,
//           timeout: 20000,
//         });
//         createdOrderId =
//           data?.id || data?.data?._id || data?._id || data?.order?._id || null;
//       }

//       // 2) Reserve inventory (optional best-effort)
//       try {
//         const holdLines = items.map((it) => {
//           const m = String(it.presentation || "").trim().toUpperCase().replace(/\s+/g, "").match(/^(\d+(?:[.,]\d+)?)([A-Z]+)$/);
//           const peso = m ? m[1].replace(",", ".") : it.presentation;
//           const unidad = m ? m[2] : "";
//           return { product: it.product, peso, unidad, quantity: Number(it.amount) || 0 };
//         });

//         if (createdOrderId && holdLines.length > 0) {
//           await axios.post(
//             `${API}/inventory/hold`,
//             { orderId: createdOrderId, holdMinutes: 120, lines: holdLines },
//             { withCredentials: false, timeout: 15000 }
//           );
//         }
//       } catch (holdErr) {
//         console.error("Error reservando inventario:", holdErr);
//       }

//       alert("Orden creada exitosamente en nombre del cliente.");
//       navigate("/newOrders");
//     } catch (error) {
//       console.error("Error al crear la orden:", error);
//       alert("No se pudo crear la orden. Intenta nuevamente.");
//     }
//   };

//   if (!isAllowed) {
//     return (
//       <body className="body-BG-Gradient">
//         <div className="loginLogo-ParentDiv">
//           <img
//             className="secondaryPages-GISLogo"
//             src={Logo}
//             alt="Home Icon"
//             width="180"
//             height="55"
//             onClick={() => navigate("/adminHome")}
//           />
//         </div>

//         <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
//           <div className="orderNow-AddressDiv" style={{ maxWidth: 480, textAlign: "center" }}>
//             <FontAwesomeIcon icon={faBan} style={{ fontSize: 28, marginBottom: 12 }} />
//             <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Acceso restringido</div>
//             <div style={{ fontSize: 14 }}>
//               Esta sección solo está disponible para ventas@greenimportsol.com, info@greenimportsol.com y majo_test@gmail.com.
//             </div>
//           </div>

//           <button className="submitOrder-Btn" style={{ marginTop: 16 }} onClick={() => navigate("/adminHome")}>
//             Regresar
//           </button>
//         </div>
//       </body>
//     );
//   }

//   return (
//     <body className="app-shell body-BG-Gradient">
//       {/* Header */}
//       <div className="app-header loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src={Logo}
//           alt="Home Icon"
//           width="180"
//           height="55"
//           onClick={() => navigate("/adminHome")}
//         />
//       </div>

//       <div className="app-main">
//         <label className="sectionHeader-Label">Crea Una Nueva Orden</label>

//         {/* ===== Customer identity ===== */}
//         <div className="quoterBody-Div">
//           <label className="newUserData-Label">Datos del cliente</label>

//           <input
//             className="productInfo-Input"
//             type="text"
//             placeholder="Nombre del cliente"
//             value={customerName}
//             onChange={(e) => setCustomerName(e.target.value)}
//           />

//           <input
//             className="productInfo-Input"
//             type="email"
//             placeholder="Correo del cliente"
//             value={customerEmail}
//             onChange={(e) => setCustomerEmail(e.target.value)}
//           />

//           <input
//             className="productInfo-Input"
//             type="text"
//             placeholder="Empresa (opcional)"
//             value={customerCompany}
//             onChange={(e) => setCustomerCompany(e.target.value)}
//           />

//           {/* ===== Shipping address ===== */}
//           <label className="newUserData-Label" style={{ marginTop: 10 }}>Dirección de Envío</label>
//           {/* <input className="productInfo-Input" placeholder="Apodo (opcional)" value={shipping.apodo} onChange={(e)=>setShipping(s=>({...s,apodo:e.target.value}))}/> */}
//           <input className="productInfo-Input" placeholder="Calle" value={shipping.calleEnvio} onChange={(e)=>setShipping(s=>({...s,calleEnvio:e.target.value}))}/>
//           <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "82%", marginLeft: "9%" }}>
//             <input className="productInfo-Input" placeholder="# Ext." value={shipping.exteriorEnvio} onChange={(e)=>setShipping(s=>({...s,exteriorEnvio:e.target.value}))}/>
//             <input className="productInfo-Input" placeholder="# Int." value={shipping.interiorEnvio} onChange={(e)=>setShipping(s=>({...s,interiorEnvio:e.target.value}))}/>
//           </div>
//           <input className="productInfo-Input" placeholder="Colonia" value={shipping.coloniaEnvio} onChange={(e)=>setShipping(s=>({...s,coloniaEnvio:e.target.value}))}/>
//           {/* <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}> */}
//             <input className="productInfo-Input" placeholder="Ciudad" value={shipping.ciudadEnvio} onChange={(e)=>setShipping(s=>({...s,ciudadEnvio:e.target.value}))}/>
//             <input className="productInfo-Input" placeholder="Estado" value={shipping.estadoEnvio} onChange={(e)=>setShipping(s=>({...s,estadoEnvio:e.target.value}))}/>
//             <input className="productInfo-Input" placeholder="C.P." value={shipping.cpEnvio} onChange={(e)=>setShipping(s=>({...s,cpEnvio:e.target.value}))}/>
//           {/* </div> */}

//           {/* ===== Billing ===== */}
//           <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
//             <span className="newUserData-Label" style={{ marginLeft: "15%" }}>¿Desea factura?</span>
//             {/* <span className="newUserData-Label" style={{ margin: 0 }}>¿Desea factura?</span> */}
//             <select
//               className="productInfo-Input"
//               style={{ maxWidth: 100, marginRight: "15%" }}
//               value={String(wantsInvoice)}
//               onChange={(e) => setWantsInvoice(e.target.value === "true")}
//             >
//               <option value="false">No</option>
//               <option value="true">Sí</option>
//             </select>
//           </div>

//           {wantsInvoice && (
//             <>
//               <input className="productInfo-Input" placeholder="Razón Social" value={billing.razonSocial} onChange={(e)=>setBilling(b=>({...b,razonSocial:e.target.value}))}/>
//               <input className="productInfo-Input" placeholder="RFC" value={billing.rfcEmpresa} onChange={(e)=>setBilling(b=>({...b,rfcEmpresa:e.target.value}))}/>
//               <input className="productInfo-Input" placeholder="Correo fiscal" value={billing.correoFiscal} onChange={(e)=>setBilling(b=>({...b,correoFiscal:e.target.value}))}/>
//               <input className="productInfo-Input" placeholder="Calle fiscal" value={billing.calleFiscal} onChange={(e)=>setBilling(b=>({...b,calleFiscal:e.target.value}))}/>
//               <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, width: "82%", marginLeft: "9%" }}>
//                 <input className="productInfo-Input" placeholder="# Ext." value={billing.exteriorFiscal} onChange={(e)=>setBilling(b=>({...b,exteriorFiscal:e.target.value}))}/>
//                 <input className="productInfo-Input" placeholder="# Int." value={billing.interiorFiscal} onChange={(e)=>setBilling(b=>({...b,interiorFiscal:e.target.value}))}/>
//               </div>
//               <input className="productInfo-Input" placeholder="Colonia fiscal" value={billing.coloniaFiscal} onChange={(e)=>setBilling(b=>({...b,coloniaFiscal:e.target.value}))}/>
//               {/* <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}> */}
//                 <input className="productInfo-Input" placeholder="Ciudad fiscal" value={billing.ciudadFiscal} onChange={(e)=>setBilling(b=>({...b,ciudadFiscal:e.target.value}))}/>
//                 <input className="productInfo-Input" placeholder="Estado fiscal" value={billing.estadoFiscal} onChange={(e)=>setBilling(b=>(({...b}),{estadoFiscal:e.target.value}))}/>
//                 <input className="productInfo-Input" placeholder="C.P. fiscal" value={billing.cpFiscal} onChange={(e)=>setBilling(b=>({...b,cpFiscal:e.target.value}))}/>
//               {/* </div> */}
//             </>
//           )}

//           {/* ===== Product picker ===== */}
//           <label className="newUserData-Label" style={{ marginTop: 12 }}>Productos</label>

//           <select
//             className="productInfo-Input"
//             value={selectedProduct}
//             onChange={(e) => {
//               setSelectedProduct(e.target.value);
//               setPresentation("");
//               setAmount("");
//               setPrice("");
//               setPriceCurrency("");
//               setStock("");
//               setStockReady(false);
//             }}
//           >
//             <option value="">Selecciona producto</option>
//             {[...new Set(csvProducts.map((i) => i.NOMBRE_PRODUCTO))].map((p, idx) => (
//               <option key={idx} value={p}>{p}</option>
//             ))}
//           </select>

//           <select
//             className="productInfo-Input"
//             value={presentation}
//             onChange={(e) => {
//               setPresentation(e.target.value);
//               setAmount("");
//               setStock("");
//               setStockReady(false);
//             }}
//           >
//             <option value="">Selecciona presentación</option>
//             {[...new Set(presentationOptions)].map((pres, idx) => (
//               <option key={idx} value={pres}>{pres}</option>
//             ))}
//           </select>

//           <input
//             className="productInfo-Input"
//             placeholder="Presentación empaque"
//             value={packPresentation}
//             readOnly
//           />

//           <input
//             className="productInfo-Input"
//             placeholder={`Precio ${priceCurrency ? `(${priceCurrency})` : ""}`}
//             value={price ? `${price} ${priceCurrency}` : ""}
//             readOnly
//           />

//           <input
//             className="productInfo-Input"
//             type="number"
//             inputMode="numeric"
//             min="0"
//             step="1"
//             placeholder="Cantidad"
//             value={amount}
//             onChange={(e) => {
//               const q = asQty(e.target.value);
//               setAmount(q === 0 && e.target.value === "" ? "" : String(q));
//             }}
//           />

//           {stockReady && hasFiniteStock && qty > 0 && outOfStock && (
//             <label className="stockAvailability-Label">
//               Lo sentimos, no hay suficiente inventario para esta cantidad.
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
//           >
//             +
//           </button>

//           {/* Cart */}
//           <label className="newUserData-Label">Resumen del pedido</label>
//           <div className="quoter-wishlistDiv">
//             <ul className="wishlist-ulElement">
//               {items.map((it, i) => (
//                 <div key={i} className="wishlist-liElement">
//                   {it.amount} x {it.product} ({it.presentation})
//                   {it.packPresentation ? ` — ${it.packPresentation}` : ""} — ${it.price} {it.currency} c/u
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

//           {/* Preferred currency toggle */}
//           <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "6px 0 10px 55px" }}>
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
//                 disabled={!dofRate}
//               />
//               MXN
//             </label>
//           </div>

//           {/* Financial summary */}
//           {(() => {
//             const hasUSD = totalUSD > 0;
//             const hasMXN = totalMXN > 0;
//             const mixed = hasUSD && hasMXN;
//             const fx = Number.isFinite(dofRate) ? Number(dofRate) : null;

//             if (!mixed) {
//               if (hasUSD) {
//                 return (
//                   <div className="quoter-summaryDiv">
//                     <label className="summary-Label">
//                       <b>Subtotal en USD:</b> {fmtUSD(totalUSD)}
//                     </label>
//                     {preferredCurrency === "USD" ? (
//                       <label className="summaryTotal-Label">
//                         <b>Total a pagar en USD:</b> {fmtUSD(totalUSD)}
//                       </label>
//                     ) : (
//                       <>
//                         <label className="summary-Label">
//                           <b>Tipo de cambio:</b> {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando…")}
//                         </label>
//                         <label className="summaryTotal-Label">
//                           <b>Total a pagar en MXN:</b> {fx ? fmtMXN(totalUSD * fx) : "—"}
//                         </label>
//                       </>
//                     )}
//                   </div>
//                 );
//               }
//               if (hasMXN) {
//                 return (
//                   <div className="quoter-summaryDiv">
//                     <label className="summary-Label">
//                       <b>Subtotal en MXN:</b> {fmtMXN(totalMXN)}
//                     </label>
//                     <label className="summaryTotal-Label">
//                       <b>Total a pagar en MXN:</b> {fmtMXN(totalMXN)}
//                     </label>
//                   </div>
//                 );
//               }
//               return null;
//             }

//             // Mixed
//             if (preferredCurrency === "USD") {
//               return (
//                 <div className="quoter-summaryDiv">
//                   <label className="summary-Label">
//                     <b>Subtotal USD:</b> {fmtUSD(totalUSD)}
//                   </label>
//                   <label className="summary-Label">
//                     <b>Subtotal MXN:</b> {fmtMXN(totalMXN)}
//                   </label>
//                   <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
//                     En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.
//                   </div>
//                 </div>
//               );
//             }
//             return (
//               <div className="quoter-summaryDiv">
//                 <label className="summary-Label">
//                   <b>Subtotal USD:</b> {fmtUSD(totalUSD)}
//                 </label>
//                 <label className="summary-Label">
//                   <b>Subtotal MXN:</b> {fmtMXN(totalMXN)}
//                 </label>
//                 <label className="summary-Label">
//                   <b>Tipo de cambio:</b> {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando…")}
//                 </label>
//                 <label className="summaryTotal-Label">
//                   <b>Total combinado (MXN):</b> {fx ? fmtMXN(totalUSD * fx + totalMXN) : "—"}
//                 </label>
//               </div>
//             );
//           })()}

//           {/* Actions */}
//           <div className="newOrderActionButtons-Div" style={{ marginTop: 10 }}>
//             <button className="submitOrder-Btn" type="button" onClick={handleCreateOrder}>
//               Crear Orden
//             </button>
//           </div>
//         </div>
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

//           <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
//             <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
//             <label className="footerIcon-Name">ENTREGAR</label>
//           </div>
//         </div>
//       </div>
//     </body>
//   );
// }
