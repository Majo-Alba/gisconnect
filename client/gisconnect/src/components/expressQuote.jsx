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

  const [price, setPrice] = useState("");                 // numeric string
  const [priceCurrency, setPriceCurrency] = useState("USD"); // "USD" | "MXN"
  const [weight, setWeight] = useState("");
  const [stock, setStock] = useState("");
  const [specialApplied, setSpecialApplied] = useState(false);
  const [packPresentation, setPackPresentation] = useState(""); // PRESENTACION_EMPAQUE

  const [csvData, setCsvData] = useState([]);             // Products
  const [csvClientData, setCsvClientData] = useState([]); // Client DB (for name/email → client column)
  const [specialPrices, setSpecialPrices] = useState([]);  // Special prices sheet

  // NEW: LATEST inventory by PRODUCT NAME ONLY → { "<normalized product>": totalExistencia }
  const [stockByKey, setStockByKey] = useState({});

  const [user, setUser] = useState(null);
  const [isActive, setIsActive] = useState(false);

  // DOF rate (MXN per USD)
  const [dofRate, setDofRate] = useState(null);
  const [dofDate, setDofDate] = useState(null);
  const [fxError, setFxError] = useState(null);

  // ---------- helpers (placed up here so they’re usable below) ----------
  const normalize = (s) =>
    (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " "); // collapse multiple spaces

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
  // ---------------------------------------------------------------------

  // Fetch DOF rate once
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

  // CSV URLs
  const PRODUCTS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

  const CLIENT_DB_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";

  const SPECIAL_PRICES_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=231220133&single=true&output=csv";

  // 🔗 LIVE "LATEST" inventory CSV (publish LATEST sheet as CSV and paste that link here)
  const INVENTORY_LATEST_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3w6YJjBrIDz56fkcJmjeBNlsfI55v9ilSXOzmnJBLi4h97ePj433ibiqXIRQ1KHOae-mYb21zydwS/pub?gid=0&single=true&output=csv";

  useEffect(() => {
    fetchCSV(PRODUCTS_CSV_URL, setCsvData);
    fetchCSV(CLIENT_DB_URL, setCsvClientData);
    fetchCSV(SPECIAL_PRICES_URL, setSpecialPrices);

    // ==== LATEST inventory by PRODUCT NAME ONLY ====
    axios
      .get(INVENTORY_LATEST_CSV_URL)
      .then((res) => {
        const rows = parseCSV(res.data);
        // Expect headers: NOMBRE_PRODUCTO, EXISTENCIA (PESO/UNIDAD may exist but are IGNORED)
        const byName = {};
        rows.forEach((r) => {
          const prod = normalize(r.NOMBRE_PRODUCTO || "");
          const ex = parseFloat((r.EXISTENCIA ?? r.EXISTENCIAS ?? "0").toString().replace(/,/g, ""));
          if (!prod || !Number.isFinite(ex)) return;
          byName[prod] = (byName[prod] || 0) + ex; // sum if repeated rows
        });
        setStockByKey(byName);
      })
      .catch((err) => console.error("Error fetching LATEST inventory CSV:", err));
  }, []);

  function fetchCSV(url, setter) {
    axios
      .get(url)
      .then((res) => setter(parseCSV(res.data)))
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

    // 🔁 STOCK SOURCE: LATEST CSV (by product only) with fallback to products CSV
    const prodKey = normalize(selectedProduct);
    const latestStock = stockByKey[prodKey];
    const fallbackStock = baseRow.CANTIDAD_EXISTENCIA
      ? parseFloat((baseRow.CANTIDAD_EXISTENCIA || "0").toString().replace(/,/g, ""))
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

// // yes please! Here is my full expressQuote.jsx code, can you give me the full copy-paste version of it?

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

// export default function ExpressQuote() {
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

  // ======== PDF + Upload (unchanged design; now shows split+global totals & currency) ========
  const downloadPDF = async () => {
    const doc = new jsPDF();
  
    // Helpers (use same DOF/IVA values already in component state)
    const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
    const fmtMXN = (v) => `$${(v ?? 0).toFixed(2)} MXN`;
  
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
  
    // Add background to EVERY page
    const drawBg = () => doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
    drawBg();
  
    // Header
    doc.setFontSize(10);
    doc.setFont("custom", "bold");
    doc.text(`Fecha de Elaboración: ${new Date().toLocaleDateString("es-MX")}`, 195, 15, { align: "right" });
    doc.text(`Cotización Válida Hasta: ${new Date(Date.now()+30*86400000).toLocaleDateString("es-MX")}`, 195, 20, { align: "right" });
  
    // Separator
    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 45, 200, 45);
  
    // Resolve client row (csvClientData is an array)
    const normalize = (s) => (s ?? "").toString().trim().toLowerCase();
    const userCreds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    const clientRow = Array.isArray(csvClientData)
      ? csvClientData.find(r => normalize(r.CORREO_EMPRESA) === normalize(userCreds?.correo))
      : null;
  
    // Client section (Shipping)
    doc.setFontSize(11);
    doc.setFont("custom", "bold");
    doc.text("Información de Envío", 13, 51);
  
    doc.setFontSize(10);
    doc.addImage(iconBuilding, 13, 53, 5, 5);
    doc.text(`${clientRow?.NOMBRE_EMPRESA || ""}`, 19, 57);
  
    doc.addImage(iconContact, 13.5, 59.5, 4, 4);
    doc.text(`${clientRow?.NOMBRE_APELLIDO || ""}`, 19, 63);
  
    doc.addImage(iconLocation, 13.7, 65, 3, 4);
    doc.text(
      `${(clientRow?.CALLE_ENVIO || "")}  # ${(clientRow?.EXTERIOR_ENVIO || "")}  Int. ${(clientRow?.INTERIOR_ENVIO || "")}`,
      19, 68
    );
    doc.text(`Col. ${clientRow?.COLONIA_ENVIO || ""}`, 19, 72);
    doc.text(
      `${clientRow?.CIUDAD_ENVIO || ""}, ${clientRow?.ESTADO_ENVIO || ""}. C.P. ${clientRow?.CP_ENVIO || ""}`,
      19, 76
    );
  
    doc.addImage(iconPhone, 13.7, 78, 3, 4);
    doc.text(`${clientRow?.TELEFONO_EMPRESA || ""}`, 19, 81.5);
  
    doc.addImage(iconEmail, 13.7, 84, 4, 3);
    doc.text(`${clientRow?.CORREO_EMPRESA || userCreds?.correo || ""}`, 19, 87);
  
    // Billing section
    doc.setFontSize(11);
    doc.setFont("custom", "bold");
    doc.text("Información Fiscal", 100, 51);
  
    doc.setFontSize(10);
    doc.text(`Razón Social: ${clientRow?.RAZON_SOCIAL || ""}`, 106, 57);
    doc.text(`RFC: ${clientRow?.RFC_EMPRESA || ""}`, 106, 63);
  
    doc.addImage(iconEmail, 100, 65, 4, 3);
    doc.text(`${clientRow?.CORREO_FISCAL || ""}`, 106, 68);
  
    doc.addImage(iconLocation, 100.5, 70, 3, 4);
    doc.text(
      `${(clientRow?.CALLE_FISCAL || "")}  # ${(clientRow?.EXTERIOR_FISCAL || "")}  Int. ${(clientRow?.INTERIOR_FISCAL || "")}`,
      106, 73
    );
    doc.text(`Col. ${clientRow?.COLONIA_FISCAL || ""}`, 106, 77);
    doc.text(
      `${clientRow?.CIUDAD_FISCAL || ""}, ${clientRow?.ESTADO_FISCAL || ""}. C.P. ${clientRow?.CP_FISCAL || ""}`,
      106, 81
    );
  
    // Separator
    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 92, 200, 92);
  
    // ===== Items table (with currency + packPresentation) =====
    const tableData = items.map((it) => [
      it.product,
      it.presentation,
      it.packPresentation || "-",                                  // NEW column
      it.amount,
      `$${Number(it.price).toFixed(2)} ${it.currency || "USD"}`,    // unit price + currency
      `$${(Number(it.amount) * Number(it.price)).toFixed(2)} ${it.currency || "USD"}`, // line total + currency
    ]);
  
    autoTable(doc, {
      head: [["Producto", "Presentación", "Empaque", "Cantidad", "Precio Unitario", "Total"]],
      body: tableData,
      startY: 100,
      headStyles: {
        fillColor: [149, 194, 61],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
      styles: { fontSize: 9 },
      // Add background to every new page
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          drawBg();
        }
      },
      margin: { top: 100, right: 10, bottom: 20, left: 10 },
    });
  
    // ===== Totals (split + all-products w/ DOF) =====
    const usdItems = items.filter((it) => (it.currency || "USD") === "USD");
    const mxnItems = items.filter((it) => (it.currency || "USD") === "MXN");
  
    const totalUSD = usdItems.reduce((sum, it) => sum + Number(it.amount) * Number(it.price), 0);
    const totalMXN = mxnItems.reduce((sum, it) => sum + Number(it.amount) * Number(it.price), 0);
  
    const allUSD = dofRate ? totalUSD + totalMXN / dofRate : null; // MXN → USD
    const allMXN = dofRate ? totalMXN + totalUSD * dofRate : null; // USD → MXN
  
    const ivaAllUSD = (typeof isActive === "boolean" && isActive && allUSD != null)
      ? +(allUSD * 0.16).toFixed(2)
      : null;
    const ivaAllMXN = (typeof isActive === "boolean" && isActive && allMXN != null)
      ? +(allMXN * 0.16).toFixed(2)
      : null;
  
    const allUSDWithIVA = ivaAllUSD != null ? +(allUSD + ivaAllUSD).toFixed(2) : allUSD;
    const allMXNWithIVA = ivaAllMXN != null ? +(allMXN + ivaAllMXN).toFixed(2) : allMXN;
  
    let extraY = doc.lastAutoTable.finalY + 12;
  
    // Green rounded box for totals
    const boxX = 141;
    const boxY = extraY - 8;
    const boxWidth = 55;
    const boxHeight = isActive ? 46 : 38; // a bit taller if IVA lines are shown
    const radius = 4;
  
    if (doc.roundedRect) {
      doc.setFillColor(207, 242, 137);
      doc.roundedRect(boxX, boxY, boxWidth, boxHeight, radius, radius, "F");
    } else {
      doc.setFillColor(207, 242, 137);
      doc.rect(boxX, boxY, boxWidth, boxHeight, "F");
    }
  
    // Totals text
    let line = 0;
    const lineH = 5;
    const rightX = 196; // ~ inside box
  
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
  
    doc.text(`USD (solo): ${fmtUSD(totalUSD)}`, rightX, extraY + line, { align: "right" });
    line += lineH;
    doc.text(`MXN (solo): ${fmtMXN(totalMXN)}`, rightX, extraY + line, { align: "right" });
    line += lineH;
  
    // All-products totals (conversion)
    doc.text(
      `USD (todos): ${allUSD != null ? fmtUSD(allUSD) : (dofRate ? fmtUSD(0) : "Cargando...")}`,
      rightX, extraY + line, { align: "right" }
    );
    line += lineH;
    doc.text(
      `MXN (todos): ${allMXN != null ? fmtMXN(allMXN) : (dofRate ? fmtMXN(0) : "Cargando...")}`,
      rightX, extraY + line, { align: "right" }
    );
    line += lineH;
  
    // IVA (only on all-products)
    if (isActive) {
      doc.text(
        `IVA USD: ${ivaAllUSD != null ? fmtUSD(ivaAllUSD) : "—"}`,
        rightX, extraY + line, { align: "right" }
      );
      line += lineH;
      doc.text(
        `IVA MXN: ${ivaAllMXN != null ? fmtMXN(ivaAllMXN) : "—"}`,
        rightX, extraY + line, { align: "right" }
      );
      line += lineH;
    }
  
    // Totals with IVA
    doc.text(
      `TOTAL USD: ${allUSDWithIVA != null ? fmtUSD(allUSDWithIVA) : "—"}`,
      rightX, extraY + line, { align: "right" }
    );
    line += lineH;
    doc.text(
      `TOTAL MXN: ${allMXNWithIVA != null ? fmtMXN(allMXNWithIVA) : "—"}`,
      rightX, extraY + line, { align: "right" }
    );
  
    // FX note
    doc.setFontSize(9);
    doc.setFont("custom", "italic");
    const fxNoteY = extraY + line + 6;
    doc.text(
      dofRate ? `${dofRate.toFixed(2)} MXN/USD (DOF ${dofDate || ""})` : "Tipo de cambio DOF no disponible",
      rightX, fxNoteY, { align: "right" }
    );
  
    // --- PAGE 2: Payment instructions (keep your design) ---
    doc.addPage();
    drawBg();
  
    let y = 35;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(24, 144, 69);
    doc.text(`Cuentas para realizar pago:`, 13, y + 5);
  
    const payBoxX = 10;
    const payBoxY = y + 10;
    const payBoxWidth = 190;
    const payBoxHeight = 130;
    const payBoxRadius = 4;
  
    if (doc.roundedRect) {
      doc.setFillColor(241, 241, 241);
      doc.roundedRect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, payBoxRadius, payBoxRadius, "F");
    } else {
      doc.setFillColor(241, 241, 241);
      doc.rect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, "F");
    }
  
    doc.setFontSize(13);
    doc.setFont("custom", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`CUENTA EN PESOS MEXICANOS`, 15, y + 17);
  
    doc.setFontSize(11);
    doc.setFont("custom", "bold");
    doc.text(`NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV`, 15, y + 24);
    doc.text(`TRANSFERENCIA:`, 15, y + 31);
  
    doc.setFont("custom", "normal");
    doc.text(`BANCO: BBVA`, 15, y + 37);
    doc.text(`NO. DE CUENTA: 010 115 1207`, 15, y + 42);
    doc.text(`CLABE: 012 320 001 011 512 076`, 15, y + 47);
  
    doc.setFont("custom", "bold");
    doc.text(`DEPÓSITO BANCARIO:`, 120, y + 31);
  
    doc.setFont("custom", "normal");
    doc.text(`BANCO: BBVA`, 120, y + 37);
    doc.text(`NO. DE CUENTA: 010 115 1207`, 120, y + 42);
  
    doc.setFont("custom", "bold");
    doc.setFontSize(13);
    doc.text(`CUENTA EN PESOS MEXICANOS - SIN FACTURA`, 15, y + 59);
  
    doc.setFontSize(11);
    doc.text(`TRANSFERENCIA O DEPÓSITO BANCARIO`, 15, y + 66);
  
    doc.setFont("custom", "normal");
    doc.text(`NOMBRE: ALEJANDRO GONZALEZ AGUIRRE`, 15, y + 72);
    doc.text(`BANCO: BBVA`, 15, y + 77);
    doc.text(`NO. DE CUENTA: 124 525 4078`, 15, y + 82);
    doc.text(`CLABE: 012 320 012 452 540 780`, 15, y + 87);
    doc.text(`NO. DE TARJETA: 4152 3141 1021 5384`, 15, y + 92);
  
    doc.setFont("custom", "bold");
    doc.setFontSize(13);
    doc.text(`CUENTA EN DÓLARES AMERICANOS`, 15, y + 105);
  
    doc.setFontSize(11);
    doc.text(`NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV`, 15, y + 112);
    doc.text(`TRANSFERENCIA`, 15, y + 119);
  
    doc.setFont("custom", "normal");
    doc.text(`BANCO: GRUPO FINANCIERO MONEX`, 15, y + 125);
    doc.text(`CLABE: 112 180 000 028 258 341`, 15, y + 130);
  
    doc.text(`BANCO: BANCO INVEX, S.A.`, 120, y + 125);
    doc.text(`CLABE: 059 180 030 020 014 234`, 120, y + 130);
  
    // Save locally
    doc.save("Cotización_Express.pdf");
  
    // Upload to server (Mongo)
    try {
      const pdfBlob = doc.output("blob");
      const file = new File([pdfBlob], "Cotizacion_Express.pdf", { type: "application/pdf" });
      const formData = new FormData();
      formData.append("pdf", pdfBlob, file); // field name must match your multer/endpoint

      // formData.append("pdf", file); // field name must match your multer/endpoint
  
      // Optional: include metadata alongside the file
      formData.append(
        "metadata",
        JSON.stringify({
          userEmail: userCreds?.correo,
          createdAt: new Date().toISOString(),
          totals: {
            totalUSD,
            totalMXN,
            allUSD,
            allMXN,
            allUSDWithIVA,
            allMXNWithIVA,
            dofRate,
            dofDate,
            ivaApplied: !!isActive,
          },
          items, // includes currency per item
        })
      );
  
      await axios.post(`${API}/save-pdf`, formData, { withCredentials: false });
      alert("PDF generado y guardado exitosamente.");
    } catch (err) {
      console.error("Error saving PDF:", err?.response?.data || err.message || err);
      alert(
        `No se pudo guardar el PDF.\n` +
        `${err?.response?.data?.error || err.message || "Revisa tu conexión y vuelve a intentar."}`
      );
    }
  };
  
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
          src={Logo}
          alt="Home Icon"
          width="180"
          height="55"
          onClick={() => navigate("/userHome")}
        />
      </div>

      <label className="sectionHeader-Label">¡Cotiza ahora!</label>

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
          {/* {specialApplied && (
            <div style={{ fontSize: 12, color: "#26a269", marginTop: 4 }}>
              Precio especial aplicado para tu cuenta
            </div>
          )} */}
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
            {/* Por el momento no contamos con suficiente stock. */}
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

        <div className="actionButtons-Div">
          <button className="generatePDF-Btn" type="button" onClick={downloadPDF}>
            Descargar PDF
          </button>
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