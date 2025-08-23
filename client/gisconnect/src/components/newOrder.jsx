// client/gisconnect/src/pages/NewOrder.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { faHouse, faUser, faCartShopping, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { API } from "/src/lib/api";

export default function NewOrder() {
  const navigate = useNavigate();

  const [selectedProduct, setSelectedProduct] = useState("");
  const [presentation, setPresentation] = useState("");
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState([]);

  const [price, setPrice] = useState("");                 // numeric string
  const [priceCurrency, setPriceCurrency] = useState("USD"); // "USD" | "MXN"
  const [weight, setWeight] = useState("");
  const [stock, setStock] = useState("");
  const [specialApplied, setSpecialApplied] = useState(false);
  const [packPresentation, setPackPresentation] = useState(""); // PRESENTACION_EMPAQUE

  const [csvData, setCsvData] = useState([]);             // Products (JSON from /cache/products)
  const [csvClientData, setCsvClientData] = useState([]); // Client DB (for name/email → client column)
  const [specialPrices, setSpecialPrices] = useState([]);  // Special prices sheet

  // LATEST inventory map -> { "<product>__<peso><unidad>": EXISTENCIA }
  const [stockByKey, setStockByKey] = useState({});

  const [user, setUser] = useState(null);
  const [isActive, setIsActive] = useState(false);

  // DOF rate (MXN per USD)
  const [dofRate, setDofRate] = useState(null);
  const [dofDate, setDofDate] = useState(null);
  const [fxError, setFxError] = useState(null);

  // Fetch DOF rate once (from backend)
  useEffect(() => {
    const getDofRate = async () => {
      try {
        const res = await fetch(`${API}/fx/usd-dof`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Error al obtener tipo de cambio DOF");
        setDofRate(Number(data.rate)); // e.g. 18.23 (MXN per USD)
        setDofDate(data.date);
        setFxError(null);
      } catch (err) {
        console.error("DOF fetch error:", err);
        setFxError("No se pudo obtener el tipo de cambio DOF.");
      }
    };
    getDofRate();
  }, []);

  // Logged-in user (expects localStorage.userLoginCreds with { correo })
  useEffect(() => {
    const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    setUser(creds);
  }, []);

  // ===== NEW: fetch CSVs via backend cache =====
  useEffect(() => {
    // Products
    axios
      .get(`${API}/cache/products`)
      .then((res) => setCsvData(res.data || []))
      .catch((err) => console.error("CSV products error:", err));

    // Clients
    axios
      .get(`${API}/cache/clients`)
      .then((res) => setCsvClientData(res.data || []))
      .catch((err) => console.error("CSV clients error:", err));

    // Special prices
    axios
      .get(`${API}/cache/special-prices`)
      .then((res) => setSpecialPrices(res.data || []))
      .catch((err) => console.error("CSV specials error:", err));

    // LATEST inventory
    axios
      .get(`${API}/cache/inventory-latest`)
      .then((res) => {
        const rows = res.data || [];
        // Expect headers: NOMBRE_PRODUCTO, PESO_PRODUCTO, UNIDAD_MEDICION, EXISTENCIA
        const map = {};
        rows.forEach((r) => {
          const prod = (r.NOMBRE_PRODUCTO || "").trim();
          const pres = (r.PESO_PRODUCTO || "") + (r.UNIDAD_MEDICION || "");
          const key = (prod + "__" + pres).toLowerCase().trim();
          const ex = parseFloat((r.EXISTENCIA || "0").toString().replace(/,/g, ""));
          if (prod && pres && Number.isFinite(ex)) {
            map[key] = ex;
          }
        });
        setStockByKey(map);
      })
      .catch((err) => console.error("LATEST inventory error:", err));
  }, []);

  // Utils
  const normalize = (s) => (s ?? "").toString().trim().toLowerCase();
  function toClientHeader(name) {
    if (!name) return "";
    const noAccents = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return noAccents.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  function getClientColumnName(user, clientRows) {
    if (!user?.correo || clientRows.length === 0) return "";
    const hit = clientRows.find(
      (r) => normalize(r.CORREO_EMPRESA) === normalize(user.correo)
    );
    return toClientHeader(hit?.NOMBRE_APELLIDO);
  }
  const n = (v) => {
    const x = parseFloat((v ?? "").toString().replace(/,/g, ""));
    return Number.isFinite(x) ? x : null;
  };

  // Resolve product data & price whenever selection changes
  useEffect(() => {
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
      setPriceCurrency("USD");
      return;
    }

    // Common attributes
    setWeight(baseRow.PESO_PRODUCTO || "");
    setPackPresentation(baseRow.PRESENTACION_EMPAQUE || "");

    // STOCK SOURCE: LATEST CSV (fallback to products CSV if missing)
    const key = (selectedProduct + "__" + presentation).toLowerCase().trim();
    const latestStock = stockByKey[key];
    const fallbackStock = baseRow.CANTIDAD_EXISTENCIA
      ? parseInt(baseRow.CANTIDAD_EXISTENCIA, 10)
      : 0;
    setStock(Number.isFinite(latestStock) ? String(latestStock) : String(fallbackStock));

    const clientCol = getClientColumnName(user, csvClientData);

    // Match in special sheet by product + presentation
    const spRow = specialPrices.find(
      (row) =>
        normalize(row.NOMBRE_PRODUCTO) === normalize(selectedProduct) &&
        normalize(row.PESO_PRODUCTO) === normalize(baseRow.PESO_PRODUCTO) &&
        normalize(row.UNIDAD_MEDICION) === normalize(baseRow.UNIDAD_MEDICION)
    );

    // Decide price WITHOUT converting MXN→USD
    let resolvedPrice = null;
    let resolvedCurrency = "USD";
    let applied = false;

    // 1) Client-specific price (assume client-column is USD)
    if (spRow && clientCol) {
      const clientVal = n(spRow[clientCol]);
      if (clientVal && clientVal > 0) {
        resolvedPrice = clientVal;
        resolvedCurrency = "USD";
        applied = true;
      }
    }

    // 2) Fallback to general USD on special sheet, then products sheet
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

    // 3) If still nothing in USD, try MXN columns (special first, then products) — DO NOT CONVERT
    if (resolvedPrice === null) {
      const mxnVal = n(spRow?.PRECIO_PIEZA_MXN) ?? n(baseRow.PRECIO_PIEZA_MXN);
      if (mxnVal && mxnVal > 0) {
        resolvedPrice = mxnVal;
        resolvedCurrency = "MXN";
      }
    }

    // Apply
    if (resolvedPrice === null) {
      setPrice("");
      setPriceCurrency("USD");
      setSpecialApplied(false);
      return;
    }

    setPrice(String(resolvedPrice));
    setPriceCurrency(resolvedCurrency);
    setSpecialApplied(applied);
  }, [selectedProduct, presentation, csvData, specialPrices, csvClientData, user, stockByKey]);

  // Presentation list for the chosen product
  const presentationOptions = csvData
    .filter((r) => r.NOMBRE_PRODUCTO === selectedProduct)
    .map((r) => (r.PESO_PRODUCTO || "") + (r.UNIDAD_MEDICION || ""));

  // Add item to wishlist (keep currency on each item)
  const handleAddItem = () => {
    const baseRow = csvData.find(
      (r) =>
        r.NOMBRE_PRODUCTO === selectedProduct &&
        (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
    );
    if (!baseRow) return;

    if (amount && parseInt(amount) <= parseInt(stock || "0") && price) {
      setItems((prev) => [
        ...prev,
        {
          product: selectedProduct,
          presentation,
          packPresentation,
          amount: Number(amount),
          price: Number(price),          // do not convert; keep numeric
          currency: priceCurrency,       // "USD" or "MXN"
          weight: Number(baseRow.PESO_PRODUCTO || 0),
        },
      ]);
      setSelectedProduct("");
      setPresentation("");
      setPackPresentation("");
      setAmount("");
      setPrice("");
      setPriceCurrency("USD");
      setWeight("");
      setStock("");
      setSpecialApplied(false);
    }
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ===== Totals =====
  const usdItems = items.filter((it) => (it.currency || "USD") === "USD");
  const mxnItems = items.filter((it) => (it.currency || "USD") === "MXN");

  const totalUSD = usdItems.reduce((sum, it) => sum + it.amount * it.price, 0); // native USD subtotal
  const totalMXN = mxnItems.reduce((sum, it) => sum + it.amount * it.price, 0); // native MXN subtotal

  // Cross-currency totals using DOF rate
  const allUSD = dofRate ? totalUSD + totalMXN / dofRate : null; // MXN → USD
  const allMXN = dofRate ? totalMXN + totalUSD * dofRate : null; // USD → MXN

  // IVA (apply only to the all-products totals to keep UI tidy)
  const ivaAllUSD = isActive && allUSD != null ? +(allUSD * 0.16).toFixed(2) : null;
  const ivaAllMXN = isActive && allMXN != null ? +(allMXN * 0.16).toFixed(2) : null;

  const allUSDWithIVA = ivaAllUSD != null ? +(allUSD + ivaAllUSD).toFixed(2) : null;
  const allMXNWithIVA = ivaAllMXN != null ? +(allMXN + ivaAllMXN).toFixed(2) : null;

  // Formatting helpers
  const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
  const fmtMXN = (v) => `$${(v ?? 0).toFixed(2)} MXN`;
  
  const submitOrder = () => {
    // pass items with currency to OrderNow
    localStorage.setItem("discountTotal", "0");
    localStorage.setItem("billRequest", JSON.stringify(isActive));
    navigate("/orderNow", { state: { items } });
  };

  return (
    <body className="body-BG-Gradient">
      <div className="loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src="./src/assets/images/GIS_Logo.png"
          alt="Home Icon"
          width="180"
          height="55"
          onClick={() => navigate("/userHome")}
        />
      </div>

      <label className="sectionHeader-Label">¡Comienza tu Orden!</label>

      <div className="quoterBody-Div">
        <div>
          <label className="newUserData-Label">Encuentra tu producto</label>
          <select
            className="productInfo-Input"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
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
            onChange={(e) => setPresentation(e.target.value)}
          >
            <option value="">Selecciona presentación</option>
            {[...new Set(presentationOptions)].map((pres, idx) => (
              <option key={idx} value={pres}>
                {pres}
              </option>
            ))}
          </select>
        </div>

        {/* Package Presentation (auto from PRESENTACION_EMPAQUE) */}
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
          {specialApplied && (
            <div style={{ fontSize: 12, color: "#26a269", marginTop: 4 }}>
              Precio especial aplicado para tu cuenta
            </div>
          )}
          {!price && presentation && (
            <div style={{ fontSize: 12, color: "#b00", marginTop: 4 }}>
              No hay precio disponible.
            </div>
          )}
        </div>

        <div>
          <label className="newUserData-Label">Cantidad deseada</label>
          <input
            className="productInfo-Input"
            type="number"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ingrese cantidad deseada"
            value={amount}
          />
        </div>

        {amount > stock && (
          <label className="stockAvailability-Label">
            Por el momento no contamos con suficiente stock.
            <br />
            Unidades disponibles: {stock || 0}
          </label>
        )}

        <button
          className="quoter-AddMoreButton"
          onClick={handleAddItem}
          disabled={!amount || parseInt(amount) > parseInt(stock || "0") || !price}
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

        {/* ===== NEW SUMMARY BOX WITH SPLIT + ALL-PRODUCT TOTALS ===== */}
        <label className="newUserData-Label">Resumen financiero</label>

        <div className="quoter-summaryDiv">
          {/* Split subtotals (no conversion) */}
          <label className="summary-Label">
            <b>Total USD (solo artículos en USD):</b> {fmtUSD(totalUSD)}
          </label>
          <label className="summary-Label">
            <b>Total MXN (solo artículos en MXN):</b> {fmtMXN(totalMXN)}
          </label>

          <label className="summaryTotal-Label">
            <b>Total USD:</b>{" "}
            {fxError
              ? "—"
              : (allUSDWithIVA != null
                  ? fmtUSD(allUSDWithIVA)
                  : (allUSD != null ? fmtUSD(allUSD) : "Cargando tipo de cambio..."))}
          </label>
          <label className="summaryTotal-Label">
            <b>Total MXN:</b>{" "}
            {fxError
              ? "—"
              : (allMXNWithIVA != null
                  ? fmtMXN(allMXNWithIVA)
                  : (allMXN != null ? fmtMXN(allMXN) : "Cargando tipo de cambio..."))}
          </label>

          {/* Little note about rate */}
          <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
            {fxError
              ? fxError
              : dofRate
              ? `Tipo de cambio DOF ${dofDate}: $${dofRate.toFixed(2)} MXN/USD`
              : "Cargando tipo de cambio DOF..."}
          </div>
        </div>

        <div className="newOrderActionButtons-Div">
          <button className="submitOrder-Btn" type="button" onClick={submitOrder}>
            Hacer Pedido
          </button>
        </div>
      </div>

      <div className="footerMenuDiv">
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

// // USER SIDE!
// // Ok, so I'm in step 3.2 "Patch newOrder.jsx". Can you make a direct edit on my code so I can copy-past it and avoid mistakes please?
// import { useState, useEffect } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import axios from "axios";
// import { faHouse, faUser, faCartShopping, faTrash } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";


// export default function NewOrder() {
//   const navigate = useNavigate();

//   const [selectedProduct, setSelectedProduct] = useState("");
//   const [presentation, setPresentation] = useState("");
//   const [amount, setAmount] = useState("");
//   const [items, setItems] = useState([]);

//   const [price, setPrice] = useState("");                 // numeric string
//   const [priceCurrency, setPriceCurrency] = useState("USD"); // "USD" | "MXN"
//   const [weight, setWeight] = useState("");
//   const [stock, setStock] = useState("");
//   const [specialApplied, setSpecialApplied] = useState(false);
//   const [packPresentation, setPackPresentation] = useState(""); // PRESENTACION_EMPAQUE

//   const [csvData, setCsvData] = useState([]);             // Products
//   const [csvClientData, setCsvClientData] = useState([]); // Client DB (for name/email → client column)
//   const [specialPrices, setSpecialPrices] = useState([]);  // Special prices sheet

//   // NEW (Option A): LATEST inventory map -> { "<product>__<peso><unidad>": EXISTENCIA }
//   const [stockByKey, setStockByKey] = useState({});

//   const [user, setUser] = useState(null);
//   const [isActive, setIsActive] = useState(false);

//   // DOF rate (MXN per USD)
//   const [dofRate, setDofRate] = useState(null);
//   const [dofDate, setDofDate] = useState(null);
//   const [fxError, setFxError] = useState(null);

//   // Fetch DOF rate once
//   useEffect(() => {
//     const getDofRate = async () => {
//       try {
//         const res = await fetch("http://localhost:4000/fx/usd-dof");
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

//   // 🔗 NEW: LIVE "LATEST" inventory CSV (publish LATEST sheet as CSV and paste that link here)
//   const INVENTORY_LATEST_CSV_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3w6YJjBrIDz56fkcJmjeBNlsfI55v9ilSXOzmnJBLi4h97ePj433ibiqXIRQ1KHOae-mYb21zydwS/pub?gid=0&single=true&output=csv";
//     // "https://docs.google.com/spreadsheets/d/<YOUR_LIVE_SHEET_ID>/pub?gid=<LATEST_GID>&single=true&output=csv";

    
//   useEffect(() => {
//     fetchCSV(PRODUCTS_CSV_URL, setCsvData);
//     fetchCSV(CLIENT_DB_URL, setCsvClientData);
//     fetchCSV(SPECIAL_PRICES_URL, setSpecialPrices);

//     // fetch LATEST inventory
//     axios
//       .get(INVENTORY_LATEST_CSV_URL)
//       .then((res) => {
//         const rows = parseCSV(res.data);
//         // Expect headers: NOMBRE_PRODUCTO, PESO_PRODUCTO, UNIDAD_MEDICION, EXISTENCIA
//         const map = {};
//         rows.forEach((r) => {
//           const prod = (r.NOMBRE_PRODUCTO || "").trim();
//           const pres = (r.PESO_PRODUCTO || "") + (r.UNIDAD_MEDICION || "");
//           const key = (prod + "__" + pres).toLowerCase().trim();
//           const ex = parseFloat((r.EXISTENCIA || "0").toString().replace(/,/g, ""));
//           if (prod && pres && Number.isFinite(ex)) {
//             map[key] = ex;
//           }
//         });
//         setStockByKey(map);
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

//   // Utils
//   const normalize = (s) => (s ?? "").toString().trim().toLowerCase();
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
//   const n = (v) => {
//     const x = parseFloat((v ?? "").toString().replace(/,/g, ""));
//     return Number.isFinite(x) ? x : null;
//   };

//   // Resolve product data & price whenever selection changes
//   useEffect(() => {
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
//       setPriceCurrency("USD");
//       return;
//     }

//     // Common attributes
//     setWeight(baseRow.PESO_PRODUCTO || "");
//     setPackPresentation(baseRow.PRESENTACION_EMPAQUE || "");

//     // 🔁 STOCK SOURCE: LATEST CSV (fallback to products CSV if missing)
//     const key = (selectedProduct + "__" + presentation).toLowerCase().trim();
//     const latestStock = stockByKey[key];
//     const fallbackStock = baseRow.CANTIDAD_EXISTENCIA
//       ? parseInt(baseRow.CANTIDAD_EXISTENCIA, 10)
//       : 0;
//     setStock(Number.isFinite(latestStock) ? String(latestStock) : String(fallbackStock));

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

//     // Apply
//     if (resolvedPrice === null) {
//       setPrice("");
//       setPriceCurrency("USD");
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

//   // Add item to wishlist (keep currency on each item)
//   const handleAddItem = () => {
//     const baseRow = csvData.find(
//       (r) =>
//         r.NOMBRE_PRODUCTO === selectedProduct &&
//         (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
//     );
//     if (!baseRow) return;

//     if (amount && parseInt(amount) <= parseInt(stock || "0") && price) {
//       setItems((prev) => [
//         ...prev,
//         {
//           product: selectedProduct,
//           presentation,
//           packPresentation,
//           amount: Number(amount),
//           price: Number(price),          // do not convert; keep numeric
//           currency: priceCurrency,       // "USD" or "MXN"
//           weight: Number(baseRow.PESO_PRODUCTO || 0),
//         },
//       ]);
//       setSelectedProduct("");
//       setPresentation("");
//       setPackPresentation("");
//       setAmount("");
//       setPrice("");
//       setPriceCurrency("USD");
//       setWeight("");
//       setStock("");
//       setSpecialApplied(false);
//     }
//   };

//   const removeItem = (idx) => {
//     setItems((prev) => prev.filter((_, i) => i !== idx));
//   };

//   // ===== Totals =====
//   const usdItems = items.filter((it) => (it.currency || "USD") === "USD");
//   const mxnItems = items.filter((it) => (it.currency || "USD") === "MXN");

//   const totalUSD = usdItems.reduce((sum, it) => sum + it.amount * it.price, 0); // native USD subtotal
//   const totalMXN = mxnItems.reduce((sum, it) => sum + it.amount * it.price, 0); // native MXN subtotal

//   // Cross-currency totals using DOF rate
//   const allUSD = dofRate ? totalUSD + totalMXN / dofRate : null; // MXN → USD
//   const allMXN = dofRate ? totalMXN + totalUSD * dofRate : null; // USD → MXN

//   // IVA (apply only to the all-products totals to keep UI tidy)
//   const ivaAllUSD = isActive && allUSD != null ? +(allUSD * 0.16).toFixed(2) : null;
//   const ivaAllMXN = isActive && allMXN != null ? +(allMXN * 0.16).toFixed(2) : null;

//   const allUSDWithIVA = ivaAllUSD != null ? +(allUSD + ivaAllUSD).toFixed(2) : null;
//   const allMXNWithIVA = ivaAllMXN != null ? +(allMXN + ivaAllMXN).toFixed(2) : null;

//   // Formatting helpers
//   const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//   const fmtMXN = (v) => `$${(v ?? 0).toFixed(2)} MXN`;
  
//   const submitOrder = () => {
//     // pass items with currency to OrderNow
//     localStorage.setItem("discountTotal", "0");
//     localStorage.setItem("billRequest", JSON.stringify(isActive));
//     navigate("/orderNow", { state: { items } });
//   };

//   return (
//     <body className="body-BG-Gradient">
//       <div className="loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src="./src/assets/images/GIS_Logo.png"
//           alt="Home Icon"
//           width="180"
//           height="55"
//           onClick={() => navigate("/userHome")}
//         />
//       </div>

//       <label className="sectionHeader-Label">¡Comienza tu Orden!</label>

//       <div className="quoterBody-Div">
//         <div>
//           <label className="newUserData-Label">Encuentra tu producto</label>
//           <select
//             className="productInfo-Input"
//             value={selectedProduct}
//             onChange={(e) => setSelectedProduct(e.target.value)}
//           >
//             <option value="">Selecciona producto</option>
//             {[...new Set(csvData.map((i) => i.NOMBRE_PRODUCTO))].map((prod, idx) => (
//               <option key={idx} value={prod}>
//                 {prod}
//               </option>
//             ))}
//           </select>
//         </div>

//         <div>
//           <label className="newUserData-Label">Presentación</label>
//           <select
//             className="productInfo-Input"
//             value={presentation}
//             onChange={(e) => setPresentation(e.target.value)}
//           >
//             <option value="">Selecciona presentación</option>
//             {[...new Set(presentationOptions)].map((pres, idx) => (
//               <option key={idx} value={pres}>
//                 {pres}
//               </option>
//             ))}
//           </select>
//         </div>

//         {/* Package Presentation (auto from PRESENTACION_EMPAQUE) */}
//         <div>
//           <label className="newUserData-Label">Presentación Empaque</label>
//           <input
//             className="productInfo-Input"
//             type="text"
//             placeholder="Presentación empaque"
//             value={packPresentation}
//             readOnly
//           />
//         </div>

//         <div>
//           <label className="newUserData-Label">
//             Precio {priceCurrency ? `(${priceCurrency})` : ""}
//           </label>
//           <input
//             className="productInfo-Input"
//             type="text"
//             placeholder="Precio"
//             value={price ? `${price} ${priceCurrency}` : ""}
//             readOnly
//           />
//           {specialApplied && (
//             <div style={{ fontSize: 12, color: "#26a269", marginTop: 4 }}>
//               Precio especial aplicado para tu cuenta
//             </div>
//           )}
//           {!price && presentation && (
//             <div style={{ fontSize: 12, color: "#b00", marginTop: 4 }}>
//               No hay precio disponible.
//             </div>
//           )}
//         </div>

//         <div>
//           <label className="newUserData-Label">Cantidad deseada</label>
//           <input
//             className="productInfo-Input"
//             type="number"
//             onChange={(e) => setAmount(e.target.value)}
//             placeholder="Ingrese cantidad deseada"
//             value={amount}
//           />
//         </div>

//         {amount > stock && (
//           <label className="stockAvailability-Label">
//             Por el momento no contamos con suficiente stock.
//             <br />
//             Unidades disponibles: {stock || 0}
//           </label>
//         )}

//         <button
//           className="quoter-AddMoreButton"
//           onClick={handleAddItem}
//           disabled={!amount || parseInt(amount) > parseInt(stock || "0") || !price}
//         >
//           +
//         </button>

//         <label className="newUserData-Label">Resumen del pedido</label>
//         <div className="quoter-wishlistDiv">
//           <ul className="wishlist-ulElement">
//             {items.map((item, i) => (
//               <div key={i} className="wishlist-liElement">
//                 {item.amount} x {item.product} ({item.presentation})
//                 {item.packPresentation ? ` — ${item.packPresentation}` : ""} — ${item.price} {item.currency} c/u
//                 <FontAwesomeIcon
//                   className="expressQuote-TrashIt"
//                   onClick={() => removeItem(i)}
//                   icon={faTrash}
//                   style={{ marginLeft: 8, cursor: "pointer" }}
//                 />
//               </div>
//             ))}
//           </ul>
//         </div>

//         {/* ===== NEW SUMMARY BOX WITH SPLIT + ALL-PRODUCT TOTALS ===== */}
//         <label className="newUserData-Label">Resumen financiero</label>

//         <div className="quoter-summaryDiv">
//           {/* Split subtotals (no conversion) */}
//           <label className="summary-Label">
//             <b>Total USD (solo artículos en USD):</b> {fmtUSD(totalUSD)}
//           </label>
//           <label className="summary-Label">
//             <b>Total MXN (solo artículos en MXN):</b> {fmtMXN(totalMXN)}
//           </label>

//           <label className="summaryTotal-Label">
//             <b>Total USD:</b>{" "}
//             {fxError
//               ? "—"
//               : (allUSDWithIVA != null
//                   ? fmtUSD(allUSDWithIVA)
//                   : (allUSD != null ? fmtUSD(allUSD) : "Cargando tipo de cambio..."))}
//           </label>
//           <label className="summaryTotal-Label">
//             <b>Total MXN:</b>{" "}
//             {fxError
//               ? "—"
//               : (allMXNWithIVA != null
//                   ? fmtMXN(allMXNWithIVA)
//                   : (allMXN != null ? fmtMXN(allMXN) : "Cargando tipo de cambio..."))}
//           </label>

//           {/* Little note about rate */}
//           <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
//             {fxError
//               ? fxError
//               : dofRate
//               ? `Tipo de cambio DOF ${dofDate}: $${dofRate.toFixed(2)} MXN/USD`
//               : "Cargando tipo de cambio DOF..."}
//           </div>
//         </div>

//         <div className="newOrderActionButtons-Div">
//           <button className="submitOrder-Btn" type="button" onClick={submitOrder}>
//             Hacer Pedido
//           </button>
//         </div>
//       </div>

//       <div className="footerMenuDiv">
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