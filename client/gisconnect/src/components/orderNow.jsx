import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { API } from "/src/lib/api";

import Papa from "papaparse";
import fallbackImg from "../assets/images/Product_GISSample.png";

import Logo from "/src/assets/images/GIS_Logo.png";
import CarritoIcono from "/src/assets/images/Icono_Carrito.png";

import iconBuilding from "../assets/images/iconBuilding.png";
import iconContact from "../assets/images/iconContact.png";
import iconLocation from "../assets/images/iconLocation.png";
import iconPhone from "../assets/images/iconPhone.png";
import iconEmail from "../assets/images/iconEmail.png";

import { docDesign } from "/src/components/documentDesign";

export default function OrderNow() {
  const navigate = useNavigate();
  const location = useLocation();

  const items = location.state?.items || [];
  const preferredCurrency = (location.state?.preferredCurrency || "USD").toUpperCase();

  const [discountTotal, setDiscountTotal] = useState("");
  const [requestBill, setRequestBill] = useState("");
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [imageLookup, setImageLookup] = useState({});

  const [shippingPrefs, setShippingPrefs] = useState({
    preferredCarrier: "",
    insureShipment: false,
  });

  // DOF FX
  const [dofRate, setDofRate] = useState(null);
  const [dofDate, setDofDate] = useState(null);
  const [fxError, setFxError] = useState(null);

  // NEW: helper to truncate to 2 decimals (not round)
  const trunc2 = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return null;
    return Math.trunc(x * 100) / 100;
  };
  
  // NEW: effective rate used across the app
  const dof2 = useMemo(() => trunc2(dofRate), [dofRate]);

  // Credit
  const CREDIT_SHEET_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSahPxZ8Xq6jSlgWh7F7Rm7wqDsSyBrb6CEFdsEjyXYSkcsS62yXpiGb9GqIu8c4An3l7yBUbpe23hY/pub?gid=0&single=true&output=csv";

  const [creditRow, setCreditRow] = useState(null);
  const [creditAllowed, setCreditAllowed] = useState(false);
  const [creditBlocked, setCreditBlocked] = useState(false);
  const [creditDays, setCreditDays] = useState(0);
  const [paymentOption, setPaymentOption] = useState("Contado");

  // product image key
  const makeKey = (name = "", pres = "") =>
    `${name}`.trim().toLowerCase() + "__" + `${pres}`.trim().toLowerCase();

  // Helpers to pick newest Mongo address
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

  const [newestShipping, setNewestShipping] = useState(null);
  const [newestBilling, setNewestBilling] = useState(null);

  // Mongo user profile for PDF header
  const [userProfile, setUserProfile] = useState({
    empresa: "",
    nombre: "",
    apellido: "",
    correo: "",
  });

  // product images from CSV
  useEffect(() => {
    const csvUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

    axios
      .get(csvUrl)
      .then((response) => {
        Papa.parse(response.data, {
          header: true,
          skipEmptyLines: true,
          complete: ({ data }) => {
            const map = {};
            data.forEach((row) => {
              const name = row.NOMBRE_PRODUCTO || "";
              const pres = row.PESO_PRODUCTO + row.UNIDAD_MEDICION || "";
              const img = row.IMAGE_URL || row.IMAGE || "";
              if (name && pres && img) map[makeKey(name, pres)] = img;
            });
            setImageLookup(map);
          },
        });
      })
      .catch((err) => console.error("Error fetching product CSV:", err));
  }, []);

  const getItemImage = (item) => {
    const url = imageLookup[makeKey(item.product, item.presentation)];
    return url && url.length > 0 ? url : fallbackImg;
  };

  // DOF rate
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

  // localStorage bits
  useEffect(() => {
    const savedDiscount = localStorage.getItem("discountTotal");
    setDiscountTotal(savedDiscount || "0");
    const savedRequestBill = localStorage.getItem("billRequest");
    setRequestBill(savedRequestBill === "true" ? "true" : "false");
    setWantsInvoice(savedRequestBill === "true");
  }, []);

  // user + addresses
  const [userCredentials, setUserCredentials] = useState([]);
  const [shippingOptions, setShippingOptions] = useState([]);
  const [billingOptions, setBillingOptions] = useState([]);

  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [selectedBillingId, setSelectedBillingId] = useState("");

  useEffect(() => {
    const savedCreds = JSON.parse(localStorage.getItem("userLoginCreds"));
    setUserCredentials(savedCreds || []);
    fetchCSVClientData();
  }, []);

  // Client DB (also used now to read DESGLOSE_IVA flag)
  const [csvClientData, setCsvClientData] = useState([]);
  const fetchCSVClientData = () => {
    const csvClientUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
    axios
      .get(csvClientUrl)
      .then((response) => {
        const rows = response.data.split(/\r\n/);
        const headers = rows[0].split(",");
        const data = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i].split(",");
          const obj = {};
          headers.forEach((h, idx) => (obj[h] = r[idx]));
          data.push(obj);
        }
        setCsvClientData(data);
      })
      .catch((error) => {
        console.error("Error fetching CSV data:", error);
      });
  };

  // row for the logged-in user (by CORREO_EMPRESA)
  const clientRowFromCSV = useMemo(() => {
    if (!userCredentials?.correo || csvClientData.length === 0) return null;
    return csvClientData.find(
      (r) =>
        (r.CORREO_EMPRESA || "").trim().toLowerCase() ===
        (userCredentials.correo || "").trim().toLowerCase()
    );
  }, [csvClientData, userCredentials?.correo]);

  // Client full name (kept for credit lookup)
  const clientNameFromSheet = useMemo(() => {
    return (clientRowFromCSV?.NOMBRE_APELLIDO || "").trim();
  }, [clientRowFromCSV]);

  // === NEW: whether we must show the IVA breakdown when wantsInvoice === true
  const wantsDesgloseIVA = useMemo(() => {
    if (!wantsInvoice) return false;
    const v = (clientRowFromCSV?.DESGLOSE_IVA || "").trim().toLowerCase();
    return v === "si" || v === "sí";
  }, [wantsInvoice, clientRowFromCSV?.DESGLOSE_IVA]);


  // keep legacy fallbacks (unused in header now, but left intact)
  let telefonoEmpresa,
    correoEmpresa,
    nombreEmpresa,
    nombreEncargado,
    calleEnvio,
    exteriorEnvio,
    interiorEnvio,
    coloniaEnvio,
    ciudadEnvio,
    estadoEnvio,
    cpEnvio,
    razonSocial,
    rfcEmpresa,
    correoFiscal,
    calleFiscal,
    exteriorFiscal,
    interiorFiscal,
    coloniaFiscal,
    ciudadFiscal,
    estadoFiscal,
    cpFiscal;

  for (let i in csvClientData) {
    if (csvClientData[i].CORREO_EMPRESA === userCredentials.correo) {
      telefonoEmpresa = csvClientData[i].TELEFONO_EMPRESA;
      correoEmpresa = csvClientData[i].CORREO_EMPRESA;
      nombreEmpresa = csvClientData[i].NOMBRE_EMPRESA;
      nombreEncargado = csvClientData[i].NOMBRE_APELLIDO;

      calleEnvio = csvClientData[i].CALLE_ENVIO;
      exteriorEnvio = csvClientData[i].EXTERIOR_ENVIO;
      interiorEnvio = csvClientData[i].INTERIOR_ENVIO;
      coloniaEnvio = csvClientData[i].COLONIA_ENVIO;
      ciudadEnvio = csvClientData[i].CIUDAD_ENVIO;
      estadoEnvio = csvClientData[i].ESTADO_ENVIO;
      cpEnvio = csvClientData[i].CP_ENVIO;

      razonSocial = csvClientData[i].RAZON_SOCIAL;
      rfcEmpresa = csvClientData[i].RFC_EMPRESA;
      correoFiscal = csvClientData[i].CORREO_FISCAL;
      calleFiscal = csvClientData[i].CALLE_FISCAL;
      exteriorFiscal = csvClientData[i].EXTERIOR_FISCAL;
      interiorFiscal = csvClientData[i].INTERIOR_FISCAL;
      coloniaFiscal = csvClientData[i].COLONIA_FISCAL;
      ciudadFiscal = csvClientData[i].CIUDAD_FISCAL;
      estadoFiscal = csvClientData[i].ESTADO_FISCAL;
      cpFiscal = csvClientData[i].CP_FISCAL;
    }
  }

  // fetch credit settings
  const norm = (s) =>
    (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + (Number(days) || 0));
    return d;
  };

  useEffect(() => {
    if (!clientNameFromSheet) return;

    axios
      .get(CREDIT_SHEET_URL)
      .then((resp) => {
        Papa.parse(resp.data, {
          header: true,
          skipEmptyLines: true,
          complete: ({ data }) => {
            const row = data.find((r) => norm(r.NOMBRE_CLIENTE) === norm(clientNameFromSheet));
            setCreditRow(row || null);

            const hasCreditOption = true;
            const blocked = (row?.CONDICIONES_CREDITO || "").trim().toLowerCase() === "si";
            const days = Number(row?.VIGENCIA_CREDITO || 0) || 0;

            setCreditBlocked(blocked);
            setCreditAllowed(hasCreditOption && !blocked);
            setCreditDays(days);

            if (!hasCreditOption || blocked) setPaymentOption("Contado");
          },
        });
      })
      .catch((err) => {
        console.error("Error fetching credit clients sheet:", err);
        setCreditRow(null);
        setCreditAllowed(false);
        setCreditBlocked(false);
        setCreditDays(0);
        setPaymentOption("Contado");
      });
  }, [clientNameFromSheet]);

  // Load Mongo data (addresses + prefs + user profile)
  useEffect(() => {
    const email = userCredentials?.correo;
    if (!email) return;

    (async () => {
      try {
        const [sRes, bRes] = await Promise.all([
          axios.get(`${API}/shipping-address/${encodeURIComponent(email)}`),
          axios.get(`${API}/billing-address/${encodeURIComponent(email)}`),
        ]);

        const sList = Array.isArray(sRes.data) ? sRes.data : [];
        const bList = Array.isArray(bRes.data) ? bRes.data : [];

        setShippingOptions(sList);
        setBillingOptions(bList);

        setNewestShipping(pickNewest(sList));
        setNewestBilling(pickNewest(bList));
      } catch (err) {
        console.error("Error fetching addresses:", err);
        setShippingOptions([]);
        setBillingOptions([]);
        setNewestShipping(null);
        setNewestBilling(null);
      }
      try {
        const res = await fetch(`${API}/users/by-email?email=${encodeURIComponent(email)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();

          setUserProfile({
            empresa: data?.empresa || "",
            nombre: data?.nombre || "",
            apellido: data?.apellido || "",
            correo: data?.correo || email || "",
          });

          const prefs =
            data?.shippingPreferences || {
              preferredCarrier: data?.preferredCarrier || "",
              insureShipment: !!data?.insureShipment,
            };
          setShippingPrefs({
            preferredCarrier: (prefs?.preferredCarrier || "").trim(),
            insureShipment: !!prefs?.insureShipment,
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [userCredentials?.correo]);

  // Build the current shipping/billing objects shown on screen
  const currentShipping = useMemo(() => {
    if (selectedShippingId) {
      const s = shippingOptions.find((x) => x._id === selectedShippingId);
      if (s) {
        return {
          apodo: s.apodo || "",
          calleEnvio: s.calleEnvio || "",
          exteriorEnvio: s.exteriorEnvio || "",
          interiorEnvio: s.interiorEnvio || "",
          coloniaEnvio: s.coloniaEnvio || "",
          ciudadEnvio: s.ciudadEnvio || "",
          estadoEnvio: s.estadoEnvio || "",
          cpEnvio: s.cpEnvio || "",
        };
      }
    }
    if (newestShipping) {
      return {
        apodo: newestShipping.apodo || "",
        calleEnvio: newestShipping.calleEnvio || "",
        exteriorEnvio: newestShipping.exteriorEnvio || "",
        interiorEnvio: newestShipping.interiorEnvio || "",
        coloniaEnvio: newestShipping.coloniaEnvio || "",
        ciudadEnvio: newestShipping.ciudadEnvio || "",
        estadoEnvio: newestShipping.estadoEnvio || "",
        cpEnvio: newestShipping.cpEnvio || "",
      };
    }
    return {
      apodo: "",
      calleEnvio: "",
      exteriorEnvio: "",
      interiorEnvio: "",
      coloniaEnvio: "",
      ciudadEnvio: "",
      estadoEnvio: "",
      cpEnvio: "",
    };
  }, [selectedShippingId, shippingOptions, newestShipping]);

  const currentBilling = useMemo(() => {
    if (!wantsInvoice) {
      return {
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
      };
    }
    if (selectedBillingId) {
      const b = billingOptions.find((x) => x._id === selectedBillingId);
      if (b) {
        return {
          razonSocial: b.razonSocial || "",
          rfcEmpresa: b.rfcEmpresa || "",
          correoFiscal: b.correoFiscal || "",
          calleFiscal: b.calleFiscal || "",
          exteriorFiscal: b.exteriorFiscal || "",
          interiorFiscal: b.interiorFiscal || "",
          coloniaFiscal: b.coloniaFiscal || "",
          ciudadFiscal: b.ciudadFiscal || "",
          estadoFiscal: b.estadoFiscal || "",
          cpFiscal: b.cpFiscal || "",
        };
      }
    }
    if (newestBilling) {
      return {
        razonSocial: newestBilling.razonSocial || "",
        rfcEmpresa: newestBilling.rfcEmpresa || "",
        correoFiscal: newestBilling.correoFiscal || "",
        calleFiscal: newestBilling.calleFiscal || "",
        exteriorFiscal: newestBilling.exteriorFiscal || "",
        interiorFiscal: newestBilling.interiorFiscal || "",
        coloniaFiscal: newestBilling.coloniaFiscal || "",
        ciudadFiscal: newestBilling.ciudadFiscal || "",
        estadoFiscal: newestBilling.estadoFiscal || "",
        cpFiscal: newestBilling.cpFiscal || "",
      };
    }
    return {
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
    };
  }, [wantsInvoice, selectedBillingId, billingOptions, newestBilling]);

  useEffect(() => {
    if (!selectedShippingId && newestShipping?._id) setSelectedShippingId(newestShipping._id);
    if (!selectedBillingId && newestBilling?._id) setSelectedBillingId(newestBilling._id);
  }, [newestShipping?._id, newestBilling?._id]);

  // ====== NEW TOTALS MODEL (grand totals are the NATURAL SUM; breakdown is display-only when desglose) ======
  const VAT_RATE = 0.16;
  const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
  const fmtMXN = (v) =>
    `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

  // Pre-IVA natural sums by currency
  const {
    sumUSD,          // natural sum of USD lines
    sumMXN,          // natural sum of MXN lines
    isMixed,
    hasUSD,
    hasMXN,
    // for MXN preference combined view
    usdToMXN,        // USD bucket converted to MXN (pre-IVA)
    combinedMXN,     // sumMXN + usdToMXN  (pre-IVA)
  } = useMemo(() => {
    let usd = 0;
    let mxn = 0;

    items.forEach((it) => {
      const qty = Number(it.amount) || 0;
      const cur = (it.currency || "USD").toUpperCase();
      if (cur === "MXN") {
        const unit = Number(it.priceMXN ?? it.price);
        if (Number.isFinite(unit)) mxn += qty * unit;
      } else {
        const unit = Number(it.priceUSD ?? it.price);
        if (Number.isFinite(unit)) usd += qty * unit;
      }
    });

    const _hasUSD = usd > 0;
    const _hasMXN = mxn > 0;
    const mixed = _hasUSD && _hasMXN;

    // CHANGED: use dof2
    let usdMXN = null;
    let combined = null;
    if (Number.isFinite(dof2) && dof2) {
      usdMXN = usd * dof2;          // uses truncated 2-dec rate
      combined = mxn + usdMXN;
    }

    return {
      sumUSD: usd,
      sumMXN: mxn,
      isMixed: mixed,
      hasUSD: _hasUSD,
      hasMXN: _hasMXN,
      usdToMXN: usdMXN,
      combinedMXN: combined,
    };
  }, [items, dof2]);   // CHANGED: depend on dof2

  // Legacy + payload mapping (we’ll keep these as the natural sums, not tax-added)
  const totalUSDNative = sumUSD; // pre-IVA natural USD
  const totalMXNNative = sumMXN; // pre-IVA natural MXN

  const totalAllUSD =
  Number.isFinite(dof2) && dof2 ? sumUSD + sumMXN / dof2 : null;


  const totalAllMXN =
    Number.isFinite(dof2) && dof2 ? sumMXN + sumUSD * dof2 : null;

  // OPTIONAL: apply discount to natural sums if you were using it before (kept as-is)
  const numericDiscount = Number(discountTotal || 0);
  const baseAllUSD = (totalAllUSD ?? 0) - numericDiscount;
    // CHANGED: use dof2 for discount conversion as well
    const baseAllMXN =
    totalAllMXN != null ? totalAllMXN - numericDiscount * (Number(dof2) || 0) : null;

  // VAT fields for payload: only meaningful if we are actually showing desglose
  const vatUSD = wantsDesgloseIVA && baseAllUSD > 0
  ? +(baseAllUSD - baseAllUSD / (1 + VAT_RATE)).toFixed(2)
  : 0;

const vatMXN = wantsDesgloseIVA && baseAllMXN != null && baseAllMXN > 0
  ? +(baseAllMXN - baseAllMXN / (1 + VAT_RATE)).toFixed(2)
  : 0;

  // ========== inventory hold helpers ==========
  const splitPresentation = (presentation = "") => {
    const s = String(presentation).trim().toUpperCase().replace(/\s+/g, "");
    const m = s.match(/^(\d+(?:[.,]\d+)?)([A-Z]+)$/);
    if (!m) return { peso: presentation, unidad: "" };
    return { peso: m[1].replace(",", "."), unidad: m[2] };
  };

  const buildHoldLines = () =>
    items.map((it) => {
      const { peso, unidad } = splitPresentation(it.presentation || "");
      return {
        product: it.product,
        peso,
        unidad,
        quantity: Number(it.amount) || 0,
      };
    });

  // ===== PDF + Save order (uses new "natural sum + optional desglose" rules) =====
  const handleDownloadAndSave = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const today = new Date();

    // Background
    doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

    // Header
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Fecha de Elaboración: ${today.toLocaleDateString("es-MX")}`, 195, 15, null, null, "right");

    // Separator
    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 45, 200, 45);

    // ========= Cliente - Envío (Mongo user + selected/newest shipping address) =========
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Información de Envío", 13, 51);

    doc.setFontSize(10);

    // Empresa
    doc.addImage(iconBuilding, 13, 53, 5, 5);
    doc.text(`${userProfile.empresa || ""}`, 19, 57);

    // Contacto
    doc.addImage(iconContact, 13.5, 59.5, 4, 4);
    doc.text(`${[userProfile.nombre, userProfile.apellido].filter(Boolean).join(" ")}`, 19, 63);

    // Dirección
    doc.addImage(iconLocation, 13.7, 65, 3, 4);
    doc.text(
      `${(currentShipping.calleEnvio || "")}  # ${(currentShipping.exteriorEnvio || "")}  Int. ${(currentShipping.interiorEnvio || "")}`,
      19,
      68
    );
    doc.text(`Col. ${currentShipping.coloniaEnvio || ""}`, 19, 72);
    doc.text(
      `${(currentShipping.ciudadEnvio || "")}, ${(currentShipping.estadoEnvio || "")}. C.P. ${(currentShipping.cpEnvio || "")}`,
      19,
      76
    );

    // Correo
    doc.addImage(iconEmail, 13.7, 84, 4, 3);
    doc.text(`${userProfile.correo || userCredentials?.correo || ""}`, 19, 87);

    // ========= Información Fiscal =========
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Información Fiscal", 100, 51);

    doc.setFontSize(10);
    if (wantsInvoice) {
      doc.text(`Razón Social: ${currentBilling.razonSocial || ""}`, 106, 57);
      doc.text(`RFC: ${currentBilling.rfcEmpresa || ""}`, 106, 63);

      doc.addImage(iconEmail, 100, 65, 4, 3);
      doc.text(`${currentBilling.correoFiscal || ""}`, 106, 68);

      doc.addImage(iconLocation, 100.5, 70, 3, 4);
      doc.text(
        `${(currentBilling.calleFiscal || "")}  # ${(currentBilling.exteriorFiscal || "")}  Int. ${(currentBilling.interiorFiscal || "")}`,
        106,
        73
      );
      doc.text(`Col. ${currentBilling.coloniaFiscal || ""}`, 106, 77);
      doc.text(
        `${(currentBilling.ciudadFiscal || "")}, ${(currentBilling.estadoFiscal || "")}. C.P. ${(currentBilling.cpFiscal || "")}`,
        106,
        81
      );
    } else {
      doc.setFont("helvetica", "italic");
      doc.text("Sin factura.", 106, 57);
      doc.setFont("helvetica", "normal");
    }

    // Separator
    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 92, 200, 92);

    // === Helpers (define before any use) ===
    const fmtNum = (v, locale = "en-US") =>
      (Number(v) || 0).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    // ========= Items por divisa =========
    const normCur = (v) => String(v ?? "USD").trim().toUpperCase();
    const isMXN = (it) => normCur(it.currency) === "MXN";
    const isUSD = (it) => normCur(it.currency) === "USD";

    const usdItems = (items || []).filter(isUSD);
    const mxnItems = (items || []).filter(isMXN);

    const makeBodyUSD = (arr) =>
      arr.map((it) => {
        const qty = Number(it.amount) || 0;
        const unit = Number(it.priceUSD ?? it.price) || 0;
        const pack = it.packPresentation ? ` — ${it.packPresentation}` : "";
        return [
          it.product,
          `${it.presentation || ""}${pack}`,
          String(qty),
          `$${fmtNum(unit, "en-US")} USD`,
          `$${fmtNum(qty * unit, "en-US")} USD`,
          // `$${unit.toFixed(2)} USD`,
          // `$${(qty * unit).toFixed(2)} USD`,
        ];
      });

    const makeBodyMXN = (arr) =>
      arr.map((it) => {
        const qty = Number(it.amount) || 0;
        const unit = Number(it.priceMXN ?? it.price) || 0;
        const pack = it.packPresentation ? ` — ${it.packPresentation}` : "";
        return [
          it.product,
          `${it.presentation || ""}${pack}`,
          String(qty),
          `$${unit.toFixed(2)} MXN`,
          `$${(qty * unit).toFixed(2)} MXN`,
        ];
      });

    const sectionTitle = (text, y) => {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(24, 144, 69);
      doc.text(text, 13, y);
      doc.setTextColor(0, 0, 0);
    };

    let cursorY = 100;

    // --- USD primero ---
    if (usdItems.length) {
      sectionTitle("Artículos en USD", cursorY - 5);
      autoTable(doc, {
        head: [["Producto", "Presentación", "Cantidad", "Precio Unitario", "Total"]],
        body: makeBodyUSD(usdItems),
        startY: cursorY,
        headStyles: { fillColor: [149, 194, 61], textColor: [0, 0, 0], fontStyle: "bold" },
        styles: { fontSize: 9 },
        margin: { left: 10, right: 10 },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
          }
        },
      });

      cursorY = doc.lastAutoTable.finalY + 6;

      // Subtotal USD (natural sum)
      const subtotalUSD_pdf = usdItems.reduce(
        (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0),
        0
      );
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      // doc.text(`Subtotal USD: $${subtotalUSD_pdf.toFixed(2)} USD`, 140, cursorY);
      doc.text(`Subtotal USD: $${fmtNum(subtotalUSD_pdf, "en-US")} USD`, 140, cursorY);
      doc.setFont("helvetica", "normal");
      cursorY += 12;
    }

    // --- MXN después ---
    if (mxnItems.length) {
      sectionTitle("Artículos en MXN", cursorY - 5);
      autoTable(doc, {
        head: [["Producto", "Presentación", "Cantidad", "Precio Unitario", "Total"]],
        body: makeBodyMXN(mxnItems),
        startY: cursorY,
        headStyles: { fillColor: [149, 194, 61], textColor: [0, 0, 0], fontStyle: "bold" },
        styles: { fontSize: 9 },
        margin: { left: 10, right: 10 },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
          }
        },
      });

      cursorY = doc.lastAutoTable.finalY + 6;

      // Subtotal MXN (natural sum)
      const subtotalMXN_pdf = mxnItems.reduce(
        (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0),
        0
      );
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(
        `Subtotal MXN: $${subtotalMXN_pdf.toLocaleString("es-MX", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} MXN`,
        140,
        cursorY
      );
      doc.setFont("helvetica", "normal");
      cursorY += 12;
    }

    // ========= Resumen Financiero (NATURAL sums + optional desglose) =========

    // const fmtUSD_pdf = (v) => `$${(Number(v) || 0).toFixed(2)} USD`;
    // const fmtNum = (v, locale = "en-US") =>
    //   (Number(v) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // const fmtUSD_pdf = (v) => `$${fmtNum(v, "en-US")} USD`;
    // const fmtMXN_pdf = (v) =>
    //   `$${(Number(v) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
    // const rate = Number.isFinite(dof2) ? dof2 : 0;
    const fmtUSD_pdf = (v) => `$${fmtNum(v, "en-US")} USD`;
    const fmtMXN_pdf = (v) =>
      `$${(Number(v) || 0).toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} MXN`;

    const hasUSD_pdf = usdItems.length > 0;
    const hasMXN_pdf = mxnItems.length > 0;
    const isMixed_pdf = hasUSD_pdf && hasMXN_pdf;

    const subtotalUSD_pdf2 = usdItems.reduce(
      (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0),
      0
    );
    const subtotalMXN_pdf2 = mxnItems.reduce(
      (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0),
      0
    );

    const preferred = String(preferredCurrency || "USD").toUpperCase();

    // Natural totals (NO extra IVA added)
    const grandUSD_natural = subtotalUSD_pdf2; // to be paid in USD (if user pays USD)
    const grandMXN_natural = subtotalMXN_pdf2; // to be paid in MXN
    const usdEnMXN = rate ? subtotalUSD_pdf2 * rate : 0; // for MXN view detail
    const combinedMXN_natural = rate ? subtotalMXN_pdf2 + usdEnMXN : null;

    const boxX = 12,
      boxW = 186,
      boxPad = 4,
      lineH = 6;
    const textMaxW = boxW - boxPad * 2;

    const measure = () => {
      let y = cursorY + boxPad;
      y += lineH; // "Moneda seleccionada"
      if (preferred === "MXN") {
        if (combinedMXN_natural != null) {
          // total line (and maybe 2 extra lines if desglose)
          y += wantsDesgloseIVA ? lineH * 3 : lineH;
          if (isMixed_pdf || hasUSD_pdf) {
            const det = rate
              ? (isMixed_pdf
                  ? `Detalle (conversión): USD (${fmtUSD_pdf(subtotalUSD_pdf2)}) × ${rate.toFixed(
                      2
                    )} = ${fmtMXN_pdf(usdEnMXN)}; + MXN nativo ${fmtMXN_pdf(subtotalMXN_pdf2)}.`
                  : `Detalle (conversión): USD (${fmtUSD_pdf(subtotalUSD_pdf2)}) × ${rate.toFixed(
                      2
                    )} = ${fmtMXN_pdf(usdEnMXN)}.`)
              : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
            const detLines = doc.splitTextToSize(det, textMaxW);
            y += detLines.length * 5 + 3;
            if (rate) y += 5; // tipo de cambio
          }
        } else {
          const err =
            "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
          const lines = doc.splitTextToSize(err, textMaxW);
          y += lines.length * 5 + 3;
        }
        if (isMixed_pdf) {
          const legend =
            "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
          const l = doc.splitTextToSize(legend, textMaxW);
          y += l.length * 5 + 5;
        }
      } else {
        // USD preference
        if (hasUSD_pdf) y += wantsDesgloseIVA ? lineH * 3 : lineH;
        if (hasMXN_pdf) y += wantsDesgloseIVA ? lineH * 3 : lineH;
        if (isMixed_pdf && rate) y += 5;
        if (isMixed_pdf) {
          const legend =
            "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
          const l = doc.splitTextToSize(legend, textMaxW);
          y += l.length * 5 + 5;
        }
        if (!hasUSD_pdf && hasMXN_pdf) {
          const note =
            "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
          const n = doc.splitTextToSize(note, textMaxW);
          y += n.length * 5 + 3;
        }
      }
      return y + boxPad;
    };

    const boxHeight = Math.max(14, measure() - cursorY);
    doc.setFillColor(241, 241, 241);
    doc.setDrawColor(200, 200, 200);
    if (doc.roundedRect) doc.roundedRect(boxX, cursorY, boxW, boxHeight, 2.5, 2.5, "FD");
    else doc.rect(boxX, cursorY, boxW, boxHeight, "FD");

    // Render dentro de la caja
    let y = cursorY + boxPad;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Moneda de pago seleccionada: ${preferred}`, boxX + boxPad, y + 3);
    y += lineH;
    doc.setFont("helvetica", "normal");

    const writeBreakdownUSD = (grand) => {
      const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
      const iva = +(grand - sub).toFixed(2);
      doc.text(`USD — Subtotal: ${fmtUSD_pdf(sub)}`, boxX + boxPad, y + 3);
      y += lineH;
      doc.text(`USD — IVA (16%): ${fmtUSD_pdf(iva)}`, boxX + boxPad, y + 3);
      y += lineH;
      doc.setFont("helvetica", "bold");
      doc.text(`USD — Total: ${fmtUSD_pdf(grand)}`, boxX + boxPad, y + 3);
      y += lineH;
      doc.setFont("helvetica", "normal");
    };
    const writeBreakdownMXN = (grand) => {
      const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
      const iva = +(grand - sub).toFixed(2);
      doc.text(`MXN — Subtotal: ${fmtMXN_pdf(sub)}`, boxX + boxPad, y + 3);
      y += lineH;
      doc.text(`MXN — IVA (16%): ${fmtMXN_pdf(iva)}`, boxX + boxPad, y + 3);
      y += lineH;
      doc.setFont("helvetica", "bold");
      doc.text(`MXN — Total: ${fmtMXN_pdf(grand)}`, boxX + boxPad, y + 3);
      y += lineH;
      doc.setFont("helvetica", "normal");
    };

    if (preferred === "MXN") {
      if (combinedMXN_natural == null) {
        doc.setTextColor(180, 0, 0);
        const err =
          "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
        doc.text(doc.splitTextToSize(err, textMaxW), boxX + boxPad, y);
        doc.setTextColor(0, 0, 0);
        y += 10;
      } else {
        if (wantsDesgloseIVA) {
          writeBreakdownMXN(combinedMXN_natural);
        } else {
          doc.setFont("helvetica", "bold");
          doc.text(
            `Total a pagar en MXN: ${fmtMXN_pdf(combinedMXN_natural)}`,
            boxX + boxPad,
            y + 3
          );
          doc.setFont("helvetica", "normal");
          y += lineH;
        }

        // Detalle + TC
        if (isMixed_pdf || hasUSD_pdf) {
          doc.setFontSize(9);
          doc.setTextColor(120, 120, 120);
          const det = `Detalle (conversión): USD (${fmtUSD_pdf(
            subtotalUSD_pdf2
          )}) × ${rate.toFixed(2)} = ${fmtMXN_pdf(usdEnMXN)}`;
          doc.text(doc.splitTextToSize(det, textMaxW), boxX + boxPad, y + 2);
          y += 8;

          doc.text(
            `Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD${dofDate ? `  (Fecha: ${dofDate})` : ""}`,
            boxX + boxPad,
            y + 2
          );
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          y += 5;
        }
      }

      if (isMixed_pdf) {
        doc.setTextColor(180, 0, 0);
        doc.setFont("helvetica", "bold");
        const legend =
          "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
        doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 3);
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
      }
    } else {
      // Preferencia USD — buckets por divisa
      if (hasUSD_pdf) {
        if (wantsDesgloseIVA) {
          writeBreakdownUSD(grandUSD_natural);
        } else {
          doc.setFont("helvetica", "bold");
          doc.text(
            `A pagar en USD (Total): ${fmtUSD_pdf(grandUSD_natural)}`,
            boxX + boxPad,
            y + 3
          );
          doc.setFont("helvetica", "normal");
          y += lineH;
        }
      }
      if (hasMXN_pdf) {
        if (wantsDesgloseIVA) {
          writeBreakdownMXN(grandMXN_natural);
        } else {
          doc.setFont("helvetica", "bold");
          doc.text(
            `A pagar en MXN (Total): ${fmtMXN_pdf(grandMXN_natural)}`,
            boxX + boxPad,
            y + 3
          );
          doc.setFont("helvetica", "normal");
          y += lineH;
        }
      }
      if (isMixed_pdf && rate) {
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD${dofDate ? `  (Fecha: ${dofDate})` : ""}`,
          boxX + boxPad,
          y + 2
        );
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        y += 5;
      }
      if (isMixed_pdf) {
        doc.setTextColor(180, 0, 0);
        doc.setFont("helvetica", "bold");
        const legend =
          "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
        doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 5);
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
      }
      if (!hasUSD_pdf && hasMXN_pdf) {
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        const note =
          "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
        doc.text(doc.splitTextToSize(note, textMaxW), boxX + boxPad, y + 2);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
      }
    }

    // Avanza debajo del resumen
    cursorY = cursorY + boxHeight + 6;

    // ========= Opción de Pago =========
    const creditBoxX = 10;
    const creditBoxY = cursorY;
    const creditBoxWidth = 190;
    const creditBoxHeight = 20;
    const creditBoxRadius = 4;

    if (doc.roundedRect) {
      doc.setFillColor(241, 241, 241);
      doc.roundedRect(creditBoxX, creditBoxY, creditBoxWidth, creditBoxHeight, creditBoxRadius, creditBoxRadius, "F");
    } else {
      doc.setFillColor(241, 241, 241);
      doc.rect(creditBoxX, creditBoxY, creditBoxWidth, creditBoxHeight, "F");
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Opción de Pago: ${paymentOption}`, 15, creditBoxY + 6);
    if (paymentOption === "Crédito") {
      doc.text(`Plazo de Crédito: ${creditDays} Días`, 15, creditBoxY + 11);
      doc.text(`Vencimiento: ${addDays(new Date(), creditDays).toLocaleDateString("es-MX")}`, 15, creditBoxY + 16);
    }

    // ========= PÁGINA DE CUENTAS =========
    doc.addPage();
    doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

    let y2 = 35;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(24, 144, 69);
    doc.text(`Cuentas para realizar pago:`, 13, y2 + 5);

    const payBoxX = 10;
    const payBoxY = y2 + 10;
    const payBoxWidth = 190;
    const payBoxHeight = 135;
    const payBoxRadius = 4;

    if (doc.roundedRect) {
      doc.setFillColor(241, 241, 241);
      doc.roundedRect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, payBoxRadius, payBoxRadius, "F");
    } else {
      doc.setFillColor(241, 241, 241);
      doc.rect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, "F");
    }

    const miniBox = (title, lines, startY) => {
      const x = 12;
      const w = 120;
      const pad = 4;
      const lineH = 5;
      const titleH = title ? lineH + 1 : 0;
      const h = pad * 2 + titleH + lines.length * lineH;

      if (doc.roundedRect) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, startY, w, h, 3, 3, "F");
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(x, startY, w, h, "F");
      }

      let ty = startY + pad + (title ? lineH : 0);

      if (title) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(title, x + pad, startY + pad + 3.5);
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      lines.forEach((t) => {
        doc.text(t, x + pad, ty + 2);
        ty += lineH;
      });

      return startY + h;
    };

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);

    if (wantsInvoice) {
      // Empresa (MXN + USD)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`CUENTA EN PESOS MEXICANOS`, 15, y2 + 17);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`TRANSFERENCIA O DEPÓSITO BANCARIO:`, 15, y2 + 24);

      let cursor2 = y2 + 28;

      cursor2 = miniBox(
        "BANCO: BBVA",
        [
          "NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV",
          "NO. DE CUENTA: 010 115 1207",
          "CLABE: 012 320 001 011 512 076",
        ],
        cursor2
      );
      cursor2 += 6;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`CUENTA EN DÓLARES AMERICANOS`, 15, cursor2 + 12);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`TRANSFERENCIA:`, 15, cursor2 + 19);

      cursor2 += 24;

      cursor2 = miniBox(
        "BANCO: GRUPO FINANCIERO MONEX",
        [
          "NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV",
          "CLABE: 112 180 000 028 258 341",
        ],
        cursor2
      );
      cursor2 += 6;

      miniBox(
        "BANCO: BANCO INVEX, S.A.",
        [
          "NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV",
          "CLABE: 059 180 030 020 014 234",
        ],
        cursor2
      );
    } else {
      // Personal MXN
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`CUENTA EN PESOS MEXICANOS - SIN FACTURA`, 15, y2 + 17);

      doc.setFontSize(11);
      doc.text(`TRANSFERENCIA O DEPÓSITO BANCARIO`, 15, y2 + 24);
      doc.text(`BANCO: BBVA`, 15, y2 + 31);

      doc.setFont("helvetica", "normal");
      doc.text(`NOMBRE: ALEJANDRO GONZALEZ AGUIRRE`, 15, y2 + 36);
      doc.text(`NO. DE CUENTA: 124 525 4078`, 15, y2 + 41);
      doc.text(`CLABE: 012 320 012 452 540 780`, 15, y2 + 46);
      doc.text(`NO. DE TARJETA: 4152 3141 1021 5384`, 15, y2 + 51);
    }

    // ========= Build payload (natural sums; VAT only if desglose) =========
    const userEmail = userCredentials?.correo;
    const creditDue =
      paymentOption === "Crédito" && creditAllowed
        ? addDays(new Date(), creditDays).toISOString()
        : null;

    // For payload, keep natural totals and include VAT numbers only when desglose applies.
    const orderInfo = {
      userEmail,
      items,
      totals: {
        // natural (pre-IVA) buckets:
        totalUSDNative: Number(totalUSDNative.toFixed(2)),
        totalMXNNative: Number(totalMXNNative.toFixed(2)),
        // natural combined:
        totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
        totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
        dofRate: dof2,
        dofDate,
        discountUSD: Number(discountTotal || 0),
        // VAT fields (only meaningful if desglose is on)
        vatUSD,
        vatMXN: totalAllMXN !== null ? vatMXN : null,
        // For clarity, also store the grand totals as NATURAL sums in the preferred currency contexts:
        // If front-end needs, they can derive them again; here we keep natural sums only.
      },
      requestBill: !!wantsInvoice,
      shippingInfo: { ...currentShipping },
      billingInfo: wantsInvoice ? { ...currentBilling } : {},
      shippingPreferences: { ...shippingPrefs },
      orderDate: new Date().toISOString(),
      orderStatus: "Pedido Realizado",
      paymentOption,
      creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
      creditDueDate: creditDue,
      invoiceBreakdownEnabled: wantsDesgloseIVA,
    };

    try {
      // Subir primero
      const pdfBlob = doc.output("blob");
      const form = new FormData();
      form.append("order", JSON.stringify(orderInfo));
      form.append("pdf", pdfBlob, "order_summary.pdf");

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

      // Reserva inventario (opcional)
      try {
        const holdLines = buildHoldLines();
        if (createdOrderId && holdLines.length > 0) {
          await axios.post(
            `${API}/inventory/hold`,
            { orderId: createdOrderId, holdMinutes: 120, lines: holdLines },
            { withCredentials: false, timeout: 15000 }
          );
        }
      } catch (holdErr) {
        console.error("Error al reservar inventario:", holdErr);
      }

      // Descargar local
      doc.save("order_summary.pdf");

      alert("Orden guardada exitosamente");
      navigate("/myOrders", { state: { from: "orderNow" } });
    } catch (error) {
      console.error("Error al guardar la orden o al reservar inventario", error);
      const msg =
        error?.message ||
        error?.response?.data?.error ||
        "Revisa tu conexión y vuelve a intentar.";
      alert(`Ocurrió un error al guardar la orden o al reservar inventario\n${msg}`);
    }
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
        <div className="edit-titleIcon-Div">
          <label className="editAddress-headerLabel">Detalles de Orden</label>
          <img src={CarritoIcono} alt="Carrito" width="35" height="35" />
        </div>

        <div className="orderNowBody-Div">
          {/* ===== Shipping Preferences ===== */}
          <div className="headerAndDets-Div">
            <div className="headerEditIcon-Div">
              <label className="newAddress-Label">Preferencias de Envío</label>
            </div>

            <div className="orderNow-AddressDiv">
              <label className="orderNow-Label">
                <b>Transportista:</b> <br />
                {shippingPrefs.preferredCarrier || "No especificado"}
              </label>
              <br />
              <label className="orderNow-Label">
                <b>Mercancía Asegurada:</b> <br />
                {shippingPrefs.insureShipment ? "Sí" : "No"}
              </label>
            </div>
          </div>

          {/* Shipping address */}
          <div className="headerAndDets-Div">
            <div className="headerEditIcon-Div">
              <label className="newAddress-Label">Dirección de Envío</label>
              <select
                className="alternateAddress-Select"
                value={selectedShippingId}
                onChange={(e) => setSelectedShippingId(e.target.value)}
              >
                <option value="">Seleccione otra dirección</option>
                {shippingOptions.map((opt) => (
                  <option key={opt._id} value={opt._id}>
                    {opt.apodo || `${opt.calleEnvio} ${opt.exteriorEnvio || ""}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="orderNow-AddressDiv">
              <label className="orderNow-Label">
                {currentShipping.calleEnvio} #{currentShipping.exteriorEnvio} Int. {currentShipping.interiorEnvio}
              </label>
              <label className="orderNow-Label">Col. {currentShipping.coloniaEnvio}</label>
              <label className="orderNow-Label">
                {currentShipping.ciudadEnvio}, {currentShipping.estadoEnvio}. C.P. {currentShipping.cpEnvio}
              </label>
            </div>
          </div>

          {/* Invoice toggle */}
          <div className="headerAndDets-Div" style={{ marginTop: 10 }}>
            <div className="headerEditIcon-Div">
              <label className="newAddress-Label">¿Deseas factura?</label>
            </div>
            <div className="orderNow-AddressDiv" style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <select
                className="invoiceRequest-Dropdown"
                value={wantsInvoice ? "true" : "false"}
                onChange={(e) => {
                  const v = e.target.value === "true";
                  setWantsInvoice(v);
                  localStorage.setItem("billRequest", String(v));
                }}
              >
                <option value="false">No</option>
                <option value="true">Sí</option>
              </select>
            </div>
          </div>

          {/* Billing – only show when wantsInvoice === true */}
          {wantsInvoice && (
            <div className="headerAndDets-Div">
              <div className="headerEditIcon-Div">
                <label className="newAddress-Label">Datos de Facturación</label>
                <select
                  className="alternateAddress-Select"
                  value={selectedBillingId}
                  onChange={(e) => setSelectedBillingId(e.target.value)}
                >
                  <option value="">Seleccione otra dirección</option>
                  {billingOptions.map((opt) => (
                    <option key={opt._id} value={opt._id}>
                      {opt.apodo || opt.razonSocial || opt.rfcEmpresa}
                    </option>
                  ))}
                </select>
              </div>

              <div className="orderNow-AddressDiv">
                <label className="orderNow-Label">{currentBilling.razonSocial}</label>
                <label className="orderNow-Label">{currentBilling.rfcEmpresa}</label>
                <br />
                <label className="orderNow-Label">
                  {currentBilling.calleFiscal} #{currentBilling.exteriorFiscal} Int. {currentBilling.interiorFiscal}
                </label>
                <label className="orderNow-Label">Col. {currentBilling.coloniaFiscal}</label>
                <label className="orderNow-Label">
                  {currentBilling.ciudadFiscal}, {currentBilling.estadoFiscal}. C.P. {currentBilling.cpFiscal}
                </label>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="headerAndDets-Div">
            <label className="orderSummary-Label">Resumen de orden</label>
          </div>

          <div className="products-Div">
            <ul>
              {items.map((item, i) => {
                const cur = (item.currency || "USD").toUpperCase();
                const unit =
                  cur === "MXN"
                    ? `${Number(item.priceMXN ?? item.price).toFixed(2)} MXN`
                    : `${Number(item.priceUSD ?? item.price).toFixed(2)} USD`;
                const line =
                  cur === "MXN"
                    ? (Number(item.amount) * Number(item.priceMXN ?? item.price)).toFixed(2) + " MXN"
                    : (Number(item.amount) * Number(item.priceUSD ?? item.price)).toFixed(2) + " USD";

                return (
                  <div className="orderImageAndDets-Div" key={i}>
                    <img
                      src={getItemImage(item)}
                      alt={item.product}
                      width="75"
                      height="75"
                      onError={(e) => {
                        e.currentTarget.src = fallbackImg;
                      }}
                    />
                    <div className="orderDetails-Div">
                      <label className="orderDets-Label">
                        <b>{item.product}</b>
                      </label>
                      <label className="orderDets-Label">
                        <b>Presentación: {item.presentation}</b>
                        {item.packPresentation ? ` — ${item.packPresentation}` : ""}
                      </label>
                      <br />
                      <label className="orderDets-Label">
                        <b>Cantidad:</b> {item.amount}
                      </label>
                      <label className="orderDets-Label">
                        <b>Precio Unitario:</b> ${unit}
                      </label>
                      <label className="orderDetsTotal-Label">
                        <b>Total:</b> ${line}
                      </label>
                    </div>
                  </div>
                );
              })}
            </ul>

            {/* Summary box (NATURAL totals; show breakdown only if wantsInvoice && DESGLOSE_IVA === "Sí") */}
            <div className="orderNow-summaryDiv">
              {(() => {
                const rows = [{ label: "Moneda de pago:", value: preferredCurrency, boldLabel: true, labelClass: "accent"  }];

                // 👉 track if we've already added the header
                let addedDesgloseHeader = false;
                const ensureDesgloseHeader = () => {
                  if (wantsDesgloseIVA && !addedDesgloseHeader) {
                    rows.push({ isHeader: true, text: "Desglose Financiero" });
                    addedDesgloseHeader = true;
                  }
                };

                const writeBreakdownRows = (prefix, grand, fmt) => {
                  // make sure header shows up **before** the first Sub-total line
                  ensureDesgloseHeader();
                  const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
                  const iva = +(grand - sub).toFixed(2);
                  rows.push({ label: `Sub-total (${prefix}):`, value: fmt(sub) });
                  rows.push({ label: `IVA (${prefix}) (16%):`, value: fmt(iva) });
                  rows.push({ label: `Total ${prefix}:`, value: fmt(grand), boldLabel: true });

                  // rows.push({ label: `${prefix} Sub-total:`, value: fmt(sub) });
                  // rows.push({ label: `${prefix} IVA (16%):`, value: fmt(iva) });
                  // rows.push({ label: `${prefix} Total:`, value: fmt(grand), boldLabel: true });
                };

                if (preferredCurrency === "USD") {
                  if (hasUSD) {
                    // wantsDesgloseIVA ? writeBreakdownRows("USD —", sumUSD, fmtUSD)
                    wantsDesgloseIVA ? writeBreakdownRows("USD", sumUSD, fmtUSD)
                                    : rows.push({ label: "Total USD:", value: fmtUSD(sumUSD), boldLabel: true });
                  }
                  if (hasMXN) {
                    wantsDesgloseIVA ? writeBreakdownRows("MXN", sumMXN, fmtMXN)
                                    : rows.push({ label: "Total MXN:", value: fmtMXN(sumMXN), boldLabel: true });
                  }
                  if (isMixed && dofRate) {
                    rows.push({
                      label: "Tipo de cambio:",
                      labelClass: "muted",
                      valueClass: dofRate ? "muted" : "",
                      value: `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`,
                    });
                  }
                } else {
                  if (combinedMXN != null) {
                    wantsDesgloseIVA
                      ? writeBreakdownRows("MXN", combinedMXN, fmtMXN)
                      : rows.push({ label: "Total a pagar en MXN:", value: fmtMXN(combinedMXN), boldLabel: true });

                    if (isMixed || hasUSD) {
                      rows.push({
                        label: "Detalle (conversión):",
                        labelClass: "sectionHeader",
                        value:
                          dofRate && usdToMXN != null ? (
                            <>
                              {`USD (${fmtUSD(sumUSD)}) × ${dof2.toFixed(2)} = ${fmtMXN(usdToMXN)}`}
                              <br />
                              {/* {`+ MXN nativo ${fmtMXN(sumMXN)}`} */}
                            </>
                          ) : (
                            "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN."
                          ),
                      });
                      rows.push({
                        label: "Tipo de cambio:",
                        labelClass: "muted",
                        valueClass: dofRate ? "muted" : "",
                        value: dofRate
                          ? `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
                          : fxError
                          ? "—"
                          : "Cargando...",
                      });
                    }
                  } else {
                    rows.push({ label: "Total a pagar en MXN:", value: "—", boldLabel: true });
                  }
                }

                return (
                  <>
                    {rows.map((r, i) =>
                      r.isHeader ? (
                        <div className="summary-section" key={`hdr-${i}`}>
                          {r.text}
                        </div>
                      ) : (
                        <div className="summary-pair" key={i}>
                          <div className={`summary-label ${r.boldLabel ? "bold" : ""} ${r.labelClass || ""}`}>
                            {r.label}
                          </div>
                          <div className={`summary-value ${r.valueClass || ""}`}>{r.value}</div>
                        </div>
                      )
                    )}

                    {isMixed && (
                      <div className="summary-note">
                        IMPORTANTE: En órdenes mixtas, los artículos listados en MXN deben pagarse en MXN.
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            {/* <div className="orderNow-summaryDiv">
              {(() => {
                const rows = [{ label: "Moneda de pago:", value: preferredCurrency, boldLabel: true }];

                const writeBreakdownRows = (prefix, grand, fmt) => {
                  const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
                  const iva = +(grand - sub).toFixed(2);
                  rows.push({ label: `${prefix} Sub-total:`, value: fmt(sub) });
                  rows.push({ label: `${prefix} IVA (16%):`, value: fmt(iva) });
                  rows.push({ label: `${prefix} Total:`, value: fmt(grand), boldLabel: true });
                };

                if (preferredCurrency === "USD") {
                  // USD preference: show per-currency buckets (MXN must be paid in MXN)
                  if (hasUSD) {
                    if (wantsDesgloseIVA) {
                      writeBreakdownRows("USD —", sumUSD, fmtUSD);
                    } else {
                      rows.push({ label: "Total USD:", value: fmtUSD(sumUSD), boldLabel: true });
                    }
                  }
                  if (hasMXN) {
                    if (wantsDesgloseIVA) {
                      writeBreakdownRows("MXN —", sumMXN, fmtMXN);
                    } else {
                      rows.push({ label: "Total MXN:", value: fmtMXN(sumMXN), boldLabel: true });
                    }
                  }
                  if (isMixed && dofRate) {
                    rows.push({
                      label: "Tipo de cambio:",
                      value: `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`,
                    });
                  }
                } else {
                  // MXN preference: single combined total
                  if (combinedMXN != null) {
                    if (wantsDesgloseIVA) {
                      writeBreakdownRows("MXN —", combinedMXN, fmtMXN);
                    } else {
                      rows.push({
                        label: "Total a pagar en MXN:",
                        value: fmtMXN(combinedMXN),
                        boldLabel: true,
                      });
                    }

                    if (isMixed || hasUSD) {
                      rows.push({
                        label: "Detalle (conversión):",
                        labelClass: "sectionHeader",
                        value:
                          dofRate && usdToMXN != null ? (
                            <>
                              {`USD (${fmtUSD(sumUSD)}) × ${dof2.toFixed(2)} = ${fmtMXN(usdToMXN)};`}
                              <br /> */}
                              {/* {`+ MXN nativo ${fmtMXN(sumMXN)}`} */}
                            {/* </>
                          ) : (
                            "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN."
                          ),
                      });
                    
                      rows.push({
                        label: "Tipo de cambio:",
                        labelClass: "muted",
                        valueClass: dofRate ? "muted" : "", 
                        value: dofRate
                          ? `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
                          : fxError
                          ? "—"
                          : "Cargando...",
                      });
                    }
                  } else {
                    rows.push({ label: "Total a pagar en MXN:", value: "—", boldLabel: true });
                  }
                }

                return (
                  <>
                  {rows.map((r, i) => (
                    <div className="summary-pair" key={i}>
                      <div className={`summary-label ${r.boldLabel ? "bold" : ""} ${r.labelClass || ""}`}>
                        {r.label}
                      </div>
                      <div className={`summary-value ${r.valueClass || ""}`}>
                        {r.value}
                      </div>
                    </div>
                  ))}

                    {isMixed && (
                      <div className="summary-note">
                        En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.
                      </div>
                    )}
                  </>
                );
              })()}
            </div> */}
          </div>

          {/* Payment option / Credit */}
          <div className="headerAndDets-Div" style={{ marginTop: 16 }}>
            <div className="headerEditIcon-Div">
              <label className="newAddress-Label">Opción de Pago</label>
            </div>

            {creditBlocked && (
              <div className="orderNow-AddressDiv" style={{ color: "#b00", fontSize: 13, marginBottom: 8 }}>
                Este cliente tiene condiciones pendientes. El crédito no está disponible para nuevas órdenes.
              </div>
            )}

            <div className="orderNow-AddressDiv" style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <select
                className="alternateAddress-Select"
                value={paymentOption}
                onChange={(e) => setPaymentOption(e.target.value)}
                disabled={!creditAllowed}
              >
                <option value="Contado">Contado</option>
                {creditAllowed && <option value="Crédito">Crédito</option>}
              </select>

              {paymentOption === "Crédito" && creditAllowed && (
                <span style={{ fontSize: 13 }}>
                  Vigencia: {creditDays} día(s). Vence: {addDays(new Date(), creditDays).toLocaleDateString("es-MX")}
                </span>
              )}
            </div>
          </div>

          <div className="orderReqBts-Div">
            <button className="submitOrder-Btn" type="submit" onClick={handleDownloadAndSave}>
              Descargar <br />
              Orden
            </button>
          </div>
        </div>
      </div>

      <div className="app-footer footerMenuDiv">
        <div className="footerHolder">
          <div className="footerIcon-NameDiv" onClick={() => navigate("/userHome")}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons" />{" "}
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={() => navigate("/userProfile")}>
            <FontAwesomeIcon icon={faUser} className="footerIcons" />{" "}
            <label className="footerIcon-Name">MI PERFIL</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={() => navigate("/newOrder")}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />{" "}
            <label className="footerIcon-Name">ORDENA</label>
          </div>
        </div>
      </div>
    </body>
  );
}

