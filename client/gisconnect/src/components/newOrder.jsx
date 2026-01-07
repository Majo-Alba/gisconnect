
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

export default function NewOrder() {
  const navigate = useNavigate();

  const [selectedProduct, setSelectedProduct] = useState("");
  const [presentation, setPresentation] = useState("");
  const [amount, setAmount] = useState(""); // kept as string for input, normalized for logic
  const [items, setItems] = useState([]);

  const [price, setPrice] = useState("");                 // numeric string
  const [priceCurrency, setPriceCurrency] = useState(""); // "USD" | "MXN"
  const [weight, setWeight] = useState("");
  const [stock, setStock] = useState("");                 // raw string
  const [stockReady, setStockReady] = useState(false);    // NEW: guards comparisons
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

  // Preferred currency for the summary box
  const [preferredCurrency, setPreferredCurrency] = useState("USD");

  // ---------- helpers ----------
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
  // Robust number parser for CSV / inputs ("1,234.50" → 1234.5)
  const n = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().replace(/\s+/g, "");
    if (!s) return null;
    // remove thousands separators like "1,234" or "1 234"
    const cleaned = s.replace(/(?<=\d)[,\s](?=\d{3}\b)/g, "").replace(/,/g, ".");
    const x = Number(cleaned);
    return Number.isFinite(x) ? x : null;
  };
  // Integer qty from input
  const asQty = (v) => {
    const num = n(v);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.floor(num));
  };

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
        const byName = {};
        rows.forEach((r) => {
          const prod = normalize(r.NOMBRE_PRODUCTO || "");
          // Try multiple common column names; parse robustly
          const ex = n(r.EXISTENCIA ?? r.EXISTENCIAS ?? r.STOCK ?? "0");
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

  // Resolve product data & price whenever selection or stock map changes
  useEffect(() => {
    // reset stock readiness while recomputing
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

    // Common attributes
    setWeight(baseRow.PESO_PRODUCTO || "");
    setPackPresentation(baseRow.PRESENTACION_EMPAQUE || "");

    // STOCK SOURCE: LATEST CSV (by product only) with fallback to products CSV
    const prodKey = normalize(selectedProduct);
    const latestStock = stockByKey[prodKey];
    const fallbackStock = n(baseRow.CANTIDAD_EXISTENCIA) ?? 0;

    // store raw, but we will compare with robust parsers
    setStock(
      Number.isFinite(latestStock)
        ? String(latestStock)
        : String(fallbackStock)
    );

    // mark as ready next tick to avoid using stale state in render
    setTimeout(() => setStockReady(true), 0);

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

  // Presentation list for the chosen product
  const presentationOptions = csvData
    .filter((r) => r.NOMBRE_PRODUCTO === selectedProduct)
    .map((r) => (r.PESO_PRODUCTO || "") + (r.UNIDAD_MEDICION || ""));

  // === NEW: unified numeric derivations for UI & guards ===
  const qty = asQty(amount);           // integer >= 0
  const stockNum = n(stock);           // finite or null
  const hasFiniteStock = Number.isFinite(stockNum);
  const outOfStock = hasFiniteStock && qty > 0 && qty > stockNum;

  // Add item (uses the SAME guards as UI)
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

    // Reset inputs
    setSelectedProduct("");
    setPresentation("");
    setPackPresentation("");
    setAmount("");
    setPrice("");
    setPriceCurrency(""); // reset
    setWeight("");
    setStock("");
    setStockReady(false);
    setSpecialApplied(false);
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ===== Totals (unchanged) =====
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

  const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
  const fmtMXN = (v) =>
    `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
//  -----> HERE MJ
//   // ======== PDF + Upload (unchanged design; now shows split+global totals & currency) ========  
//   const downloadPDF = async () => {
//     const doc = new jsPDF();
  
//     // Helpers (use same DOF/IVA values already in component state)
//     const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//     const fmtMXN = (v) =>
//   `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

//     const pageWidth = doc.internal.pageSize.getWidth();
//     const pageHeight = doc.internal.pageSize.getHeight();
  
//     // Add background to EVERY page
//     const drawBg = () => doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
//     drawBg();
  
//     // Header
//     doc.setFontSize(10);
//     doc.setFont("custom", "bold");
//     doc.text(`Fecha de Elaboración: ${new Date().toLocaleDateString("es-MX")}`, 195, 15, { align: "right" });
//     doc.text(`Cotización Válida Hasta: ${new Date(Date.now()+30*86400000).toLocaleDateString("es-MX")}`, 195, 20, { align: "right" });
  
//     // Separator
//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 45, 200, 45);
  
//     // Resolve client row (csvClientData is an array)
//     const normalize = (s) => (s ?? "").toString().trim().toLowerCase();
//     const userCreds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     const clientRow = Array.isArray(csvClientData)
//       ? csvClientData.find(r => normalize(r.CORREO_EMPRESA) === normalize(userCreds?.correo))
//       : null;
  
//     // Client section (Shipping)
//     doc.setFontSize(11);
//     doc.setFont("custom", "bold");
//     doc.text("Información de Envío", 13, 51);
  
//     doc.setFontSize(10);
//     doc.addImage(iconBuilding, 13, 53, 5, 5);
//     doc.text(`${clientRow?.NOMBRE_EMPRESA || ""}`, 19, 57);
  
//     doc.addImage(iconContact, 13.5, 59.5, 4, 4);
//     doc.text(`${clientRow?.NOMBRE_APELLIDO || ""}`, 19, 63);
  
//     doc.addImage(iconLocation, 13.7, 65, 3, 4);
//     doc.text(
//       `${(clientRow?.CALLE_ENVIO || "")}  # ${(clientRow?.EXTERIOR_ENVIO || "")}  Int. ${(clientRow?.INTERIOR_ENVIO || "")}`,
//       19, 68
//     );
//     doc.text(`Col. ${clientRow?.COLONIA_ENVIO || ""}`, 19, 72);
//     doc.text(
//       `${clientRow?.CIUDAD_ENVIO || ""}, ${clientRow?.ESTADO_ENVIO || ""}. C.P. ${clientRow?.CP_ENVIO || ""}`,
//       19, 76
//     );
  
//     doc.addImage(iconPhone, 13.7, 78, 3, 4);
//     doc.text(`${clientRow?.TELEFONO_EMPRESA || ""}`, 19, 81.5);
  
//     doc.addImage(iconEmail, 13.7, 84, 4, 3);
//     doc.text(`${clientRow?.CORREO_EMPRESA || userCreds?.correo || ""}`, 19, 87);
  
//     // Billing section
//     doc.setFontSize(11);
//     doc.setFont("custom", "bold");
//     doc.text("Información Fiscal", 100, 51);
  
//     doc.setFontSize(10);
//     doc.text(`Razón Social: ${clientRow?.RAZON_SOCIAL || ""}`, 106, 57);
//     doc.text(`RFC: ${clientRow?.RFC_EMPRESA || ""}`, 106, 63);
  
//     doc.addImage(iconEmail, 100, 65, 4, 3);
//     doc.text(`${clientRow?.CORREO_FISCAL || ""}`, 106, 68);
  
//     doc.addImage(iconLocation, 100.5, 70, 3, 4);
//     doc.text(
//       `${(clientRow?.CALLE_FISCAL || "")}  # ${(clientRow?.EXTERIOR_FISCAL || "")}  Int. ${(clientRow?.INTERIOR_FISCAL || "")}`,
//       106, 73
//     );
//     doc.text(`Col. ${clientRow?.COLONIA_FISCAL || ""}`, 106, 77);
//     doc.text(
//       `${clientRow?.CIUDAD_FISCAL || ""}, ${clientRow?.ESTADO_FISCAL || ""}. C.P. ${clientRow?.CP_FISCAL || ""}`,
//       106, 81
//     );
  
//     // Separator
//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 92, 200, 92);
  
//     // ===== Items table (with currency + packPresentation) =====
//     const tableData = items.map((it) => [
//       it.product,
//       it.presentation,
//       it.packPresentation || "-",                                  // NEW column
//       it.amount,
//       `$${Number(it.price).toFixed(2)} ${it.currency || "USD"}`,    // unit price + currency
//       `$${(Number(it.amount) * Number(it.price)).toFixed(2)} ${it.currency || "USD"}`, // line total + currency
//     ]);
  
//     // ===== Totals (split + all-products w/ DOF) =====

//     // SEP05
//     // ===== Currency-scoped tables (robust partition) =====
    
//     // sep08
//     const toCur = (v) => String(v ?? "").trim().toUpperCase();
//     const itemCur = (it) => toCur(it.currency ?? it.priceCurrency); // prefer item.currency
//     const isMXN = (it) => itemCur(it) === "MXN";
//     const isUSD = (it) => itemCur(it) === "USD";
//     // sep08
//     const normCur = (v) => String(v ?? "").trim().toUpperCase();
//     const getCur = (it) => {
//       // prefer explicit item.currency, fall back to priceCurrency
//       const c = normCur(it.currency || it.priceCurrency);
//       return c === "MXN" ? "MXN" : "USD"; // default unknowns to USD
//     };

//     // Partition once using normalized currency
//     const usdItems = items.filter(isUSD);
//     const mxnItems = items.filter(isMXN);

//     // (optional, for debugging)
//     const unknownItems = items.filter((it) => !isUSD(it) && !isMXN(it));
//     // sep08

//     const sectionTitle = (text, y) => {
//       doc.setFontSize(12);
//       doc.setFont("helvetica", "bold");
//       doc.text(text, 13, y);
//     };

//     const makeBody = (arr) =>
//       arr.map((it) => {
//         const cur  = itemCur(it) || "—";           // don't silently call it USD
//         const unit = Number(it.price) || 0;
//         const qty  = Number(it.amount) || 0;
//         return [
//           it.product,
//           it.presentation,
//           it.packPresentation || "-",
//           String(qty),
//           `$${unit.toFixed(2)} ${cur}`,
//           `$${(qty * unit).toFixed(2)} ${cur}`,
//         ];
//       });


// let cursorY = 105;

// // --- USD section ---
// if (usdItems.length) {
//   doc.setTextColor(24, 144, 69);
//   sectionTitle("Artículos en USD", cursorY - 6);

//   autoTable(doc, {
//     head: [["Producto", "Presentación", "Empaque", "Cantidad", "Precio Unitario", "Total"]],
//     body: makeBody(usdItems),
//     startY: cursorY,
//     headStyles: { fillColor: [149, 194, 61], textColor: [0, 0, 0], fontStyle: "bold" },
//     styles: { fontSize: 9 },
//     margin: { top: 100, right: 10, bottom: 20, left: 10 },
//     didDrawPage: (data) => { if (data.pageNumber > 1) drawBg(); }
//   });

//   // Subtotal USD
//   cursorY = doc.lastAutoTable.finalY + 6;
//   const subtotalUSD = usdItems.reduce((sum, it) => sum + (Number(it.amount)||0) * (Number(it.price)||0), 0);
//   doc.setFontSize(11);
//   doc.setTextColor(0, 0, 0);
//   doc.setFont("helvetica", "bold");
//   doc.text(`Subtotal USD: $${subtotalUSD.toFixed(2)} USD`, 140, cursorY);
//   cursorY += 12;
// }

// // --- MXN section ---
// if (mxnItems.length) {
//   doc.setTextColor(24, 144, 69);
//   sectionTitle("Artículos en MXN", cursorY - 6);

//   autoTable(doc, {
//     head: [["Producto", "Presentación", "Empaque", "Cantidad", "Precio Unitario", "Total"]],
//     body: makeBody(mxnItems),
//     startY: cursorY,
//     headStyles: { fillColor: [149, 194, 61], textColor: [0, 0, 0], fontStyle: "bold" },
//     styles: { fontSize: 9 },
//     margin: { top: 100, right: 10, bottom: 20, left: 10 },
//     didDrawPage: (data) => { if (data.pageNumber > 1) drawBg(); }
//   });

//   // Subtotal MXN
//   cursorY = doc.lastAutoTable.finalY + 6;
//   const subtotalMXN = mxnItems.reduce((sum, it) => sum + (Number(it.amount)||0) * (Number(it.price)||0), 0);
//   doc.setFontSize(11);
//   doc.setTextColor(0, 0, 0);
//   doc.setFont("helvetica", "bold");
//   doc.text(
//     `Subtotal MXN: $${subtotalMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`,
//     140,
//     cursorY
//   );
//   cursorY += 12;
// }

// // --->

// {
//   // Subtotales nativos
//   const subtotalUSD = usdItems.reduce((s, it) => s + (Number(it.amount)||0) * (Number(it.price)||0), 0);
//   const subtotalMXN = mxnItems.reduce((s, it) => s + (Number(it.amount)||0) * (Number(it.price)||0), 0);

//   // Utilidades
//   const rate = Number(dofRate) || 0;                  // MXN por USD
//   const iva16 = (v) => (isActive ? +(v * 0.16).toFixed(2) : 0);
//   const hasUSD = usdItems.length > 0;
//   const hasMXN = mxnItems.length > 0;
//   const isMixed = hasUSD && hasMXN;
//   const wantsMXN = (preferredCurrency || "USD").toUpperCase() === "MXN";

//   // Título (fuera de la caja)
//   doc.setFontSize(12);
//   doc.setFont("helvetica", "bold");
//   doc.text("Resumen Financiero", 13, cursorY);
//   cursorY += 6;

//   // ---- Caja: parámetros ----
//   const boxX = 12;
//   const boxW = 186;
//   const boxPad = 4;
//   const textMaxW = boxW - boxPad * 2;
//   const lineH = 6;

//   // Pre-cálculos de líneas para MXN-seleccionado
//   const usdEnMXN = rate ? subtotalUSD * rate : 0;
//   const baseMXN_Mixed = subtotalMXN + usdEnMXN;
//   const totalMXN_Mixed = baseMXN_Mixed + iva16(baseMXN_Mixed);
//   const totalUSD_only = subtotalUSD + iva16(subtotalUSD);
//   const totalMXN_only = subtotalMXN + iva16(subtotalMXN);

//   // Medición previa para definir alto de la caja (con el orden nuevo)
//   const measureSummary = () => {
//     let y = cursorY + boxPad;

//     // (1) Moneda de pago (bold) — 1 línea
//     y += lineH;

//     if (wantsMXN) {
//       // --- Orden para MXN seleccionado ---
//       // (2) Total a Pagar en MXN
//       y += lineH;

//       // (3) Detalle: USD… (solo si hay USD o mixta con TC)
//       if (isMixed || hasUSD) {
//         const det = rate
//           ? (isMixed
//               ? `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(usdEnMXN)}; + MXN nativo ${fmtMXN(subtotalMXN)}.`
//               : `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(usdEnMXN)}.`)
//           : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//         const detLines = doc.splitTextToSize(det, textMaxW);
//         y += detLines.length * 5 + 3;
//       }

//       // (4) Tipo de cambio (si hay rate o si es útil mostrarlo)
//       if ((isMixed || hasUSD) && rate) {
//         y += 5;
//       }

//       // (5) IMPORTANTE (solo mixtas)
//       if (isMixed) {
//         const legend = "IMPORTANTE: En órdenes mixtas, donde se tengan artículos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN.";
//         const legendLines = doc.splitTextToSize(legend, textMaxW);
//         y += legendLines.length * 5 + 5;
//       }
//     } else {
//       // --- Orden para USD seleccionado ---
//       // (2) A Pagar en USD (si hay USD)
//       if (hasUSD) y += lineH;

//       // (3) A Pagar en MXN (si hay MXN o mixta)
//       if (hasMXN) y += lineH;

//       // (4) Tipo de cambio (lo mostramos si es mixto y hay rate como referencia)
//       if (isMixed && rate) {
//         y += 5;
//       }

//       // (5) IMPORTANTE (solo mixtas)
//       if (isMixed) {
//         const legend = "IMPORTANTE: En órdenes mixtas, donde se tengan artículos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN.";
//         const legendLines = doc.splitTextToSize(legend, textMaxW);
//         y += legendLines.length * 5 + 5;
//       }

//       // Caso especial: preferencia USD pero solo MXN-items
//       if (!hasUSD && hasMXN) {
//         // Total MXN + nota
//         y += lineH; // total MXN
//         const note = "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
//         const noteLines = doc.splitTextToSize(note, textMaxW);
//         y += noteLines.length * 5 + 3;
//       }
//     }

//     return y + boxPad;
//   };

//   const boxBottom = measureSummary();
//   const boxHeight = Math.max(12, boxBottom - cursorY);

//   // Dibuja caja gris con bordes redondeados
//   doc.setFillColor(241, 241, 241);
//   doc.setDrawColor(200, 200, 200);
//   const r = 2.5; // radio de esquina
//   if (typeof doc.roundedRect === "function") {
//     doc.roundedRect(boxX, cursorY, boxW, boxHeight, r, r, "FD");
//   } else {
//     // fallback si la versión de jsPDF no tiene roundedRect
//     doc.rect(boxX, cursorY, boxW, boxHeight, "FD");
//   }

//   // ---- Render real con el nuevo orden ----
//   let y = cursorY + boxPad;

//   // (1) Moneda de pago (bold)
//   doc.setFontSize(10);
//   doc.setFont("helvetica", "bold");
//   doc.text(`Moneda de pago seleccionada: ${preferredCurrency || "USD"}`, boxX + boxPad, y + 3);
//   y += lineH;
//   doc.setFont("helvetica", "normal");

//   if (wantsMXN) {
//     // === Usuario seleccionó MXN ===

//     // (2) Total a Pagar en MXN
//     if (isMixed) {
//       if (!rate) {
//         // No rate → no es posible total global MXN
//         doc.setTextColor(180, 0, 0);
//         const err = "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//         const errLines = doc.splitTextToSize(err, textMaxW);
//         doc.text(errLines, boxX + boxPad, y);
//         doc.setTextColor(0, 0, 0);
//         y += errLines.length * 5 + 3;
//       } else {
//         doc.text(
//           `Total a pagar en MXN: ${fmtMXN(totalMXN_Mixed)}` + (isActive ? " (incluye IVA 16%)" : ""),
//           boxX + boxPad,
//           y + 3
//         );
//         y += lineH;

//         // (3) Detalle
//         doc.setFontSize(9);
//         doc.setTextColor(120,120,120);
//         const det = `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(usdEnMXN)}; + MXN nativo ${fmtMXN(subtotalMXN)}.`;
//         const detLines = doc.splitTextToSize(det, textMaxW);
//         doc.text(detLines, boxX + boxPad, y + 3);
//         y += detLines.length * 5 + 3;

//         // (4) Tipo de cambio
//         doc.text(`Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD` + (dofDate ? `  (Fecha: ${dofDate})` : ""), boxX + boxPad, y + 2);
//         doc.setTextColor(0,0,0);
//         doc.setFontSize(10);
//         y += 5;
//       }
//     } else if (hasUSD) {
//       // Solo USD → convertir todo
//       if (!rate) {
//         doc.setTextColor(180, 0, 0);
//         const err = "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total en MXN.";
//         const errLines = doc.splitTextToSize(err, textMaxW);
//         doc.text(errLines, boxX + boxPad, y);
//         doc.setTextColor(0, 0, 0);
//         y += errLines.length * 5 + 3;
//       } else {
//         const base = subtotalUSD * rate;
//         const total = base + iva16(base);
//         doc.text(`Total a pagar en MXN: ${fmtMXN(total)}` + (isActive ? " (incluye IVA 16%)" : ""), boxX + boxPad, y);
//         y += lineH;

//         // (3) Detalle
//         doc.setFontSize(9);
//         doc.setTextColor(120,120,120);
//         const det = `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(base)}.`;
//         const detLines = doc.splitTextToSize(det, textMaxW);
//         doc.text(detLines, boxX + boxPad, y);
//         y += detLines.length * 5 + 3;

//         // (4) Tipo de cambio
//         doc.text(`Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD` + (dofDate ? `  (Fecha: ${dofDate})` : ""), boxX + boxPad, y);
//         doc.setTextColor(0,0,0);
//         doc.setFontSize(10);
//         y += 5;
//       }
//     } else {
//       // Solo MXN
//       doc.text(`Total a pagar en MXN: ${fmtMXN(totalMXN_only)}` + (isActive ? " (incluye IVA 16%)" : ""), boxX + boxPad, y);
//       y += lineH;
//     }

//     // (5) IMPORTANTE (solo mixtas)
//     if (isMixed) {
//       doc.setTextColor(180, 0, 0);
//       doc.setFont("helvetica", "bold");
//       const legend = "IMPORTANTE: En órdenes mixtas, donde se tengan artículos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN.";
//       const legendLines = doc.splitTextToSize(legend, textMaxW);
//       doc.text(legendLines, boxX + boxPad, y + 3);
//       y += legendLines.length * 5 + 5;
//       doc.setTextColor(0, 0, 0);
//       doc.setFont("helvetica", "normal");
//     }
//   } else {
//     // === Usuario seleccionó USD ===

//     // (2) A Pagar en USD
//     if (hasUSD) {
//       doc.text(
//         `A pagar en USD (artículos en USD): ${fmtUSD(totalUSD_only)}` + (isActive ? " (incluye IVA 16%)" : ""),
//         boxX + boxPad,
//         y + 3
//       );
//       y += lineH;
//     }

//     // (3) A Pagar en MXN
//     if (hasMXN) {
//       doc.text(
//         `A pagar en MXN (artículos en MXN): ${fmtMXN(totalMXN_only)}` + (isActive ? " (incluye IVA 16%)" : ""),
//         boxX + boxPad,
//         y + 3
//       );
//       y += lineH;
//     }

//     // (4) Tipo de cambio (referencia en mixtas)
//     if (isMixed && rate) {
//       doc.setFontSize(9);
//       doc.setTextColor(120,120,120);
//       doc.text(`Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD` + (dofDate ? `  (Fecha: ${dofDate})` : ""), boxX + boxPad, y + 3);
//       doc.setTextColor(0,0,0);
//       doc.setFontSize(10);
//       y += 5;
//     }

//     // (5) IMPORTANTE (solo mixtas)
//     if (isMixed) {
//       doc.setTextColor(180, 0, 0);
//       doc.setFont("helvetica", "bold");
//       const legend = "IMPORTANTE: En órdenes mixtas, donde se tengan artículos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN.";
//       const legendLines = doc.splitTextToSize(legend, textMaxW);
//       doc.text(legendLines, boxX + boxPad, y + 5);
//       y += legendLines.length * 5 + 5;
//       doc.setTextColor(0, 0, 0);
//       doc.setFont("helvetica", "normal");
//     }

//     // Caso especial: preferencia USD pero solo MXN
//     if (!hasUSD && hasMXN) {
//       doc.setFontSize(9);
//       doc.setTextColor(120,120,120);
//       const note = "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
//       const noteLines = doc.splitTextToSize(note, textMaxW);
//       doc.text(noteLines, boxX + boxPad, y);
//       doc.setTextColor(0,0,0);
//       doc.setFontSize(10);
//       y += noteLines.length * 5 + 3;
//     }
//   }

//   // Avanza cursor debajo de la caja
//   cursorY = cursorY + boxHeight + 4;
// }

// // sep10
// // =========================
//   // NEW: Mini-box de “Keep-in-mind” al fondo de la ÚLTIMA página
//   // =========================
//   {
//     const last = doc.internal.getNumberOfPages();
//     doc.setPage(last);

//     const boxPad = 4;
//     const boxX = 12;
//     const boxW = 186;
//     const lineH = 5.2;

//     // tus 4 puntos (con wording exacto)
//     const bullets = [
//       "1) Disponibilidad inmediata.",
//       "2) Precios LAB Guadalajara, Jalisco.",
//       "3) Precios en dólares americanos, pagaderos al TC del DOF del día del pago.",
//       "4) Precios sujetos a cambio sin previo aviso.",
//     ];

//     // medir alto total con wrapping
//     const textLines = bullets.flatMap((b) => doc.splitTextToSize(b, boxW - boxPad * 2));
//     const boxH = boxPad * 2 + textLines.length * lineH;

//     // lo pegamos al fondo con un pequeño margen
//     const bottomMargin = 10;
//     const boxY = pageHeight - boxH - bottomMargin;

//     // dibujar caja clara
//     doc.setFillColor(241, 241, 241);
//     doc.setDrawColor(200, 200, 200);
//     if (typeof doc.roundedRect === "function") {
//       doc.roundedRect(boxX, boxY, boxW, boxH, 2.5, 2.5, "FD");
//     } else {
//       doc.rect(boxX, boxY, boxW, boxH, "FD");
//     }

//     // contenido
//     doc.setFont("helvetica", "normal");
//     doc.setFontSize(9.5);
//     let y = boxY + boxPad + 3;
//     textLines.forEach((ln) => {
//       doc.text(ln, boxX + boxPad, y);
//       y += lineH;
//     });
//   }
// // sep10

// // ----> 

//     // --- Build the PDF once ---
//     const pdfBlob = doc.output("blob");

//     // --- Upload FIRST (mobile-safe with keepalive only if small) ---
//     try {
//       if (!navigator.onLine) throw new Error("Sin conexión a Internet.");

//       const formData = new FormData();
//       formData.append("pdf", pdfBlob, "Cotización_Express.pdf"); // filename is important
//       formData.append(
//         "metadata",
//         JSON.stringify({
//           userEmail: userCreds?.correo,
//           createdAt: new Date().toISOString(),
//           totals: {
//             totalUSD,
//             totalMXN,
//             allUSD,
//             allMXN,
//             allUSDWithIVA,
//             allMXNWithIVA,
//             dofRate,
//             dofDate,
//             ivaApplied: !!isActive,
//           },
//           items,
//         })
//       );

//       // keepalive has a ~64 KB body limit; only enable for tiny payloads
//       const useKeepalive = pdfBlob.size <= 60 * 1024;

//       let res;
//       try {
//         res = await fetch(`${API}/save-pdf`, {
//           method: "POST",
//           body: formData,
//           // only set keepalive if the body is tiny
//           ...(useKeepalive ? { keepalive: true } : {}),
//           headers: { Accept: "application/json" },
//           cache: "no-store",
//         });
//       } catch (e) {
//         // Fallback to Axios if fetch fails (some mobile Safari/Chrome quirks)
//         const axiosRes = await axios.post(`${API}/save-pdf`, formData, {
//           headers: { "Accept": "application/json" },
//           withCredentials: false,
//         });
//         res = new Response(JSON.stringify(axiosRes.data), { status: 200 });
//       }

//       if (!res.ok) {
//         const errJson = await res.json().catch(() => ({}));
//         throw new Error(errJson?.error || `Error ${res.status}`);
//       }

//       // Optional: tiny pause helps some mobile UIs settle
//       await new Promise((r) => setTimeout(r, 50));

//       // Now trigger the local download
//       doc.save("Cotización_Express.pdf");

//       alert("PDF generado y guardado exitosamente.");
//     } catch (err) {
//       console.error("Error saving PDF:", err);
//       alert(
//         `No se pudo guardar el PDF.\n${
//           err?.message || "Revisa tu conexión y vuelve a intentar."
//         }`
//       );
//     }
  
//   };
//   ----> HERE MJ

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

            const combinedMXN = fx ? usdSubtotal * fx + mxnSubtotal : null;
            const combinedMXNIVA = fx ? withIVA(combinedMXN) : null;

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
                        {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")}
                      </label>
                      <label className="summaryTotal-Label">
                        <b>Total a pagar en MXN:</b>{' '}
                        {fx ? fmtMXN(usdSubtotalIVA * fx) : "—"}
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
                      {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")}
                    </label>

                    <label className="summaryTotal-Label">
                      <b>Total a pagar (MXN):</b>{" "}
                      {fx ? fmtMXN(combinedMXNIVA) : "—"}
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


// // following on polishing our PDF, as part of file expressQuote.jsx we allow the user to select currency in which he wants to pay - either USD or MXN. However we have a limitation: If a product is listed in USD, the user can decide to pay either in USD or translate currency to MXN. If a product is listed in MXN it can ONLY be payed in MXN. In mixed orderes, where the user has products in USD and MXN, if user selects paying in USD, he'll have "split total" showing amount to pay in USD for USD-listed products and amount to pay in MXN for MXN-listed products. On the other hand, if the user has mixed order and selects MXN as desired currency, then USD-listed items are converted using DOF Rate and the user is predented with a global total expressed in MXN. As an extra, if a user has a mixed order, please add legend "IMPORTANTE:En órdenes mixtas, donde se tengan articulos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN". Following this logic and with all that is already setup, can you help me add the "financial summaries" for the PDF. Here is current expressQuote.jsx, can you help me do a direct edit to code 
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
//   const [amount, setAmount] = useState("");
//   const [items, setItems] = useState([]);

//   const [price, setPrice] = useState("");                 // numeric string
//   const [priceCurrency, setPriceCurrency] = useState(""); // "USD" | "MXN"
//   // const [priceCurrency, setPriceCurrency] = useState("USD"); // "USD" | "MXN"
//   const [weight, setWeight] = useState("");
//   const [stock, setStock] = useState("");
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

//   // SEP05
//   const [preferredCurrency, setPreferredCurrency] = useState("USD"); // "USD" | "MXN"
//   // SEP05 

//   // ---------- helpers (placed up here so they’re usable below) ----------
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
//   const n = (v) => {
//     const x = parseFloat((v ?? "").toString().replace(/,/g, ""));
//     return Number.isFinite(x) ? x : null;
//   };
//   // ---------------------------------------------------------------------

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
//         // Expect headers: NOMBRE_PRODUCTO, EXISTENCIA (PESO/UNIDAD may exist but are IGNORED)
//         const byName = {};
//         rows.forEach((r) => {
//           const prod = normalize(r.NOMBRE_PRODUCTO || "");
//           const ex = parseFloat((r.EXISTENCIA ?? r.EXISTENCIAS ?? "0").toString().replace(/,/g, ""));
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
//       // setPriceCurrency("USD");
//       setPriceCurrency("");
//       return;
//     }

//     // Common attributes
//     setWeight(baseRow.PESO_PRODUCTO || "");
//     setPackPresentation(baseRow.PRESENTACION_EMPAQUE || "");

//     // 🔁 STOCK SOURCE: LATEST CSV (by product only) with fallback to products CSV
//     const prodKey = normalize(selectedProduct);
//     const latestStock = stockByKey[prodKey];
//     const fallbackStock = baseRow.CANTIDAD_EXISTENCIA
//       ? parseFloat((baseRow.CANTIDAD_EXISTENCIA || "0").toString().replace(/,/g, ""))
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

//   // Add item to wishlist (keep currency on each item)
//   // sep05
// // Replace your current handleAddItem with this one
// const handleAddItem = () => {
//   const baseRow = csvData.find(
//     (r) =>
//       r.NOMBRE_PRODUCTO === selectedProduct &&
//       (r.PESO_PRODUCTO + r.UNIDAD_MEDICION) === presentation
//   );
//   if (!baseRow) return;

//   const inStock = parseInt(stock || "0", 10);
//   const qty = Number(amount) || 0;
//   const unitPrice = Number(price) || 0;

//   if (qty && qty <= inStock && unitPrice) {
//     // Normalize to upper-case and strictly check
//     const cur = (priceCurrency || "").toUpperCase() === "MXN" ? "MXN" : "USD";

//     setItems((prev) => [
//       ...prev,
//       {
//         product: selectedProduct,
//         presentation,
//         packPresentation,
//         amount: qty,
//         price: unitPrice,
//         currency: cur,      // <-- normalized
//         weight: Number(baseRow.PESO_PRODUCTO || 0),
//         preferredCurrency,
//       },
//     ]);

//     // Reset inputs
//     setSelectedProduct("");
//     setPresentation("");
//     setPackPresentation("");
//     setAmount("");
//     setPrice("");
//     setPriceCurrency("USD"); // reset to USD for next entry
//     setWeight("");
//     setStock("");
//     setSpecialApplied(false);
//   }
// };

// console.log("Added item:", {
//   product: selectedProduct,
//   price,
//   priceCurrency,
//   finalCurrency: (priceCurrency || "").toUpperCase()
// });

//   const removeItem = (idx) => {
//     setItems((prev) => prev.filter((_, i) => i !== idx));
//   };

//   // ===== Totals =====
//   const normalizeCur = (val) => {
//     const c = String(val || "").trim().toUpperCase();
//     return c === "MXN" ? "MXN" : "USD";
//   };
  
//   const usdItems = items.filter((it) => normalizeCur(it.currency) === "USD");
//   const mxnItems = items.filter((it) => normalizeCur(it.currency) === "MXN");

//   const totalUSD = usdItems.reduce((sum, it) => sum + it.amount * it.price, 0); // native USD subtotal
//   const totalMXN = mxnItems.reduce((sum, it) => sum + it.amount * it.price, 0); // native MXN subtotal

//   // Cross-currency totals using DOF rate
//   const allUSD = dofRate ? totalUSD + totalMXN / (dofRate.toFixed(2)) : null; // MXN → USD
//   const allMXN = dofRate ? totalMXN + totalUSD * (dofRate.toFixed(2)) : null; // USD → MXN

//   // IVA (apply only to the all-products totals to keep UI tidy)
//   const ivaAllUSD = isActive && allUSD != null ? +(allUSD * 0.16).toFixed(2) : null;
//   const ivaAllMXN = isActive && allMXN != null ? +(allMXN * 0.16).toFixed(2) : null;

//   const allUSDWithIVA = ivaAllUSD != null ? +(allUSD + ivaAllUSD).toFixed(2) : null;
//   const allMXNWithIVA = ivaAllMXN != null ? +(allMXN + ivaAllMXN).toFixed(2) : null;

//   // Formatting helpers
//   const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//   const fmtMXN = (v) => `$${(v ?? 0).toFixed(2)} MXN`;

//   // ======== PDF + Upload (unchanged design; now shows split+global totals & currency) ========  
//   const downloadPDF = async () => {
//     const doc = new jsPDF();
  
//     // Helpers (use same DOF/IVA values already in component state)
//     const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//     const fmtMXN = (v) =>
//   `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

//     const pageWidth = doc.internal.pageSize.getWidth();
//     const pageHeight = doc.internal.pageSize.getHeight();
  
//     // Add background to EVERY page
//     const drawBg = () => doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
//     drawBg();
  
//     // Header
//     doc.setFontSize(10);
//     doc.setFont("custom", "bold");
//     doc.text(`Fecha de Elaboración: ${new Date().toLocaleDateString("es-MX")}`, 195, 15, { align: "right" });
//     doc.text(`Cotización Válida Hasta: ${new Date(Date.now()+30*86400000).toLocaleDateString("es-MX")}`, 195, 20, { align: "right" });
  
//     // Separator
//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 45, 200, 45);
  
//     // Resolve client row (csvClientData is an array)
//     const normalize = (s) => (s ?? "").toString().trim().toLowerCase();
//     const userCreds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     const clientRow = Array.isArray(csvClientData)
//       ? csvClientData.find(r => normalize(r.CORREO_EMPRESA) === normalize(userCreds?.correo))
//       : null;
  
//     // Client section (Shipping)
//     doc.setFontSize(11);
//     doc.setFont("custom", "bold");
//     doc.text("Información de Envío", 13, 51);
  
//     doc.setFontSize(10);
//     doc.addImage(iconBuilding, 13, 53, 5, 5);
//     doc.text(`${clientRow?.NOMBRE_EMPRESA || ""}`, 19, 57);
  
//     doc.addImage(iconContact, 13.5, 59.5, 4, 4);
//     doc.text(`${clientRow?.NOMBRE_APELLIDO || ""}`, 19, 63);
  
//     doc.addImage(iconLocation, 13.7, 65, 3, 4);
//     doc.text(
//       `${(clientRow?.CALLE_ENVIO || "")}  # ${(clientRow?.EXTERIOR_ENVIO || "")}  Int. ${(clientRow?.INTERIOR_ENVIO || "")}`,
//       19, 68
//     );
//     doc.text(`Col. ${clientRow?.COLONIA_ENVIO || ""}`, 19, 72);
//     doc.text(
//       `${clientRow?.CIUDAD_ENVIO || ""}, ${clientRow?.ESTADO_ENVIO || ""}. C.P. ${clientRow?.CP_ENVIO || ""}`,
//       19, 76
//     );
  
//     doc.addImage(iconPhone, 13.7, 78, 3, 4);
//     doc.text(`${clientRow?.TELEFONO_EMPRESA || ""}`, 19, 81.5);
  
//     doc.addImage(iconEmail, 13.7, 84, 4, 3);
//     doc.text(`${clientRow?.CORREO_EMPRESA || userCreds?.correo || ""}`, 19, 87);
  
//     // Billing section
//     doc.setFontSize(11);
//     doc.setFont("custom", "bold");
//     doc.text("Información Fiscal", 100, 51);
  
//     doc.setFontSize(10);
//     doc.text(`Razón Social: ${clientRow?.RAZON_SOCIAL || ""}`, 106, 57);
//     doc.text(`RFC: ${clientRow?.RFC_EMPRESA || ""}`, 106, 63);
  
//     doc.addImage(iconEmail, 100, 65, 4, 3);
//     doc.text(`${clientRow?.CORREO_FISCAL || ""}`, 106, 68);
  
//     doc.addImage(iconLocation, 100.5, 70, 3, 4);
//     doc.text(
//       `${(clientRow?.CALLE_FISCAL || "")}  # ${(clientRow?.EXTERIOR_FISCAL || "")}  Int. ${(clientRow?.INTERIOR_FISCAL || "")}`,
//       106, 73
//     );
//     doc.text(`Col. ${clientRow?.COLONIA_FISCAL || ""}`, 106, 77);
//     doc.text(
//       `${clientRow?.CIUDAD_FISCAL || ""}, ${clientRow?.ESTADO_FISCAL || ""}. C.P. ${clientRow?.CP_FISCAL || ""}`,
//       106, 81
//     );
  
//     // Separator
//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 92, 200, 92);
  
//     // ===== Items table (with currency + packPresentation) =====
//     const tableData = items.map((it) => [
//       it.product,
//       it.presentation,
//       it.packPresentation || "-",                                  // NEW column
//       it.amount,
//       `$${Number(it.price).toFixed(2)} ${it.currency || "USD"}`,    // unit price + currency
//       `$${(Number(it.amount) * Number(it.price)).toFixed(2)} ${it.currency || "USD"}`, // line total + currency
//     ]);
  
//     // ===== Totals (split + all-products w/ DOF) =====

//     // SEP05
//     // ===== Currency-scoped tables (robust partition) =====
    
//     // sep08
//     const toCur = (v) => String(v ?? "").trim().toUpperCase();
//     const itemCur = (it) => toCur(it.currency ?? it.priceCurrency); // prefer item.currency
//     const isMXN = (it) => itemCur(it) === "MXN";
//     const isUSD = (it) => itemCur(it) === "USD";
//     // sep08
//     const normCur = (v) => String(v ?? "").trim().toUpperCase();
//     const getCur = (it) => {
//       // prefer explicit item.currency, fall back to priceCurrency
//       const c = normCur(it.currency || it.priceCurrency);
//       return c === "MXN" ? "MXN" : "USD"; // default unknowns to USD
//     };

//     // Partition once using normalized currency
//     const usdItems = items.filter(isUSD);
//     const mxnItems = items.filter(isMXN);

//     // (optional, for debugging)
//     const unknownItems = items.filter((it) => !isUSD(it) && !isMXN(it));
//     // sep08

//     const sectionTitle = (text, y) => {
//       doc.setFontSize(12);
//       doc.setFont("helvetica", "bold");
//       doc.text(text, 13, y);
//     };

//     const makeBody = (arr) =>
//       arr.map((it) => {
//         const cur  = itemCur(it) || "—";           // don't silently call it USD
//         const unit = Number(it.price) || 0;
//         const qty  = Number(it.amount) || 0;
//         return [
//           it.product,
//           it.presentation,
//           it.packPresentation || "-",
//           String(qty),
//           `$${unit.toFixed(2)} ${cur}`,
//           `$${(qty * unit).toFixed(2)} ${cur}`,
//         ];
//       });


// let cursorY = 105;

// // --- USD section ---
// if (usdItems.length) {
//   doc.setTextColor(24, 144, 69);
//   sectionTitle("Artículos en USD", cursorY - 6);

//   autoTable(doc, {
//     head: [["Producto", "Presentación", "Empaque", "Cantidad", "Precio Unitario", "Total"]],
//     body: makeBody(usdItems),
//     startY: cursorY,
//     headStyles: { fillColor: [149, 194, 61], textColor: [0, 0, 0], fontStyle: "bold" },
//     styles: { fontSize: 9 },
//     margin: { top: 100, right: 10, bottom: 20, left: 10 },
//     didDrawPage: (data) => { if (data.pageNumber > 1) drawBg(); }
//   });

//   // Subtotal USD
//   cursorY = doc.lastAutoTable.finalY + 6;
//   const subtotalUSD = usdItems.reduce((sum, it) => sum + (Number(it.amount)||0) * (Number(it.price)||0), 0);
//   doc.setFontSize(11);
//   doc.setTextColor(0, 0, 0);
//   doc.setFont("helvetica", "bold");
//   doc.text(`Subtotal USD: $${subtotalUSD.toFixed(2)} USD`, 140, cursorY);
//   cursorY += 12;
// }

// // --- MXN section ---
// if (mxnItems.length) {
//   doc.setTextColor(24, 144, 69);
//   sectionTitle("Artículos en MXN", cursorY - 6);

//   autoTable(doc, {
//     head: [["Producto", "Presentación", "Empaque", "Cantidad", "Precio Unitario", "Total"]],
//     body: makeBody(mxnItems),
//     startY: cursorY,
//     headStyles: { fillColor: [149, 194, 61], textColor: [0, 0, 0], fontStyle: "bold" },
//     styles: { fontSize: 9 },
//     margin: { top: 100, right: 10, bottom: 20, left: 10 },
//     didDrawPage: (data) => { if (data.pageNumber > 1) drawBg(); }
//   });

//   // Subtotal MXN
//   cursorY = doc.lastAutoTable.finalY + 6;
//   const subtotalMXN = mxnItems.reduce((sum, it) => sum + (Number(it.amount)||0) * (Number(it.price)||0), 0);
//   doc.setFontSize(11);
//   doc.setTextColor(0, 0, 0);
//   doc.setFont("helvetica", "bold");
//   doc.text(
//     `Subtotal MXN: $${subtotalMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`,
//     140,
//     cursorY
//   );
//   cursorY += 12;
// }

// // --->

// {
//   // Subtotales nativos
//   const subtotalUSD = usdItems.reduce((s, it) => s + (Number(it.amount)||0) * (Number(it.price)||0), 0);
//   const subtotalMXN = mxnItems.reduce((s, it) => s + (Number(it.amount)||0) * (Number(it.price)||0), 0);

//   // Utilidades
//   const rate = Number(dofRate) || 0;                  // MXN por USD
//   const iva16 = (v) => (isActive ? +(v * 0.16).toFixed(2) : 0);
//   const hasUSD = usdItems.length > 0;
//   const hasMXN = mxnItems.length > 0;
//   const isMixed = hasUSD && hasMXN;
//   const wantsMXN = (preferredCurrency || "USD").toUpperCase() === "MXN";

//   // Título (fuera de la caja)
//   doc.setFontSize(12);
//   doc.setFont("helvetica", "bold");
//   doc.text("Resumen Financiero", 13, cursorY);
//   cursorY += 6;

//   // ---- Caja: parámetros ----
//   const boxX = 12;
//   const boxW = 186;
//   const boxPad = 4;
//   const textMaxW = boxW - boxPad * 2;
//   const lineH = 6;

//   // Pre-cálculos de líneas para MXN-seleccionado
//   const usdEnMXN = rate ? subtotalUSD * rate : 0;
//   const baseMXN_Mixed = subtotalMXN + usdEnMXN;
//   const totalMXN_Mixed = baseMXN_Mixed + iva16(baseMXN_Mixed);
//   const totalUSD_only = subtotalUSD + iva16(subtotalUSD);
//   const totalMXN_only = subtotalMXN + iva16(subtotalMXN);

//   // Medición previa para definir alto de la caja (con el orden nuevo)
//   const measureSummary = () => {
//     let y = cursorY + boxPad;

//     // (1) Moneda de pago (bold) — 1 línea
//     y += lineH;

//     if (wantsMXN) {
//       // --- Orden para MXN seleccionado ---
//       // (2) Total a Pagar en MXN
//       y += lineH;

//       // (3) Detalle: USD… (solo si hay USD o mixta con TC)
//       if (isMixed || hasUSD) {
//         const det = rate
//           ? (isMixed
//               ? `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(usdEnMXN)}; + MXN nativo ${fmtMXN(subtotalMXN)}.`
//               : `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(usdEnMXN)}.`)
//           : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//         const detLines = doc.splitTextToSize(det, textMaxW);
//         y += detLines.length * 5 + 3;
//       }

//       // (4) Tipo de cambio (si hay rate o si es útil mostrarlo)
//       if ((isMixed || hasUSD) && rate) {
//         y += 5;
//       }

//       // (5) IMPORTANTE (solo mixtas)
//       if (isMixed) {
//         const legend = "IMPORTANTE: En órdenes mixtas, donde se tengan artículos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN.";
//         const legendLines = doc.splitTextToSize(legend, textMaxW);
//         y += legendLines.length * 5 + 5;
//       }
//     } else {
//       // --- Orden para USD seleccionado ---
//       // (2) A Pagar en USD (si hay USD)
//       if (hasUSD) y += lineH;

//       // (3) A Pagar en MXN (si hay MXN o mixta)
//       if (hasMXN) y += lineH;

//       // (4) Tipo de cambio (lo mostramos si es mixto y hay rate como referencia)
//       if (isMixed && rate) {
//         y += 5;
//       }

//       // (5) IMPORTANTE (solo mixtas)
//       if (isMixed) {
//         const legend = "IMPORTANTE: En órdenes mixtas, donde se tengan artículos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN.";
//         const legendLines = doc.splitTextToSize(legend, textMaxW);
//         y += legendLines.length * 5 + 5;
//       }

//       // Caso especial: preferencia USD pero solo MXN-items
//       if (!hasUSD && hasMXN) {
//         // Total MXN + nota
//         y += lineH; // total MXN
//         const note = "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
//         const noteLines = doc.splitTextToSize(note, textMaxW);
//         y += noteLines.length * 5 + 3;
//       }
//     }

//     return y + boxPad;
//   };

//   const boxBottom = measureSummary();
//   const boxHeight = Math.max(12, boxBottom - cursorY);

//   // Dibuja caja gris con bordes redondeados
//   doc.setFillColor(241, 241, 241);
//   doc.setDrawColor(200, 200, 200);
//   const r = 2.5; // radio de esquina
//   if (typeof doc.roundedRect === "function") {
//     doc.roundedRect(boxX, cursorY, boxW, boxHeight, r, r, "FD");
//   } else {
//     // fallback si la versión de jsPDF no tiene roundedRect
//     doc.rect(boxX, cursorY, boxW, boxHeight, "FD");
//   }

//   // ---- Render real con el nuevo orden ----
//   let y = cursorY + boxPad;

//   // (1) Moneda de pago (bold)
//   doc.setFontSize(10);
//   doc.setFont("helvetica", "bold");
//   doc.text(`Moneda de pago seleccionada: ${preferredCurrency || "USD"}`, boxX + boxPad, y + 3);
//   y += lineH;
//   doc.setFont("helvetica", "normal");

//   if (wantsMXN) {
//     // === Usuario seleccionó MXN ===

//     // (2) Total a Pagar en MXN
//     if (isMixed) {
//       if (!rate) {
//         // No rate → no es posible total global MXN
//         doc.setTextColor(180, 0, 0);
//         const err = "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//         const errLines = doc.splitTextToSize(err, textMaxW);
//         doc.text(errLines, boxX + boxPad, y);
//         doc.setTextColor(0, 0, 0);
//         y += errLines.length * 5 + 3;
//       } else {
//         doc.text(
//           `Total a pagar en MXN: ${fmtMXN(totalMXN_Mixed)}` + (isActive ? " (incluye IVA 16%)" : ""),
//           boxX + boxPad,
//           y + 3
//         );
//         y += lineH;

//         // (3) Detalle
//         doc.setFontSize(9);
//         doc.setTextColor(120,120,120);
//         const det = `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(usdEnMXN)}; + MXN nativo ${fmtMXN(subtotalMXN)}.`;
//         const detLines = doc.splitTextToSize(det, textMaxW);
//         doc.text(detLines, boxX + boxPad, y + 3);
//         y += detLines.length * 5 + 3;

//         // (4) Tipo de cambio
//         doc.text(`Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD` + (dofDate ? `  (Fecha: ${dofDate})` : ""), boxX + boxPad, y + 2);
//         doc.setTextColor(0,0,0);
//         doc.setFontSize(10);
//         y += 5;
//       }
//     } else if (hasUSD) {
//       // Solo USD → convertir todo
//       if (!rate) {
//         doc.setTextColor(180, 0, 0);
//         const err = "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total en MXN.";
//         const errLines = doc.splitTextToSize(err, textMaxW);
//         doc.text(errLines, boxX + boxPad, y);
//         doc.setTextColor(0, 0, 0);
//         y += errLines.length * 5 + 3;
//       } else {
//         const base = subtotalUSD * rate;
//         const total = base + iva16(base);
//         doc.text(`Total a pagar en MXN: ${fmtMXN(total)}` + (isActive ? " (incluye IVA 16%)" : ""), boxX + boxPad, y);
//         y += lineH;

//         // (3) Detalle
//         doc.setFontSize(9);
//         doc.setTextColor(120,120,120);
//         const det = `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(base)}.`;
//         const detLines = doc.splitTextToSize(det, textMaxW);
//         doc.text(detLines, boxX + boxPad, y);
//         y += detLines.length * 5 + 3;

//         // (4) Tipo de cambio
//         doc.text(`Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD` + (dofDate ? `  (Fecha: ${dofDate})` : ""), boxX + boxPad, y);
//         doc.setTextColor(0,0,0);
//         doc.setFontSize(10);
//         y += 5;
//       }
//     } else {
//       // Solo MXN
//       doc.text(`Total a pagar en MXN: ${fmtMXN(totalMXN_only)}` + (isActive ? " (incluye IVA 16%)" : ""), boxX + boxPad, y);
//       y += lineH;
//     }

//     // (5) IMPORTANTE (solo mixtas)
//     if (isMixed) {
//       doc.setTextColor(180, 0, 0);
//       doc.setFont("helvetica", "bold");
//       const legend = "IMPORTANTE: En órdenes mixtas, donde se tengan artículos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN.";
//       const legendLines = doc.splitTextToSize(legend, textMaxW);
//       doc.text(legendLines, boxX + boxPad, y + 3);
//       y += legendLines.length * 5 + 5;
//       doc.setTextColor(0, 0, 0);
//       doc.setFont("helvetica", "normal");
//     }
//   } else {
//     // === Usuario seleccionó USD ===

//     // (2) A Pagar en USD
//     if (hasUSD) {
//       doc.text(
//         `A pagar en USD (artículos en USD): ${fmtUSD(totalUSD_only)}` + (isActive ? " (incluye IVA 16%)" : ""),
//         boxX + boxPad,
//         y + 3
//       );
//       y += lineH;
//     }

//     // (3) A Pagar en MXN
//     if (hasMXN) {
//       doc.text(
//         `A pagar en MXN (artículos en MXN): ${fmtMXN(totalMXN_only)}` + (isActive ? " (incluye IVA 16%)" : ""),
//         boxX + boxPad,
//         y + 3
//       );
//       y += lineH;
//     }

//     // (4) Tipo de cambio (referencia en mixtas)
//     if (isMixed && rate) {
//       doc.setFontSize(9);
//       doc.setTextColor(120,120,120);
//       doc.text(`Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD` + (dofDate ? `  (Fecha: ${dofDate})` : ""), boxX + boxPad, y + 3);
//       doc.setTextColor(0,0,0);
//       doc.setFontSize(10);
//       y += 5;
//     }

//     // (5) IMPORTANTE (solo mixtas)
//     if (isMixed) {
//       doc.setTextColor(180, 0, 0);
//       doc.setFont("helvetica", "bold");
//       const legend = "IMPORTANTE: En órdenes mixtas, donde se tengan artículos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN.";
//       const legendLines = doc.splitTextToSize(legend, textMaxW);
//       doc.text(legendLines, boxX + boxPad, y + 5);
//       y += legendLines.length * 5 + 5;
//       doc.setTextColor(0, 0, 0);
//       doc.setFont("helvetica", "normal");
//     }

//     // Caso especial: preferencia USD pero solo MXN
//     if (!hasUSD && hasMXN) {
//       doc.setFontSize(9);
//       doc.setTextColor(120,120,120);
//       const note = "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
//       const noteLines = doc.splitTextToSize(note, textMaxW);
//       doc.text(noteLines, boxX + boxPad, y);
//       doc.setTextColor(0,0,0);
//       doc.setFontSize(10);
//       y += noteLines.length * 5 + 3;
//     }
//   }

//   // Avanza cursor debajo de la caja
//   cursorY = cursorY + boxHeight + 4;
// }

// // {
// //   // Subtotales nativos
// //   const subtotalUSD = usdItems.reduce((s, it) => s + (Number(it.amount)||0) * (Number(it.price)||0), 0);
// //   const subtotalMXN = mxnItems.reduce((s, it) => s + (Number(it.amount)||0) * (Number(it.price)||0), 0);

// //   // Utilidades
// //   const rate = Number(dofRate) || 0;                  // MXN por USD
// //   const iva16 = (v) => (isActive ? +(v * 0.16).toFixed(2) : 0);
// //   const hasUSD = usdItems.length > 0;
// //   const hasMXN = mxnItems.length > 0;
// //   const isMixed = hasUSD && hasMXN;

// //   // Título
// //   doc.setFontSize(12);
// //   doc.setFont("helvetica", "bold");
// //   doc.text("Resumen Financiero", 13, cursorY);
// //   cursorY += 6;

// //   // Moneda preferida (mostramos al usuario lo que eligió)
// //   doc.setFontSize(10);
// //   doc.setFont("helvetica", "normal");
// //   doc.text(`Moneda de pago seleccionada: ${preferredCurrency || "USD"}`, 13, cursorY);
// //   cursorY += 6;

// //   // Leyenda obligatoria en órdenes mixtas
// //   if (isMixed) {
// //     doc.setTextColor(180, 0, 0);
// //     doc.setFont("helvetica", "bold");
// //     doc.text(
// //       "IMPORTANTE: En órdenes mixtas, donde se tengan artículos cotizados tanto en USD como en MXN, los artículos cotizados en MXN deben pagarse en MXN.",
// //       13,
// //       cursorY,
// //       { maxWidth: 184 }
// //     );
// //     doc.setTextColor(0, 0, 0);
// //     doc.setFont("helvetica", "normal");
// //     cursorY += 10;
// //   }

// //   // Ramas segun preferencia
// //   if ((preferredCurrency || "USD").toUpperCase() === "USD") {
// //     // --- Usuario quiere pagar en USD ---
// //     if (isMixed) {
// //       // Split total: USD por USD-items, MXN por MXN-items (sin convertir)
// //       const totalUSD = subtotalUSD + iva16(subtotalUSD);
// //       const totalMXN = subtotalMXN + iva16(subtotalMXN);

// //       doc.text(`A pagar en USD (artículos en USD): ${fmtUSD(totalUSD)}` + (isActive ? " (incluye IVA 16%)" : ""), 13, cursorY);
// //       cursorY += 6;
// //       doc.text(
// //         `A pagar en MXN (artículos en MXN): ${fmtMXN(totalMXN)}` + (isActive ? " (incluye IVA 16%)" : ""),
// //         13,
// //         cursorY
// //       );
// //       cursorY += 8;

// //       if (rate) {
// //         doc.setFontSize(9);
// //         doc.setTextColor(120,120,120);
// //         doc.text(`Tipo de cambio DOF: ${rate.toFixed(4)} MXN/USD` + (dofDate ? `  (Fecha: ${dofDate})` : ""), 13, cursorY);
// //         doc.setTextColor(0,0,0);
// //         cursorY += 6;
// //       }
// //     } else if (hasUSD) {
// //       // Solo USD-items → total en USD
// //       const total = subtotalUSD + iva16(subtotalUSD);
// //       doc.text(`Total a pagar: ${fmtUSD(total)}` + (isActive ? " (incluye IVA 16%)" : ""), 13, cursorY);
// //       cursorY += 8;
// //     } else {
// //       // Solo MXN-items → por regla, deben pagarse en MXN, aunque la preferencia sea USD
// //       const total = subtotalMXN + iva16(subtotalMXN);
// //       doc.text(
// //         `Total a pagar: ${fmtMXN(total)}` + (isActive ? " (incluye IVA 16%)" : ""),
// //         13,
// //         cursorY
// //       );
// //       cursorY += 6;
// //       doc.setFontSize(9);
// //       doc.setTextColor(120,120,120);
// //       doc.text("Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.", 13, cursorY);
// //       doc.setTextColor(0,0,0);
// //       cursorY += 6;
// //     }
// //   } else {
// //     // --- Usuario quiere pagar en MXN ---
// //     if (isMixed) {
// //       // Convertir USD→MXN y sumar con MXN nativo
// //       if (!rate) {
// //         doc.setTextColor(180, 0, 0);
// //         doc.text("No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.", 13, cursorY, { maxWidth: 184 });
// //         doc.setTextColor(0, 0, 0);
// //         cursorY += 8;
// //       } else {
// //         const usdEnMXN = subtotalUSD * rate;
// //         const base = subtotalMXN + usdEnMXN;
// //         const total = base + iva16(base);

// //         doc.text(
// //           `Total global a pagar en MXN: ${fmtMXN(total)}` + (isActive ? " (incluye IVA 16%)" : ""),
// //           13,
// //           cursorY
// //         );
// //         cursorY += 6;

// //         doc.setFontSize(9);
// //         doc.setTextColor(120,120,120);
// //         doc.text(
// //           `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(4)} = ${fmtMXN(usdEnMXN)}; + MXN nativo ${fmtMXN(subtotalMXN)}.`,
// //           13,
// //           cursorY,
// //           { maxWidth: 184 }
// //         );
// //         cursorY += 6;
// //         doc.text(`Tipo de cambio DOF: ${rate.toFixed(4)} MXN/USD` + (dofDate ? `  (Fecha: ${dofDate})` : ""), 13, cursorY);
// //         doc.setTextColor(0,0,0);
// //         doc.setFontSize(10);
// //         cursorY += 6;
// //       }
// //     } else if (hasUSD) {
// //       // Solo USD-items → convertir todo a MXN
// //       if (!rate) {
// //         doc.setTextColor(180, 0, 0);
// //         doc.text("No se pudo obtener el tipo de cambio DOF; no es posible calcular el total en MXN.", 13, cursorY, { maxWidth: 184 });
// //         doc.setTextColor(0, 0, 0);
// //         cursorY += 8;
// //       } else {
// //         const base = subtotalUSD * rate;
// //         const total = base + iva16(base);
// //         doc.text(
// //           `Total a pagar en MXN: ${fmtMXN(total)}` + (isActive ? " (incluye IVA 16%)" : ""),
// //           13,
// //           cursorY
// //         );
// //         cursorY += 6;

// //         doc.setFontSize(9);
// //         doc.setTextColor(120,120,120);
// //         doc.text(
// //           `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(4)} = ${fmtMXN(base)}.`,
// //           13,
// //           cursorY
// //         );
// //         doc.setTextColor(0,0,0);
// //         doc.setFontSize(10);
// //         cursorY += 6;
// //       }
// //     } else {
// //       // Solo MXN-items → pagar en MXN (sin conversion)
// //       const total = subtotalMXN + iva16(subtotalMXN);
// //       doc.text(`Total a pagar en MXN: ${fmtMXN(total)}` + (isActive ? " (incluye IVA 16%)" : ""), 13, cursorY);
// //       cursorY += 8;
// //     }
// //   }
// // }

// // ----> 

//     // --- Build the PDF once ---
//     const pdfBlob = doc.output("blob");

//     // --- Upload FIRST (mobile-safe with keepalive only if small) ---
//     try {
//       if (!navigator.onLine) throw new Error("Sin conexión a Internet.");

//       const formData = new FormData();
//       formData.append("pdf", pdfBlob, "Cotización_Express.pdf"); // filename is important
//       formData.append(
//         "metadata",
//         JSON.stringify({
//           userEmail: userCreds?.correo,
//           createdAt: new Date().toISOString(),
//           totals: {
//             totalUSD,
//             totalMXN,
//             allUSD,
//             allMXN,
//             allUSDWithIVA,
//             allMXNWithIVA,
//             dofRate,
//             dofDate,
//             ivaApplied: !!isActive,
//           },
//           items,
//         })
//       );

//       // keepalive has a ~64 KB body limit; only enable for tiny payloads
//       const useKeepalive = pdfBlob.size <= 60 * 1024;

//       let res;
//       try {
//         res = await fetch(`${API}/save-pdf`, {
//           method: "POST",
//           body: formData,
//           // only set keepalive if the body is tiny
//           ...(useKeepalive ? { keepalive: true } : {}),
//           headers: { Accept: "application/json" },
//           cache: "no-store",
//         });
//       } catch (e) {
//         // Fallback to Axios if fetch fails (some mobile Safari/Chrome quirks)
//         const axiosRes = await axios.post(`${API}/save-pdf`, formData, {
//           headers: { "Accept": "application/json" },
//           withCredentials: false,
//         });
//         res = new Response(JSON.stringify(axiosRes.data), { status: 200 });
//       }

//       if (!res.ok) {
//         const errJson = await res.json().catch(() => ({}));
//         throw new Error(errJson?.error || `Error ${res.status}`);
//       }

//       // Optional: tiny pause helps some mobile UIs settle
//       await new Promise((r) => setTimeout(r, 50));

//       // Now trigger the local download
//       doc.save("Cotización_Express.pdf");

//       alert("PDF generado y guardado exitosamente.");
//     } catch (err) {
//       console.error("Error saving PDF:", err);
//       alert(
//         `No se pudo guardar el PDF.\n${
//           err?.message || "Revisa tu conexión y vuelve a intentar."
//         }`
//       );
//     }
  
//   };
  
//   const submitOrder = () => {
//      // pass items + preferredCurrency to OrderNow
//     localStorage.setItem("discountTotal", "0");
//     localStorage.setItem("billRequest", JSON.stringify(isActive));
//     navigate("/orderNow", { state: { items, preferredCurrency } }); // <-- add this
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
//       <label className="sectionHeader-Label">¡Haz tu pedido!</label>

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
//           {/* {specialApplied && (
//             <div style={{ fontSize: 12, color: "#26a269", marginTop: 4 }}>
//               Precio especial aplicado para tu cuenta
//             </div>
//           )} */}
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
//             Lo sentimos, por el momento no contamos con suficiente disponibilidad de este producto.
//             <br />
//             {/* Unidades disponibles: {stock || 0} */}
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
//         {/* SEP05 */}
//         {/* ===== NEW SUMMARY BOX WITH TOGGLE + RULES ===== */}
//         <label className="newUserData-Label">Resumen financiero</label>

//         {/* Toggle */}
//         <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, marginLeft: 55, marginTop: 5 }}>
//           <span style={{ fontSize: 13, color: "#333" }}>Moneda preferida:</span>

//           <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
//             <input
//               type="radio"
//               name="prefCurrency"
//               value="USD"
//               checked={preferredCurrency === "USD"}
//               onChange={() => setPreferredCurrency("USD")}
//             />
//             USD
//           </label>

//           <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
//             <input
//               type="radio"
//               name="prefCurrency"
//               value="MXN"
//               checked={preferredCurrency === "MXN"}
//               onChange={() => setPreferredCurrency("MXN")}
//               disabled={!dofRate} // need FX to combine/convert
//             />
//             MXN
//           </label>
//         </div>

//         {(() => {
//           const hasUSD = totalUSD > 0;
//           const hasMXN = totalMXN > 0;
//           const onlyUSD = hasUSD && !hasMXN;
//           const mixed = hasUSD && hasMXN;

//           const fx = Number.isFinite(dofRate) ? Number(dofRate) : null;

//           // Helpers
//           const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//           const fmtMXN = (v) =>
//             `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

//           // IVA helpers
//           const withIVA = (v) => (isActive ? v * 1.16 : v);

//           // Precompute subtotals with/without IVA
//           const usdSubtotal = totalUSD;
//           const mxnSubtotal = totalMXN;

//           const usdSubtotalIVA = withIVA(usdSubtotal);
//           const mxnSubtotalIVA = withIVA(mxnSubtotal);

//           // Combined MXN (for mixed/MXN pref and onlyUSD/MXN pref)
//           const combinedMXN = fx ? usdSubtotal * fx + mxnSubtotal : null;
//           const combinedMXNIVA = fx ? withIVA(combinedMXN) : null;

//           // Only-USD cart behavior
//           if (onlyUSD) {
//             return (
//               <div className="quoter-summaryDiv">
//                 <label className="summary-Label">
//                   <b>Subtotal artículos en USD:</b> {fmtUSD(usdSubtotal)}
//                 </label>

//                 {preferredCurrency === "USD" ? (
//                   <>
//                     <label className="summaryTotal-Label">
//                       <b>Total a pagar en USD:</b> {fmtUSD(usdSubtotalIVA)}
//                     </label>
//                   </>
//                 ) : (
//                   <>
//                     <label className="summary-Label">
//                       <b>Tipo de cambio:</b>{" "}
//                       {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")}
//                     </label>
//                     <label className="summaryTotal-Label">
//                       <b>Total a pagar en MXN:</b>{" "}
//                       {fx ? fmtMXN(usdSubtotalIVA * (fx).toFixed(2)) : "—"}
//                     </label>
//                   </>
//                 )}
//               </div>
//             );
//           }

//           // Mixed cart behavior (USD + MXN)
//           if (mixed) {
//             if (preferredCurrency === "USD") {
//               // USD preferred → MXN items MUST stay in MXN (two amounts)
//               return (
//                 <div className="quoter-summaryDiv">
//                   <label className="summary-Label">
//                     <b>Subtotal artículos en USD:</b> {fmtUSD(usdSubtotal)}
//                   </label>
//                   <label className="summary-Label">
//                     <b>Subtotal artículos en MXN:</b> {fmtMXN(mxnSubtotal)}
//                   </label>

//                   <label className="summaryTotal-Label">
//                     <b>Total a pagar en USD:</b> {fmtUSD(usdSubtotalIVA)}
//                   </label>
//                   <label className="summaryTotal-Label">
//                     <b>Total a pagar en MXN:</b> {fmtMXN(mxnSubtotalIVA)}
//                   </label>

//                   <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
//                     En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.
//                   </div>
//                 </div>
//               );
//             } else {
//               // MXN preferred → combinar todo a MXN
//               return (
//                 <div className="quoter-summaryDiv">
//                   <label className="summary-Label">
//                     <b>Subtotal artículos en USD:</b> {fmtUSD(usdSubtotal)}
//                   </label>
//                   <label className="summary-Label">
//                     <b>Subtotal artículos en MXN:</b> {fmtMXN(mxnSubtotal)}
//                   </label>
//                   <label className="summary-Label">
//                     <b>Tipo de cambio:</b>{" "}
//                     {fx ? `$${fx.toFixed(2)} MXN/USD` : (fxError || "Cargando tipo de cambio...")}
//                   </label>

//                   <label className="summaryTotal-Label">
//                     <b>Total a pagar (MXN):</b>{" "}
//                     {fx ? fmtMXN(combinedMXNIVA) : "—"}
//                   </label>
//                 </div>
//               );
//             }
//           }

//           // Only-MXN cart (edge case — no USD)
//           return (
//             <div className="quoter-summaryDiv">
//               <label className="summary-Label">
//                 <b>Subtotal MXN (artículos en MXN):</b> {fmtMXN(mxnSubtotal)}
//               </label>
//               <label className="summaryTotal-Label">
//                 <b>Total a pagar (MXN):</b> {fmtMXN(mxnSubtotalIVA)}
//               </label>
//             </div>
//           );
//         })()}
//         {/* SEP05 */}

//         <div className="newOrderActionButtons-Div">
//            <button className="submitOrder-Btn" type="button" onClick={submitOrder}>
//              Hacer Pedido
//            </button>
//          </div>
//       </div>
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
