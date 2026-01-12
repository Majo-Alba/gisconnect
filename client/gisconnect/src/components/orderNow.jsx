// Hey chatgpt, I'd like to add an extra field to be stored in MongoDb. Currently, we dont store the total the user is paying for the order, nor the currency in which the person is paying. Now, since we are using data from DOF to convert, I'd like to save the total the user is paying using that moments convertion rate, not changing everytime the currency changes. So, in order to do so, I'm thinking adding to orderModel.js three fields "paymentCurrency" (which takes value of field "Moneda de Pago" from orderNow.jsx), "amountPayed" (this one's kinf of tricky. Remember that we have the following scenarios that need to be taken into consideration. The user can ask for USD-listed products and select to pay in USd, which works perfect. Second, user can usk for USD-listed items and pay in MXN, in which case the amountPayed would be converted using the DOF rate and thus amountPayed would be sotred in MXN. Third case is that user can ask for mixed orders - orders containing USD-listed & MXN-listed products. In such case, Items listed in USD can be payed in USD but products listed in MXN cannot be payed in USD, thus, if user selects USD as desired currency to pay, we would have to amountPayed: the amouont payed in USD and the amount payed in MXN), and "currencyExchange" (which stores the currency rate at the moment of placing the order). Im attachinf my orderNow.jsx file, as well as orderModel.js to make the needed modifs to both files to get these modifications going on. Please direct edit
// orderNow.jsx
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

  // ✅ NEW: pickup toggle & fields
  const [pickupSelected, setPickupSelected] = useState(false);
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");

  // ✅ NEW: CTA modal before downloading order
  const [showCtaModal, setShowCtaModal] = useState(false);

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

  // NEW: round to 2 decimals (bankers not needed here)
  const round2 = (n) => Math.round(Number(n) * 100) / 100;
  
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

  // ======== Pickup helpers: date & time logic ========
  const fmtYMD = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const fmtDMY = (d) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const baseSlots = useMemo(() => {
    const start = 9, end = 18; // 9:00–18:00 cada hora
    return Array.from({ length: end - start + 1 }, (_, i) =>
      `${String(start + i).padStart(2, "0")}:00`
    );
  }, []);

  const now = new Date();
  const isAfter13 = now.getHours() >= 13;

  const dateOptions = useMemo(() => {
    const opts = [];
    const startOffset = isAfter13 ? 1 : 0; // si >13:00, iniciar mañana
    for (let i = startOffset; i < startOffset + 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      opts.push({ value: fmtYMD(d), label: fmtDMY(d) });
    }
    return opts;
  }, [isAfter13]);

  const timeOptions = useMemo(() => {
    if (!pickupDate) return [];
    const todayYMD = fmtYMD(now);
    if (!isAfter13 && pickupDate === todayYMD) {
      const minHour = now.getHours() + 2;
      return baseSlots.filter((hhmm) => parseInt(hhmm.slice(0, 2), 10) >= minHour);
    }
    return baseSlots;
  }, [pickupDate, baseSlots, isAfter13]);

  useEffect(() => {
    if (pickupSelected) {
      if (!pickupDate && dateOptions[0]) setPickupDate(dateOptions[0].value);
    } else {
      setPickupDate("");
      setPickupTime("");
    }
  }, [pickupSelected, dateOptions, pickupDate]);

  useEffect(() => {
    if (pickupSelected) {
      if (timeOptions.length > 0) {
        if (!pickupTime || !timeOptions.includes(pickupTime)) {
          setPickupTime(timeOptions[0]);
        }
      } else {
        setPickupTime("");
      }
    }
  }, [pickupSelected, pickupDate, timeOptions]);  

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
    sumUSD,
    sumMXN,
    isMixed,
    hasUSD,
    hasMXN,
    usdToMXN,
    combinedMXN,
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

    let usdMXN = null;
    let combined = null;
    if (Number.isFinite(dof2) && dof2) {
      usdMXN = usd * dof2;
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
  }, [items, dof2]);

  const totalUSDNative = sumUSD;
  const totalMXNNative = sumMXN;

  const totalAllUSD =
    Number.isFinite(dof2) && dof2 ? sumUSD + sumMXN / dof2 : null;

  const totalAllMXN =
    Number.isFinite(dof2) && dof2 ? sumMXN + sumUSD * dof2 : null;

  const numericDiscount = Number(discountTotal || 0);
  const baseAllUSD = (totalAllUSD ?? 0) - numericDiscount;
  const baseAllMXN =
    totalAllMXN != null ? totalAllMXN - numericDiscount * (Number(dof2) || 0) : null;

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

      const subtotalUSD_pdf = usdItems.reduce(
        (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0),
        0
      );
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Subtotal USD: $${fmtNum(subtotalUSD_pdf, "en-US")} USD`, 140, cursorY);
      doc.setFont("helvetica", "normal");
      cursorY += 12;
    }

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

    const rate = Number.isFinite(dof2) ? dof2 : 0;
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

    const grandUSD_natural = subtotalUSD_pdf2;
    const grandMXN_natural = subtotalMXN_pdf2;
    const usdEnMXN = rate ? subtotalUSD_pdf2 * rate : 0;
    const combinedMXN_natural = rate ? subtotalMXN_pdf2 + usdEnMXN : null;

    const boxX = 12,
      boxW = 186,
      boxPad = 4,
      lineH = 6;
    const textMaxW = boxW - boxPad * 2;

    const measure = () => {
      let y = cursorY + boxPad;
      y += lineH;
      if (preferred === "MXN") {
        if (combinedMXN_natural != null) {
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
            if (rate) y += 5;
          }
        } else {
          const err =
            "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
          const lines = doc.splitTextToSize(err, textMaxW);
          y += lines.length * 5 + 3;
        }
        if (isMixed_pdf) {
          const l = doc.splitTextToSize(
            "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.",
            textMaxW
          );
          y += l.length * 5 + 5;
        }
      } else {
        if (hasUSD_pdf) y += wantsDesgloseIVA ? lineH * 3 : lineH;
        if (hasMXN_pdf) y += wantsDesgloseIVA ? lineH * 3 : lineH;
        if (isMixed_pdf && rate) y += 5;
        if (isMixed_pdf) {
          const l = doc.splitTextToSize(
            "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.",
            textMaxW
          );
          y += l.length * 5 + 5;
        }
        if (!hasUSD_pdf && hasMXN_pdf) {
          const n = doc.splitTextToSize(
            "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.",
            textMaxW
          );
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

    // ========= Build payload =========
    const userEmail = userCredentials?.correo;
    const creditDue =
      paymentOption === "Crédito" && creditAllowed
        ? addDays(new Date(), creditDays).toISOString()
        : null;

    // NEW JAN12 ====== SNAPSHOT de pago según reglas (moneda seleccionada + DOF actual) ======
    const paymentCurrency = String(preferredCurrency || "USD").toUpperCase();
    const hasRate = Number.isFinite(rate) && rate > 0;
    const usdSum = subtotalUSD_pdf2 || 0;
    const mxnSum = subtotalMXN_pdf2 || 0;
    
    // Sanitiza descuento
    const discUSD = Number(numericDiscount || 0);
    const discMXN = hasRate ? discUSD * rate : 0;
    
    let amountPayed = null;
    
        if (paymentCurrency === "MXN") {
          if (hasRate) {
            // Se paga TODO en MXN: USD se convierte con DOF; MXN queda en MXN
            const grossMXN = mxnSum + usdSum * rate;
            const netMXN   = round2(grossMXN - discMXN); // desc. convertido a MXN
            amountPayed = Math.max(0, netMXN);
          } else {
            // No hay DOF: snapshot como mixto para no perder integridad
            // USD se pagará en USD; MXN en MXN. Descuento en MXN desconocido => no se aplica.
            amountPayed = {
              usd: round2(Math.max(0, usdSum)), // sin descuento por no poder convertirlo
              mxn: round2(Math.max(0, mxnSum)), // igual que arriba
            };
          }
        } else {
          // paymentCurrency === "USD"
          if (mxnSum > 0 && usdSum > 0) {
            // Orden mixta: USD-listado en USD, MXN-listado en MXN
            // Descuento (si existe) lo aplicamos a la porción USD
            const netUSD = round2(Math.max(0, usdSum - discUSD));
            amountPayed = { usd: netUSD, mxn: round2(mxnSum) };
          } else if (usdSum > 0 && mxnSum === 0) {
            // Solo USD
            const netUSD = round2(Math.max(0, usdSum - discUSD));
            amountPayed = netUSD;
          } else {
            // Solo MXN (aunque eligió USD, no se puede pagar MXN en USD)
            amountPayed = round2(mxnSum); // snapshot en MXN
          }
    }
    
    // Estructura del tipo de cambio usado (si existe)
    const currencyExchange = {
          pair: "USD/MXN",
          source: "DOF",
          rate: hasRate ? round2(rate) : null,
          asOf: dofDate || null,
    };
    

    const orderInfo = {
      userEmail,
      items,
      totals: {
        totalUSDNative: Number(totalUSDNative.toFixed(2)),
        totalMXNNative: Number(totalMXNNative.toFixed(2)),
        totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
        totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
        dofRate: dof2,
        dofDate,
        discountUSD: Number(discountTotal || 0),
        vatUSD,
        vatMXN: totalAllMXN !== null ? vatMXN : null,
      },

      // 🔻 NUEVO SNAPSHOT
      paymentCurrency,
      amountPayed,
      currencyExchange,
      
      requestBill: !!wantsInvoice,

      // ⬇️ keep string for compatibility + include structured pickup details
      shippingInfo: pickupSelected ? "Recoger en Matriz" : { ...currentShipping },
      pickupDetails: pickupSelected
        ? { date: pickupDate || null, time: pickupTime || null }
        : null,

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
          {/* ===== Preferencias de Envío (solo datos) ===== */}
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
                disabled={pickupSelected} // optional: disable if picking up
                title={pickupSelected ? "Deshabilitado al seleccionar Recoger en Matriz" : ""}
              >
                <option value="">Seleccione otra dirección</option>
                {shippingOptions.map((opt) => (
                  <option key={opt._id} value={opt._id}>
                    {opt.apodo || `${opt.calleEnvio} ${opt.exteriorEnvio || ""}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="orderNow-AddressDiv" style={pickupSelected ? { opacity: 0.5 } : undefined}>
              {pickupSelected ? (
                <label className="orderNow-Label"><b>Entrega en tienda matriz seleccionada.</b></label>
              ) : (
                <>
                  <label className="orderNow-Label">
                    {currentShipping.calleEnvio} #{currentShipping.exteriorEnvio} Int. {currentShipping.interiorEnvio}
                  </label>
                  <label className="orderNow-Label">Col. {currentShipping.coloniaEnvio}</label>
                  <label className="orderNow-Label">
                    {currentShipping.ciudadEnvio}, {currentShipping.estadoEnvio}. C.P. {currentShipping.cpEnvio}
                  </label>
                </>
              )}
            </div>
          </div>

          {/* ===== Recoger en Matriz (CTA debajo de Dirección de Envío) ===== */}
          <div className="headerAndDets-Div" style={{ marginTop: 8 }}>
            <div className="storePickUp-Div">
              <div
                className="orderNow-PickUpDiv "
                style={{
                  border: "1px dashed rgba(255,255,255,0.35)",
                  padding: 12,
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  gap: 8,
                  background: pickupSelected ? "rgba(16,185,129,0.12)" : "transparent",
                }}
              >
                <label className="orderNow-Label" style={{ fontWeight: 700 }}>
                  ¿Prefieres recoger en matriz?
                </label>
                <button
                  type="button"
                  className="submitOrder-Btn"
                  onClick={() => setPickupSelected((v) => !v)}
                  style={{ minWidth: 160, fontSize: 12 }}
                  title={
                    pickupSelected
                      ? "Haz clic para volver a Enviar a domicilio"
                      : "Haz clic para elegir Recoger en Matriz"
                  }
                >
                  {pickupSelected ? "✓ Recoger en Matriz (Seleccionado)" : "Recoger en Matriz"}
                </button>
                <span style={{ fontSize: 12, opacity: 0.9 }}>
                  {pickupSelected
                    ? "Guardaremos 'Recoger en Matriz' como tu método de entrega."
                    : "Por defecto, enviaremos a tu dirección seleccionada."}
                </span>

                {/* ⬇️ Dropdowns de fecha y hora SOLO si está seleccionado */}
                {pickupSelected && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", marginTop: 6 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label className="orderNow-Label"><b>Fecha de recolección</b></label>
                      <select
                        className="alternateAddress-Select"
                        value={pickupDate}
                        onChange={(e) => setPickupDate(e.target.value)}
                        style={{ width: "100%" }}
                      >
                        {dateOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label className="orderNow-Label"><b>Hora de recolección</b></label>
                      <select
                        className="alternateAddress-Select"
                        value={pickupTime}
                        onChange={(e) => setPickupTime(e.target.value)}
                        style={{ width: "100%" }}
                      >
                        {timeOptions.length ? (
                          timeOptions.map((t) => <option key={t} value={t}>{t}</option>)
                        ) : (
                          <option value="">No hay horarios disponibles</option>
                        )}
                      </select>
                      {pickupDate && !timeOptions.length && (
                        <span style={{ fontSize: 12, opacity: 0.9 }}>
                          Selecciona otra fecha para ver horarios disponibles.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
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

                let addedDesgloseHeader = false;
                const ensureDesgloseHeader = () => {
                  if (wantsDesgloseIVA && !addedDesgloseHeader) {
                    rows.push({ isHeader: true, text: "Desglose Financiero" });
                    addedDesgloseHeader = true;
                  }
                };

                const writeBreakdownRows = (prefix, grand, fmt) => {
                  ensureDesgloseHeader();
                  const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
                  const iva = +(grand - sub).toFixed(2);
                  rows.push({ label: `Sub-total (${prefix}):`, value: fmt(sub) });
                  rows.push({ label: `IVA (${prefix}) (16%):`, value: fmt(iva) });
                  rows.push({ label: `Total ${prefix}:`, value: fmt(grand), boldLabel: true });
                };

                if (preferredCurrency === "USD") {
                  if (hasUSD) {
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
            <button
              className="submitOrder-Btn"
              type="button"
              onClick={() => setShowCtaModal(true)}  // ⬅️ open CTA modal instead of saving immediately
            >
              Descargar <br />
              Orden
            </button>
          </div>
        </div>
      </div>

      {/* ===== CTA MODAL: recordar subir evidencia de pago ===== */}
      {showCtaModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCtaModal(false);
          }}
        >
          <div
            style={{
              width: "min(680px, 95vw)",
              background: "white",
              color: "#0b0b0b",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              padding: "20px 18px",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#C2410C" }}>
              Atención
            </h3>
            <p style={{ margin: "0 0 10px", lineHeight: 1.4, fontSize: 14 }}>
              Recuerda que para que tu pedido sea procesado, es necesario enviarnos tu comprobante de pago.
              Para hacerlo, sigue estos sencillos pasos:
            </p>
            <ol style={{ margin: "0 0 10px 16px", padding: 0, fontSize: 14, lineHeight: 1.5 }}>
              <li>En la página principal de la app <b>GISConnect</b> entra a <b>“Mis Pedidos”</b>.</li>
              <li>Busca y selecciona el pedido que acabas de realizar.</li>
              <li>En la parte inferior de la pantalla, en el detalle del pedido, anexa la evidencia de tu pago (ticket o captura de pantalla).</li>
              <li>Da clic en <b>“Subir Evidencia”</b> y listo.</li>
            </ol>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowCtaModal(false)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "transparent",
                  border: "1px solid #ddd",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowCtaModal(false);
                  await handleDownloadAndSave();
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "linear-gradient(90deg,#38bdf8,#22c55e)",
                  border: "none",
                  color: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Entendido, continuar
              </button>
            </div>
          </div>
        </div>
      )}

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




// // when clicking on "Recoger en Matriz" please add two dropdowns immediatly bellow: a date and a time dropdown. If the user is ordering past 13:00hrs of current day, dont show current date on date dropdown. If order is placed before 13:00hrs, then allow for the first available timeslot shown to be two hours after current time (say, order is placed at 10am local time, then first available pickup timeslot is at 12pm). As well, when clikcing "Descargar Orden" I want a modal to pop-up that is a call to action, since users aren't following the order flow. In this modal I want a message that says something like "Atención: Recuerda que para que tu pedido sea procesado, es necesario nos envies to comporbante de pago. Para hacerlo sigue estos sencillos pasos: 1. En la pagina principal de la app GISConnect entra a "Mis Pedidos", 2. Busca y selecciona el pedido que acabas de realizar. 3. En la parte inferior de la pantalla donde puedes ver el detalle de tu pedido anexa la evidencia de tu pago - ya sea un ticket o captura de pantalla. 4. Da click a "Subir Evidencia" y listo. PLease direct edit.   
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

//   const [discountTotal, setDiscountTotal] = useState("");
//   const [requestBill, setRequestBill] = useState("");
//   const [wantsInvoice, setWantsInvoice] = useState(false);
//   const [imageLookup, setImageLookup] = useState({});

//   const [shippingPrefs, setShippingPrefs] = useState({
//     preferredCarrier: "",
//     insureShipment: false,
//   });

//   // ✅ NEW: pickup toggle
//   const [pickupSelected, setPickupSelected] = useState(false);

//   // DOF FX
//   const [dofRate, setDofRate] = useState(null);
//   const [dofDate, setDofDate] = useState(null);
//   const [fxError, setFxError] = useState(null);

//   // NEW: helper to truncate to 2 decimals (not round)
//   const trunc2 = (n) => {
//     const x = Number(n);
//     if (!Number.isFinite(x)) return null;
//     return Math.trunc(x * 100) / 100;
//   };
  
//   // NEW: effective rate used across the app
//   const dof2 = useMemo(() => trunc2(dofRate), [dofRate]);

//   // Credit
//   const CREDIT_SHEET_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vSahPxZ8Xq6jSlgWh7F7Rm7wqDsSyBrb6CEFdsEjyXYSkcsS62yXpiGb9GqIu8c4An3l7yBUbpe23hY/pub?gid=0&single=true&output=csv";

//   const [creditRow, setCreditRow] = useState(null);
//   const [creditAllowed, setCreditAllowed] = useState(false);
//   const [creditBlocked, setCreditBlocked] = useState(false);
//   const [creditDays, setCreditDays] = useState(0);
//   const [paymentOption, setPaymentOption] = useState("Contado");

//   // product image key
//   const makeKey = (name = "", pres = "") =>
//     `${name}`.trim().toLowerCase() + "__" + `${pres}`.trim().toLowerCase();

//   // Helpers to pick newest Mongo address
//   const _idToMs = (id) => {
//     try {
//       return parseInt(String(id).slice(0, 8), 16) * 1000;
//     } catch {
//       return 0;
//     }
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

//   // product images from CSV
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

//   // Client DB (also used now to read DESGLOSE_IVA flag)
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

//   // row for the logged-in user (by CORREO_EMPRESA)
//   const clientRowFromCSV = useMemo(() => {
//     if (!userCredentials?.correo || csvClientData.length === 0) return null;
//     return csvClientData.find(
//       (r) =>
//         (r.CORREO_EMPRESA || "").trim().toLowerCase() ===
//         (userCredentials.correo || "").trim().toLowerCase()
//     );
//   }, [csvClientData, userCredentials?.correo]);

//   // Client full name (kept for credit lookup)
//   const clientNameFromSheet = useMemo(() => {
//     return (clientRowFromCSV?.NOMBRE_APELLIDO || "").trim();
//   }, [clientRowFromCSV]);

//   // === NEW: whether we must show the IVA breakdown when wantsInvoice === true
//   const wantsDesgloseIVA = useMemo(() => {
//     if (!wantsInvoice) return false;
//     const v = (clientRowFromCSV?.DESGLOSE_IVA || "").trim().toLowerCase();
//     return v === "si" || v === "sí";
//   }, [wantsInvoice, clientRowFromCSV?.DESGLOSE_IVA]);

//   // keep legacy fallbacks (unused in header now, but left intact)
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

//   // fetch credit settings
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

//   // ====== NEW TOTALS MODEL (grand totals are the NATURAL SUM; breakdown is display-only when desglose) ======
//   const VAT_RATE = 0.16;
//   const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//   const fmtMXN = (v) =>
//     `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

//   // Pre-IVA natural sums by currency
//   const {
//     sumUSD,
//     sumMXN,
//     isMixed,
//     hasUSD,
//     hasMXN,
//     usdToMXN,
//     combinedMXN,
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

//     let usdMXN = null;
//     let combined = null;
//     if (Number.isFinite(dof2) && dof2) {
//       usdMXN = usd * dof2;
//       combined = mxn + usdMXN;
//     }

//     return {
//       sumUSD: usd,
//       sumMXN: mxn,
//       isMixed: mixed,
//       hasUSD: _hasUSD,
//       hasMXN: _hasMXN,
//       usdToMXN: usdMXN,
//       combinedMXN: combined,
//     };
//   }, [items, dof2]);

//   const totalUSDNative = sumUSD;
//   const totalMXNNative = sumMXN;

//   const totalAllUSD =
//     Number.isFinite(dof2) && dof2 ? sumUSD + sumMXN / dof2 : null;

//   const totalAllMXN =
//     Number.isFinite(dof2) && dof2 ? sumMXN + sumUSD * dof2 : null;

//   const numericDiscount = Number(discountTotal || 0);
//   const baseAllUSD = (totalAllUSD ?? 0) - numericDiscount;
//   const baseAllMXN =
//     totalAllMXN != null ? totalAllMXN - numericDiscount * (Number(dof2) || 0) : null;

//   const vatUSD = wantsDesgloseIVA && baseAllUSD > 0
//     ? +(baseAllUSD - baseAllUSD / (1 + VAT_RATE)).toFixed(2)
//     : 0;

//   const vatMXN = wantsDesgloseIVA && baseAllMXN != null && baseAllMXN > 0
//     ? +(baseAllMXN - baseAllMXN / (1 + VAT_RATE)).toFixed(2)
//     : 0;

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

//   // ===== PDF + Save order (uses new "natural sum + optional desglose" rules) =====
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

//     // Empresa
//     doc.addImage(iconBuilding, 13, 53, 5, 5);
//     doc.text(`${userProfile.empresa || ""}`, 19, 57);

//     // Contacto
//     doc.addImage(iconContact, 13.5, 59.5, 4, 4);
//     doc.text(`${[userProfile.nombre, userProfile.apellido].filter(Boolean).join(" ")}`, 19, 63);

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

//     // Correo
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
//         106,
//         73
//       );
//       doc.text(`Col. ${currentBilling.coloniaFiscal || ""}`, 106, 77);
//       doc.text(
//         `${(currentBilling.ciudadFiscal || "")}, ${(currentBilling.estadoFiscal || "")}. C.P. ${(currentBilling.cpFiscal || "")}`,
//         106,
//         81
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

//     // === Helpers (define before any use) ===
//     const fmtNum = (v, locale = "en-US") =>
//       (Number(v) || 0).toLocaleString(locale, {
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//     });

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
//           `$${fmtNum(unit, "en-US")} USD`,
//           `$${fmtNum(qty * unit, "en-US")} USD`,
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

//       const subtotalUSD_pdf = usdItems.reduce(
//         (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0),
//         0
//       );
//       doc.setFontSize(11);
//       doc.setFont("helvetica", "bold");
//       doc.text(`Subtotal USD: $${fmtNum(subtotalUSD_pdf, "en-US")} USD`, 140, cursorY);
//       doc.setFont("helvetica", "normal");
//       cursorY += 12;
//     }

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

//       const subtotalMXN_pdf = mxnItems.reduce(
//         (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0),
//         0
//       );
//       doc.setFontSize(11);
//       doc.setFont("helvetica", "bold");
//       doc.text(
//         `Subtotal MXN: $${subtotalMXN_pdf.toLocaleString("es-MX", {
//           minimumFractionDigits: 2,
//           maximumFractionDigits: 2,
//         })} MXN`,
//         140,
//         cursorY
//       );
//       doc.setFont("helvetica", "normal");
//       cursorY += 12;
//     }

//     const rate = Number.isFinite(dof2) ? dof2 : 0;
//     const fmtUSD_pdf = (v) => `$${fmtNum(v, "en-US")} USD`;
//     const fmtMXN_pdf = (v) =>
//       `$${(Number(v) || 0).toLocaleString("es-MX", {
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//       })} MXN`;

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

//     const grandUSD_natural = subtotalUSD_pdf2;
//     const grandMXN_natural = subtotalMXN_pdf2;
//     const usdEnMXN = rate ? subtotalUSD_pdf2 * rate : 0;
//     const combinedMXN_natural = rate ? subtotalMXN_pdf2 + usdEnMXN : null;

//     const boxX = 12,
//       boxW = 186,
//       boxPad = 4,
//       lineH = 6;
//     const textMaxW = boxW - boxPad * 2;

//     const measure = () => {
//       let y = cursorY + boxPad;
//       y += lineH;
//       if (preferred === "MXN") {
//         if (combinedMXN_natural != null) {
//           y += wantsDesgloseIVA ? lineH * 3 : lineH;
//           if (isMixed_pdf || hasUSD_pdf) {
//             const det = rate
//               ? (isMixed_pdf
//                   ? `Detalle (conversión): USD (${fmtUSD_pdf(subtotalUSD_pdf2)}) × ${rate.toFixed(
//                       2
//                     )} = ${fmtMXN_pdf(usdEnMXN)}; + MXN nativo ${fmtMXN_pdf(subtotalMXN_pdf2)}.`
//                   : `Detalle (conversión): USD (${fmtUSD_pdf(subtotalUSD_pdf2)}) × ${rate.toFixed(
//                       2
//                     )} = ${fmtMXN_pdf(usdEnMXN)}.`)
//               : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//             const detLines = doc.splitTextToSize(det, textMaxW);
//             y += detLines.length * 5 + 3;
//             if (rate) y += 5;
//           }
//         } else {
//           const err =
//             "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//           const lines = doc.splitTextToSize(err, textMaxW);
//           y += lines.length * 5 + 3;
//         }
//         if (isMixed_pdf) {
//           const l = doc.splitTextToSize(
//             "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.",
//             textMaxW
//           );
//           y += l.length * 5 + 5;
//         }
//       } else {
//         if (hasUSD_pdf) y += wantsDesgloseIVA ? lineH * 3 : lineH;
//         if (hasMXN_pdf) y += wantsDesgloseIVA ? lineH * 3 : lineH;
//         if (isMixed_pdf && rate) y += 5;
//         if (isMixed_pdf) {
//           const l = doc.splitTextToSize(
//             "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.",
//             textMaxW
//           );
//           y += l.length * 5 + 5;
//         }
//         if (!hasUSD_pdf && hasMXN_pdf) {
//           const n = doc.splitTextToSize(
//             "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.",
//             textMaxW
//           );
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

//     let y = cursorY + boxPad;
//     doc.setFontSize(10);
//     doc.setFont("helvetica", "bold");
//     doc.text(`Moneda de pago seleccionada: ${preferred}`, boxX + boxPad, y + 3);
//     y += lineH;
//     doc.setFont("helvetica", "normal");

//     const writeBreakdownUSD = (grand) => {
//       const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
//       const iva = +(grand - sub).toFixed(2);
//       doc.text(`USD — Subtotal: ${fmtUSD_pdf(sub)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.text(`USD — IVA (16%): ${fmtUSD_pdf(iva)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.setFont("helvetica", "bold");
//       doc.text(`USD — Total: ${fmtUSD_pdf(grand)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.setFont("helvetica", "normal");
//     };
//     const writeBreakdownMXN = (grand) => {
//       const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
//       const iva = +(grand - sub).toFixed(2);
//       doc.text(`MXN — Subtotal: ${fmtMXN_pdf(sub)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.text(`MXN — IVA (16%): ${fmtMXN_pdf(iva)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.setFont("helvetica", "bold");
//       doc.text(`MXN — Total: ${fmtMXN_pdf(grand)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.setFont("helvetica", "normal");
//     };

//     if (preferred === "MXN") {
//       if (combinedMXN_natural == null) {
//         doc.setTextColor(180, 0, 0);
//         const err =
//           "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//         doc.text(doc.splitTextToSize(err, textMaxW), boxX + boxPad, y);
//         doc.setTextColor(0, 0, 0);
//         y += 10;
//       } else {
//         if (wantsDesgloseIVA) {
//           writeBreakdownMXN(combinedMXN_natural);
//         } else {
//           doc.setFont("helvetica", "bold");
//           doc.text(
//             `Total a pagar en MXN: ${fmtMXN_pdf(combinedMXN_natural)}`,
//             boxX + boxPad,
//             y + 3
//           );
//           doc.setFont("helvetica", "normal");
//           y += lineH;
//         }

//         if (isMixed_pdf || hasUSD_pdf) {
//           doc.setFontSize(9);
//           doc.setTextColor(120, 120, 120);
//           const det = `Detalle (conversión): USD (${fmtUSD_pdf(
//             subtotalUSD_pdf2
//           )}) × ${rate.toFixed(2)} = ${fmtMXN_pdf(usdEnMXN)}`;
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
//         const legend =
//           "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//         doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 3);
//         doc.setTextColor(0, 0, 0);
//         doc.setFont("helvetica", "normal");
//       }
//     } else {
//       if (hasUSD_pdf) {
//         if (wantsDesgloseIVA) {
//           writeBreakdownUSD(grandUSD_natural);
//         } else {
//           doc.setFont("helvetica", "bold");
//           doc.text(
//             `A pagar en USD (Total): ${fmtUSD_pdf(grandUSD_natural)}`,
//             boxX + boxPad,
//             y + 3
//           );
//           doc.setFont("helvetica", "normal");
//           y += lineH;
//         }
//       }
//       if (hasMXN_pdf) {
//         if (wantsDesgloseIVA) {
//           writeBreakdownMXN(grandMXN_natural);
//         } else {
//           doc.setFont("helvetica", "bold");
//           doc.text(
//             `A pagar en MXN (Total): ${fmtMXN_pdf(grandMXN_natural)}`,
//             boxX + boxPad,
//             y + 3
//           );
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
//         const legend =
//           "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//         doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 5);
//         doc.setTextColor(0, 0, 0);
//         doc.setFont("helvetica", "normal");
//       }
//       if (!hasUSD_pdf && hasMXN_pdf) {
//         doc.setFontSize(9);
//         doc.setTextColor(120, 120, 120);
//         const note =
//           "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
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
//         totalUSDNative: Number(totalUSDNative.toFixed(2)),
//         totalMXNNative: Number(totalMXNNative.toFixed(2)),
//         totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
//         totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
//         dofRate: dof2,
//         dofDate,
//         discountUSD: Number(discountTotal || 0),
//         vatUSD,
//         vatMXN: totalAllMXN !== null ? vatMXN : null,
//       },
//       requestBill: !!wantsInvoice,
//       // ✅ If pickup is selected, store string "Recoger en Matriz"; else keep address object
//       shippingInfo: pickupSelected ? "Recoger en Matriz" : { ...currentShipping },
//       billingInfo: wantsInvoice ? { ...currentBilling } : {},
//       shippingPreferences: { ...shippingPrefs },
//       orderDate: new Date().toISOString(),
//       orderStatus: "Pedido Realizado",
//       paymentOption,
//       creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
//       creditDueDate: creditDue,
//       invoiceBreakdownEnabled: wantsDesgloseIVA,
//     };

//     try {
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
//           {/* ===== Preferencias de Envío (SPLIT: prefs left, divider, pickup button right) ===== */}
//           {/* ===== Preferencias de Envío (solo datos) ===== */}
//           <div className="headerAndDets-Div">
//             <div className="headerEditIcon-Div">
//               <label className="newAddress-Label">Preferencias de Envío</label>
//             </div>

//             <div className="orderNow-AddressDiv">
//               <label className="orderNow-Label">
//                 <b>Transportista:</b> <br />
//                 {shippingPrefs.preferredCarrier || "No especificado"}
//               </label>
//               <br />
//               <label className="orderNow-Label">
//                 <b>Mercancía Asegurada:</b> <br />
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
//                 disabled={pickupSelected} // optional: disable if picking up
//                 title={pickupSelected ? "Deshabilitado al seleccionar Recoger en Matriz" : ""}
//               >
//                 <option value="">Seleccione otra dirección</option>
//                 {shippingOptions.map((opt) => (
//                   <option key={opt._id} value={opt._id}>
//                     {opt.apodo || `${opt.calleEnvio} ${opt.exteriorEnvio || ""}`}
//                   </option>
//                 ))}
//               </select>
//             </div>

//             <div className="orderNow-AddressDiv" style={pickupSelected ? { opacity: 0.5 } : undefined}>
//               {pickupSelected ? (
//                 <label className="orderNow-Label"><b>Entrega en tienda matriz seleccionada.</b></label>
//               ) : (
//                 <>
//                   <label className="orderNow-Label">
//                     {currentShipping.calleEnvio} #{currentShipping.exteriorEnvio} Int. {currentShipping.interiorEnvio}
//                   </label>
//                   <label className="orderNow-Label">Col. {currentShipping.coloniaEnvio}</label>
//                   <label className="orderNow-Label">
//                     {currentShipping.ciudadEnvio}, {currentShipping.estadoEnvio}. C.P. {currentShipping.cpEnvio}
//                   </label>
//                 </>
//               )}
//             </div>
//           </div>

//           {/* ===== Recoger en Matriz (CTA debajo de Dirección de Envío) ===== */}
//           <div className="headerAndDets-Div" style={{ marginTop: 8 }}>
//           <div className="storePickUp-Div">
//             <div className="orderNow-AddressDiv"
//                 style={{
//                   border: "1px dashed rgba(255,255,255,0.35)",
//                   padding: 12,
//                   borderRadius: 10,
//                   display: "flex",
//                   flexDirection: "column",
//                   alignItems: "flex-start",
//                   justifyContent: "center",
//                   gap: 8,
//                   background: pickupSelected ? "rgba(16,185,129,0.12)" : "transparent",
//                 }}
//             >
//               <label className="orderNow-Label" style={{ fontWeight: 700 }}>
//                 ¿Prefieres recoger en matriz?
//               </label>
//               <button
//                 type="button"
//                 className="submitOrder-Btn"
//                 onClick={() => setPickupSelected((v) => !v)}
//                 style={{ minWidth: 160, fontSize: 12 }}
//                 title={
//                   pickupSelected
//                     ? "Haz clic para volver a Enviar a domicilio"
//                     : "Haz clic para elegir Recoger en Matriz"
//                 }
//               >
//                 {pickupSelected ? "✓ Recoger en Matriz (Seleccionado)" : "Recoger en Matriz"}
//               </button>
//               <span style={{ fontSize: 12, opacity: 0.9 }}>
//                 {pickupSelected
//                   ? "Guardaremos 'Recoger en Matriz' como tu método de entrega."
//                   : "Por defecto, enviaremos a tu dirección seleccionada."}
//               </span>
//             </div>
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

//             {/* Summary box (NATURAL totals; show breakdown only if wantsInvoice && DESGLOSE_IVA === "Sí") */}
//             <div className="orderNow-summaryDiv">
//               {(() => {
//                 const rows = [{ label: "Moneda de pago:", value: preferredCurrency, boldLabel: true, labelClass: "accent"  }];

//                 let addedDesgloseHeader = false;
//                 const ensureDesgloseHeader = () => {
//                   if (wantsDesgloseIVA && !addedDesgloseHeader) {
//                     rows.push({ isHeader: true, text: "Desglose Financiero" });
//                     addedDesgloseHeader = true;
//                   }
//                 };

//                 const writeBreakdownRows = (prefix, grand, fmt) => {
//                   ensureDesgloseHeader();
//                   const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
//                   const iva = +(grand - sub).toFixed(2);
//                   rows.push({ label: `Sub-total (${prefix}):`, value: fmt(sub) });
//                   rows.push({ label: `IVA (${prefix}) (16%):`, value: fmt(iva) });
//                   rows.push({ label: `Total ${prefix}:`, value: fmt(grand), boldLabel: true });
//                 };

//                 if (preferredCurrency === "USD") {
//                   if (hasUSD) {
//                     wantsDesgloseIVA ? writeBreakdownRows("USD", sumUSD, fmtUSD)
//                                     : rows.push({ label: "Total USD:", value: fmtUSD(sumUSD), boldLabel: true });
//                   }
//                   if (hasMXN) {
//                     wantsDesgloseIVA ? writeBreakdownRows("MXN", sumMXN, fmtMXN)
//                                     : rows.push({ label: "Total MXN:", value: fmtMXN(sumMXN), boldLabel: true });
//                   }
//                   if (isMixed && dofRate) {
//                     rows.push({
//                       label: "Tipo de cambio:",
//                       labelClass: "muted",
//                       valueClass: dofRate ? "muted" : "",
//                       value: `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`,
//                     });
//                   }
//                 } else {
//                   if (combinedMXN != null) {
//                     wantsDesgloseIVA
//                       ? writeBreakdownRows("MXN", combinedMXN, fmtMXN)
//                       : rows.push({ label: "Total a pagar en MXN:", value: fmtMXN(combinedMXN), boldLabel: true });

//                     if (isMixed || hasUSD) {
//                       rows.push({
//                         label: "Detalle (conversión):",
//                         labelClass: "sectionHeader",
//                         value:
//                           dofRate && usdToMXN != null ? (
//                             <>
//                               {`USD (${fmtUSD(sumUSD)}) × ${dof2.toFixed(2)} = ${fmtMXN(usdToMXN)}`}
//                               <br />
//                             </>
//                           ) : (
//                             "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN."
//                           ),
//                       });
//                       rows.push({
//                         label: "Tipo de cambio:",
//                         labelClass: "muted",
//                         valueClass: dofRate ? "muted" : "",
//                         value: dofRate
//                           ? `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
//                           : fxError
//                           ? "—"
//                           : "Cargando...",
//                       });
//                     }
//                   } else {
//                     rows.push({ label: "Total a pagar en MXN:", value: "—", boldLabel: true });
//                   }
//                 }

//                 return (
//                   <>
//                     {rows.map((r, i) =>
//                       r.isHeader ? (
//                         <div className="summary-section" key={`hdr-${i}`}>
//                           {r.text}
//                         </div>
//                       ) : (
//                         <div className="summary-pair" key={i}>
//                           <div className={`summary-label ${r.boldLabel ? "bold" : ""} ${r.labelClass || ""}`}>
//                             {r.label}
//                           </div>
//                           <div className={`summary-value ${r.valueClass || ""}`}>{r.value}</div>
//                         </div>
//                       )
//                     )}

//                     {isMixed && (
//                       <div className="summary-note">
//                         IMPORTANTE: En órdenes mixtas, los artículos listados en MXN deben pagarse en MXN.
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
//               <div className="orderNow-AddressDiv" style={{ color: "#b00", fontSize: 13, marginBottom: 8 }}>
//                 Este cliente tiene condiciones pendientes. El crédito no está disponible para nuevas órdenes.
//               </div>
//             )}

//             <div className="orderNow-AddressDiv" style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
//                   Vigencia: {creditDays} día(s). Vence: {addDays(new Date(), creditDays).toLocaleDateString("es-MX")}
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










// // please direct edit the vertical line into my current code. as well, in your newest version you eliminate resumen de orden and opciones de pago, please make sure you dont get rid of any of the other fields, just modify the "preferencias de envio". Here is my original orderNow.jsx, please direct edit all modifs without getting rid of anything
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

//   // NEW: helper to truncate to 2 decimals (not round)
//   const trunc2 = (n) => {
//     const x = Number(n);
//     if (!Number.isFinite(x)) return null;
//     return Math.trunc(x * 100) / 100;
//   };
  
//   // NEW: effective rate used across the app
//   const dof2 = useMemo(() => trunc2(dofRate), [dofRate]);

//   // Credit
//   const CREDIT_SHEET_URL =
//     "https://docs.google.com/spreadsheets/d/e/2PACX-1vSahPxZ8Xq6jSlgWh7F7Rm7wqDsSyBrb6CEFdsEjyXYSkcsS62yXpiGb9GqIu8c4An3l7yBUbpe23hY/pub?gid=0&single=true&output=csv";

//   const [creditRow, setCreditRow] = useState(null);
//   const [creditAllowed, setCreditAllowed] = useState(false);
//   const [creditBlocked, setCreditBlocked] = useState(false);
//   const [creditDays, setCreditDays] = useState(0);
//   const [paymentOption, setPaymentOption] = useState("Contado");

//   // product image key
//   const makeKey = (name = "", pres = "") =>
//     `${name}`.trim().toLowerCase() + "__" + `${pres}`.trim().toLowerCase();

//   // Helpers to pick newest Mongo address
//   const _idToMs = (id) => {
//     try {
//       return parseInt(String(id).slice(0, 8), 16) * 1000;
//     } catch {
//       return 0;
//     }
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

//   // product images from CSV
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

//   // Client DB (also used now to read DESGLOSE_IVA flag)
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

//   // row for the logged-in user (by CORREO_EMPRESA)
//   const clientRowFromCSV = useMemo(() => {
//     if (!userCredentials?.correo || csvClientData.length === 0) return null;
//     return csvClientData.find(
//       (r) =>
//         (r.CORREO_EMPRESA || "").trim().toLowerCase() ===
//         (userCredentials.correo || "").trim().toLowerCase()
//     );
//   }, [csvClientData, userCredentials?.correo]);

//   // Client full name (kept for credit lookup)
//   const clientNameFromSheet = useMemo(() => {
//     return (clientRowFromCSV?.NOMBRE_APELLIDO || "").trim();
//   }, [clientRowFromCSV]);

//   // === NEW: whether we must show the IVA breakdown when wantsInvoice === true
//   const wantsDesgloseIVA = useMemo(() => {
//     if (!wantsInvoice) return false;
//     const v = (clientRowFromCSV?.DESGLOSE_IVA || "").trim().toLowerCase();
//     return v === "si" || v === "sí";
//   }, [wantsInvoice, clientRowFromCSV?.DESGLOSE_IVA]);


//   // keep legacy fallbacks (unused in header now, but left intact)
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

//   // fetch credit settings
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

//   // ====== NEW TOTALS MODEL (grand totals are the NATURAL SUM; breakdown is display-only when desglose) ======
//   const VAT_RATE = 0.16;
//   const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
//   const fmtMXN = (v) =>
//     `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

//   // Pre-IVA natural sums by currency
//   const {
//     sumUSD,          // natural sum of USD lines
//     sumMXN,          // natural sum of MXN lines
//     isMixed,
//     hasUSD,
//     hasMXN,
//     // for MXN preference combined view
//     usdToMXN,        // USD bucket converted to MXN (pre-IVA)
//     combinedMXN,     // sumMXN + usdToMXN  (pre-IVA)
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

//     // CHANGED: use dof2
//     let usdMXN = null;
//     let combined = null;
//     if (Number.isFinite(dof2) && dof2) {
//       usdMXN = usd * dof2;          // uses truncated 2-dec rate
//       combined = mxn + usdMXN;
//     }

//     return {
//       sumUSD: usd,
//       sumMXN: mxn,
//       isMixed: mixed,
//       hasUSD: _hasUSD,
//       hasMXN: _hasMXN,
//       usdToMXN: usdMXN,
//       combinedMXN: combined,
//     };
//   }, [items, dof2]);   // CHANGED: depend on dof2

//   // Legacy + payload mapping (we’ll keep these as the natural sums, not tax-added)
//   const totalUSDNative = sumUSD; // pre-IVA natural USD
//   const totalMXNNative = sumMXN; // pre-IVA natural MXN

//   const totalAllUSD =
//   Number.isFinite(dof2) && dof2 ? sumUSD + sumMXN / dof2 : null;


//   const totalAllMXN =
//     Number.isFinite(dof2) && dof2 ? sumMXN + sumUSD * dof2 : null;

//   // OPTIONAL: apply discount to natural sums if you were using it before (kept as-is)
//   const numericDiscount = Number(discountTotal || 0);
//   const baseAllUSD = (totalAllUSD ?? 0) - numericDiscount;
//     // CHANGED: use dof2 for discount conversion as well
//     const baseAllMXN =
//     totalAllMXN != null ? totalAllMXN - numericDiscount * (Number(dof2) || 0) : null;

//   // VAT fields for payload: only meaningful if we are actually showing desglose
//   const vatUSD = wantsDesgloseIVA && baseAllUSD > 0
//   ? +(baseAllUSD - baseAllUSD / (1 + VAT_RATE)).toFixed(2)
//   : 0;

// const vatMXN = wantsDesgloseIVA && baseAllMXN != null && baseAllMXN > 0
//   ? +(baseAllMXN - baseAllMXN / (1 + VAT_RATE)).toFixed(2)
//   : 0;

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

//   // ===== PDF + Save order (uses new "natural sum + optional desglose" rules) =====
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

//     // Empresa
//     doc.addImage(iconBuilding, 13, 53, 5, 5);
//     doc.text(`${userProfile.empresa || ""}`, 19, 57);

//     // Contacto
//     doc.addImage(iconContact, 13.5, 59.5, 4, 4);
//     doc.text(`${[userProfile.nombre, userProfile.apellido].filter(Boolean).join(" ")}`, 19, 63);

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

//     // Correo
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
//         106,
//         73
//       );
//       doc.text(`Col. ${currentBilling.coloniaFiscal || ""}`, 106, 77);
//       doc.text(
//         `${(currentBilling.ciudadFiscal || "")}, ${(currentBilling.estadoFiscal || "")}. C.P. ${(currentBilling.cpFiscal || "")}`,
//         106,
//         81
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

//     // === Helpers (define before any use) ===
//     const fmtNum = (v, locale = "en-US") =>
//       (Number(v) || 0).toLocaleString(locale, {
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//     });

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
//           `$${fmtNum(unit, "en-US")} USD`,
//           `$${fmtNum(qty * unit, "en-US")} USD`,
//           // `$${unit.toFixed(2)} USD`,
//           // `$${(qty * unit).toFixed(2)} USD`,
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

//       // Subtotal USD (natural sum)
//       const subtotalUSD_pdf = usdItems.reduce(
//         (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0),
//         0
//       );
//       doc.setFontSize(11);
//       doc.setFont("helvetica", "bold");
//       // doc.text(`Subtotal USD: $${subtotalUSD_pdf.toFixed(2)} USD`, 140, cursorY);
//       doc.text(`Subtotal USD: $${fmtNum(subtotalUSD_pdf, "en-US")} USD`, 140, cursorY);
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

//       // Subtotal MXN (natural sum)
//       const subtotalMXN_pdf = mxnItems.reduce(
//         (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0),
//         0
//       );
//       doc.setFontSize(11);
//       doc.setFont("helvetica", "bold");
//       doc.text(
//         `Subtotal MXN: $${subtotalMXN_pdf.toLocaleString("es-MX", {
//           minimumFractionDigits: 2,
//           maximumFractionDigits: 2,
//         })} MXN`,
//         140,
//         cursorY
//       );
//       doc.setFont("helvetica", "normal");
//       cursorY += 12;
//     }

//     // ========= Resumen Financiero (NATURAL sums + optional desglose) =========

//     // const fmtUSD_pdf = (v) => `$${(Number(v) || 0).toFixed(2)} USD`;
//     // const fmtNum = (v, locale = "en-US") =>
//     //   (Number(v) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
//     // const fmtUSD_pdf = (v) => `$${fmtNum(v, "en-US")} USD`;
//     // const fmtMXN_pdf = (v) =>
//     //   `$${(Number(v) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
//     const rate = Number.isFinite(dof2) ? dof2 : 0;
//     const fmtUSD_pdf = (v) => `$${fmtNum(v, "en-US")} USD`;
//     const fmtMXN_pdf = (v) =>
//       `$${(Number(v) || 0).toLocaleString("es-MX", {
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//       })} MXN`;

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

//     // Natural totals (NO extra IVA added)
//     const grandUSD_natural = subtotalUSD_pdf2; // to be paid in USD (if user pays USD)
//     const grandMXN_natural = subtotalMXN_pdf2; // to be paid in MXN
//     const usdEnMXN = rate ? subtotalUSD_pdf2 * rate : 0; // for MXN view detail
//     const combinedMXN_natural = rate ? subtotalMXN_pdf2 + usdEnMXN : null;

//     const boxX = 12,
//       boxW = 186,
//       boxPad = 4,
//       lineH = 6;
//     const textMaxW = boxW - boxPad * 2;

//     const measure = () => {
//       let y = cursorY + boxPad;
//       y += lineH; // "Moneda seleccionada"
//       if (preferred === "MXN") {
//         if (combinedMXN_natural != null) {
//           // total line (and maybe 2 extra lines if desglose)
//           y += wantsDesgloseIVA ? lineH * 3 : lineH;
//           if (isMixed_pdf || hasUSD_pdf) {
//             const det = rate
//               ? (isMixed_pdf
//                   ? `Detalle (conversión): USD (${fmtUSD_pdf(subtotalUSD_pdf2)}) × ${rate.toFixed(
//                       2
//                     )} = ${fmtMXN_pdf(usdEnMXN)}; + MXN nativo ${fmtMXN_pdf(subtotalMXN_pdf2)}.`
//                   : `Detalle (conversión): USD (${fmtUSD_pdf(subtotalUSD_pdf2)}) × ${rate.toFixed(
//                       2
//                     )} = ${fmtMXN_pdf(usdEnMXN)}.`)
//               : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//             const detLines = doc.splitTextToSize(det, textMaxW);
//             y += detLines.length * 5 + 3;
//             if (rate) y += 5; // tipo de cambio
//           }
//         } else {
//           const err =
//             "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//           const lines = doc.splitTextToSize(err, textMaxW);
//           y += lines.length * 5 + 3;
//         }
//         if (isMixed_pdf) {
//           const legend =
//             "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//           const l = doc.splitTextToSize(legend, textMaxW);
//           y += l.length * 5 + 5;
//         }
//       } else {
//         // USD preference
//         if (hasUSD_pdf) y += wantsDesgloseIVA ? lineH * 3 : lineH;
//         if (hasMXN_pdf) y += wantsDesgloseIVA ? lineH * 3 : lineH;
//         if (isMixed_pdf && rate) y += 5;
//         if (isMixed_pdf) {
//           const legend =
//             "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//           const l = doc.splitTextToSize(legend, textMaxW);
//           y += l.length * 5 + 5;
//         }
//         if (!hasUSD_pdf && hasMXN_pdf) {
//           const note =
//             "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
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

//     const writeBreakdownUSD = (grand) => {
//       const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
//       const iva = +(grand - sub).toFixed(2);
//       doc.text(`USD — Subtotal: ${fmtUSD_pdf(sub)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.text(`USD — IVA (16%): ${fmtUSD_pdf(iva)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.setFont("helvetica", "bold");
//       doc.text(`USD — Total: ${fmtUSD_pdf(grand)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.setFont("helvetica", "normal");
//     };
//     const writeBreakdownMXN = (grand) => {
//       const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
//       const iva = +(grand - sub).toFixed(2);
//       doc.text(`MXN — Subtotal: ${fmtMXN_pdf(sub)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.text(`MXN — IVA (16%): ${fmtMXN_pdf(iva)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.setFont("helvetica", "bold");
//       doc.text(`MXN — Total: ${fmtMXN_pdf(grand)}`, boxX + boxPad, y + 3);
//       y += lineH;
//       doc.setFont("helvetica", "normal");
//     };

//     if (preferred === "MXN") {
//       if (combinedMXN_natural == null) {
//         doc.setTextColor(180, 0, 0);
//         const err =
//           "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
//         doc.text(doc.splitTextToSize(err, textMaxW), boxX + boxPad, y);
//         doc.setTextColor(0, 0, 0);
//         y += 10;
//       } else {
//         if (wantsDesgloseIVA) {
//           writeBreakdownMXN(combinedMXN_natural);
//         } else {
//           doc.setFont("helvetica", "bold");
//           doc.text(
//             `Total a pagar en MXN: ${fmtMXN_pdf(combinedMXN_natural)}`,
//             boxX + boxPad,
//             y + 3
//           );
//           doc.setFont("helvetica", "normal");
//           y += lineH;
//         }

//         // Detalle + TC
//         if (isMixed_pdf || hasUSD_pdf) {
//           doc.setFontSize(9);
//           doc.setTextColor(120, 120, 120);
//           const det = `Detalle (conversión): USD (${fmtUSD_pdf(
//             subtotalUSD_pdf2
//           )}) × ${rate.toFixed(2)} = ${fmtMXN_pdf(usdEnMXN)}`;
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
//         const legend =
//           "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//         doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 3);
//         doc.setTextColor(0, 0, 0);
//         doc.setFont("helvetica", "normal");
//       }
//     } else {
//       // Preferencia USD — buckets por divisa
//       if (hasUSD_pdf) {
//         if (wantsDesgloseIVA) {
//           writeBreakdownUSD(grandUSD_natural);
//         } else {
//           doc.setFont("helvetica", "bold");
//           doc.text(
//             `A pagar en USD (Total): ${fmtUSD_pdf(grandUSD_natural)}`,
//             boxX + boxPad,
//             y + 3
//           );
//           doc.setFont("helvetica", "normal");
//           y += lineH;
//         }
//       }
//       if (hasMXN_pdf) {
//         if (wantsDesgloseIVA) {
//           writeBreakdownMXN(grandMXN_natural);
//         } else {
//           doc.setFont("helvetica", "bold");
//           doc.text(
//             `A pagar en MXN (Total): ${fmtMXN_pdf(grandMXN_natural)}`,
//             boxX + boxPad,
//             y + 3
//           );
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
//         const legend =
//           "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
//         doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 5);
//         doc.setTextColor(0, 0, 0);
//         doc.setFont("helvetica", "normal");
//       }
//       if (!hasUSD_pdf && hasMXN_pdf) {
//         doc.setFontSize(9);
//         doc.setTextColor(120, 120, 120);
//         const note =
//           "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
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

//     // ========= Build payload (natural sums; VAT only if desglose) =========
//     const userEmail = userCredentials?.correo;
//     const creditDue =
//       paymentOption === "Crédito" && creditAllowed
//         ? addDays(new Date(), creditDays).toISOString()
//         : null;

//     // For payload, keep natural totals and include VAT numbers only when desglose applies.
//     const orderInfo = {
//       userEmail,
//       items,
//       totals: {
//         // natural (pre-IVA) buckets:
//         totalUSDNative: Number(totalUSDNative.toFixed(2)),
//         totalMXNNative: Number(totalMXNNative.toFixed(2)),
//         // natural combined:
//         totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
//         totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
//         dofRate: dof2,
//         dofDate,
//         discountUSD: Number(discountTotal || 0),
//         // VAT fields (only meaningful if desglose is on)
//         vatUSD,
//         vatMXN: totalAllMXN !== null ? vatMXN : null,
//         // For clarity, also store the grand totals as NATURAL sums in the preferred currency contexts:
//         // If front-end needs, they can derive them again; here we keep natural sums only.
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
//       invoiceBreakdownEnabled: wantsDesgloseIVA,
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
//                 <b>Transportista:</b> <br />
//                 {shippingPrefs.preferredCarrier || "No especificado"}
//               </label>
//               <br />
//               <label className="orderNow-Label">
//                 <b>Mercancía Asegurada:</b> <br />
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

//             {/* Summary box (NATURAL totals; show breakdown only if wantsInvoice && DESGLOSE_IVA === "Sí") */}
//             <div className="orderNow-summaryDiv">
//               {(() => {
//                 const rows = [{ label: "Moneda de pago:", value: preferredCurrency, boldLabel: true, labelClass: "accent"  }];

//                 // 👉 track if we've already added the header
//                 let addedDesgloseHeader = false;
//                 const ensureDesgloseHeader = () => {
//                   if (wantsDesgloseIVA && !addedDesgloseHeader) {
//                     rows.push({ isHeader: true, text: "Desglose Financiero" });
//                     addedDesgloseHeader = true;
//                   }
//                 };

//                 const writeBreakdownRows = (prefix, grand, fmt) => {
//                   // make sure header shows up **before** the first Sub-total line
//                   ensureDesgloseHeader();
//                   const sub = +(grand / (1 + VAT_RATE)).toFixed(2);
//                   const iva = +(grand - sub).toFixed(2);
//                   rows.push({ label: `Sub-total (${prefix}):`, value: fmt(sub) });
//                   rows.push({ label: `IVA (${prefix}) (16%):`, value: fmt(iva) });
//                   rows.push({ label: `Total ${prefix}:`, value: fmt(grand), boldLabel: true });

//                   // rows.push({ label: `${prefix} Sub-total:`, value: fmt(sub) });
//                   // rows.push({ label: `${prefix} IVA (16%):`, value: fmt(iva) });
//                   // rows.push({ label: `${prefix} Total:`, value: fmt(grand), boldLabel: true });
//                 };

//                 if (preferredCurrency === "USD") {
//                   if (hasUSD) {
//                     // wantsDesgloseIVA ? writeBreakdownRows("USD —", sumUSD, fmtUSD)
//                     wantsDesgloseIVA ? writeBreakdownRows("USD", sumUSD, fmtUSD)
//                                     : rows.push({ label: "Total USD:", value: fmtUSD(sumUSD), boldLabel: true });
//                   }
//                   if (hasMXN) {
//                     wantsDesgloseIVA ? writeBreakdownRows("MXN", sumMXN, fmtMXN)
//                                     : rows.push({ label: "Total MXN:", value: fmtMXN(sumMXN), boldLabel: true });
//                   }
//                   if (isMixed && dofRate) {
//                     rows.push({
//                       label: "Tipo de cambio:",
//                       labelClass: "muted",
//                       valueClass: dofRate ? "muted" : "",
//                       value: `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`,
//                     });
//                   }
//                 } else {
//                   if (combinedMXN != null) {
//                     wantsDesgloseIVA
//                       ? writeBreakdownRows("MXN", combinedMXN, fmtMXN)
//                       : rows.push({ label: "Total a pagar en MXN:", value: fmtMXN(combinedMXN), boldLabel: true });

//                     if (isMixed || hasUSD) {
//                       rows.push({
//                         label: "Detalle (conversión):",
//                         labelClass: "sectionHeader",
//                         value:
//                           dofRate && usdToMXN != null ? (
//                             <>
//                               {`USD (${fmtUSD(sumUSD)}) × ${dof2.toFixed(2)} = ${fmtMXN(usdToMXN)}`}
//                               <br />
//                               {/* {`+ MXN nativo ${fmtMXN(sumMXN)}`} */}
//                             </>
//                           ) : (
//                             "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN."
//                           ),
//                       });
//                       rows.push({
//                         label: "Tipo de cambio:",
//                         labelClass: "muted",
//                         valueClass: dofRate ? "muted" : "",
//                         value: dofRate
//                           ? `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
//                           : fxError
//                           ? "—"
//                           : "Cargando...",
//                       });
//                     }
//                   } else {
//                     rows.push({ label: "Total a pagar en MXN:", value: "—", boldLabel: true });
//                   }
//                 }

//                 return (
//                   <>
//                     {rows.map((r, i) =>
//                       r.isHeader ? (
//                         <div className="summary-section" key={`hdr-${i}`}>
//                           {r.text}
//                         </div>
//                       ) : (
//                         <div className="summary-pair" key={i}>
//                           <div className={`summary-label ${r.boldLabel ? "bold" : ""} ${r.labelClass || ""}`}>
//                             {r.label}
//                           </div>
//                           <div className={`summary-value ${r.valueClass || ""}`}>{r.value}</div>
//                         </div>
//                       )
//                     )}

//                     {isMixed && (
//                       <div className="summary-note">
//                         IMPORTANTE: En órdenes mixtas, los artículos listados en MXN deben pagarse en MXN.
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
//               <div className="orderNow-AddressDiv" style={{ color: "#b00", fontSize: 13, marginBottom: 8 }}>
//                 Este cliente tiene condiciones pendientes. El crédito no está disponible para nuevas órdenes.
//               </div>
//             )}

//             <div className="orderNow-AddressDiv" style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
//                   Vigencia: {creditDays} día(s). Vence: {addDays(new Date(), creditDays).toLocaleDateString("es-MX")}
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