// // Hey chatgpt, we're making some adjustments to oderNow.jsx regarding the financial summary. If client doesn't want "factura" (wantsInvoice === false) then the total price shown will bet the natural sum of the products selected, and just take into consideration the currency selected by the user. So, for example, lets say the user is buying 2 items valued at $225USD. If the user selects NO FACTURA and USD as prefered currency, then the total displayed will be $450USD. If same scenario but chooses MXN as prefered currency, then show total to pay in MXN and the convertion rate. However, when the client DOES select Factura, then we need some specific tweaks that require to tap into csvClientURL database. I added a new column named "DESGLOSE_IVA" to the databse. When client selects choses to indeed have "FACTURA" generated, if "Sí" is on that column then the following applies: for same example of two products worth $225USD, total will still be $450USD. However, in financial summary the breakdown will be as follows: Subtotal will be $387.93 (which corresponds to 450 divided by 1.16, rounded to 2nd decimal), IVA will be $62.07 (difference between 450 and 387.93), and TOTAL will still be $450. If however the user choses FACTURA and column "DESGLOSE_IVA" doesn't say anything or explicitly says "No", then the summary will behave exactly as if the user had not asked for "Factura". In all cases, keep the currency convertion logistic as is (products listed in USD can be paid either in USD or MXN, but products listed in MXN can only be paid in MXN, hence we can have "combined orders", which result from user selecting USD as prefered currency and handed financial summary that handles USD-listed products and MXN-listed products, or "MXN orders" that result of user selecting MXN as prefered currency and converting USD-Listed products to MXN). Here is my current orderNow.jsx, please do direct edit   
// import { useState, useEffect, useMemo } from "react";
// import { useLocation, useNavigate } from "react-router-dom";
// import axios from "axios";
// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import jsPDF from "jspdf";
// import autoTable from "jspdf-autotable";

