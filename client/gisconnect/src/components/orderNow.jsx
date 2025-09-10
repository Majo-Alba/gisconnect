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

  // Items now can carry: { product, presentation, packPresentation, amount, price, currency, priceUSD?, priceMXN?, weight }
  const items = location.state?.items || [];
  // sep09
  const preferredCurrency = (location.state?.preferredCurrency || "USD").toUpperCase(); // <-- NEW
  // sep09
  console.log(items)

  const [discountTotal, setDiscountTotal] = useState("");
  // replaced by boolean "wantsInvoice" but we keep this for backwards compatibility reading
  const [requestBill, setRequestBill] = useState("");
  const [wantsInvoice, setWantsInvoice] = useState(false); // ⬅️ NEW: controls UI + PDF + VAT
  const [imageLookup, setImageLookup] = useState({});

  // Shipping preferences (from Mongo)
  const [shippingPrefs, setShippingPrefs] = useState({
    preferredCarrier: "",
    insureShipment: false,
  });

  // DOF FX
  const [dofRate, setDofRate] = useState(null);
  const [dofDate, setDofDate] = useState(null);
  const [fxError, setFxError] = useState(null);

  // Credit
  const CREDIT_SHEET_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSahPxZ8Xq6jSlgWh7F7Rm7wqDsSyBrb6CEFdsEjyXYSkcsS62yXpiGb9GqIu8c4An3l7yBUbpe23hY/pub?gid=0&single=true&output=csv";

  const [creditRow, setCreditRow] = useState(null);
  const [creditAllowed, setCreditAllowed] = useState(false);
  const [creditBlocked, setCreditBlocked] = useState(false);
  const [creditDays, setCreditDays] = useState(0);
  const [paymentOption, setPaymentOption] = useState("Contado");

  // fetch product images
  const makeKey = (name = "", pres = "") =>
    `${name}`.trim().toLowerCase() + "__" + `${pres}`.trim().toLowerCase();

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
    setWantsInvoice(savedRequestBill === "true"); // ⬅️ NEW (drives UI/PDF)
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

  // Client DB
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

  // map client row
  const clientNameFromSheet = useMemo(() => {
    if (!userCredentials?.correo || csvClientData.length === 0) return "";
    const row = csvClientData.find(
      (r) =>
        (r.CORREO_EMPRESA || "").trim().toLowerCase() ===
        (userCredentials.correo || "").trim().toLowerCase()
    );
    return (row?.NOMBRE_APELLIDO || "").trim();
  }, [csvClientData, userCredentials?.correo]);

  // shipping + billing from client DB
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

  // fetch credit settings when client name is known
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

            const option = (row?.OPCION_DE_PAGO || "").toString();
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

  // Load saved addresses + shipping preferences (Mongo)
  useEffect(() => {
    const email = userCredentials?.correo;
    if (!email) return;

    // Shipping addresses for this user
    axios
      .get(`${API}/shipping-address/${encodeURIComponent(email)}`)
      .then((res) => setShippingOptions(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Error fetching shipping addresses:", err));

    // Billing addresses for this user
    axios
      .get(`${API}/billing-address/${encodeURIComponent(email)}`)
      .then((res) => setBillingOptions(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Error fetching billing addresses:", err));

    // ⬅️ NEW: shipping preferences
    fetch(`${API}/users/by-email?email=${encodeURIComponent(email)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const prefs =
          data?.shippingPreferences || {
            preferredCarrier: data?.preferredCarrier || "",
            insureShipment: !!data?.insureShipment,
          };
        setShippingPrefs({
          preferredCarrier: (prefs?.preferredCarrier || "").trim(),
          insureShipment: !!prefs?.insureShipment,
        });
      })
      .catch(() => {});
  }, [userCredentials?.correo]);

  // Build the current shipping/billing objects shown on screen
  const currentShipping = useMemo(() => {
    if (selectedShippingId) {
      const s = shippingOptions.find((x) => x._id === selectedShippingId);
      if (s) {
        return {
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
    return {
      calleEnvio: calleEnvio || "",
      exteriorEnvio: exteriorEnvio || "",
      interiorEnvio: interiorEnvio || "",
      coloniaEnvio: coloniaEnvio || "",
      ciudadEnvio: ciudadEnvio || "",
      estadoEnvio: estadoEnvio || "",
      cpEnvio: cpEnvio || "",
    };
  }, [
    selectedShippingId,
    shippingOptions,
    calleEnvio,
    exteriorEnvio,
    interiorEnvio,
    coloniaEnvio,
    ciudadEnvio,
    estadoEnvio,
    cpEnvio,
  ]);

  const currentBilling = useMemo(() => {
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
    return {
      razonSocial: razonSocial || "",
      rfcEmpresa: rfcEmpresa || "",
      correoFiscal: correoFiscal || "",
      calleFiscal: calleFiscal || "",
      exteriorFiscal: exteriorFiscal || "",
      interiorFiscal: interiorFiscal || "",
      coloniaFiscal: coloniaFiscal || "",
      ciudadFiscal: ciudadFiscal || "",
      estadoFiscal: estadoFiscal || "",
      cpFiscal: cpFiscal || "",
    };
  }, [
    selectedBillingId,
    billingOptions,
    razonSocial,
    rfcEmpresa,
    correoFiscal,
    calleFiscal,
    exteriorFiscal,
    interiorFiscal,
    coloniaFiscal,
    ciudadFiscal,
    estadoFiscal,
    cpFiscal,
  ]);

  // -----> sep09

  // ====== CURRENCY-AWARE TOTALS (refined for preferredCurrency) ======
const fmtUSD = (v) => `$${(v ?? 0).toFixed(2)} USD`;
const fmtMXN = (v) =>
  `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

const {
  subtotalUSD,         // native USD (no VAT)
  subtotalMXN,         // native MXN (no VAT)
  isMixed,             // both USD and MXN present
  hasUSD,
  hasMXN,
  payableUSD_only,     // subtotalUSD (+ IVA if wantsInvoice) — used when pref USD and only USD items
  payableMXN_only,     // subtotalMXN (+ IVA if wantsInvoice) — used when pref USD and only MXN items OR as bucket
  splitUSD_withIVA,    // USD bucket w/ IVA (pref USD & mixed)
  splitMXN_withIVA,    // MXN bucket w/ IVA (pref USD & mixed)
  grandMXN_withIVA,    // MXN grand total w/ IVA (pref MXN)
  usdInMXN_detail,     // converted USD→MXN part (no IVA by itself; used in detail lines)
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

  const mixed = usd > 0 && mxn > 0;
  const _hasUSD = usd > 0;
  const _hasMXN = mxn > 0;

  // IVA helper
  const addIVA = (v) => (wantsInvoice ? v * 1.16 : v);

  // USD preference → split: USD bucket in USD, MXN bucket in MXN (no conversion)
  const _splitUSD_withIVA = addIVA(usd);
  const _splitMXN_withIVA = addIVA(mxn);

  // MXN preference → convert USD to MXN and build one grand total (if we have dofRate)
  let usdToMXN = null;
  let _grandMXN_withIVA = null;
  if (dofRate && Number.isFinite(dofRate)) {
    usdToMXN = usd * Number(dofRate);
    _grandMXN_withIVA = addIVA(mxn + usdToMXN);
  }

  return {
    subtotalUSD: usd,
    subtotalMXN: mxn,
    isMixed: mixed,
    hasUSD: _hasUSD,
    hasMXN: _hasMXN,
    payableUSD_only: addIVA(usd),
    payableMXN_only: addIVA(mxn),
    splitUSD_withIVA: _splitUSD_withIVA,
    splitMXN_withIVA: _splitMXN_withIVA,
    grandMXN_withIVA: _grandMXN_withIVA,
    usdInMXN_detail: usdToMXN, // only meaningful when dofRate exists
  };
}, [items, dofRate, wantsInvoice]);

// SEP09
// ---- Legacy totals compatibility (for jsPDF & saved payload) ----
// Map new fields to the legacy names the rest of the file expects.
const totalUSDNative = subtotalUSD; // native USD (no FX)
const totalMXNNative = subtotalMXN; // native MXN (no FX)

const totalAllUSD =
  Number.isFinite(dofRate) && dofRate
    ? subtotalUSD + subtotalMXN / Number(dofRate)   // MXN → USD
    : null;

const totalAllMXN =
  Number.isFinite(dofRate) && dofRate
    ? subtotalMXN + subtotalUSD * Number(dofRate)   // USD → MXN
    : null;

// SEP09

  // // ====== CURRENCY-AWARE TOTALS ======
  // const {
  //   totalUSDNative,
  //   totalMXNNative,
  //   totalAllUSD,
  //   totalAllMXN,
  // } = useMemo(() => {
  //   let usdNative = 0;
  //   let mxnNative = 0;

  //   items.forEach((it) => {
  //     const qty = Number(it.amount) || 0;

  //     if ((it.currency || "USD").toUpperCase() === "MXN") {
  //       const mxnUnit = Number(
  //         it.priceMXN ?? (it.currency?.toUpperCase() === "MXN" ? it.price : null)
  //       );
  //       if (Number.isFinite(mxnUnit)) {
  //         mxnNative += qty * mxnUnit;
  //       }
  //     } else {
  //       const usdUnit = Number(it.priceUSD ?? it.price);
  //       if (Number.isFinite(usdUnit)) {
  //         usdNative += qty * usdUnit;
  //       }
  //     }
  //   });

  //   const allUSD =
  //     dofRate && Number.isFinite(dofRate) ? usdNative + mxnNative / dofRate : null;
  //   const allMXN =
  //     dofRate && Number.isFinite(dofRate) ? mxnNative + usdNative * dofRate : null;

  //   return {
  //     totalUSDNative: usdNative,
  //     totalMXNNative: mxnNative,
  //     totalAllUSD: allUSD,
  //     totalAllMXN: allMXN,
  //   };
  // }, [items, dofRate]);

  // -----> Sep09

  const numericDiscount = Number(discountTotal || 0);
  const baseAllUSD = totalAllUSD ?? 0;
  const baseAllMXN = totalAllMXN ?? 0;

  // use wantsInvoice for VAT:
  const vatUSD = wantsInvoice ? (baseAllUSD - numericDiscount) * 0.16 : 0;
  const finalAllUSD = wantsInvoice ? (baseAllUSD - numericDiscount) * 1.16 : baseAllUSD - numericDiscount;

  const vatMXN = wantsInvoice && dofRate
    ? (baseAllMXN - numericDiscount * dofRate) * 0.16
    : 0;

  const finalAllMXN = wantsInvoice && dofRate
    ? (baseAllMXN - numericDiscount * dofRate) * 1.16
    : dofRate
    ? baseAllMXN - numericDiscount * dofRate
    : null;

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

  // ===== PDF + Save order (updated with wantsInvoice + shippingPrefs + conditional bank accounts) =====
// ===== PDF + Save order (USD first, then MXN, then Resumen Financiero; keeps factura rules) =====
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

  // ========= Cliente - Envío =========
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Información de Envío", 13, 51);

  doc.setFontSize(10);
  doc.addImage(iconBuilding, 13, 53, 5, 5);
  doc.text(`${nombreEmpresa || ""}`, 19, 57);

  doc.addImage(iconContact, 13.5, 59.5, 4, 4);
  doc.text(`${nombreEncargado || ""}`, 19, 63);

  doc.addImage(iconLocation, 13.7, 65, 3, 4);
  doc.text(
    `${(currentShipping.calleEnvio || "")}  # ${(currentShipping.exteriorEnvio || "")}  Int. ${(currentShipping.interiorEnvio || "")}`,
    19, 68
  );
  doc.text(`Col. ${currentShipping.coloniaEnvio || ""}`, 19, 72);
  doc.text(
    `${(currentShipping.ciudadEnvio || "")}, ${(currentShipping.estadoEnvio || "")}. C.P. ${(currentShipping.cpEnvio || "")}`,
    19, 76
  );

  doc.addImage(iconPhone, 13.7, 78, 3, 4);
  doc.text(`${telefonoEmpresa || ""}`, 19, 81.5);

  doc.addImage(iconEmail, 13.7, 84, 4, 3);
  doc.text(`${correoEmpresa || ""}`, 19, 87);

  // ========= Información Fiscal (solo si factura) =========
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
      106, 73
    );
    doc.text(`Col. ${currentBilling.coloniaFiscal || ""}`, 106, 77);
    doc.text(
      `${(currentBilling.ciudadFiscal || "")}, ${(currentBilling.estadoFiscal || "")}. C.P. ${(currentBilling.cpFiscal || "")}`,
      106, 81
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

  // ========= Items por divisa =========

  // Helpers de moneda
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
        `$${unit.toFixed(2)} USD`,
        `$${(qty * unit).toFixed(2)} USD`,
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
          // Si hay salto de página, vuelve a dibujar fondo
          doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
        }
      },
    });

    cursorY = doc.lastAutoTable.finalY + 6;

    // Subtotal USD
    const subtotalUSD = usdItems.reduce(
      (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0),
      0
    );
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Subtotal USD: $${subtotalUSD.toFixed(2)} USD`, 140, cursorY);
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

    // Subtotal MXN
    const subtotalMXN = mxnItems.reduce(
      (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0),
      0
    );
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Subtotal MXN: $${subtotalMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`,
      140,
      cursorY
    );
    doc.setFont("helvetica", "normal");
    cursorY += 12;
  }

  // ========= Resumen Financiero (sustituye el viejo "Totals box") =========
  // (usa mismas reglas de DOF/IVA que tu app)
  const fmtUSD = (v) => `$${(Number(v) || 0).toFixed(2)} USD`;
  const fmtMXN = (v) => `$${(Number(v) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

  const rate = Number(dofRate) || 0; // MXN por USD
  const addIVA = (v) => (wantsInvoice ? v * 1.16 : v);

  const hasUSD = usdItems.length > 0;
  const hasMXN = mxnItems.length > 0;
  const isMixed = hasUSD && hasMXN;

  const subtotalUSD = usdItems.reduce(
    (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceUSD ?? it.price) || 0),
    0
  );
  const subtotalMXN = mxnItems.reduce(
    (s, it) => s + (Number(it.amount) || 0) * (Number(it.priceMXN ?? it.price) || 0),
    0
  );

  const preferred = String(preferredCurrency || "USD").toUpperCase();

  // Título
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen Financiero", 13, cursorY);
  cursorY += 6;

  // Caja
  const boxX = 12, boxW = 186, boxPad = 4, lineH = 6;
  const textMaxW = boxW - boxPad * 2;

  // Pre-cálculos
  const usdEnMXN = rate ? subtotalUSD * rate : 0;
  const totalMXN_mixto = addIVA(subtotalMXN + usdEnMXN);
  const totalUSD_solo = addIVA(subtotalUSD);
  const totalMXN_solo = addIVA(subtotalMXN);

  // Medir alto
  const measure = () => {
    let y = cursorY + boxPad;
    // moneda
    y += lineH;
    if (preferred === "MXN") {
      // total MXN
      y += lineH;
      if (isMixed || hasUSD) {
        const det = rate
          ? (isMixed
              ? `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(usdEnMXN)}; + MXN nativo ${fmtMXN(subtotalMXN)}.`
              : `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(usdEnMXN)}.`)
          : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
        const detLines = doc.splitTextToSize(det, textMaxW);
        y += detLines.length * 5 + 3;
        if (rate) y += 5; // tipo de cambio
      }
      if (isMixed) {
        const legend = "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
        const l = doc.splitTextToSize(legend, textMaxW);
        y += l.length * 5 + 5;
      }
    } else {
      if (hasUSD) y += lineH; // pagar USD
      if (hasMXN) y += lineH; // pagar MXN
      if (isMixed && rate) y += 5; // tipo de cambio
      if (isMixed) {
        const legend = "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
        const l = doc.splitTextToSize(legend, textMaxW);
        y += l.length * 5 + 5;
      }
      if (!hasUSD && hasMXN) {
        const note = "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
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

  if (preferred === "MXN") {
    if (isMixed) {
      if (!rate) {
        doc.setTextColor(180, 0, 0);
        const err = "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.";
        doc.text(doc.splitTextToSize(err, textMaxW), boxX + boxPad, y);
        doc.setTextColor(0, 0, 0);
        y += 10;
      } else {
        doc.text(
          `Total a pagar en MXN: ${fmtMXN(totalMXN_mixto)}${wantsInvoice ? " (incluye IVA 16%)" : ""}`,
          boxX + boxPad,
          y + 3
        );
        y += lineH;

        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        const det = `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(usdEnMXN)}; + MXN nativo ${fmtMXN(subtotalMXN)}.`;
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
    } else if (hasUSD) {
      if (!rate) {
        doc.setTextColor(180, 0, 0);
        const err = "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total en MXN.";
        doc.text(doc.splitTextToSize(err, textMaxW), boxX + boxPad, y);
        doc.setTextColor(0, 0, 0);
        y += 10;
      } else {
        const base = subtotalUSD * rate;
        doc.text(
          `Total a pagar en MXN: ${fmtMXN(addIVA(base))}${wantsInvoice ? " (incluye IVA 16%)" : ""}`,
          boxX + boxPad,
          y + 3
        );
        y += lineH;

        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        const det = `Detalle: USD (${fmtUSD(subtotalUSD)}) × ${rate.toFixed(2)} = ${fmtMXN(base)}.`;
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
    } else if (hasMXN) {
      doc.text(
        `Total a pagar en MXN: ${fmtMXN(totalMXN_solo)}${wantsInvoice ? " (incluye IVA 16%)" : ""}`,
        boxX + boxPad,
        y + 3
      );
      y += lineH;
    }

    if (isMixed) {
      doc.setTextColor(180, 0, 0);
      doc.setFont("helvetica", "bold");
      const legend = "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
      doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 3);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
    }
  } else {
    // Preferencia USD
    if (hasUSD) {
      doc.text(
        `A pagar en USD (artículos en USD): ${fmtUSD(totalUSD_solo)}${wantsInvoice ? " (incluye IVA 16%)" : ""}`,
        boxX + boxPad,
        y + 3
      );
      y += lineH;
    }
    if (hasMXN) {
      doc.text(
        `A pagar en MXN (artículos en MXN): ${fmtMXN(totalMXN_solo)}${wantsInvoice ? " (incluye IVA 16%)" : ""}`,
        boxX + boxPad,
        y + 3
      );
      y += lineH;
    }
    if (isMixed && rate) {
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
    if (isMixed) {
      doc.setTextColor(180, 0, 0);
      doc.setFont("helvetica", "bold");
      const legend = "IMPORTANTE: En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.";
      doc.text(doc.splitTextToSize(legend, textMaxW), boxX + boxPad, y + 5);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
    }
    if (!hasUSD && hasMXN) {
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      const note = "Nota: Esta orden solo contiene artículos en MXN; el pago debe realizarse en MXN.";
      doc.text(doc.splitTextToSize(note, textMaxW), boxX + boxPad, y + 2);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
    }
  }

  // Avanza debajo del resumen
  cursorY = cursorY + boxHeight + 6;

  // ========= Opción de Pago (igual que tenías) =========
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

  // ========= PÁGINA DE CUENTAS (igual que tu versión, mini-boxes incluidos) =========
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

  // Mini-box helper
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
    // ===== FACTURA: Cuentas empresa (MXN + USD)
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
    // ===== SIN FACTURA: Cuenta personal MXN
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

  // ========= Build payload (sin cambios funcionales) =========
  const userEmail = userCredentials?.correo;
  const creditDue =
    paymentOption === "Crédito" && creditAllowed
      ? addDays(new Date(), creditDays).toISOString()
      : null;

  const orderInfo = {
    userEmail,
    items,
    totals: {
      totalUSDNative: Number(totalUSDNative.toFixed(2)),
      totalMXNNative: Number(totalMXNNative.toFixed(2)),
      totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
      totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
      dofRate,
      dofDate,
      discountUSD: Number(discountTotal || 0),
      vatUSD: Number(vatUSD.toFixed(2)),
      finalAllUSD: Number(finalAllUSD.toFixed(2)),
      vatMXN: finalAllMXN !== null ? Number(vatMXN.toFixed(2)) : null,
      finalAllMXN: finalAllMXN !== null ? Number(finalAllMXN.toFixed(2)) : null,
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

  // const handleDownloadAndSave = async () => {
  //   const doc = new jsPDF();
  //   const pageWidth = doc.internal.pageSize.getWidth();
  //   const pageHeight = doc.internal.pageSize.getHeight();
  //   const today = new Date();

  //   doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

  //   doc.setFontSize(10);
  //   doc.setFont("helvetica", "bold");
  //   doc.text(`Fecha de Elaboración: ${today.toLocaleDateString("es-MX")}`, 195, 15, null, null, "right");

  //   doc.setLineWidth(0.1);
  //   doc.setDrawColor(200, 200, 200);
  //   doc.line(10, 45, 200, 45);

  //   // Cliente - Envío
  //   doc.setFontSize(11);
  //   doc.setFont("helvetica", "bold");
  //   doc.text("Información de Envío", 13, 51);

  //   doc.setFontSize(10);
  //   doc.addImage(iconBuilding, 13, 53, 5, 5);
  //   doc.text(`${nombreEmpresa || ""}`, 19, 57);

  //   doc.addImage(iconContact, 13.5, 59.5, 4, 4);
  //   doc.text(`${nombreEncargado || ""}`, 19, 63);

  //   doc.addImage(iconLocation, 13.7, 65, 3, 4);
  //   doc.text(
  //     `${(currentShipping.calleEnvio || "")}  # ${(currentShipping.exteriorEnvio || "")}  Int. ${(currentShipping.interiorEnvio || "")}`,
  //     19, 68
  //   );
  //   doc.text(`Col. ${currentShipping.coloniaEnvio || ""}`, 19, 72);
  //   doc.text(
  //     `${(currentShipping.ciudadEnvio || "")}, ${(currentShipping.estadoEnvio || "")}. C.P. ${(currentShipping.cpEnvio || "")}`,
  //     19, 76
  //   );

  //   doc.addImage(iconPhone, 13.7, 78, 3, 4);
  //   doc.text(`${telefonoEmpresa || ""}`, 19, 81.5);

  //   doc.addImage(iconEmail, 13.7, 84, 4, 3);
  //   doc.text(`${correoEmpresa || ""}`, 19, 87);

  //   // Billing (only render details if wantsInvoice)
  //   doc.setFontSize(11);
  //   doc.setFont("helvetica", "bold");
  //   doc.text("Información Fiscal", 100, 51);

  //   doc.setFontSize(10);
  //   if (wantsInvoice) {
  //     doc.text(`Razón Social: ${currentBilling.razonSocial || ""}`, 106, 57);
  //     doc.text(`RFC: ${currentBilling.rfcEmpresa || ""}`, 106, 63);

  //     doc.addImage(iconEmail, 100, 65, 4, 3);
  //     doc.text(`${currentBilling.correoFiscal || ""}`, 106, 68);

  //     doc.addImage(iconLocation, 100.5, 70, 3, 4);
  //     doc.text(
  //       `${(currentBilling.calleFiscal || "")}  # ${(currentBilling.exteriorFiscal || "")}  Int. ${(currentBilling.interiorFiscal || "")}`,
  //       106, 73
  //     );
  //     doc.text(`Col. ${currentBilling.coloniaFiscal || ""}`, 106, 77);
  //     doc.text(
  //       `${(currentBilling.ciudadFiscal || "")}, ${(currentBilling.estadoFiscal || "")}. C.P. ${(currentBilling.cpFiscal || "")}`,
  //       106, 81
  //     );
  //   } else {
  //     doc.setFont("helvetica", "italic");
  //     doc.text("Sin factura.", 106, 57);
  //     doc.setFont("helvetica", "normal");
  //   }

  //   // Separator
  //   doc.setLineWidth(0.1);
  //   doc.setDrawColor(200, 200, 200);
  //   doc.line(10, 92, 200, 92);

  //   // Items table
  //   const tableData = items.map((it) => {
  //     const cur = (it.currency || "USD").toUpperCase();
  //     const unit =
  //       cur === "MXN"
  //         ? `$${Number(it.priceMXN ?? it.price).toFixed(2)} MXN`
  //         : `$${Number(it.priceUSD ?? it.price).toFixed(2)} USD`;
  //     const line =
  //       cur === "MXN"
  //         ? `$${(Number(it.amount) * Number(it.priceMXN ?? it.price)).toFixed(2)} MXN`
  //         : `$${(Number(it.amount) * Number(it.priceUSD ?? it.price)).toFixed(2)} USD`;
  //     const pack = it.packPresentation ? ` — ${it.packPresentation}` : "";
  //     return [it.product, `${it.presentation}${pack}`, it.amount, unit, line];
  //   });

  //   autoTable(doc, {
  //     head: [["Producto", "Presentación", "Cantidad", "Precio Unitario", "Total"]],
  //     body: tableData,
  //     startY: 100,
  //     headStyles: { fillColor: [149, 194, 61], textColor: [0, 0, 0], fontStyle: "bold" },
  //   });

  //   let extraY = doc.lastAutoTable.finalY + 12;

  //   // Totals box
  //   const boxX = 141;
  //   const boxY = extraY - 8;
  //   const boxWidth = 55;
  //   const boxHeight = 30;
  //   const radius = 4;

  //   if (doc.roundedRect) {
  //     doc.setFillColor(207, 242, 137);
  //     doc.roundedRect(boxX, boxY, boxWidth, boxHeight, radius, radius, "F");
  //   } else {
  //     doc.setFillColor(207, 242, 137);
  //     doc.rect(boxX, boxY, boxWidth, boxHeight, "F");
  //   }

  //   const y0 = extraY;
  //   doc.text(
  //     `Total en USD: ${totalAllUSD !== null ? `$${totalAllUSD.toFixed(2)}` : "—"}`,
  //     146,
  //     y0
  //   );
  //   doc.text(
  //     `Total en MXN: ${
  //       totalAllMXN !== null
  //         ? `$${totalAllMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  //         : "—"
  //     }`,
  //     146,
  //     y0 + 5
  //   );

  //   doc.setFontSize(9);
  //   doc.setFont("helvetica", "italic");
  //   doc.text(
  //     dofRate ? `${dofRate.toFixed(2)} MXN/USD \n (DOF ${dofDate})` : "Tipo de cambio no disponible",
  //     146,
  //     y0 + 12
  //   );

  //   // Payment option box
  //   const creditBoxX = 10;
  //   const creditBoxY = y0 + 30;
  //   const creditBoxWidth = 190;
  //   const creditBoxHeight = 20;
  //   const creditBoxRadius = 4;

  //   if (doc.roundedRect) {
  //     doc.setFillColor(241, 241, 241);
  //     doc.roundedRect(creditBoxX, creditBoxY, creditBoxWidth, creditBoxHeight, creditBoxRadius, creditBoxRadius, "F");
  //   } else {
  //     doc.setFillColor(241, 241, 241);
  //     doc.rect(creditBoxX, creditBoxY, creditBoxWidth, creditBoxHeight, "F");
  //   }

  //   doc.setFontSize(11);
  //   doc.setFont("helvetica", "bold");
  //   doc.text(`Opción de Pago: ${paymentOption}` , 15, y0 + 36);
  //   if (paymentOption === "Crédito") {
  //     doc.text(`Plazo de Crédito: ${creditDays} Días` , 15, y0 + 41);
  //     doc.text(`Vencimiento: ${addDays(new Date(), creditDays).toLocaleDateString('es-MX')}` , 15, y0 + 46);
  //   }

  //   // Payment accounts page (conditional by wantsInvoice)
  //   doc.addPage();
  //   doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

  //   let y = 35;
  //   doc.setFont("helvetica", "bold");
  //   doc.setFontSize(16);
  //   doc.setTextColor(24, 144, 69);
  //   doc.text(`Cuentas para realizar pago:`, 13, y + 5);

  //   const payBoxX = 10;
  //   const payBoxY = y + 10;
  //   const payBoxWidth = 190;
  //   const payBoxHeight = 135;
  //   const payBoxRadius = 4;

  //   if (doc.roundedRect) {
  //     doc.setFillColor(241, 241, 241);
  //     doc.roundedRect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, payBoxRadius, payBoxRadius, "F");
  //   } else {
  //     doc.setFillColor(241, 241, 241);
  //     doc.rect(payBoxX, payBoxY, payBoxWidth, payBoxHeight, "F");
  //   }

  //   doc.setFontSize(11);
  //   doc.setTextColor(0, 0, 0);

  //   if (wantsInvoice) {
  //     // ===== FACTURA: mostrar cuentas de empresa (MXN + USD) =====
  //     doc.setFont("helvetica", "bold");
  //     doc.setFontSize(13);
  //     doc.text(`CUENTA EN PESOS MEXICANOS`, 15, y + 17);

  //     // // hey chatgpt, I'd like for each bank account to be placed in its own mini-box within the main bank account box. Can you do a direct edit
  //     // --- Mini-box helper (inside the main pay box) ---
  //     const miniBox = (title, lines, startY) => {
  //       const x = 12;               // a bit inside the main gray box (10…200)
  //       // const w = 186;              // keep it visually inset
  //       const w = 120;              // keep it visually inset
  //       const pad = 4;
  //       const lineH = 5;

  //       // compute height
  //       const titleH = title ? lineH + 1 : 0;
  //       const h = pad * 2 + titleH + lines.length * lineH;

  //       // box
  //       if (doc.roundedRect) {
  //         doc.setFillColor(255, 255, 255);
  //         doc.roundedRect(x, startY, w, h, 3, 3, "F");
  //       } else {
  //         doc.setFillColor(255, 255, 255);
  //         doc.rect(x, startY, w, h, "F");
  //       }

  //       // content
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

  //       return startY + h; // returns bottom Y
  //     };

  //     // ===== MXN (Empresa) =====
  //     doc.setFontSize(11);
  //     doc.setFont("helvetica", "bold");
  //     doc.text(`TRANSFERENCIA O DEPÓSITO BANCARIO:`, 15, y + 24);

  //     let cursorY = y + 28;

  //     // Mini-box: BBVA (MXN)
  //     cursorY = miniBox(
  //       "BANCO: BBVA",
  //       [
  //         "NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV",
  //         "NO. DE CUENTA: 010 115 1207",
  //         "CLABE: 012 320 001 011 512 076",
  //       ],
  //       cursorY
  //     );
  //     cursorY += 6; // spacing between mini-boxes/sections

  //     // ===== USD (Empresa) =====
  //     doc.setFont("helvetica", "bold");
  //     doc.setFontSize(13);
  //     doc.text(`CUENTA EN DÓLARES AMERICANOS`, 15, cursorY + 12);
  //     doc.setFontSize(11);
  //     doc.setFont("helvetica", "bold");
  //     doc.text(`TRANSFERENCIA:`, 15, cursorY + 19);

  //     cursorY += 24;

  //     // Mini-box: MONEX (USD)
  //     cursorY = miniBox(
  //       "BANCO: GRUPO FINANCIERO MONEX",
  //       [
  //         "NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV",
  //         "CLABE: 112 180 000 028 258 341",
  //       ],
  //       cursorY
  //     );
  //     cursorY += 6;

  //     // Mini-box: INVEX (USD)
  //     cursorY = miniBox(
  //       "BANCO: BANCO INVEX, S.A.",
  //       [
  //         "NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV",
  //         "CLABE: 059 180 030 020 014 234",
  //       ],
  //       cursorY
  //     );

  //   } else {
  //     // ===== SIN FACTURA: mostrar cuenta personal (MXN) =====
  //     doc.setFont("helvetica", "bold");
  //     doc.setFontSize(13);
  //     doc.text(`CUENTA EN PESOS MEXICANOS - SIN FACTURA`, 15, y + 17);

  //     doc.setFontSize(11);
  //     doc.text(`TRANSFERENCIA O DEPÓSITO BANCARIO`, 15, y + 24);
  //     doc.text(`BANCO: BBVA`, 15, y + 31);

  //     doc.setFont("helvetica", "normal");
  //     doc.text(`NOMBRE: ALEJANDRO GONZALEZ AGUIRRE`, 15, y + 36);
  //     // doc.text(`BANCO: BBVA`, 15, y + 36);
  //     doc.text(`NO. DE CUENTA: 124 525 4078`, 15, y + 41);
  //     doc.text(`CLABE: 012 320 012 452 540 780`, 15, y + 46);
  //     doc.text(`NO. DE TARJETA: 4152 3141 1021 5384`, 15, y + 51);
  //   }

  //   // Build payload
  //   const userEmail = userCredentials?.correo;
  //   const creditDue =
  //     paymentOption === "Crédito" && creditAllowed
  //       ? addDays(new Date(), creditDays).toISOString()
  //       : null;

  //   const orderInfo = {
  //     userEmail,
  //     items,
  //     totals: {
  //       totalUSDNative: Number(totalUSDNative.toFixed(2)),
  //       totalMXNNative: Number(totalMXNNative.toFixed(2)),
  //       totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
  //       totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
  //       dofRate,
  //       dofDate,
  //       discountUSD: Number(discountTotal || 0),
  //       vatUSD: Number(vatUSD.toFixed(2)),
  //       finalAllUSD: Number(finalAllUSD.toFixed(2)),
  //       vatMXN: finalAllMXN !== null ? Number(vatMXN.toFixed(2)) : null,
  //       finalAllMXN: finalAllMXN !== null ? Number(finalAllMXN.toFixed(2)) : null,
  //     },
  //     requestBill: !!wantsInvoice, // ⬅️ boolean
  //     shippingInfo: { ...currentShipping },
  //     billingInfo: wantsInvoice ? { ...currentBilling } : {}, // if no invoice, billing is irrelevant
  //     shippingPreferences: { ...shippingPrefs }, // ⬅️ NEW: include for traceability
  //     orderDate: new Date().toISOString(),
  //     orderStatus: "Pedido Realizado",
  //     paymentOption,
  //     creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
  //     creditDueDate: creditDue,
  //   };

  //   try {
  //     // Upload
  //     const pdfBlob = doc.output("blob");
  //     const form = new FormData();
  //     form.append("order", JSON.stringify(orderInfo));
  //     form.append("pdf", pdfBlob, "order_summary.pdf");

  //     let createdOrderId = null;
  //     try {
  //       const ac = new AbortController();
  //       const timer = setTimeout(() => ac.abort("timeout"), 20000);
  //       const res = await fetch(`${API}/orderDets`, {
  //         method: "POST",
  //         body: form,
  //         mode: "cors",
  //         cache: "no-store",
  //         credentials: "omit",
  //         signal: ac.signal,
  //       });
  //       clearTimeout(timer);
  //       if (!res.ok) {
  //         const text = await res.text().catch(() => "");
  //         throw new Error(text || `HTTP ${res.status}`);
  //       }
  //       const data = await res.json().catch(() => ({}));
  //       createdOrderId =
  //         data?.id || data?.data?._id || data?._id || data?.order?._id || null;
  //     } catch (fetchErr) {
  //       const { data } = await axios.post(`${API}/orderDets`, form, {
  //         withCredentials: false,
  //         timeout: 20000,
  //       });
  //       createdOrderId =
  //         data?.id || data?.data?._id || data?._id || data?.order?._id || null;
  //     }

  //     // Optional inventory hold
  //     try {
  //       const holdLines = buildHoldLines();
  //       if (createdOrderId && holdLines.length > 0) {
  //         await axios.post(
  //           `${API}/inventory/hold`,
  //           { orderId: createdOrderId, holdMinutes: 120, lines: holdLines },
  //           { withCredentials: false, timeout: 15000 }
  //         );
  //       }
  //     } catch (holdErr) {
  //       console.error("Error al reservar inventario:", holdErr);
  //     }

  //     // Save locally after server success
  //     doc.save("order_summary.pdf");

  //     alert("Orden guardada exitosamente");
  //     navigate("/myOrders", { state: { from: "orderNow" } });
  //   } catch (error) {
  //     console.error("Error al guardar la orden o al reservar inventario", error);
  //     const msg =
  //       error?.message ||
  //       error?.response?.data?.error ||
  //       "Revisa tu conexión y vuelve a intentar.";
  //     alert(`Ocurrió un error al guardar la orden o al reservar inventario\n${msg}`);
  //   }
  // };

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
          {/* ===== NEW: Shipping Preferences block ===== */}
          <div className="headerAndDets-Div">
            <div className="headerEditIcon-Div">
              <label className="newAddress-Label">Preferencias de Envío</label>
            </div>

            <div className="orderNow-AddressDiv">
              <label className="orderNow-Label">
                <b>Transportista:</b>{" "} <br></br>
                {shippingPrefs.preferredCarrier || "No especificado"}
              </label> 
              <br></br>
              <label className="orderNow-Label">
                <b>Mercancía Asegurada:</b>{" "} <br></br>
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

          {/* ===== NEW: "¿Deseas factura?" toggle ===== */}
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
                  localStorage.setItem("billRequest", String(v)); // keep parity with prior flow
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

            {/* Summary box */}
            {/* ----> SEP09 */}
            {/* Summary box (keeps your styling; content depends on preferredCurrency) */}
            <div className="orderNow-summaryDiv">
              {(() => {
                const rows = [
                  { label: "Moneda de pago:", value: preferredCurrency, boldLabel: true },
                ];

                if (preferredCurrency === "USD") {
                  if (hasUSD) {
                    rows.push({
                      label: "A pagar en USD (artículos en USD):",
                      value: `${fmtUSD(splitUSD_withIVA)}${wantsInvoice ? " (incluye IVA 16%)" : ""}`,
                      boldLabel: true,
                    });
                  }
                  if (hasMXN) {
                    rows.push({
                      label: "A pagar en MXN (artículos en MXN):",
                      value: `${fmtMXN(splitMXN_withIVA)}${wantsInvoice ? " (incluye IVA 16%)" : ""}`,
                      boldLabel: true,
                    });
                  }
                  // if (isMixed) {
                  //   rows.push({
                  //     label: "Tipo de Cambio (referencia):",
                  //     value: dofRate
                  //       ? `${dofRate.toFixed(4)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
                  //       : fxError
                  //       ? "—"
                  //       : "Cargando...",
                  //     boldLabel: true,
                  //   });
                  // }
                } else {
                  // Preferred MXN
                  rows.push({
                    label: "Total a pagar en MXN:",
                    value:
                      grandMXN_withIVA != null
                        ? `${fmtMXN(grandMXN_withIVA)}${wantsInvoice ? " (incluye IVA 16%)" : ""}`
                        : "—",
                    boldLabel: true,
                  });

                  if (isMixed || hasUSD) {
                    rows.push({
                      label: "Detalle:",
                      value:
                        dofRate && usdInMXN_detail != null
                          ? `USD (${fmtUSD(subtotalUSD)}) × ${Number(dofRate).toFixed(2)} = ${fmtMXN(usdInMXN_detail)}; + MXN nativo ${fmtMXN(subtotalMXN)}`
                          : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.",
                    });
                    rows.push({
                      label: "Tipo de cambio:",
                      value: dofRate
                        ? `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
                        : fxError
                        ? "—"
                        : "Cargando...",
                    });
                  }
                }

                return (
                  <>
                    {rows.map((r, i) => (
                      <div className="summary-pair" key={i}>
                        <div className={`summary-label ${r.boldLabel ? "bold" : ""}`}>{r.label}</div>
                        <div className="summary-value">{r.value}</div>
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
            </div>

            {/* ----> sep09 2 */}
            {/* <div className="orderNow-summaryDiv">
              <div className="orderSummary-subDivs">
                <label className="orderNowSummary-Label"><b>Moneda de pago:</b></label>

                {preferredCurrency === "USD" ? (
                  <>
                    {hasUSD && (
                      <label className="orderNowSummary-Label"><b>A pagar en USD (artículos en USD):</b></label>
                    )}
                    {hasMXN && (
                      <label className="orderNowSummary-Label"><b>A pagar en MXN (artículos en MXN):</b></label>
                    )}
                    {isMixed && (
                      <label className="orderNowSummary-Label"><b>Tipo de Cambio (referencia):</b></label>
                    )}
                    {isMixed && (
                      <label className="orderNowSummary-Label"><b>IMPORTANTE:</b></label>
                    )}
                  </>
                ) : (
                  <>
                    <label className="orderNowSummary-Label"><b>Total a pagar en MXN:</b></label>
                    {(isMixed || hasUSD) && (
                      <label className="orderNowSummary-Label"><b>Detalle:</b></label>
                    )}
                    {(isMixed || hasUSD) && (
                      <label className="orderNowSummary-Label"><b>Tipo de cambio:</b></label>
                    )}
                    {isMixed && (
                      <label className="orderNowSummary-Label"><b>IMPORTANTE:</b></label>
                    )}
                  </>
                )}
              </div>

              <div className="orderSummary-subDivs">
                <label className="orderNowSummary-Label">{preferredCurrency}</label>

                {preferredCurrency === "USD" ? (
                  <>
                    {hasUSD && (
                      <label className="orderNowSummary-Label">
                        {fmtUSD(splitUSD_withIVA)}
                        {wantsInvoice ? " (incluye IVA 16%)" : ""}
                      </label>
                    )}
                    {hasMXN && (
                      <label className="orderNowSummary-Label">
                        {fmtMXN(splitMXN_withIVA)}
                        {wantsInvoice ? " (incluye IVA 16%)" : ""}
                      </label>
                    )}
                    {isMixed && (
                      <label className="orderNowSummary-Label">
                        {dofRate
                          ? `${dofRate.toFixed(4)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
                          : fxError
                          ? "—"
                          : "Cargando..."}
                      </label>
                    )}
                    {isMixed && (
                      <label className="orderNowSummary-Label" style={{ color: "#b00", fontWeight: 600 }}>
                        En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.
                      </label>
                    )}
                  </>
                ) : (
                  <>
                    <label className="orderNowSummary-Label">
                      {grandMXN_withIVA != null
                        ? `${fmtMXN(grandMXN_withIVA)}${wantsInvoice ? " (incluye IVA 16%)" : ""}`
                        : "—"}
                    </label>

                    {(isMixed || hasUSD) && (
                      <label className="orderNowSummary-Label" style={{ color: "#777", fontSize: 13 }}>
                        {dofRate && usdInMXN_detail != null
                          ? `USD (${fmtUSD(subtotalUSD)}) × ${Number(dofRate).toFixed(4)} = ${fmtMXN(usdInMXN_detail)}; + MXN nativo ${fmtMXN(subtotalMXN)}`
                          : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN."}
                      </label>
                    )}

                    {(isMixed || hasUSD) && (
                      <label className="orderNowSummary-Label">
                        {dofRate
                          ? `${dofRate.toFixed(4)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
                          : fxError
                          ? "—"
                          : "Cargando..."}
                      </label>
                    )}

                    {isMixed && (
                      <label className="orderNowSummary-Label" style={{ color: "#b00", fontWeight: 600 }}>
                        En órdenes mixtas, los artículos cotizados en MXN deben pagarse en MXN.
                      </label>
                    )}
                  </>
                )}
              </div>
            </div> */}
            {/* ------> sep09 2 */}

            {/* <div className="orderNow-summaryDiv">
              <div className="orderSummary-subDivs">
                <label className="orderNowSummary-Label">
                  <b>Total USD (nativo):</b>
                </label>
                <label className="orderNowSummary-Label">
                  <b>Total MXN (nativo):</b>
                </label>
                <label className="orderNowSummary-Label">
                  <b>Tipo de Cambio:</b>
                </label>
                <label className="orderNowSummary-Label">
                  <b>Total Global USD:</b>
                </label>
                <label className="orderNowSummary-Label">
                  <b>Total Global MXN:</b>
                </label>
                {wantsInvoice && (
                  <label className="orderNowSummary-Label">
                    <b>I.V.A. (sobre total global):</b>
                  </label>
                )}
              </div>

              <div className="orderSummary-subDivs">
                <label className="orderNowSummary-Label">
                  ${totalUSDNative.toFixed(2)} USD
                </label>
                <label className="orderNowSummary-Label">
                  $
                  {totalMXNNative.toLocaleString("es-MX", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  MXN
                </label>
                <label className="orderNowSummary-Label">
                  {fxError
                    ? "—"
                    : dofRate
                    ? `${dofRate.toFixed(2)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
                    : "Cargando..."}
                </label>
                <label className="orderNowSummary-Label">
                  {totalAllUSD !== null ? `$${totalAllUSD.toFixed(2)} USD` : "—"}
                </label>
                <label className="orderNowSummary-Label">
                  {totalAllMXN !== null
                    ? `$${totalAllMXN.toLocaleString("es-MX", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} MXN`
                    : "—"}
                </label>
                {wantsInvoice && (
                  <label className="orderNowSummary-Label">
                    {dofRate
                      ? `USD: $${vatUSD.toFixed(2)} • MXN: $${
                          finalAllMXN !== null
                            ? vatMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : "—"
                        }`
                      : `USD: $${vatUSD.toFixed(2)} • MXN: —`}
                  </label>
                )}
              </div>
            </div> */}
            {/* ----> SEP09 */}
          </div>

          {/* Payment option / Credit */}
          <div className="headerAndDets-Div" style={{ marginTop: 16 }}>
            <div className="headerEditIcon-Div">
              <label className="newAddress-Label">Opción de Pago</label>
            </div>

            {creditBlocked && (
              <div
                className="orderNow-AddressDiv"
                style={{ color: "#b00", fontSize: 13, marginBottom: 8 }}
              >
                Este cliente tiene condiciones pendientes. El crédito no está disponible para nuevas órdenes.
              </div>
            )}

            <div
              className="orderNow-AddressDiv"
              style={{ display: "flex", gap: 12, alignItems: "center" }}
            >
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
                  Vigencia: {creditDays} día(s). Vence:{" "}
                  {addDays(new Date(), creditDays).toLocaleDateString("es-MX")}
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