// import { API } from "/src/lib/api";

// import Papa from "papaparse";
// import fallbackImg from "../assets/images/Product_GISSample.png";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import CarritoIcono from "/src/assets/images/Icono_Carrito.png";

// import iconBuilding from "../assets/images/iconBuilding.png";
// import iconContact from "../assets/images/iconContact.png";
// import iconLocation from "../assets/images/iconLocation.png";
// import iconPhone from "../assets/images/iconPhone.png";
// import iconEmail from "../assets/images/iconEmail.png";

// import { docDesign } from "/src/components/documentDesign";

// export default function OrderNow() {
//   const navigate = useNavigate();
//   const location = useLocation();

//   const items = location.state?.items || [];
//   const preferredCurrency = (location.state?.preferredCurrency || "USD").toUpperCase();
//   console.log(items)

//   const [discountTotal, setDiscountTotal] = useState("");
//   const [requestBill, setRequestBill] = useState("");
//   const [wantsInvoice, setWantsInvoice] = useState(false);
//   const [imageLookup, setImageLookup] = useState({});

//   const [shippingPrefs, setShippingPrefs] = useState({
//     preferredCarrier: "",
//     insureShipment: false,
//   });

//   // DOF FX
//   const [dofRate, setDofRate] = useState(null);
//   const [dofDate, setDofDate] = useState(null);
//   const [fxError, setFxError] = useState(null);

//   // Credit
//   const CREDIT_SHEET_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vSahPxZ8Xq6jSlgWh7F7Rm7wqDsSyBrb6CEFdsEjyXYSkcsS62yXpiGb9GqIu8c4An3l7yBUbpe23hY/pub?gid=0&single=true&output=csv";

//   const [creditRow, setCreditRow] = useState(null);
//   const [creditAllowed, setCreditAllowed] = useState(false);
//   const [creditBlocked, setCreditBlocked] = useState(false);
//   const [creditDays, setCreditDays] = useState(0);
//   const [paymentOption, setPaymentOption] = useState("Contado");

//   const makeKey = (name = "", pres = "") =>
//     `${name}`.trim().toLowerCase() + "__" + `${pres}`.trim().toLowerCase();

//   // Helpers to pick newest Mongo address
//   const _idToMs = (id) => {
//     try { return parseInt(String(id).slice(0, 8), 16) * 1000; } catch { return 0; }
//   };
//   const pickNewest = (arr) =>
//     Array.isArray(arr) && arr.length
//       ? [...arr].sort((a, b) => _idToMs(b?._id) - _idToMs(a?._id))[0]
//       : null;

//   const [newestShipping, setNewestShipping] = useState(null);
//   const [newestBilling, setNewestBilling] = useState(null);

//   // Mongo user profile for PDF header
//   const [userProfile, setUserProfile] = useState({
//     empresa: "",
//     nombre: "",
//     apellido: "",
//     correo: "",
//   });

//   useEffect(() => {
//     const csvUrl =
//       "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

//     axios
//       .get(csvUrl)
//       .then((response) => {
//         Papa.parse(response.data, {
//           header: true,
//           skipEmptyLines: true,
//           complete: ({ data }) => {
//             const map = {};
//             data.forEach((row) => {
//               const name = row.NOMBRE_PRODUCTO || "";
//               const pres = row.PESO_PRODUCTO + row.UNIDAD_MEDICION || "";
//               const img = row.IMAGE_URL || row.IMAGE || "";
//               if (name && pres && img) map[makeKey(name, pres)] = img;
//             });
//             setImageLookup(map);
//           },
//         });
//       })
//       .catch((err) => console.error("Error fetching product CSV:", err));
//   }, []);

//   const getItemImage = (item) => {
//     const url = imageLookup[makeKey(item.product, item.presentation)];
//     return url && url.length > 0 ? url : fallbackImg;
//   };

//   // DOF rate
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

//   // localStorage bits
//   useEffect(() => {
//     const savedDiscount = localStorage.getItem("discountTotal");
//     setDiscountTotal(savedDiscount || "0");
//     const savedRequestBill = localStorage.getItem("billRequest");
//     setRequestBill(savedRequestBill === "true" ? "true" : "false");
//     setWantsInvoice(savedRequestBill === "true");
//   }, []);

//   // user + addresses
//   const [userCredentials, setUserCredentials] = useState([]);
//   const [shippingOptions, setShippingOptions] = useState([]);
//   const [billingOptions, setBillingOptions] = useState([]);

//   const [selectedShippingId, setSelectedShippingId] = useState("");
//   const [selectedBillingId, setSelectedBillingId] = useState("");

//   useEffect(() => {
//     const savedCreds = JSON.parse(localStorage.getItem("userLoginCreds"));
//     setUserCredentials(savedCreds || []);
//     fetchCSVClientData();
//   }, []);

//   // Client DB (only used elsewhere as fallback; kept untouched)
//   const [csvClientData, setCsvClientData] = useState([]);
//   const fetchCSVClientData = () => {
//     const csvClientUrl =
//       "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
//     axios
//       .get(csvClientUrl)
//       .then((response) => {
//         const rows = response.data.split(/\r\n/);
//         const headers = rows[0].split(",");
//         const data = [];
//         for (let i = 1; i < rows.length; i++) {
//           const r = rows[i].split(",");
//           const obj = {};
//           headers.forEach((h, idx) => (obj[h] = r[idx]));
//           data.push(obj);
//         }
//         setCsvClientData(data);
//       })
//       .catch((error) => {
//         console.error("Error fetching CSV data:", error);
//       });
//   };

//   const clientNameFromSheet = useMemo(() => {
//     if (!userCredentials?.correo || csvClientData.length === 0) return "";
//     const row = csvClientData.find(
//       (r) =>
//         (r.CORREO_EMPRESA || "").trim().toLowerCase() ===
//         (userCredentials.correo || "").trim().toLowerCase()
//     );
//     return (row?.NOMBRE_APELLIDO || "").trim();
//   }, [csvClientData, userCredentials?.correo]);

//   // fallbacks kept (unused in new PDF header)
//   let telefonoEmpresa,
//     correoEmpresa,
//     nombreEmpresa,
//     nombreEncargado,
//     calleEnvio,
//     exteriorEnvio,
//     interiorEnvio,
//     coloniaEnvio,
//     ciudadEnvio,
//     estadoEnvio,
//     cpEnvio,
//     razonSocial,
//     rfcEmpresa,
//     correoFiscal,
//     calleFiscal,
//     exteriorFiscal,
//     interiorFiscal,
//     coloniaFiscal,
//     ciudadFiscal,
//     estadoFiscal,
//     cpFiscal;

//   for (let i in csvClientData) {
//     if (csvClientData[i].CORREO_EMPRESA === userCredentials.correo) {
//       telefonoEmpresa = csvClientData[i].TELEFONO_EMPRESA;
//       correoEmpresa = csvClientData[i].CORREO_EMPRESA;
//       nombreEmpresa = csvClientData[i].NOMBRE_EMPRESA;
//       nombreEncargado = csvClientData[i].NOMBRE_APELLIDO;

//       calleEnvio = csvClientData[i].CALLE_ENVIO;
//       exteriorEnvio = csvClientData[i].EXTERIOR_ENVIO;
//       interiorEnvio = csvClientData[i].INTERIOR_ENVIO;
//       coloniaEnvio = csvClientData[i].COLONIA_ENVIO;
//       ciudadEnvio = csvClientData[i].CIUDAD_ENVIO;
//       estadoEnvio = csvClientData[i].ESTADO_ENVIO;
//       cpEnvio = csvClientData[i].CP_ENVIO;

//       razonSocial = csvClientData[i].RAZON_SOCIAL;
//       rfcEmpresa = csvClientData[i].RFC_EMPRESA;
//       correoFiscal = csvClientData[i].CORREO_FISCAL;
//       calleFiscal = csvClientData[i].CALLE_FISCAL;
//       exteriorFiscal = csvClientData[i].EXTERIOR_FISCAL;
//       interiorFiscal = csvClientData[i].INTERIOR_FISCAL;
//       coloniaFiscal = csvClientData[i].COLONIA_FISCAL;
//       ciudadFiscal = csvClientData[i].CIUDAD_FISCAL;
//       estadoFiscal = csvClientData[i].ESTADO_FISCAL;
//       cpFiscal = csvClientData[i].CP_FISCAL;
//     }
//   }

//   // fetch credit settings when client name is known
//   const norm = (s) =>
//     (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
//   const addDays = (date, days) => {
//     const d = new Date(date);
//     d.setDate(d.getDate() + (Number(days) || 0));
//     return d;
//   };

//   useEffect(() => {
//     if (!clientNameFromSheet) return;

//     axios
//       .get(CREDIT_SHEET_URL)
//       .then((resp) => {
//         Papa.parse(resp.data, {
//           header: true,
//           skipEmptyLines: true,
//           complete: ({ data }) => {
//             const row = data.find((r) => norm(r.NOMBRE_CLIENTE) === norm(clientNameFromSheet));
//             setCreditRow(row || null);

//             const hasCreditOption = true;
//             const blocked = (row?.CONDICIONES_CREDITO || "").trim().toLowerCase() === "si";
//             const days = Number(row?.VIGENCIA_CREDITO || 0) || 0;

//             setCreditBlocked(blocked);
//             setCreditAllowed(hasCreditOption && !blocked);
//             setCreditDays(days);

//             if (!hasCreditOption || blocked) setPaymentOption("Contado");
//           },
//         });
//       })
//       .catch((err) => {
//         console.error("Error fetching credit clients sheet:", err);
//         setCreditRow(null);
//         setCreditAllowed(false);
//         setCreditBlocked(false);
//         setCreditDays(0);
//         setPaymentOption("Contado");
//       });
//   }, [clientNameFromSheet]);

//   // Load Mongo data (addresses + prefs + user profile)
//   useEffect(() => {
//     const email = userCredentials?.correo;
//     if (!email) return;
  
//     (async () => {
//       try {
//         const [sRes, bRes] = await Promise.all([
//           axios.get(`${API}/shipping-address/${encodeURIComponent(email)}`),
//           axios.get(`${API}/billing-address/${encodeURIComponent(email)}`),
//         ]);
  
//         const sList = Array.isArray(sRes.data) ? sRes.data : [];
//         const bList = Array.isArray(bRes.data) ? bRes.data : [];
  
//         setShippingOptions(sList);
//         setBillingOptions(bList);
  
//         setNewestShipping(pickNewest(sList));
//         setNewestBilling(pickNewest(bList));
//       } catch (err) {
//         console.error("Error fetching addresses:", err);
//         setShippingOptions([]);
//         setBillingOptions([]);
//         setNewestShipping(null);
//         setNewestBilling(null);
//       }
//       try {
//         const res = await fetch(`${API}/users/by-email?email=${encodeURIComponent(email)}`, {
//           method: "GET",
//           headers: { Accept: "application/json" },
//           cache: "no-store",
//         });
//         if (res.ok) {
//           const data = await res.json();

//           setUserProfile({
//             empresa: data?.empresa || "",
//             nombre: data?.nombre || "",
//             apellido: data?.apellido || "",
//             correo: data?.correo || email || "",
//           });

//           const prefs =
//             data?.shippingPreferences || {
//               preferredCarrier: data?.preferredCarrier || "",
//               insureShipment: !!data?.insureShipment,
//             };
//           setShippingPrefs({
//             preferredCarrier: (prefs?.preferredCarrier || "").trim(),
//             insureShipment: !!prefs?.insureShipment,
//           });
//         }
//       } catch {
//         /* ignore */
//       }
//     })();
//   }, [userCredentials?.correo]);

//   // Build the current shipping/billing objects shown on screen
//   const currentShipping = useMemo(() => {
//     if (selectedShippingId) {
//       const s = shippingOptions.find((x) => x._id === selectedShippingId);
//       if (s) {
//         return {
//           apodo: s.apodo || "",
//           calleEnvio: s.calleEnvio || "",
//           exteriorEnvio: s.exteriorEnvio || "",
//           interiorEnvio: s.interiorEnvio || "",
//           coloniaEnvio: s.coloniaEnvio || "",
//           ciudadEnvio: s.ciudadEnvio || "",
//           estadoEnvio: s.estadoEnvio || "",
//           cpEnvio: s.cpEnvio || "",
//         };
//       }
//     }
//     if (newestShipping) {
//       return {
//         apodo: newestShipping.apodo || "",
//         calleEnvio: newestShipping.calleEnvio || "",
//         exteriorEnvio: newestShipping.exteriorEnvio || "",
//         interiorEnvio: newestShipping.interiorEnvio || "",
//         coloniaEnvio: newestShipping.coloniaEnvio || "",
//         ciudadEnvio: newestShipping.ciudadEnvio || "",
//         estadoEnvio: newestShipping.estadoEnvio || "",
//         cpEnvio: newestShipping.cpEnvio || "",
//       };
//     }
//     return {
//       apodo: "",
//       calleEnvio: "",
//       exteriorEnvio: "",
//       interiorEnvio: "",
//       coloniaEnvio: "",
//       ciudadEnvio: "",
//       estadoEnvio: "",
//       cpEnvio: "",
//     };
//   }, [selectedShippingId, shippingOptions, newestShipping]);

//   const currentBilling = useMemo(() => {
//     if (!wantsInvoice) {
//       return {
//         razonSocial: "",
//         rfcEmpresa: "",
//         correoFiscal: "",
//         calleFiscal: "",
//         exteriorFiscal: "",
//         interiorFiscal: "",
//         coloniaFiscal: "",
//         ciudadFiscal: "",
//         estadoFiscal: "",
//         cpFiscal: "",
//       };
//     }
//     if (selectedBillingId) {
//       const b = billingOptions.find((x) => x._id === selectedBillingId);
//       if (b) {
//         return {
//           razonSocial: b.razonSocial || "",
//           rfcEmpresa: b.rfcEmpresa || "",
//           correoFiscal: b.correoFiscal || "",
//           calleFiscal: b.calleFiscal || "",
//           exteriorFiscal: b.exteriorFiscal || "",
//           interiorFiscal: b.interiorFiscal || "",
//           coloniaFiscal: b.coloniaFiscal || "",
//           ciudadFiscal: b.ciudadFiscal || "",
//           estadoFiscal: b.estadoFiscal || "",
//           cpFiscal: b.cpFiscal || "",
//         };
//       }
//     }
//     if (newestBilling) {
//       return {
//         razonSocial: newestBilling.razonSocial || "",
//         rfcEmpresa: newestBilling.rfcEmpresa || "",
//         correoFiscal: newestBilling.correoFiscal || "",
//         calleFiscal: newestBilling.calleFiscal || "",
//         exteriorFiscal: newestBilling.exteriorFiscal || "",
//         interiorFiscal: newestBilling.interiorFiscal || "",
//         coloniaFiscal: newestBilling.coloniaFiscal || "",
//         ciudadFiscal: newestBilling.ciudadFiscal || "",
//         estadoFiscal: newestBilling.estadoFiscal || "",
//         cpFiscal: newestBilling.cpFiscal || "",
//       };
//     }
//     return {
//       razonSocial: "",
//       rfcEmpresa: "",
//       correoFiscal: "",
//       calleFiscal: "",
//       exteriorFiscal: "",
//       interiorFiscal: "",
//       coloniaFiscal: "",
//       ciudadFiscal: "",
//       estadoFiscal: "",
//       cpFiscal: "",
//     };
//   }, [wantsInvoice, selectedBillingId, billingOptions, newestBilling]);

//   useEffect(() => {
//     if (!selectedShippingId && newestShipping?._id) setSelectedShippingId(newestShipping._id);
//     if (!selectedBillingId && newestBilling?._id) setSelectedBillingId(newestBilling._id);
//   }, [newestShipping?._id, newestBilling?._id]);

//   // ====== NEW TOTALS MODEL (grand totals always include IVA; breakdown is display-only) ======
//   const VAT_RATE = 0.16;

//   const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//   const fmtMXN = (v) =>
//     `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

//   const {
//     subtotalUSD,         // net USD (pre-IVA)
//     subtotalMXN,         // net MXN (pre-IVA)
//     isMixed,
//     hasUSD,
//     hasMXN,
//     grandUSD_bucket,     // USD bucket grand total (with IVA)
//     grandMXN_bucket,     // MXN bucket grand total (with IVA)
//     combinedBaseMXN,     // pre-IVA combined base in MXN (when pref MXN and dofRate)
//     combinedGrandMXN,    // combined grand in MXN (with IVA)
//     usdInMXN_detail,     // USD→MXN converted (pre-IVA) for detail lines
//   } = useMemo(() => {
//     let usd = 0;
//     let mxn = 0;

//     items.forEach((it) => {
//       const qty = Number(it.amount) || 0;
//       const cur = (it.currency || "USD").toUpperCase();
//       if (cur === "MXN") {
//         const unit = Number(it.priceMXN ?? it.price);
//         if (Number.isFinite(unit)) mxn += qty * unit;
//       } else {
//         const unit = Number(it.priceUSD ?? it.price);
//         if (Number.isFinite(unit)) usd += qty * unit;
//       }
//     });

//     const _hasUSD = usd > 0;
//     const _hasMXN = mxn > 0;
//     const mixed = _hasUSD && _hasMXN;

//     const grandUSD = usd * (1 + VAT_RATE);
//     const grandMXN = mxn * (1 + VAT_RATE);

//     let usdToMXN = null;
//     let baseMXNCombined = null;
//     let grandMXNCombined = null;
//     if (dofRate && Number.isFinite(dofRate)) {
//       usdToMXN = usd * Number(dofRate);         // pre-IVA
//       baseMXNCombined = mxn + usdToMXN;         // pre-IVA
//       grandMXNCombined = baseMXNCombined * (1 + VAT_RATE); // with IVA (constant)
//     }

//     return {
//       subtotalUSD: usd,
//       subtotalMXN: mxn,
//       isMixed: mixed,
//       hasUSD: _hasUSD,
//       hasMXN: _hasMXN,
//       grandUSD_bucket: grandUSD,
//       grandMXN_bucket: grandMXN,
//       combinedBaseMXN: baseMXNCombined,
//       combinedGrandMXN: grandMXNCombined,
//       usdInMXN_detail: usdToMXN,
//     };
//   }, [items, dofRate]);

//   // ---- Legacy totals compatibility (for saved payload); now final totals ALWAYS include IVA ----
//   const totalUSDNative = subtotalUSD;
//   const totalMXNNative = subtotalMXN;

//   const totalAllUSD =
//     Number.isFinite(dofRate) && dofRate
//       ? subtotalUSD + subtotalMXN / Number(dofRate)   // pre-IVA in USD
//       : null;

//   const totalAllMXN =
//     Number.isFinite(dofRate) && dofRate
//       ? subtotalMXN + subtotalUSD * Number(dofRate)   // pre-IVA in MXN
//       : null;

//   const numericDiscount = Number(discountTotal || 0);
//   const baseAllUSD = totalAllUSD ?? 0; // pre-IVA
//   const baseAllMXN = totalAllMXN ?? 0; // pre-IVA

//   // Final totals (ALWAYS include IVA)
//   const finalAllUSD = (baseAllUSD - numericDiscount) * (1 + VAT_RATE);
//   const finalAllMXN = dofRate
//     ? (baseAllMXN - numericDiscount * dofRate) * (1 + VAT_RATE)
//     : null;

//   // VAT fields in payload are populated only if user wants invoice (display semantics)
//   const vatUSD = wantsInvoice ? finalAllUSD - finalAllUSD / (1 + VAT_RATE) : 0;
//   const vatMXN = wantsInvoice && dofRate ? finalAllMXN - finalAllMXN / (1 + VAT_RATE) : 0;

//   // ========== inventory hold helpers ==========
//   const splitPresentation = (presentation = "") => {
//     const s = String(presentation).trim().toUpperCase().replace(/\s+/g, "");
//     const m = s.match(/^(\d+(?:[.,]\d+)?)([A-Z]+)$/);
//     if (!m) return { peso: presentation, unidad: "" };
//     return { peso: m[1].replace(",", "."), unidad: m[2] };
//   };

//   const buildHoldLines = () =>
//     items.map((it) => {
//       const { peso, unidad } = splitPresentation(it.presentation || "");
//       return {
//         product: it.product,
//         peso,
//         unidad,
//         quantity: Number(it.amount) || 0,
//       };
//     });

//   // ===== PDF + Save order (USD first, then MXN, then Resumen Financiero) =====
//   const handleDownloadAndSave = async () => {
//     const doc = new jsPDF();
//     const pageWidth = doc.internal.pageSize.getWidth();
//     const pageHeight = doc.internal.pageSize.getHeight();
//     const today = new Date();

//     // Background
//     doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

//     // Header
//     doc.setFontSize(10);
//     doc.setFont("helvetica", "bold");
//     doc.text(`Fecha de Elaboración: ${today.toLocaleDateString("es-MX")}`, 195, 15, null, null, "right");

//     // Separator
//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 45, 200, 45);

//     // ========= Cliente - Envío (Mongo user + selected/newest shipping address) =========
//     doc.setFontSize(11);
//     doc.setFont("helvetica", "bold");
//     doc.text("Información de Envío", 13, 51);

//     doc.setFontSize(10);

//     // Empresa (Mongo: empresa)
//     doc.addImage(iconBuilding, 13, 53, 5, 5);
//     doc.text(`${userProfile.empresa || ""}`, 19, 57);

//     // Contacto (Mongo: nombre + apellido)
//     doc.addImage(iconContact, 13.5, 59.5, 4, 4);
//     doc.text(
//       `${[userProfile.nombre, userProfile.apellido].filter(Boolean).join(" ")}`,
//       19,
//       63
//     );

//     // Dirección
//     doc.addImage(iconLocation, 13.7, 65, 3, 4);
//     doc.text(
//       `${(currentShipping.calleEnvio || "")}  # ${(currentShipping.exteriorEnvio || "")}  Int. ${(currentShipping.interiorEnvio || "")}`,
//       19,
//       68
//     );
//     doc.text(`Col. ${currentShipping.coloniaEnvio || ""}`, 19, 72);
//     doc.text(
//       `${(currentShipping.ciudadEnvio || "")}, ${(currentShipping.estadoEnvio || "")}. C.P. ${(currentShipping.cpEnvio || "")}`,
//       19,
//       76
//     );

//     // Correo (Mongo: correo)
//     doc.addImage(iconEmail, 13.7, 84, 4, 3);
//     doc.text(`${userProfile.correo || userCredentials?.correo || ""}`, 19, 87);

//     // ========= Información Fiscal =========
//     doc.setFontSize(11);
//     doc.setFont("helvetica", "bold");
//     doc.text("Información Fiscal", 100, 51);

//     doc.setFontSize(10);
//     if (wantsInvoice) {
//       doc.text(`Razón Social: ${currentBilling.razonSocial || ""}`, 106, 57);
//       doc.text(`RFC: ${currentBilling.rfcEmpresa || ""}`, 106, 63);

//       doc.addImage(iconEmail, 100, 65, 4, 3);
//       doc.text(`${currentBilling.correoFiscal || ""}`, 106, 68);

//       doc.addImage(iconLocation, 100.5, 70, 3, 4);
//       doc.text(
//         `${(currentBilling.calleFiscal || "")}  # ${(currentBilling.exteriorFiscal || "")}  Int. ${(currentBilling.interiorFiscal || "")}`,
//         106, 73
//       );
//       doc.text(`Col. ${currentBilling.coloniaFiscal || ""}`, 106, 77);
//       doc.text(
//         `${(currentBilling.ciudadFiscal || "")}, ${(currentBilling.estadoFiscal || "")}. C.P. ${(currentBilling.cpFiscal || "")}`,
//         106, 81
//       );
//     } else {
//       doc.setFont("helvetica", "italic");
//       doc.text("Sin factura.", 106, 57);
//       doc.setFont("helvetica", "normal");
//     }

//     // Separator
//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 92, 200, 92);

//     // ========= Items por divisa =========
//     const normCur = (v) => String(v ?? "USD").trim().toUpperCase();
//     const isMXN = (it) => normCur(it.currency) === "MXN";
//     const isUSD = (it) => normCur(it.currency) === "USD";

//     const usdItems = (items || []).filter(isUSD);
//     const mxnItems = (items || []).filter(isMXN);

//     const makeBodyUSD = (arr) =>
//       arr.map((it) => {
//         const qty = Number(it.amount) || 0;
//         const unit = Number(it.priceUSD ?? it.price) || 0;
//         const pack = it.packPresentation ? ` — ${it.packPresentation}` : "";
//         return [
//           it.product,
//           `${it.presentation || ""}${pack}`,
//           String(qty),
//           `$${unit.toFixed(2)} USD`,
//           `$${(qty * unit).toFixed(2)} USD`,
//         ];
//       });

//     const makeBodyMXN = (arr) =>
//       arr.map((it) => {
//         const qty = Number(it.amount) || 0;
//         const unit = Number(it.priceMXN ?? it.price) || 0;
//         const pack = it.packPresentation ? ` — ${it.packPresentation}` : "";
//         return [
//           it.product,
//           `${it.presentation || ""}${pack}`,
//           String(qty),
//           `$${unit.toFixed(2)} MXN`,
//           `$${(qty * unit).toFixed(2)} MXN`,
//         ];
//       });

//     const sectionTitle = (text, y) => {
//       doc.setFontSize(12);
//       doc.setFont("helvetica", "bold");
//       doc.setTextColor(24, 144, 69);
//       doc.text(text, 13, y);
//       doc.setTextColor(0, 0, 0);
//     };

//     let cursorY = 100;

//     // --- USD primero ---
//     if (usdItems.length) {
//       sectionTitle("Artículos en USD", cursorY - 5);
//       autoTable(doc, {
//         head: [["Producto", "Presentación", "Cantidad", "Precio Unitario", "Total"]],
//         body: makeBodyUSD(usdItems),
//         startY: cursorY,
//         headStyles: { fillColor: [149, 194, 61], textColor: [0, 0, 0], fontStyle: "bold" },
//         styles: { fontSize: 9 },
//         margin: { left: 10, right: 10 },
//         didDrawPage: (data) => {
//           if (data.pageNumber > 1) {
//             doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
//           }
//         },
//       });

//       cursorY = doc.lastAutoTable.finalY + 6;

//       // Subtotal USD (pre-IVA)
//       const subtotalUSD_pdf = usdItems.reduce(
//         (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0),
//         0
//       );
//       doc.setFontSize(11);
//       doc.setFont("helvetica", "bold");
//       doc.text(`Subtotal USD (pre-IVA): $${subtotalUSD_pdf.toFixed(2)} USD`, 140, cursorY);
//       doc.setFont("helvetica", "normal");
//       cursorY += 12;
//     }

//     // --- MXN después ---
//     if (mxnItems.length) {
//       sectionTitle("Artículos en MXN", cursorY - 5);
//       autoTable(doc, {
//         head: [["Producto", "Presentación", "Cantidad", "Precio Unitario", "Total"]],
//         body: makeBodyMXN(mxnItems),
//         startY: cursorY,
//         headStyles: { fillColor: [149, 194, 61], textColor: [0, 0, 0], fontStyle: "bold" },
//         styles: { fontSize: 9 },
//         margin: { left: 10, right: 10 },
//         didDrawPage: (data) => {
//           if (data.pageNumber > 1) {
//             doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
//           }
//         },
//       });

//       cursorY = doc.lastAutoTable.finalY + 6;

//       // Subtotal MXN (pre-IVA)
//       const subtotalMXN_pdf = mxnItems.reduce(
//         (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0),
//         0
//       );
//       doc.setFontSize(11);
//       doc.setFont("helvetica", "bold");
//       doc.text(
//         `Subtotal MXN (pre-IVA): $${subtotalMXN_pdf.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`,
//         140,
//         cursorY
//       );
//       doc.setFont("helvetica", "normal");
//       cursorY += 12;
//     }

//     // ========= Resumen Financiero (grand totals ALWAYS include IVA) =========
//     const fmtUSD_pdf = (v) => `$${(Number(v) || 0).toFixed(2)} USD`;
//     const fmtMXN_pdf = (v) => `$${(Number(v) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
//     const rate = Number(dofRate) || 0;

//     const hasUSD_pdf = usdItems.length > 0;
//     const hasMXN_pdf = mxnItems.length > 0;
//     const isMixed_pdf = hasUSD_pdf && hasMXN_pdf;

//     const subtotalUSD_pdf2 = usdItems.reduce(
//       (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0),
//       0
//     );
//     const subtotalMXN_pdf2 = mxnItems.reduce(
//       (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0),
//       0
//     );

//     const preferred = String(preferredCurrency || "USD").toUpperCase();

//     // Pre-cálculos de GRANDES (con IVA)
//     const grandUSD = subtotalUSD_pdf2 * (1 + VAT_RATE);
//     const grandMXN = subtotalMXN_pdf2 * (1 + VAT_RATE);
//     const usdEnMXN = rate ? subtotalUSD_pdf2 * rate : 0; // pre-IVA
//     const baseCombinedMXN = rate ? subtotalMXN_pdf2 + usdEnMXN : null; // pre-IVA
//     const grandCombinedMXN = baseCombinedMXN != null ? baseCombinedMXN * (1 + VAT_RATE) : null; // con IVA

//     const boxX = 12, boxW = 186, boxPad = 4, lineH = 6;
//     const textMaxW = boxW - boxPad * 2;

//     // Medición aproximada
//     const measure = () => {
//       let y = cursorY + boxPad;
//       y += lineH; // "Moneda seleccionada"
//       if (preferred === "MXN") {
//         if (grandCombinedMXN != null) {
//           // Total (and maybe 2 extra lines for breakdown)
//           y += wantsInvoice ? lineH * 3 : lineH;
//           // Detalle + TC lines if needed
//           if (isMixed_pdf || hasUSD_pdf) {
//             const det = rate
//               ? (isMixed_pdf
//                   ? `Detalle (pre-IVA): USD (${fmtUSD_pdf(subtotalUSD_pdf2)}) × ${rate.toFixed(2)} = ${fmtMXN_pdf(usdEnMXN)}; + MXN nativo ${fmtMXN_pdf(subtotalMXN_pdf2)}.`
//                   : `Detalle (pre-IVA): USD (${fmtUSD_pdf(subtotalUSD_pdf2)}) × ${rate.toFixed(2)} = ${fmtMXN_pdf(usdEnMXN)}.`)
//               : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//             const detLines = doc.splitTextToSize(det, textMaxW);
//             y += detLines.length * 5 + 3;
//             if (rate) y += 5; // TC
//           }
//         } else {
//           // no TC available
//           const err = "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//           const lines = doc.splitTextToSize(err, textMaxW);
//           y += lines.length * 5 + 3;
//         }
//         if (isMixed_pdf) {
//           const legend = "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//           const l = doc.splitTextToSize(legend, textMaxW);
//           y += l.length * 5 + 5;
//         }
//       } else {
//         if (hasUSD_pdf) y += wantsInvoice ? lineH * 3 : lineH;
//         if (hasMXN_pdf) y += wantsInvoice ? lineH * 3 : lineH;
//         if (isMixed_pdf && rate) y += 5; // TC
//         if (isMixed_pdf) {
//           const legend = "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//           const l = doc.splitTextToSize(legend, textMaxW);
//           y += l.length * 5 + 5;
//         }
//         if (!hasUSD_pdf && hasMXN_pdf) {
//           const note = "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
//           const n = doc.splitTextToSize(note, textMaxW);
//           y += n.length * 5 + 3;
//         }
//       }
//       return y + boxPad;
//     };

//     const boxHeight = Math.max(14, measure() - cursorY);
//     doc.setFillColor(241, 241, 241);
//     doc.setDrawColor(200, 200, 200);
//     if (doc.roundedRect) doc.roundedRect(boxX, cursorY, boxW, boxHeight, 2.5, 2.5, "FD");
//     else doc.rect(boxX, cursorY, boxW, boxHeight, "FD");

//     // Render dentro de la caja
//     let y = cursorY + boxPad;
//     doc.setFontSize(10);
//     doc.setFont("helvetica", "bold");
//     doc.text(`Moneda de pago seleccionada: ${preferred}`, boxX + boxPad, y + 3);
//     y += lineH;
//     doc.setFont("helvetica", "normal");

//     const writeBreakdownUSD = (g) => {
//       const sub = g / (1 + VAT_RATE);
//       const iva = g - sub;
//       doc.text(`USD — Subtotal: ${fmtUSD_pdf(sub)}`, boxX + boxPad, y + 3); y += lineH;
//       doc.text(`USD — IVA (16%): ${fmtUSD_pdf(iva)}`, boxX + boxPad, y + 3); y += lineH;
//       doc.setFont("helvetica", "bold");
//       doc.text(`USD — Total: ${fmtUSD_pdf(g)}`, boxX + boxPad, y + 3); y += lineH;
//       doc.setFont("helvetica", "normal");
//     };
//     const writeBreakdownMXN = (g) => {
//       const sub = g / (1 + VAT_RATE);
//       const iva = g - sub;
//       doc.text(`MXN — Subtotal: ${fmtMXN_pdf(sub)}`, boxX + boxPad, y + 3); y += lineH;
//       doc.text(`MXN — IVA (16%): ${fmtMXN_pdf(iva)}`, boxX + boxPad, y + 3); y += lineH;
//       doc.setFont("helvetica", "bold");
//       doc.text(`MXN — Total: ${fmtMXN_pdf(g)}`, boxX + boxPad, y + 3); y += lineH;
//       doc.setFont("helvetica", "normal");
//     };

//     if (preferred === "MXN") {
//       if (grandCombinedMXN == null) {
//         doc.setTextColor(180, 0, 0);
//         const err = "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//         doc.text(doc.splitTextToSize(err, textMaxW), boxX + boxPad, y);
//         doc.setTextColor(0, 0, 0);
//         y += 10;
//       } else {
//         if (wantsInvoice) {
//           writeBreakdownMXN(grandCombinedMXN);
//         } else {
//           doc.setFont("helvetica", "bold");
//           doc.text(`Total a pagar en MXN: ${fmtMXN_pdf(grandCombinedMXN)}`, boxX + boxPad, y + 3);
//           doc.setFont("helvetica", "normal");
//           y += lineH;
//         }

//         // Detalle (pre-IVA) + TC
//         if (isMixed_pdf || hasUSD_pdf) {
//           doc.setFontSize(9);
//           doc.setTextColor(120, 120, 120);
//           const det = `Detalle (pre-IVA): USD (${fmtUSD_pdf(subtotalUSD_pdf2)}) × ${rate.toFixed(2)} = ${fmtMXN_pdf(usdEnMXN)}; + MXN nativo ${fmtMXN_pdf(subtotalMXN_pdf2)}.`;
//           doc.text(doc.splitTextToSize(det, textMaxW), boxX + boxPad, y + 2);
//           y += 8;

//           doc.text(
//             `Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD${dofDate ? `  (Fecha: ${dofDate})` : ""}`,
//             boxX + boxPad,
//             y + 2
//           );
//           doc.setFontSize(10);
//           doc.setTextColor(0, 0, 0);
//           y += 5;
//         }
//       }

//       if (isMixed_pdf) {
//         doc.setTextColor(180, 0, 0);
//         doc.setFont("helvetica", "bold");
//         const legend = "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//         doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 3);
//         doc.setTextColor(0, 0, 0);
//         doc.setFont("helvetica", "normal");
//       }
//     } else {
//       // Preferencia USD — buckets por divisa (cada uno con GRAND siempre y breakdown opcional)
//       if (hasUSD_pdf) {
//         if (wantsInvoice) {
//           writeBreakdownUSD(grandUSD);
//         } else {
//           doc.setFont("helvetica", "bold");
//           doc.text(`A pagar en USD (Total): ${fmtUSD_pdf(grandUSD)}`, boxX + boxPad, y + 3);
//           doc.setFont("helvetica", "normal");
//           y += lineH;
//         }
//       }
//       if (hasMXN_pdf) {
//         if (wantsInvoice) {
//           writeBreakdownMXN(grandMXN);
//         } else {
//           doc.setFont("helvetica", "bold");
//           doc.text(`A pagar en MXN (Total): ${fmtMXN_pdf(grandMXN)}`, boxX + boxPad, y + 3);
//           doc.setFont("helvetica", "normal");
//           y += lineH;
//         }
//       }
//       if (isMixed_pdf && rate) {
//         doc.setFontSize(9);
//         doc.setTextColor(120, 120, 120);
//         doc.text(
//           `Tipo de cambio DOF: ${rate.toFixed(2)} MXN/USD${dofDate ? `  (Fecha: ${dofDate})` : ""}`,
//           boxX + boxPad,
//           y + 2
//         );
//         doc.setFontSize(10);
//         doc.setTextColor(0, 0, 0);
//         y += 5;
//       }
//       if (isMixed_pdf) {
//         doc.setTextColor(180, 0, 0);
//         doc.setFont("helvetica", "bold");
//         const legend = "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//         doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 5);
//         doc.setTextColor(0, 0, 0);
//         doc.setFont("helvetica", "normal");
//       }
//       if (!hasUSD_pdf && hasMXN_pdf) {
//         doc.setFontSize(9);
//         doc.setTextColor(120, 120, 120);
//         const note = "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
//         doc.text(doc.splitTextToSize(note, textMaxW), boxX + boxPad, y + 2);
//         doc.setTextColor(0, 0, 0);
//         doc.setFontSize(10);
//       }
//     }

//     // Avanza debajo del resumen
//     cursorY = cursorY + boxHeight + 6;

//     // ========= Opción de Pago =========
//     const creditBoxX = 10;
//     const creditBoxY = cursorY;
//     const creditBoxWidth = 190;
//     const creditBoxHeight = 20;
//     const creditBoxRadius = 4;

//     if (doc.roundedRect) {
//       doc.setFillColor(241, 241, 241);
//       doc.roundedRect(creditBoxX, creditBoxY, creditBoxWidth, creditBoxHeight, creditBoxRadius, creditBoxRadius, "F");
//     } else {
//       doc.setFillColor(241, 241, 241);
//       doc.rect(creditBoxX, creditBoxY, creditBoxWidth, creditBoxHeight, "F");
//     }

//     doc.setFontSize(11);
//     doc.setFont("helvetica", "bold");
//     doc.text(`Opción de Pago: ${paymentOption}`, 15, creditBoxY + 6);
//     if (paymentOption === "Crédito") {
//       doc.text(`Plazo de Crédito: ${creditDays} Días`, 15, creditBoxY + 11);
//       doc.text(`Vencimiento: ${addDays(new Date(), creditDays).toLocaleDateString("es-MX")}`, 15, creditBoxY + 16);
//     }

//     // ========= PÁGINA DE CUENTAS =========
//     doc.addPage();
//     doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

//     let y2 = 35;
//     doc.setFont("helvetica", "bold");
//     doc.setFontSize(16);
//     doc.setTextColor(24, 144, 69);
//     doc.text(`Cuentas para realizar pago:`, 13, y2 + 5);

//     const payBoxX = 10;
//     const payBoxY = y2 + 10;
//     const payBoxWidth = 190;
//     const payBoxHeight = 135;
//     const payBoxRadius = 4;

//     if (doc.roundedRect) {
//       doc.setFillColor(241, 241, 241);
//       doc.roundedRect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, payBoxRadius, payBoxRadius, "F");
//     } else {
//       doc.setFillColor(241, 241, 241);
//       doc.rect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, "F");
//     }

//     const miniBox = (title, lines, startY) => {
//       const x = 12;
//       const w = 120;
//       const pad = 4;
//       const lineH = 5;
//       const titleH = title ? lineH + 1 : 0;
//       const h = pad * 2 + titleH + lines.length * lineH;

//       if (doc.roundedRect) {
//         doc.setFillColor(255, 255, 255);
//         doc.roundedRect(x, startY, w, h, 3, 3, "F");
//       } else {
//         doc.setFillColor(255, 255, 255);
//         doc.rect(x, startY, w, h, "F");
//       }

//       let ty = startY + pad + (title ? lineH : 0);

//       if (title) {
//         doc.setFont("helvetica", "bold");
//         doc.setFontSize(11);
//         doc.text(title, x + pad, startY + pad + 3.5);
//       }

//       doc.setFont("helvetica", "normal");
//       doc.setFontSize(10);
//       lines.forEach((t) => {
//         doc.text(t, x + pad, ty + 2);
//         ty += lineH;
//       });

//       return startY + h;
//     };

//     doc.setFontSize(11);
//     doc.setTextColor(0, 0, 0);

//     if (wantsInvoice) {
//       // Empresa (MXN + USD)
//       doc.setFont("helvetica", "bold");
//       doc.setFontSize(13);
//       doc.text(`CUENTA EN PESOS MEXICANOS`, 15, y2 + 17);

//       doc.setFontSize(11);
//       doc.setFont("helvetica", "bold");
//       doc.text(`TRANSFERENCIA O DEPÓSITO BANCARIO:`, 15, y2 + 24);

//       let cursor2 = y2 + 28;

//       cursor2 = miniBox(
//         "BANCO: BBVA",
//         [
//           "NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV",
//           "NO. DE CUENTA: 010 115 1207",
//           "CLABE: 012 320 001 011 512 076",
//         ],
//         cursor2
//       );
//       cursor2 += 6;

//       doc.setFont("helvetica", "bold");
//       doc.setFontSize(13);
//       doc.text(`CUENTA EN DÓLARES AMERICANOS`, 15, cursor2 + 12);
//       doc.setFontSize(11);
//       doc.setFont("helvetica", "bold");
//       doc.text(`TRANSFERENCIA:`, 15, cursor2 + 19);

//       cursor2 += 24;

//       cursor2 = miniBox(
//         "BANCO: GRUPO FINANCIERO MONEX",
//         [
//           "NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV",
//           "CLABE: 112 180 000 028 258 341",
//         ],
//         cursor2
//       );
//       cursor2 += 6;

//       miniBox(
//         "BANCO: BANCO INVEX, S.A.",
//         [
//           "NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV",
//           "CLABE: 059 180 030 020 014 234",
//         ],
//         cursor2
//       );
//     } else {
//       // Personal MXN
//       doc.setFont("helvetica", "bold");
//       doc.setFontSize(13);
//       doc.text(`CUENTA EN PESOS MEXICANOS - SIN FACTURA`, 15, y2 + 17);

//       doc.setFontSize(11);
//       doc.text(`TRANSFERENCIA O DEPÓSITO BANCARIO`, 15, y2 + 24);
//       doc.text(`BANCO: BBVA`, 15, y2 + 31);

//       doc.setFont("helvetica", "normal");
//       doc.text(`NOMBRE: ALEJANDRO GONZALEZ AGUIRRE`, 15, y2 + 36);
//       doc.text(`NO. DE CUENTA: 124 525 4078`, 15, y2 + 41);
//       doc.text(`CLABE: 012 320 012 452 540 780`, 15, y2 + 46);
//       doc.text(`NO. DE TARJETA: 4152 3141 1021 5384`, 15, y2 + 51);
//     }

//     // ========= Build payload =========
//     const userEmail = userCredentials?.correo;
//     const creditDue =
//       paymentOption === "Crédito" && creditAllowed
//         ? addDays(new Date(), creditDays).toISOString()
//         : null;

//     const orderInfo = {
//       userEmail,
//       items,
//       totals: {
//         totalUSDNative: Number(totalUSDNative.toFixed(2)),   // pre-IVA USD bucket
//         totalMXNNative: Number(totalMXNNative.toFixed(2)),   // pre-IVA MXN bucket
//         totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null, // pre-IVA combined USD
//         totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null, // pre-IVA combined MXN
//         dofRate,
//         dofDate,
//         discountUSD: Number(discountTotal || 0),
//         vatUSD: Number(vatUSD.toFixed(2)),                   // only if invoice
//         finalAllUSD: Number(finalAllUSD.toFixed(2)),         // ALWAYS includes IVA
//         vatMXN: finalAllMXN !== null ? Number(vatMXN.toFixed(2)) : null,
//         finalAllMXN: finalAllMXN !== null ? Number(finalAllMXN.toFixed(2)) : null, // ALWAYS includes IVA
//       },
//       requestBill: !!wantsInvoice,
//       shippingInfo: { ...currentShipping },
//       billingInfo: wantsInvoice ? { ...currentBilling } : {},
//       shippingPreferences: { ...shippingPrefs },
//       orderDate: new Date().toISOString(),
//       orderStatus: "Pedido Realizado",
//       paymentOption,
//       creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
//       creditDueDate: creditDue,
//     };

//     try {
//       // Subir primero
//       const pdfBlob = doc.output("blob");
//       const form = new FormData();
//       form.append("order", JSON.stringify(orderInfo));
//       form.append("pdf", pdfBlob, "order_summary.pdf");

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

//       // Reserva inventario (opcional)
//       try {
//         const holdLines = buildHoldLines();
//         if (createdOrderId && holdLines.length > 0) {
//           await axios.post(
//             `${API}/inventory/hold`,
//             { orderId: createdOrderId, holdMinutes: 120, lines: holdLines },
//             { withCredentials: false, timeout: 15000 }
//           );
//         }
//       } catch (holdErr) {
//         console.error("Error al reservar inventario:", holdErr);
//       }

//       // Descargar local
//       doc.save("order_summary.pdf");

//       alert("Orden guardada exitosamente");
//       navigate("/myOrders", { state: { from: "orderNow" } });
//     } catch (error) {
//       console.error("Error al guardar la orden o al reservar inventario", error);
//       const msg =
//         error?.message ||
//         error?.response?.data?.error ||
//         "Revisa tu conexión y vuelve a intentar.";
//       alert(`Ocurrió un error al guardar la orden o al reservar inventario\n${msg}`);
//     }
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
//         <div className="edit-titleIcon-Div">
//           <label className="editAddress-headerLabel">Detalles de Orden</label>
//           <img src={CarritoIcono} alt="Carrito" width="35" height="35" />
//         </div>

//         <div className="orderNowBody-Div">
//           {/* ===== Shipping Preferences ===== */}
//           <div className="headerAndDets-Div">
//             <div className="headerEditIcon-Div">
//               <label className="newAddress-Label">Preferencias de Envío</label>
//             </div>

//             <div className="orderNow-AddressDiv">
//               <label className="orderNow-Label">
//                 <b>Transportista:</b>{" "}<br></br>
//                 {shippingPrefs.preferredCarrier || "No especificado"}
//               </label>
//               <br></br>
//               <label className="orderNow-Label">
//                 <b>Mercancía Asegurada:</b>{" "}<br></br>
//                 {shippingPrefs.insureShipment ? "Sí" : "No"}
//               </label>
//             </div>
//           </div>

//           {/* Shipping address */}
//           <div className="headerAndDets-Div">
//             <div className="headerEditIcon-Div">
//               <label className="newAddress-Label">Dirección de Envío</label>
//               <select
//                 className="alternateAddress-Select"
//                 value={selectedShippingId}
//                 onChange={(e) => setSelectedShippingId(e.target.value)}
//               >
//                 <option value="">Seleccione otra dirección</option>
//                 {shippingOptions.map((opt) => (
//                   <option key={opt._id} value={opt._id}>
//                     {opt.apodo || `${opt.calleEnvio} ${opt.exteriorEnvio || ""}`}
//                   </option>
//                 ))}
//               </select>
//             </div>

//             <div className="orderNow-AddressDiv">
//               <label className="orderNow-Label">
//                 {currentShipping.calleEnvio} #{currentShipping.exteriorEnvio} Int. {currentShipping.interiorEnvio}
//               </label>
//               <label className="orderNow-Label">Col. {currentShipping.coloniaEnvio}</label>
//               <label className="orderNow-Label">
//                 {currentShipping.ciudadEnvio}, {currentShipping.estadoEnvio}. C.P. {currentShipping.cpEnvio}
//               </label>
//             </div>
//           </div>

//           {/* Invoice toggle */}
//           <div className="headerAndDets-Div" style={{ marginTop: 10 }}>
//             <div className="headerEditIcon-Div">
//               <label className="newAddress-Label">¿Deseas factura?</label>
//             </div>
//             <div className="orderNow-AddressDiv" style={{ display: "flex", gap: 12, alignItems: "center" }}>
//               <select
//                 className="invoiceRequest-Dropdown"
//                 value={wantsInvoice ? "true" : "false"}
//                 onChange={(e) => {
//                   const v = e.target.value === "true";
//                   setWantsInvoice(v);
//                   localStorage.setItem("billRequest", String(v));
//                 }}
//               >
//                 <option value="false">No</option>
//                 <option value="true">Sí</option>
//               </select>
//             </div>
//           </div>

//           {/* Billing – only show when wantsInvoice === true */}
//           {wantsInvoice && (
//             <div className="headerAndDets-Div">
//               <div className="headerEditIcon-Div">
//                 <label className="newAddress-Label">Datos de Facturación</label>
//                 <select
//                   className="alternateAddress-Select"
//                   value={selectedBillingId}
//                   onChange={(e) => setSelectedBillingId(e.target.value)}
//                 >
//                   <option value="">Seleccione otra dirección</option>
//                   {billingOptions.map((opt) => (
//                     <option key={opt._id} value={opt._id}>
//                       {opt.apodo || opt.razonSocial || opt.rfcEmpresa}
//                     </option>
//                   ))}
//                 </select>
//               </div>

//               <div className="orderNow-AddressDiv">
//                 <label className="orderNow-Label">{currentBilling.razonSocial}</label>
//                 <label className="orderNow-Label">{currentBilling.rfcEmpresa}</label>
//                 <br />
//                 <label className="orderNow-Label">
//                   {currentBilling.calleFiscal} #{currentBilling.exteriorFiscal} Int. {currentBilling.interiorFiscal}
//                 </label>
//                 <label className="orderNow-Label">Col. {currentBilling.coloniaFiscal}</label>
//                 <label className="orderNow-Label">
//                   {currentBilling.ciudadFiscal}, {currentBilling.estadoFiscal}. C.P. {currentBilling.cpFiscal}
//                 </label>
//               </div>
//             </div>
//           )}

//           {/* Items */}
//           <div className="headerAndDets-Div">
//             <label className="orderSummary-Label">Resumen de orden</label>
//           </div>

//           <div className="products-Div">
//             <ul>
//               {items.map((item, i) => {
//                 const cur = (item.currency || "USD").toUpperCase();
//                 const unit =
//                   cur === "MXN"
//                     ? `${Number(item.priceMXN ?? item.price).toFixed(2)} MXN`
//                     : `${Number(item.priceUSD ?? item.price).toFixed(2)} USD`;
//                 const line =
//                   cur === "MXN"
//                     ? (Number(item.amount) * Number(item.priceMXN ?? item.price)).toFixed(2) + " MXN"
//                     : (Number(item.amount) * Number(item.priceUSD ?? item.price)).toFixed(2) + " USD";

//                 return (
//                   <div className="orderImageAndDets-Div" key={i}>
//                     <img
//                       src={getItemImage(item)}
//                       alt={item.product}
//                       width="75"
//                       height="75"
//                       onError={(e) => {
//                         e.currentTarget.src = fallbackImg;
//                       }}
//                     />
//                     <div className="orderDetails-Div">
//                       <label className="orderDets-Label">
//                         <b>{item.product}</b>
//                       </label>
//                       <label className="orderDets-Label">
//                         <b>Presentación: {item.presentation}</b>
//                         {item.packPresentation ? ` — ${item.packPresentation}` : ""}
//                       </label>
//                       <br />
//                       <label className="orderDets-Label">
//                         <b>Cantidad:</b> {item.amount}
//                       </label>
//                       <label className="orderDets-Label">
//                         <b>Precio Unitario:</b> ${unit}
//                       </label>
//                       <label className="orderDetsTotal-Label">
//                         <b>Total:</b> ${line}
//                       </label>
//                     </div>
//                   </div>
//                 );
//               })}
//             </ul>

//             {/* Summary box (grand totals ALWAYS include IVA; show breakdown only when wantsInvoice) */}
//             <div className="orderNow-summaryDiv">
//               {(() => {
//                 const rows = [
//                   { label: "Moneda de pago:", value: preferredCurrency, boldLabel: true },
//                 ];

//                 const writeBreakdownRows = (prefix, grand, fmt) => {
//                   const sub = grand / (1 + VAT_RATE);
//                   const iva = grand - sub;
//                   rows.push({ label: `${prefix} Sub-total:`, value: fmt(sub) });
//                   rows.push({ label: `${prefix} IVA (16%):`, value: fmt(iva) });
//                   rows.push({ label: `${prefix} Total:`, value: fmt(grand), boldLabel: true });
//                 };

//                 if (preferredCurrency === "USD") {
//                   if (hasUSD) {
//                     if (wantsInvoice) {
//                       writeBreakdownRows("USD —", grandUSD_bucket, fmtUSD);
//                     } else {
//                       rows.push({
//                         label: "Total USD:",
//                         value: fmtUSD(grandUSD_bucket),
//                         boldLabel: true,
//                       });
//                     }
//                   }
//                   if (hasMXN) {
//                     if (wantsInvoice) {
//                       writeBreakdownRows("MXN —", grandMXN_bucket, fmtMXN);
//                     } else {
//                       rows.push({
//                         label: "Total MXN:",
//                         value: fmtMXN(grandMXN_bucket),
//                         boldLabel: true,
//                       });
//                     }
//                   }
//                 } else {
//                   // Preferred MXN (combined)
//                   if (combinedGrandMXN != null) {
//                     if (wantsInvoice) {
//                       writeBreakdownRows("MXN —", combinedGrandMXN, fmtMXN);
//                     } else {
//                       rows.push({
//                         label: "Total a pagar en MXN:",
//                         value: fmtMXN(combinedGrandMXN),
//                         boldLabel: true,
//                       });
//                     }

//                     if (isMixed || hasUSD) {
//                       rows.push({
//                         label: "Detalle (pre-IVA):",
//                         value:
//                           dofRate && usdInMXN_detail != null
//                             ? `USD (${fmtUSD(subtotalUSD)}) × ${Number(dofRate).toFixed(2)} = ${fmtMXN(usdInMXN_detail)}; + MXN nativo ${fmtMXN(subtotalMXN)}`
//                             : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.",
//                       });
//                       rows.push({
//                         label: "Tipo de cambio:",
//                         value: dofRate
//                           ? `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
//                           : fxError
//                           ? "—"
//                           : "Cargando...",
//                       });
//                     }
//                   } else {
//                     rows.push({
//                       label: "Total a pagar en MXN:",
//                       value: "—",
//                       boldLabel: true,
//                     });
//                   }
//                 }

//                 return (
//                   <>
//                     {rows.map((r, i) => (
//                       <div className="summary-pair" key={i}>
//                         <div className={`summary-label ${r.boldLabel ? "bold" : ""}`}>{r.label}</div>
//                         <div className="summary-value">{r.value}</div>
//                       </div>
//                     ))}

//                     {isMixed && (
//                       <div className="summary-note">
//                         En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.
//                       </div>
//                     )}
//                   </>
//                 );
//               })()}
//             </div>
//           </div>

//           {/* Payment option / Credit */}
//           <div className="headerAndDets-Div" style={{ marginTop: 16 }}>
//             <div className="headerEditIcon-Div">
//               <label className="newAddress-Label">Opción de Pago</label>
//             </div>

//             {creditBlocked && (
//               <div
//                 className="orderNow-AddressDiv"
//                 style={{ color: "#b00", fontSize: 13, marginBottom: 8 }}
//               >
//                 Este cliente tiene condiciones pendientes. El crédito no está disponible para nuevas órdenes.
//               </div>
//             )}

//             <div
//               className="orderNow-AddressDiv"
//               style={{ display: "flex", gap: 12, alignItems: "center" }}
//             >
//               <select
//                 className="alternateAddress-Select"
//                 value={paymentOption}
//                 onChange={(e) => setPaymentOption(e.target.value)}
//                 disabled={!creditAllowed}
//               >
//                 <option value="Contado">Contado</option>
//                 {creditAllowed && <option value="Crédito">Crédito</option>}
//               </select>

//               {paymentOption === "Crédito" && creditAllowed && (
//                 <span style={{ fontSize: 13 }}>
//                   Vigencia: {creditDays} día(s). Vence:{" "}
//                   {addDays(new Date(), creditDays).toLocaleDateString("es-MX")}
//                 </span>
//               )}
//             </div>
//           </div>

//           <div className="orderReqBts-Div">
//             <button className="submitOrder-Btn" type="submit" onClick={handleDownloadAndSave}>
//               Descargar <br />
//               Orden
//             </button>
//           </div>
//         </div>
//       </div>

//       <div className="app-footer footerMenuDiv">
//         <div className="footerHolder">
//           <div className="footerIcon-NameDiv" onClick={() => navigate("/userHome")}>
//             <FontAwesomeIcon icon={faHouse} className="footerIcons" />{" "}
//             <label className="footerIcon-Name">PRINCIPAL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={() => navigate("/userProfile")}>
//             <FontAwesomeIcon icon={faUser} className="footerIcons" />{" "}
//             <label className="footerIcon-Name">MI PERFIL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={() => navigate("/newOrder")}>
//             <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />{" "}
//             <label className="footerIcon-Name">ORDENA</label>
//           </div>
//         </div>
//       </div>
//     </body>
//   );
// }









// ---> OG <----

// // In orderNow.jsx I'd like to perform the following modifications: add an info block before "Dirección de Envío" called "Preferencias de Envío" where shippingPreferences stored in Mongo are preloaded (preferredCarrier: Transportista, insureShipment: Mercanía Asegurada). As well, I would like to condition the appereace of the block "Datos de Facturación". Add a toggle/checkpoints that asks "Deseas Factura". If user answers "No", then leave "Datos de Facturacion" innactive. If user answers "Sí", then show "Datos de Facturacion" block. Regarding this toggle, I would also like to perform certain conditionals to the PDF. Specifically, if answer is "Si" to wanting factura, show certain bank accounts, but if answer is "No", then show another set of bank accounts on PDF. Jere is my current orderNow.jsx. Can you do a direct edit

// import { useState, useEffect, useMemo } from "react";
// import { useLocation, useNavigate } from "react-router-dom";
// import axios from "axios";
// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import jsPDF from "jspdf";
// import autoTable from "jspdf-autotable";

// import { API } from "/src/lib/api";

// import Papa from "papaparse";
// import fallbackImg from "../assets/images/Product_GISSample.png";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import CarritoIcono from "/src/assets/images/Icono_Carrito.png";

// import iconBuilding from "../assets/images/iconBuilding.png";
// import iconContact from "../assets/images/iconContact.png";
// import iconLocation from "../assets/images/iconLocation.png";
// import iconPhone from "../assets/images/iconPhone.png";
// import iconEmail from "../assets/images/iconEmail.png";

// import { docDesign } from "/src/components/documentDesign";

// export default function OrderNow() {
//   const navigate = useNavigate();
//   const location = useLocation();

//   // Items now can carry: { product, presentation, packPresentation, amount, price, currency, priceUSD?, priceMXN?, weight }
//   const items = location.state?.items || [];

//   const [discountTotal, setDiscountTotal] = useState("");
//   const [requestBill, setRequestBill] = useState("");
//   const [imageLookup, setImageLookup] = useState({});

//   // DOF FX
//   const [dofRate, setDofRate] = useState(null);
//   const [dofDate, setDofDate] = useState(null);
//   const [fxError, setFxError] = useState(null);

//   // Credit
//   const CREDIT_SHEET_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vSahPxZ8Xq6jSlgWh7F7Rm7wqDsSyBrb6CEFdsEjyXYSkcsS62yXpiGb9GqIu8c4An3l7yBUbpe23hY/pub?gid=0&single=true&output=csv";

//   const [creditRow, setCreditRow] = useState(null);
//   const [creditAllowed, setCreditAllowed] = useState(false);
//   const [creditBlocked, setCreditBlocked] = useState(false);
//   const [creditDays, setCreditDays] = useState(0);
//   const [paymentOption, setPaymentOption] = useState("Contado");

//   // fetch product images
//   const makeKey = (name = "", pres = "") =>
//     `${name}`.trim().toLowerCase() + "__" + `${pres}`.trim().toLowerCase();

//   useEffect(() => {
//     const csvUrl =
//       "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

//     axios
//       .get(csvUrl)
//       .then((response) => {
//         Papa.parse(response.data, {
//           header: true,
//           skipEmptyLines: true,
//           complete: ({ data }) => {
//             const map = {};
//             data.forEach((row) => {
//               const name = row.NOMBRE_PRODUCTO || "";
//               const pres = row.PESO_PRODUCTO + row.UNIDAD_MEDICION || "";
//               const img = row.IMAGE_URL || row.IMAGE || "";
//               if (name && pres && img) map[makeKey(name, pres)] = img;
//             });
//             setImageLookup(map);
//           },
//         });
//       })
//       .catch((err) => console.error("Error fetching product CSV:", err));
//   }, []);

//   const getItemImage = (item) => {
//     const url = imageLookup[makeKey(item.product, item.presentation)];
//     return url && url.length > 0 ? url : fallbackImg;
//   };

//   // DOF rate
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

//   // localStorage bits
//   useEffect(() => {
//     const savedDiscount = localStorage.getItem("discountTotal");
//     setDiscountTotal(savedDiscount || "0");
//     const savedRequestBill = localStorage.getItem("billRequest");
//     // billRequest was saved as boolean string ("true"/"false")
//     setRequestBill(savedRequestBill === "true" ? "true" : "false");
//   }, []);

//   // user + addresses
//   const [userCredentials, setUserCredentials] = useState([]);
//   // MODIF + NEW AUG13
//   const [shippingOptions, setShippingOptions] = useState([]);
//   const [billingOptions, setBillingOptions] = useState([]);

//   const [selectedShippingId, setSelectedShippingId] = useState("");
//   const [selectedBillingId, setSelectedBillingId] = useState("");
//   // END MODIF + NEW AUG13

//   useEffect(() => {
//     const savedCreds = JSON.parse(localStorage.getItem("userLoginCreds"));
//     setUserCredentials(savedCreds || []);
//     fetchCSVClientData();
//   }, []);

//   // Client DB
//   const [csvClientData, setCsvClientData] = useState([]);
//   const fetchCSVClientData = () => {
//     const csvClientUrl =
//       "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
//     axios
//       .get(csvClientUrl)
//       .then((response) => {
//         const rows = response.data.split(/\r\n/);
//         const headers = rows[0].split(",");
//         const data = [];
//         for (let i = 1; i < rows.length; i++) {
//           const r = rows[i].split(",");
//           const obj = {};
//           headers.forEach((h, idx) => (obj[h] = r[idx]));
//           data.push(obj);
//         }
//         setCsvClientData(data);
//       })
//       .catch((error) => {
//         console.error("Error fetching CSV data:", error);
//       });
//   };

//   // map client row
//   const clientNameFromSheet = useMemo(() => {
//     if (!userCredentials?.correo || csvClientData.length === 0) return "";
//     const row = csvClientData.find(
//       (r) =>
//         (r.CORREO_EMPRESA || "").trim().toLowerCase() ===
//         (userCredentials.correo || "").trim().toLowerCase()
//     );
//     return (row?.NOMBRE_APELLIDO || "").trim();
//   }, [csvClientData, userCredentials?.correo]);

//   // shipping + billing from client DB
//   let telefonoEmpresa,
//     correoEmpresa,
//     nombreEmpresa,
//     nombreEncargado,
//     calleEnvio,
//     exteriorEnvio,
//     interiorEnvio,
//     coloniaEnvio,
//     ciudadEnvio,
//     estadoEnvio,
//     cpEnvio,
//     razonSocial,
//     rfcEmpresa,
//     correoFiscal,
//     calleFiscal,
//     exteriorFiscal,
//     interiorFiscal,
//     coloniaFiscal,
//     ciudadFiscal,
//     estadoFiscal,
//     cpFiscal;

//   for (let i in csvClientData) {
//     if (csvClientData[i].CORREO_EMPRESA === userCredentials.correo) {
//       telefonoEmpresa = csvClientData[i].TELEFONO_EMPRESA;
//       correoEmpresa = csvClientData[i].CORREO_EMPRESA;
//       nombreEmpresa = csvClientData[i].NOMBRE_EMPRESA;
//       nombreEncargado = csvClientData[i].NOMBRE_APELLIDO;

//       calleEnvio = csvClientData[i].CALLE_ENVIO;
//       exteriorEnvio = csvClientData[i].EXTERIOR_ENVIO;
//       interiorEnvio = csvClientData[i].INTERIOR_ENVIO;
//       coloniaEnvio = csvClientData[i].COLONIA_ENVIO;
//       ciudadEnvio = csvClientData[i].CIUDAD_ENVIO;
//       estadoEnvio = csvClientData[i].ESTADO_ENVIO;
//       cpEnvio = csvClientData[i].CP_ENVIO;

//       razonSocial = csvClientData[i].RAZON_SOCIAL;
//       rfcEmpresa = csvClientData[i].RFC_EMPRESA;
//       correoFiscal = csvClientData[i].CORREO_FISCAL;
//       calleFiscal = csvClientData[i].CALLE_FISCAL;
//       exteriorFiscal = csvClientData[i].EXTERIOR_FISCAL;
//       interiorFiscal = csvClientData[i].INTERIOR_FISCAL;
//       coloniaFiscal = csvClientData[i].COLONIA_FISCAL;
//       ciudadFiscal = csvClientData[i].CIUDAD_FISCAL;
//       estadoFiscal = csvClientData[i].ESTADO_FISCAL;
//       cpFiscal = csvClientData[i].CP_FISCAL;
//     }
//   }

//   // fetch credit settings when client name is known
//   const norm = (s) =>
//     (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
//   const addDays = (date, days) => {
//     const d = new Date(date);
//     d.setDate(d.getDate() + (Number(days) || 0));
//     return d;
//   };

//   useEffect(() => {
//     if (!clientNameFromSheet) return;

//     axios
//       .get(CREDIT_SHEET_URL)
//       .then((resp) => {
//         Papa.parse(resp.data, {
//           header: true,
//           skipEmptyLines: true,
//           complete: ({ data }) => {
//             const row = data.find((r) => norm(r.NOMBRE_CLIENTE) === norm(clientNameFromSheet));
//             setCreditRow(row || null);

//             const option = (row?.OPCION_DE_PAGO || "").toString();
//             const hasCreditOption = true; // if you want to strictly check: /credito/i.test(option)
//             const blocked = (row?.CONDICIONES_CREDITO || "").trim().toLowerCase() === "si";
//             const days = Number(row?.VIGENCIA_CREDITO || 0) || 0;

//             setCreditBlocked(blocked);
//             setCreditAllowed(hasCreditOption && !blocked);
//             setCreditDays(days);

//             if (!hasCreditOption || blocked) setPaymentOption("Contado");
//           },
//         });
//       })
//       .catch((err) => {
//         console.error("Error fetching credit clients sheet:", err);
//         setCreditRow(null);
//         setCreditAllowed(false);
//         setCreditBlocked(false);
//         setCreditDays(0);
//         setPaymentOption("Contado");
//       });
//   }, [clientNameFromSheet]);

//   // NEW AUG13
//   useEffect(() => {
//     const email = userCredentials?.correo;
//     if (!email) return;

//     // Shipping addresses for this user
//     axios
//       .get(`${API}/shipping-address/${encodeURIComponent(email)}`)
//       .then((res) => setShippingOptions(Array.isArray(res.data) ? res.data : []))
//       .catch((err) => console.error("Error fetching shipping addresses:", err));

//     // Billing addresses for this user (adjust URL if your route differs)
//     axios
//       .get(`${API}/billing-address/${encodeURIComponent(email)}`)
//       .then((res) => setBillingOptions(Array.isArray(res.data) ? res.data : []))
//       .catch((err) => console.error("Error fetching billing addresses:", err));
//   }, [userCredentials?.correo]);

//   // Build the current shipping/billing objects shown on screen
//   const currentShipping = useMemo(() => {
//     if (selectedShippingId) {
//       const s = shippingOptions.find((x) => x._id === selectedShippingId);
//       if (s) {
//         return {
//           calleEnvio: s.calleEnvio || "",
//           exteriorEnvio: s.exteriorEnvio || "",
//           interiorEnvio: s.interiorEnvio || "",
//           coloniaEnvio: s.coloniaEnvio || "",
//           ciudadEnvio: s.ciudadEnvio || "",
//           estadoEnvio: s.estadoEnvio || "",
//           cpEnvio: s.cpEnvio || "",
//         };
//       }
//     }
//     // fallback = values from the client master sheet
//     return {
//       calleEnvio: calleEnvio || "",
//       exteriorEnvio: exteriorEnvio || "",
//       interiorEnvio: interiorEnvio || "",
//       coloniaEnvio: coloniaEnvio || "",
//       ciudadEnvio: ciudadEnvio || "",
//       estadoEnvio: estadoEnvio || "",
//       cpEnvio: cpEnvio || "",
//     };
//   }, [
//     selectedShippingId,
//     shippingOptions,
//     calleEnvio,
//     exteriorEnvio,
//     interiorEnvio,
//     coloniaEnvio,
//     ciudadEnvio,
//     estadoEnvio,
//     cpEnvio,
//   ]);

//   // NOTE: billing schema fields assumed; adjust if yours are different
//   const currentBilling = useMemo(() => {
//     if (selectedBillingId) {
//       const b = billingOptions.find((x) => x._id === selectedBillingId);
//       if (b) {
//         return {
//           razonSocial: b.razonSocial || "",
//           rfcEmpresa: b.rfcEmpresa || "",
//           correoFiscal: b.correoFiscal || "",
//           calleFiscal: b.calleFiscal || "",
//           exteriorFiscal: b.exteriorFiscal || "",
//           interiorFiscal: b.interiorFiscal || "",
//           coloniaFiscal: b.coloniaFiscal || "",
//           ciudadFiscal: b.ciudadFiscal || "",
//           estadoFiscal: b.estadoFiscal || "",
//           cpFiscal: b.cpFiscal || "",
//         };
//       }
//     }
//     // fallback = values from the client master sheet
//     return {
//       razonSocial: razonSocial || "",
//       rfcEmpresa: rfcEmpresa || "",
//       correoFiscal: correoFiscal || "",
//       calleFiscal: calleFiscal || "",
//       exteriorFiscal: exteriorFiscal || "",
//       interiorFiscal: interiorFiscal || "",
//       coloniaFiscal: coloniaFiscal || "",
//       ciudadFiscal: ciudadFiscal || "",
//       estadoFiscal: estadoFiscal || "",
//       cpFiscal: cpFiscal || "",
//     };
//   }, [
//     selectedBillingId,
//     billingOptions,
//     razonSocial,
//     rfcEmpresa,
//     correoFiscal,
//     calleFiscal,
//     exteriorFiscal,
//     interiorFiscal,
//     coloniaFiscal,
//     ciudadFiscal,
//     estadoFiscal,
//     cpFiscal,
//   ]);
//   //   END AUG13

//   // ====== CURRENCY-AWARE TOTALS ======
//   const {
//     totalUSDNative,
//     totalMXNNative,
//     totalAllUSD,
//     totalAllMXN,
//   } = useMemo(() => {
//     let usdNative = 0;
//     let mxnNative = 0;

//     items.forEach((it) => {
//       const qty = Number(it.amount) || 0;

//       if ((it.currency || "USD").toUpperCase() === "MXN") {
//         const mxnUnit = Number(
//           it.priceMXN ?? (it.currency?.toUpperCase() === "MXN" ? it.price : null)
//         );
//         if (Number.isFinite(mxnUnit)) {
//           mxnNative += qty * mxnUnit;
//         }
//       } else {
//         // treat as USD
//         const usdUnit = Number(it.priceUSD ?? it.price);
//         if (Number.isFinite(usdUnit)) {
//           usdNative += qty * usdUnit;
//         }
//       }
//     });

//     // Convert to global totals if we have the rate
//     const allUSD =
//       dofRate && Number.isFinite(dofRate) ? usdNative + mxnNative / dofRate : null;
//     const allMXN =
//       dofRate && Number.isFinite(dofRate) ? mxnNative + usdNative * dofRate : null;

//     return {
//       totalUSDNative: usdNative,
//       totalMXNNative: mxnNative,
//       totalAllUSD: allUSD,
//       totalAllMXN: allMXN,
//     };
//   }, [items, dofRate]);

//   const numericDiscount = Number(discountTotal || 0);
//   const baseAllUSD = totalAllUSD ?? 0;
//   const baseAllMXN = totalAllMXN ?? 0;

//   const vatUSD = requestBill === "true" ? (baseAllUSD - numericDiscount) * 0.16 : 0;
//   const finalAllUSD =
//     requestBill === "true"
//       ? (baseAllUSD - numericDiscount) * 1.16
//       : baseAllUSD - numericDiscount;

//   const vatMXN =
//     requestBill === "true" && dofRate
//       ? (baseAllMXN - numericDiscount * dofRate) * 0.16
//       : 0;
//   const finalAllMXN =
//     requestBill === "true" && dofRate
//       ? (baseAllMXN - numericDiscount * dofRate) * 1.16
//       : dofRate
//       ? baseAllMXN - numericDiscount * dofRate
//       : null;

//   // ========== NEW: helpers for inventory hold ==========
//   // Split "25KG" / "25 KG" / "0.5L" into { peso, unidad }
//   const splitPresentation = (presentation = "") => {
//     const s = String(presentation).trim().toUpperCase().replace(/\s+/g, "");
//     const m = s.match(/^(\d+(?:[.,]\d+)?)([A-Z]+)$/);
//     if (!m) return { peso: presentation, unidad: "" };
//     return { peso: m[1].replace(",", "."), unidad: m[2] };
//   };

//   // Build the lines the backend will use to place a hold
//   const buildHoldLines = () =>
//     items.map((it) => {
//       const { peso, unidad } = splitPresentation(it.presentation || "");
//       return {
//         product: it.product,                 // NOMBRE_PRODUCTO
//         peso,                                // PESO_PRODUCTO
//         unidad,                              // UNIDAD_MEDICION
//         quantity: Number(it.amount) || 0,    // units to hold
//       };
//     });
//   // ======================================================

//   // PDF + Save order handler (left as-is, currency-aware table labels added)
//   const handleDownloadAndSave = async () => {
//     const doc = new jsPDF();
//     doc.text("Resumen de Orden", 20, 20);

//     const pageWidth = doc.internal.pageSize.getWidth();
//     const pageHeight = doc.internal.pageSize.getHeight();
//     doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

//     doc.setFontSize(10);
//     doc.setFont("helvetica", "bold");
//     const today = new Date();
//     doc.text(`Fecha de Elaboración: ${today.toLocaleDateString("es-MX")}`, 195, 15, null, null, "right");

//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 45, 200, 45);

//     // Cliente
//     doc.setFontSize(11);
//     doc.setFont("helvetica", "bold");
//     doc.text("Información de Envío", 13, 51);

//     doc.setFontSize(10);
//     doc.addImage(iconBuilding, 13, 53, 5, 5);
//     doc.text(`${nombreEmpresa || ""}`, 19, 57);

//     doc.addImage(iconContact, 13.5, 59.5, 4, 4);
//     doc.text(`${nombreEncargado || ""}`, 19, 63);

//     doc.addImage(iconLocation, 13.7, 65, 3, 4);
//     doc.text(
//       `${(currentShipping.calleEnvio || "") + "  # " + (currentShipping.exteriorEnvio || "") + "  Int. " + (currentShipping.interiorEnvio || "")}`,
//       19, 68
//     );
//     doc.text(`${"Col. " + (currentShipping.coloniaEnvio || "")}`, 19, 72);
//     doc.text(
//       `${(currentShipping.ciudadEnvio || "") + ", " + (currentShipping.estadoEnvio || "") + ". C.P. " + (currentShipping.cpEnvio || "")}`,
//       19, 76
//     );

//     doc.addImage(iconPhone, 13.7, 78, 3, 4);
//     doc.text(`${telefonoEmpresa || ""}`, 19, 81.5);

//     doc.addImage(iconEmail, 13.7, 84, 4, 3);
//     doc.text(`${correoEmpresa || ""}`, 19, 87);

//     doc.setFontSize(11);
//     doc.setFont("helvetica", "bold");
//     doc.text("Información Fiscal", 100, 51);

//     doc.setFontSize(10);
//     doc.text(`Razón Social: ${currentBilling.razonSocial || ""}`, 106, 57);
//     doc.text(`RFC: ${currentBilling.rfcEmpresa || ""}`, 106, 63);

//     doc.addImage(iconEmail, 100, 65, 4, 3);
//     doc.text(`${correoFiscal || ""}`, 106, 68);
//     doc.text(`${currentBilling.correoFiscal || ""}`, 106, 68);

//     doc.addImage(iconLocation, 100.5, 70, 3, 4);
//     doc.text(
//       `${(currentBilling.calleFiscal || "") + "  # " + (currentBilling.exteriorFiscal || "") + "  Int. " + (currentBilling.interiorFiscal || "")}`,
//       106, 73
//     );
//     doc.text(`${"Col. " + (currentBilling.coloniaFiscal || "")}`, 106, 77);
//     doc.text(
//       `${(currentBilling.ciudadFiscal || "") + ", " + (currentBilling.estadoFiscal || "") + ". C.P. " + (currentBilling.cpFiscal || "")}`,
//       106, 81
//     );

//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 92, 200, 92);

//     // Table with currency-aware unit & total
//     const tableData = items.map((it) => {
//       const cur = (it.currency || "USD").toUpperCase();
//       const unit =
//         cur === "MXN"
//           ? `$${Number(it.priceMXN ?? it.price).toFixed(2)} MXN`
//           : `$${Number(it.priceUSD ?? it.price).toFixed(2)} USD`;
//       const line =
//         cur === "MXN"
//           ? `$${(Number(it.amount) * Number(it.priceMXN ?? it.price)).toFixed(2)} MXN`
//           : `$${(Number(it.amount) * Number(it.priceUSD ?? it.price)).toFixed(2)} USD`;

//       const pack = it.packPresentation ? ` — ${it.packPresentation}` : "";
//       return [it.product, `${it.presentation}${pack}`, it.amount, unit, line];
//     });

//     autoTable(doc, {
//       head: [["Producto", "Presentación", "Cantidad", "Precio Unitario", "Total"]],
//       body: tableData,
//       startY: 100,
//       headStyles: {
//         fillColor: [149, 194, 61],
//         textColor: [0, 0, 0],
//         fontStyle: "bold",
//       },
//     });

//     let extraY = doc.lastAutoTable.finalY + 12;

//     // Totals box (global totals)
//     const boxX = 141;
//     const boxY = extraY - 8;
//     const boxWidth = 55;
//     const boxHeight = 30;
//     const radius = 4;

//     if (doc.roundedRect) {
//       doc.setFillColor(207, 242, 137);
//       doc.roundedRect(boxX, boxY, boxWidth, boxHeight, radius, radius, "F");
//     } else {
//       doc.setFillColor(207, 242, 137);
//       doc.rect(boxX, boxY, boxWidth, boxHeight, "F");
//     }

//     const y0 = extraY;
//     doc.text(
//       `Total en USD: ${totalAllUSD !== null ? `$${totalAllUSD.toFixed(2)}` : "—"}`,
//       146,
//       y0
//     );
//     doc.text(
//       `Total en MXN: ${
//         totalAllMXN !== null
//           ? `$${totalAllMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
//           : "—"
//       }`,
//       146,
//       y0 + 5
//     );

//     doc.setFontSize(9);
//     doc.setFont("helvetica", "italic");
//     doc.text(
//       dofRate ? `${dofRate.toFixed(2)} MXN/USD \n (DOF ${dofDate})` : "Tipo de cambio no disponible",
//       146,
//       y0 + 12
//     );

//     // AUG15
//     const creditBoxX = 10;
//     const creditBoxY = y0 + 30;
//     const creditBoxWidth = 190;
//     const creditBoxHeight = 20;
//     const creditBoxRadius = 4;

//     if (doc.roundedRect) {
//       doc.setFillColor(241, 241, 241);
//       doc.roundedRect(creditBoxX, creditBoxY, creditBoxWidth, creditBoxHeight, creditBoxRadius, creditBoxRadius, "F");
//     } else {
//       doc.setFillColor(241, 241, 241);
//       doc.rect(creditBoxX, creditBoxY, creditBoxWidth, creditBoxHeight, "F");
//     }

//     doc.setFontSize(11);
//     doc.setFont("helvetica", "bold");
//     doc.text(`Opción de Pago: ${paymentOption}` , 15, y0 + 36);
//     if(paymentOption === "Crédito"){
//         doc.text(`Plazo de Crédito: ${creditDays} Días` , 15, y0 + 41);
//         doc.text(`Vigencia de Crédito: ${addDays(new Date(), creditDays).toLocaleDateString('en-GB') }` , 15, y0 + 46);
//     }
//     // END AUG15

//     // Payment accounts second page (unchanged design)
//     let y = 35;
//     doc.addPage();
//     doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

//     doc.setFont("helvetica", "bold");
//     doc.setFontSize(16);
//     doc.setTextColor(24, 144, 69);
//     doc.text(`Cuentas para realizar pago:`, 13, y + 5);

//     const payBoxX = 10;
//     const payBoxY = y + 10;
//     const payBoxWidth = 190;
//     const payBoxHeight = 130;
//     const payBoxRadius = 4;

//     if (doc.roundedRect) {
//       doc.setFillColor(241, 241, 241);
//       doc.roundedRect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, payBoxRadius, payBoxRadius, "F");
//     } else {
//       doc.setFillColor(241, 241, 241);
//       doc.rect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, "F");
//     }

//     doc.setFontSize(13);
//     doc.setFont("helvetica", "bold");
//     doc.setTextColor(0, 0, 0);
//     doc.text(`CUENTA EN PESOS MEXICANOS`, 15, y + 17);

//     doc.setFontSize(11);
//     doc.setFont("helvetica", "bold");
//     doc.text(`NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV`, 15, y + 24);
//     doc.text(`TRANSFERENCIA:`, 15, y + 31);

//     doc.setFont("helvetica", "normal");
//     doc.text(`BANCO: BBVA`, 15, y + 37);
//     doc.text(`NO. DE CUENTA: 010 115 1207`, 15, y + 42);
//     doc.text(`CLABE: 012 320 001 011 512 076`, 15, y + 47);

//     doc.setFont("helvetica", "bold");
//     doc.text(`DEPÓSITO BANCARIO:`, 120, y + 31);
//     doc.setFont("helvetica", "normal");
//     doc.text(`BANCO: BBVA`, 120, y + 37);
//     doc.text(`NO. DE CUENTA: 010 115 1207`, 120, y + 42);

//     doc.setFont("helvetica", "bold");
//     doc.setFontSize(13);
//     doc.text(`CUENTA EN PESOS MEXICANOS - SIN FACTURA`, 15, y + 59);

//     doc.setFontSize(11);
//     doc.text(`TRANSFERENCIA O DEPÓSITO BANCARIO`, 15, y + 66);
//     doc.setFont("helvetica", "normal");
//     doc.text(`NOMBRE: ALEJANDRO GONZALEZ AGUIRRE`, 15, y + 72);
//     doc.text(`BANCO: BBVA`, 15, y + 77);
//     doc.text(`NO. DE CUENTA: 124 525 4078`, 15, y + 82);
//     doc.text(`CLABE: 012 320 012 452 540 780`, 15, y + 87);
//     doc.text(`NO. DE TARJETA: 4152 3141 1021 5384`, 15, y + 92);

//     doc.setFont("helvetica", "bold");
//     doc.setFontSize(13);
//     doc.text(`CUENTA EN DÓLARES AMERICANOS`, 15, y + 105);

//     doc.setFontSize(11);
//     doc.text(`NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV`, 15, y + 112);
//     doc.text(`TRANSFERENCIA`, 15, y + 119);

//     doc.setFont("helvetica", "normal");
//     doc.text(`BANCO: GRUPO FINANCIERO MONEX`, 15, y + 125);
//     doc.text(`CLABE: 112 180 000 028 258 341`, 15, y + 130);
//     doc.text(`BANCO: BANCO INVEX, S.A.`, 120, y + 125);
//     doc.text(`CLABE: 059 180 030 020 014 234`, 120, y + 130);

//     // SEP01 5:32
//     // 2) Prepare Order payload (same as before)
//     const userEmail = userCredentials?.correo;
//     const creditDue =
//       paymentOption === "Crédito" && creditAllowed
//         ? addDays(new Date(), creditDays).toISOString()
//         : null;

//     const orderInfo = {
//       userEmail,
//       items, // includes currency + packPresentation if present
//       totals: {
//         totalUSDNative: Number(totalUSDNative.toFixed(2)),
//         totalMXNNative: Number(totalMXNNative.toFixed(2)),
//         totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
//         totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
//         dofRate,
//         dofDate,
//         discountUSD: Number(discountTotal || 0),
//         vatUSD: Number(vatUSD.toFixed(2)),
//         finalAllUSD: Number(finalAllUSD.toFixed(2)),
//         vatMXN: finalAllMXN !== null ? Number(vatMXN.toFixed(2)) : null,
//         finalAllMXN: finalAllMXN !== null ? Number(finalAllMXN.toFixed(2)) : null,
//       },
//       requestBill: requestBill === "true",
//       shippingInfo: { ...currentShipping },
//       billingInfo: { ...currentBilling },
//       orderDate: new Date().toISOString(),
//       orderStatus: "Pedido Realizado",
//       paymentOption,
//       creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
//       creditDueDate: creditDue,
//     };

//     try {
//       // 3) Create the PDF blob & multipart form
//       const pdfBlob = doc.output("blob"); // mobile-safe
//       const form = new FormData();
//       form.append("order", JSON.stringify(orderInfo));
//       form.append("pdf", pdfBlob, "order_summary.pdf"); // filename MUST be a string

//       // 4) Upload (create order + upload PDF)
//       let createdOrderId = null;

//       // Prefer fetch first (no custom Content-Type → fewer CORS preflights)
//       try {
//         // Optional: small timeout for fetch on some mobile browsers
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
//         // Fallback: axios handles some quirky engines better
//         const { data } = await axios.post(`${API}/orderDets`, form, {
//           // DO NOT set Content-Type; axios will set proper multipart boundary
//           withCredentials: false,
//           timeout: 20000,
//         });
//         createdOrderId =
//           data?.id || data?.data?._id || data?._id || data?.order?._id || null;
//       }

//       // 5) Optional: place a 120-minute inventory hold
//       try {
//         const holdLines = buildHoldLines();
//         if (createdOrderId && holdLines.length > 0) {
//           await axios.post(
//             `${API}/inventory/hold`,
//             { orderId: createdOrderId, holdMinutes: 120, lines: holdLines },
//             { withCredentials: false, timeout: 15000 }
//           );
//         } else {
//           console.warn("Reserva omitida: faltan orderId o líneas.", {
//             createdOrderId,
//             holdLines,
//           });
//         }
//       } catch (holdErr) {
//         console.error("Error al reservar inventario:", holdErr);
//         // don’t block success
//       }

//       // 6) NOW trigger the local download (after successful server save)
//       doc.save("order_summary.pdf");

//       // 7) Success → show it in My Orders
//       alert("Orden guardada exitosamente");
//       // navigate("/myOrders");
//       // HERE!! 4:17
//       navigate("/myOrders", { state: { from: "orderNow" } });
//     } catch (error) {
//       console.error("Error al guardar la orden o al reservar inventario", error);
//       const msg =
//         error?.message ||
//         error?.response?.data?.error ||
//         "Revisa tu conexión y vuelve a intentar.";
//       alert(`Ocurrió un error al guardar la orden o al reservar inventario\n${msg}`);
//     }



// // ------> START: THE RANDOM BREAK

//     // SEP01 5:32
//     // placeholer

//     // // HERE
//     // doc.save("order_summary.pdf");

//     //   // 2) Prepare Order payload (same as before)
//     //   const userEmail = userCredentials?.correo;
//     //   const creditDue =
//     //     paymentOption === "Crédito" && creditAllowed
//     //       ? addDays(new Date(), creditDays).toISOString()
//     //       : null;

//     //   const orderInfo = {
//     //     userEmail,
//     //     items, // includes currency + packPresentation if present
//     //     totals: {
//     //       totalUSDNative: Number(totalUSDNative.toFixed(2)),
//     //       totalMXNNative: Number(totalMXNNative.toFixed(2)),
//     //       totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
//     //       totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
//     //       dofRate,
//     //       dofDate,
//     //       discountUSD: Number(discountTotal || 0),
//     //       vatUSD: Number(vatUSD.toFixed(2)),
//     //       finalAllUSD: Number(finalAllUSD.toFixed(2)),
//     //       vatMXN: finalAllMXN !== null ? Number(vatMXN.toFixed(2)) : null,
//     //       finalAllMXN: finalAllMXN !== null ? Number(finalAllMXN.toFixed(2)) : null,
//     //     },
//     //     requestBill: requestBill === "true",
//     //     shippingInfo: { ...currentShipping },
//     //     billingInfo: { ...currentBilling },
//     //     orderDate: new Date().toISOString(),
//     //     orderStatus: "Pedido Realizado",
//     //     paymentOption,
//     //     creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
//     //     creditDueDate: creditDue,
//     //   };

//     //   try {
//     //     // 3) Create the PDF blob & multipart form
//     //     const pdfBlob = doc.output("blob"); // mobile-safe blob
//     //     const form = new FormData();
//     //     form.append("order", JSON.stringify(orderInfo));
//     //     form.append("pdf", pdfBlob, "order_summary.pdf"); // filename MUST be a string

//     //     // 4) Upload (create order + upload PDF)
//     //     // Try fetch first (minimal headers = fewer CORS preflights)
//     //     let createdOrderId = null;
//     //     try {
//     //       const res = await fetch(`${API}/orderDets`, {
//     //         method: "POST",
//     //         body: form,
//     //         mode: "cors",
//     //         cache: "no-store",
//     //         credentials: "omit",
//     //       });
//     //       if (!res.ok) {
//     //         const text = await res.text().catch(() => "");
//     //         throw new Error(text || `HTTP ${res.status}`);
//     //       }
//     //       const data = await res.json().catch(() => ({}));
//     //       createdOrderId =
//     //         data?.order?._id || data?.data?._id || data?._id || data?.id || null;
//     //     } catch (fetchErr) {
//     //       // Fallback to axios if some mobile engines choke on fetch+FormData
//     //       const { data } = await axios.post(`${API}/orderDets`, form, {
//     //         withCredentials: false,
//     //         // DO NOT set Content-Type; axios will set proper multipart boundary
//     //       });
//     //       createdOrderId =
//     //         data?.order?._id || data?.data?._id || data?._id || data?.id || null;
//     //     }

//     //     // 5) Optional: place a 120-minute inventory hold (don’t block success if it fails)
//     //     try {
//     //       const holdLines = buildHoldLines();
//     //       if (createdOrderId && holdLines.length > 0) {
//     //         await axios.post(
//     //           `${API}/inventory/hold`,
//     //           {
//     //             orderId: createdOrderId,
//     //             holdMinutes: 120,
//     //             lines: holdLines,
//     //           },
//     //           { withCredentials: false }
//     //         );
//     //       } else {
//     //         console.warn("Reserva omitida: faltan orderId o líneas.", {
//     //           createdOrderId,
//     //           holdLines,
//     //         });
//     //       }
//     //     } catch (holdErr) {
//     //       console.error("Error al reservar inventario:", holdErr);
//     //       // continue anyway
//     //     }

//     //     // 6) Trigger the local download AFTER server save (best for mobile)
//     //     doc.save("order_summary.pdf");

//     //     // 7) Success UX: go to My Orders so the new order is visible
//     //     alert("Orden guardada exitosamente");
//     //     navigate("/myOrders");
//     //   } catch (error) {
//     //     console.error("Error al guardar la orden o al reservar inventario", error);
//     //     const msg =
//     //       error?.message ||
//     //       error?.response?.data?.error ||
//     //       "Revisa tu conexión y vuelve a intentar.";
//     //     alert(`Ocurrió un error al guardar la orden o al reservar inventario\n${msg}`);
//     //   }

//     // // END

//     // NEW VERSION
//     // doc.save("order_summary.pdf");

//     // SEP01
//     // const pdfBlob = doc.output("blob");

//     // const form = new FormData();
//     // form.append("order", JSON.stringify(orderInfo));
//     // form.append("pdf", pdfBlob, "order_summary.pdf"); // filename must be a string

//     // let createdOrderId = null;

//     // // Prefer fetch on mobile (simpler CORS), no custom headers = no forced preflight
//     // try {
//     //   const res = await fetch(`${API}/orderDets`, {
//     //     method: "POST",
//     //     body: form,
//     //     cache: "no-store",
//     //     credentials: "omit", // we don’t need cookies
//     //     mode: "cors",
//     //   });
//     //   if (!res.ok) {
//     //     let errText = await res.text().catch(() => "");
//     //     throw new Error(errText || `HTTP ${res.status}`);
//     //   }
//     //   const data = await res.json();
//     //   createdOrderId = data?.order?._id || data?.data?._id || data?._id || data?.id || null;
//     // } catch (e) {
//     //   // Axios fallback if fetch fails on some engines
//     //   const { data } = await axios.post(`${API}/orderDets`, form, {
//     //     withCredentials: false,
//     //     // DO NOT set Content-Type; let Axios set multipart boundary
//     //     // timeout: 20000, // optional
//     //   });
//     //   createdOrderId = data?.order?._id || data?.data?._id || data?._id || data?.id || null;
//     // }

//     // END OF NEW VERSION

//     //  ORIGINAL VERSION 
//     // Save order in DB
//     // const userEmail = userCredentials?.correo;
//     // const creditDue =
//     //   paymentOption === "Crédito" && creditAllowed
//     //     ? addDays(new Date(), creditDays).toISOString()
//     //     : null;

//     // const orderInfo = {
//     //   userEmail,
//     //   items,
//     //   totals: {
//     //     totalUSDNative: Number(totalUSDNative.toFixed(2)),
//     //     totalMXNNative: Number(totalMXNNative.toFixed(2)),
//     //     totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
//     //     totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
//     //     dofRate,
//     //     dofDate,
//     //     discountUSD: Number(discountTotal || 0),
//     //     vatUSD: Number(vatUSD.toFixed(2)),
//     //     finalAllUSD: Number(finalAllUSD.toFixed(2)),
//     //     vatMXN: finalAllMXN !== null ? Number(vatMXN.toFixed(2)) : null,
//     //     finalAllMXN: finalAllMXN !== null ? Number(finalAllMXN.toFixed(2)) : null,
//     //   },
//     //   requestBill: requestBill === "true",
//     //   shippingInfo: { ...currentShipping },
//     //   billingInfo: { ...currentBilling },
//     //   orderDate: new Date().toISOString(),
//     //   orderStatus: "Pedido Realizado",
//     //   paymentOption,
//     //   creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
//     //   creditDueDate: creditDue,
//     // };

//     // try {
//     //   // Build the PDF blob once
//     //   const pdfBlob = doc.output("blob");

//     //   // Prepare multipart form
//     //   const form = new FormData();
//     //   form.append("order", JSON.stringify(orderInfo));
//     //   form.append("pdf", pdfBlob, "order_summary.pdf"); // <-- filename as string

//     //   // Mobile-friendly upload: try fetch (no keepalive), then axios fallback
//     //   let createdOrderId = null;

//     //   try {
//     //     const res = await fetch(`${API}/orderDets`, {
//     //       method: "POST",
//     //       body: form,
//     //       headers: { Accept: "application/json" },
//     //       cache: "no-store",
//     //     });

//     //     if (!res.ok) {
//     //       const errJson = await res.json().catch(() => ({}));
//     //       throw new Error(errJson?.error || `Error ${res.status}`);
//     //     }
//     //     const data = await res.json();
//     //     createdOrderId =
//     //       data?.order?._id || data?.data?._id || data?._id || data?.id || null;
//     //   } catch (fetchErr) {
//     //     // Fallback for quirky mobile engines
//     //     const { data } = await axios.post(`${API}/orderDets`, form, {
//     //       headers: { Accept: "application/json" },
//     //       withCredentials: false,
//     //     });
//     //     createdOrderId =
//     //       data?.order?._id || data?.data?._id || data?._id || data?.id || null;
//     //   }

//     //   // Optional: Place a 120-minute hold if we have an order ID
//     //   try {
//     //     const holdLines = buildHoldLines();
//     //     if (createdOrderId && holdLines.length > 0) {
//     //       await axios.post(`${API}/inventory/hold`, {
//     //         orderId: createdOrderId,
//     //         holdMinutes: 120,
//     //         lines: holdLines,
//     //       });
//     //     } else {
//     //       console.warn("Reserva omitida: faltan orderId o líneas.", {
//     //         createdOrderId,
//     //         holdLines,
//     //       });
//     //     }
//     //   } catch (holdErr) {
//     //     console.error("Error al reservar inventario:", holdErr);
//     //     // don't block the flow if the hold fails
//     //   }

//     //   // Trigger local download AFTER a successful upload (helps mobile)
//     //   doc.save("order_summary.pdf");

//     //   alert("Orden guardada exitosamente");
//     //   navigate("/myOrders");
//     // } catch (error) {
//     //   console.error("Error al guardar la orden o al reservar inventario", error);
//     //   const msg =
//     //     error?.message ||
//     //     error?.response?.data?.error ||
//     //     "Revisa tu conexión y vuelve a intentar.";
//     //   alert(`Ocurrió un error al guardar la orden o al reservar inventario\n${msg}`);
//     // }

//     // END OF ORIGINAL VERSION


//     // ------

//     // OG
//     // Save order in DB
//     // const userEmail = userCredentials?.correo;
//     // const creditDue =
//     //   paymentOption === "Crédito" && creditAllowed ? addDays(new Date(), creditDays).toISOString() : null;

//     // const orderInfo = {
//     //   userEmail,
//     //   items, // now includes currency and packPresentation when present
//     //   totals: {
//     //     totalUSDNative: Number(totalUSDNative.toFixed(2)),
//     //     totalMXNNative: Number(totalMXNNative.toFixed(2)),
//     //     totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
//     //     totalAllMXN:
//     //       totalAllMXN !== null
//     //         ? Number(totalAllMXN.toFixed(2))
//     //         : null,
//     //     dofRate,
//     //     dofDate,
//     //     discountUSD: Number(discountTotal || 0),
//     //     vatUSD: Number(vatUSD.toFixed(2)),
//     //     finalAllUSD: Number(finalAllUSD.toFixed(2)),
//     //     vatMXN: finalAllMXN !== null ? Number(vatMXN.toFixed(2)) : null,
//     //     finalAllMXN: finalAllMXN !== null ? Number(finalAllMXN.toFixed(2)) : null,
//     //   },
//     //   requestBill: requestBill === "true",
//     //   shippingInfo: { ...currentShipping },
//     //   billingInfo: { ...currentBilling },
//     //   orderDate: new Date().toISOString(),
//     //   orderStatus: "Pedido Realizado",
//     //   paymentOption,
//     //   creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
//     //   creditDueDate: creditDue,
//     // };

//     // try {
//     //   // IMPORTANT: use arraybuffer to preserve binary; jsPDF's blob is okay too
//     //   const pdfBlob = doc.output('blob');
//     //   // const file = new File([pdfBlob], "order_summary.pdf", { type: "application/pdf" });

//     //   const form = new FormData();
//     //   form.append("order", JSON.stringify(orderInfo));
//     //   form.append("pdf", pdfBlob, "order_summary.pdf");
//     //   // form.append("pdf", pdfBlob, file);

//     //   // 1) Create order + upload PDF
//     //   const createRes = await axios.post(`${API}/orderDets`, form, {
//     //     headers: { "Content-Type": "multipart/form-data" },
//     //   });

//     //   // Try several common shapes to find the new order id
//     //   const createdOrderId =
//     //     createRes?.data?.order?._id ||
//     //     createRes?.data?.data?._id ||
//     //     createRes?.data?._id ||
//     //     createRes?.data?.id ||
//     //     null;

//     //   // 2) NEW — Place a 120-minute hold for selected items
//     //   try {
//     //     const holdLines = buildHoldLines();
//     //     if (createdOrderId && holdLines.length > 0) {

//     //       await axios.post(`${API}/inventory/hold`, {
//     //         orderId: createdOrderId,
//     //         holdMinutes: 120,
//     //         lines: holdLines,
//     //       });
//     //     } else {
//     //       console.warn("No se pudo colocar la reserva: faltan orderId o líneas.", {
//     //         createdOrderId,
//     //         holdLines,
//     //       });
//     //     }
//     //   } catch (holdErr) {
//     //     console.error("Error al reservar inventario:", holdErr);
//     //     // You can still allow navigation; the order exists, but without a hold.
//     //   }

//     //   alert("Orden guardada exitosamente");
//     //   navigate("/myOrders");
//     // } catch (error) {
//     //   console.error("Error al guardar la orden o al reservar inventario", error);
//     //   alert("Ocurrió un error al guardar la orden o al reservar inventario");
//     // }

//     // -----> 

//     // ------> END: THE RANDOM BREAK




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
//       <div className="edit-titleIcon-Div">
//         <label className="editAddress-headerLabel">Detalles de Orden</label>
//         <img src={CarritoIcono} alt="Carrito" width="35" height="35" />
//       </div>

//       <div className="orderNowBody-Div">
//         {/* Shipping */}
//         <div className="headerAndDets-Div">
//             <div className="headerEditIcon-Div">
//                 <label className="newAddress-Label">Dirección de Envío</label>
//                 <select
//                 className="alternateAddress-Select"
//                 value={selectedShippingId}
//                 onChange={(e) => setSelectedShippingId(e.target.value)}
//                 >
//                 <option value="">Seleccione otra dirección</option>
//                 {shippingOptions.map((opt) => (
//                     <option key={opt._id} value={opt._id}>
//                     {opt.apodo || `${opt.calleEnvio} ${opt.exteriorEnvio || ""}`}
//                     </option>
//                 ))}
//                 </select>
//             </div>

//             <div className="orderNow-AddressDiv">
//                 <label className="orderNow-Label">
//                 {currentShipping.calleEnvio} #{currentShipping.exteriorEnvio} Int. {currentShipping.interiorEnvio}
//                 </label>
//                 <label className="orderNow-Label">Col. {currentShipping.coloniaEnvio}</label>
//                 <label className="orderNow-Label">
//                 {currentShipping.ciudadEnvio}, {currentShipping.estadoEnvio}. C.P. {currentShipping.cpEnvio}
//                 </label>
//             </div>
//         </div>

//         {/* Billing */}
//         <div className="headerAndDets-Div">
//             <div className="headerEditIcon-Div">
//                 <label className="newAddress-Label">Datos de Facturación</label>
//                 <select
//                 className="alternateAddress-Select"
//                 value={selectedBillingId}
//                 onChange={(e) => setSelectedBillingId(e.target.value)}
//                 >
//                 <option value="">Seleccione otra dirección</option>
//                 {billingOptions.map((opt) => (
//                     <option key={opt._id} value={opt._id}>
//                     {opt.apodo || opt.razonSocial || opt.rfcEmpresa}
//                     </option>
//                 ))}
//                 </select>
//             </div>

//             <div className="orderNow-AddressDiv">
//                 <label className="orderNow-Label">{currentBilling.razonSocial}</label>
//                 <label className="orderNow-Label">{currentBilling.rfcEmpresa}</label>
//                 <br />
//                 <label className="orderNow-Label">
//                 {currentBilling.calleFiscal} #{currentBilling.exteriorFiscal} Int. {currentBilling.interiorFiscal}
//                 </label>
//                 <label className="orderNow-Label">Col. {currentBilling.coloniaFiscal}</label>
//                 <label className="orderNow-Label">
//                 {currentBilling.ciudadFiscal}, {currentBilling.estadoFiscal}. C.P. {currentBilling.cpFiscal}
//                 </label>
//             </div>
//         </div>

//         {/* Items */}
//         <div className="headerAndDets-Div">
//           <label className="orderSummary-Label">Resumen de orden</label>
//         </div>

//         <div className="products-Div">
//           <ul>
//             {items.map((item, i) => {
//               const cur = (item.currency || "USD").toUpperCase();
//               const unit =
//                 cur === "MXN"
//                   ? `${Number(item.priceMXN ?? item.price).toFixed(2)} MXN`
//                   : `${Number(item.priceUSD ?? item.price).toFixed(2)} USD`;
//               const line =
//                 cur === "MXN"
//                   ? (Number(item.amount) * Number(item.priceMXN ?? item.price)).toFixed(2) + " MXN"
//                   : (Number(item.amount) * Number(item.priceUSD ?? item.price)).toFixed(2) + " USD";

//               return (
//                 <div className="orderImageAndDets-Div" key={i}>
//                   <img
//                     src={getItemImage(item)}
//                     alt={item.product}
//                     width="75"
//                     height="75"
//                     onError={(e) => {
//                       e.currentTarget.src = fallbackImg;
//                     }}
//                   />
//                   <div className="orderDetails-Div">
//                     <label className="orderDets-Label">
//                       <b>{item.product}</b>
//                     </label>
//                     <label className="orderDets-Label">
//                       <b>Presentación: {item.presentation}</b>
//                       {item.packPresentation ? ` — ${item.packPresentation}` : ""}
//                     </label>
//                     <br />
//                     <label className="orderDets-Label">
//                       <b>Cantidad:</b> {item.amount}
//                     </label>
//                     <label className="orderDets-Label">
//                       <b>Precio Unitario:</b> ${unit}
//                     </label>
//                     <label className="orderDetsTotal-Label">
//                       <b>Total:</b> ${line}
//                     </label>
//                   </div>
//                 </div>
//               );
//             })}
//           </ul>

//           {/* Summary box */}
//           <div className="orderNow-summaryDiv">
//             <div className="orderSummary-subDivs">
//               <label className="orderNowSummary-Label">
//                 <b>Total USD (nativo):</b>
//               </label>
//               <label className="orderNowSummary-Label">
//                 <b>Total MXN (nativo):</b>
//               </label>
//               <label className="orderNowSummary-Label">
//                 <b>Tipo de Cambio:</b>
//               </label>
//               <label className="orderNowSummary-Label">
//                 <b>Total Global USD:</b>
//               </label>
//               <label className="orderNowSummary-Label">
//                 <b>Total Global MXN:</b>
//               </label>
//               {requestBill === "true" && (
//                 <label className="orderNowSummary-Label">
//                   <b>I.V.A. (sobre total global):</b>
//                 </label>
//               )}
//             </div>

//             <div className="orderSummary-subDivs">
//               <label className="orderNowSummary-Label">
//                 ${totalUSDNative.toFixed(2)} USD
//               </label>
//               <label className="orderNowSummary-Label">
//                 $
//                 {totalMXNNative.toLocaleString("es-MX", {
//                   minimumFractionDigits: 2,
//                   maximumFractionDigits: 2,
//                 })}{" "}
//                 MXN
//               </label>
//               <label className="orderNowSummary-Label">
//                 {fxError
//                   ? "—"
//                   : dofRate
//                   ? `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
//                   : "Cargando..."}
//               </label>
//               <label className="orderNowSummary-Label">
//                 {totalAllUSD !== null ? `$${totalAllUSD.toFixed(2)} USD` : "—"}
//               </label>
//               <label className="orderNowSummary-Label">
//                 {totalAllMXN !== null
//                   ? `$${totalAllMXN.toLocaleString("es-MX", {
//                       minimumFractionDigits: 2,
//                       maximumFractionDigits: 2,
//                     })} MXN`
//                   : "—"}
//               </label>
//               {requestBill === "true" && (
//                 <label className="orderNowSummary-Label">
//                   {dofRate
//                     ? `USD: $${vatUSD.toFixed(2)} • MXN: $${
//                         finalAllMXN !== null
//                           ? vatMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
//                           : "—"
//                       }`
//                     : `USD: $${vatUSD.toFixed(2)} • MXN: —`}
//                 </label>
//               )}
//             </div>
//           </div>
//         </div>

//         {/* Payment option / Credit */}
//         <div className="headerAndDets-Div" style={{ marginTop: 16 }}>
//           <div className="headerEditIcon-Div">
//             <label className="newAddress-Label">Opción de Pago</label>
//           </div>

//           {creditBlocked && (
//             <div
//               className="orderNow-AddressDiv"
//               style={{ color: "#b00", fontSize: 13, marginBottom: 8 }}
//             >
//               Este cliente tiene condiciones pendientes. El crédito no está disponible para nuevas órdenes.
//             </div>
//           )}

//           <div
//             className="orderNow-AddressDiv"
//             style={{ display: "flex", gap: 12, alignItems: "center" }}
//           >
//             <select
//               className="alternateAddress-Select"
//               value={paymentOption}
//               onChange={(e) => setPaymentOption(e.target.value)}
//               disabled={!creditAllowed}
//             >
//               <option value="Contado">Contado</option>
//               {creditAllowed && <option value="Crédito">Crédito</option>}
//             </select>

//             {paymentOption === "Crédito" && creditAllowed && (
//               <span style={{ fontSize: 13 }}>
//                 Vigencia: {creditDays} día(s). Fecha de vencimiento:{" "}
//                 {addDays(new Date(), creditDays).toLocaleDateString("es-MX")}
//               </span>
//             )}
//           </div>
//         </div>

//         <div className="orderReqBts-Div">
//           <button className="submitOrder-Btn" type="submit" onClick={handleDownloadAndSave}>
//             Descargar <br />
//             Orden
//           </button>
//         </div>
//       </div>
//       </div>

//       <div className="app-footer footerMenuDiv">
//         <div className="footerHolder">
//           <div className="footerIcon-NameDiv" onClick={() => navigate("/userHome")}>
//             <FontAwesomeIcon icon={faHouse} className="footerIcons" />{" "}
//             <label className="footerIcon-Name">PRINCIPAL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={() => navigate("/userProfile")}>
//             <FontAwesomeIcon icon={faUser} className="footerIcons" />{" "}
//             <label className="footerIcon-Name">MI PERFIL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={() => navigate("/newOrder")}>
//             <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />{" "}
//             <label className="footerIcon-Name">ORDENA</label>
//           </div>
//         </div>
//       </div>
//     </body>
//   );
// }