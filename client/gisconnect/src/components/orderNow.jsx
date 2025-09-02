// I dont seem to be finding the line you mention inside "handleDownloadAndSave". Can you help me edit the changes you mention?

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

  const [discountTotal, setDiscountTotal] = useState("");
  const [requestBill, setRequestBill] = useState("");
  const [imageLookup, setImageLookup] = useState({});

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
    // billRequest was saved as boolean string ("true"/"false")
    setRequestBill(savedRequestBill === "true" ? "true" : "false");
  }, []);

  // user + addresses
  const [userCredentials, setUserCredentials] = useState([]);
  // MODIF + NEW AUG13
  const [shippingOptions, setShippingOptions] = useState([]);
  const [billingOptions, setBillingOptions] = useState([]);

  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [selectedBillingId, setSelectedBillingId] = useState("");
  // END MODIF + NEW AUG13

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
            const hasCreditOption = true; // if you want to strictly check: /credito/i.test(option)
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

  // NEW AUG13
  useEffect(() => {
    const email = userCredentials?.correo;
    if (!email) return;

    // Shipping addresses for this user
    axios
      .get(`${API}/shipping-address/${encodeURIComponent(email)}`)
      .then((res) => setShippingOptions(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Error fetching shipping addresses:", err));

    // Billing addresses for this user (adjust URL if your route differs)
    axios
      .get(`${API}/billing-address/${encodeURIComponent(email)}`)
      .then((res) => setBillingOptions(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Error fetching billing addresses:", err));
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
    // fallback = values from the client master sheet
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

  // NOTE: billing schema fields assumed; adjust if yours are different
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
    // fallback = values from the client master sheet
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
  //   END AUG13

  // ====== CURRENCY-AWARE TOTALS ======
  const {
    totalUSDNative,
    totalMXNNative,
    totalAllUSD,
    totalAllMXN,
  } = useMemo(() => {
    let usdNative = 0;
    let mxnNative = 0;

    items.forEach((it) => {
      const qty = Number(it.amount) || 0;

      if ((it.currency || "USD").toUpperCase() === "MXN") {
        const mxnUnit = Number(
          it.priceMXN ?? (it.currency?.toUpperCase() === "MXN" ? it.price : null)
        );
        if (Number.isFinite(mxnUnit)) {
          mxnNative += qty * mxnUnit;
        }
      } else {
        // treat as USD
        const usdUnit = Number(it.priceUSD ?? it.price);
        if (Number.isFinite(usdUnit)) {
          usdNative += qty * usdUnit;
        }
      }
    });

    // Convert to global totals if we have the rate
    const allUSD =
      dofRate && Number.isFinite(dofRate) ? usdNative + mxnNative / dofRate : null;
    const allMXN =
      dofRate && Number.isFinite(dofRate) ? mxnNative + usdNative * dofRate : null;

    return {
      totalUSDNative: usdNative,
      totalMXNNative: mxnNative,
      totalAllUSD: allUSD,
      totalAllMXN: allMXN,
    };
  }, [items, dofRate]);

  const numericDiscount = Number(discountTotal || 0);
  const baseAllUSD = totalAllUSD ?? 0;
  const baseAllMXN = totalAllMXN ?? 0;

  const vatUSD = requestBill === "true" ? (baseAllUSD - numericDiscount) * 0.16 : 0;
  const finalAllUSD =
    requestBill === "true"
      ? (baseAllUSD - numericDiscount) * 1.16
      : baseAllUSD - numericDiscount;

  const vatMXN =
    requestBill === "true" && dofRate
      ? (baseAllMXN - numericDiscount * dofRate) * 0.16
      : 0;
  const finalAllMXN =
    requestBill === "true" && dofRate
      ? (baseAllMXN - numericDiscount * dofRate) * 1.16
      : dofRate
      ? baseAllMXN - numericDiscount * dofRate
      : null;

  // ========== NEW: helpers for inventory hold ==========
  // Split "25KG" / "25 KG" / "0.5L" into { peso, unidad }
  const splitPresentation = (presentation = "") => {
    const s = String(presentation).trim().toUpperCase().replace(/\s+/g, "");
    const m = s.match(/^(\d+(?:[.,]\d+)?)([A-Z]+)$/);
    if (!m) return { peso: presentation, unidad: "" };
    return { peso: m[1].replace(",", "."), unidad: m[2] };
  };

  // Build the lines the backend will use to place a hold
  const buildHoldLines = () =>
    items.map((it) => {
      const { peso, unidad } = splitPresentation(it.presentation || "");
      return {
        product: it.product,                 // NOMBRE_PRODUCTO
        peso,                                // PESO_PRODUCTO
        unidad,                              // UNIDAD_MEDICION
        quantity: Number(it.amount) || 0,    // units to hold
      };
    });
  // ======================================================

  // PDF + Save order handler (left as-is, currency-aware table labels added)
  const handleDownloadAndSave = async () => {
    const doc = new jsPDF();
    doc.text("Resumen de Orden", 20, 20);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const today = new Date();
    doc.text(`Fecha de Elaboración: ${today.toLocaleDateString("es-MX")}`, 195, 15, null, null, "right");

    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 45, 200, 45);

    // Cliente
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
      `${(currentShipping.calleEnvio || "") + "  # " + (currentShipping.exteriorEnvio || "") + "  Int. " + (currentShipping.interiorEnvio || "")}`,
      19, 68
    );
    doc.text(`${"Col. " + (currentShipping.coloniaEnvio || "")}`, 19, 72);
    doc.text(
      `${(currentShipping.ciudadEnvio || "") + ", " + (currentShipping.estadoEnvio || "") + ". C.P. " + (currentShipping.cpEnvio || "")}`,
      19, 76
    );

    doc.addImage(iconPhone, 13.7, 78, 3, 4);
    doc.text(`${telefonoEmpresa || ""}`, 19, 81.5);

    doc.addImage(iconEmail, 13.7, 84, 4, 3);
    doc.text(`${correoEmpresa || ""}`, 19, 87);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Información Fiscal", 100, 51);

    doc.setFontSize(10);
    doc.text(`Razón Social: ${currentBilling.razonSocial || ""}`, 106, 57);
    doc.text(`RFC: ${currentBilling.rfcEmpresa || ""}`, 106, 63);

    doc.addImage(iconEmail, 100, 65, 4, 3);
    doc.text(`${correoFiscal || ""}`, 106, 68);
    doc.text(`${currentBilling.correoFiscal || ""}`, 106, 68);

    doc.addImage(iconLocation, 100.5, 70, 3, 4);
    doc.text(
      `${(currentBilling.calleFiscal || "") + "  # " + (currentBilling.exteriorFiscal || "") + "  Int. " + (currentBilling.interiorFiscal || "")}`,
      106, 73
    );
    doc.text(`${"Col. " + (currentBilling.coloniaFiscal || "")}`, 106, 77);
    doc.text(
      `${(currentBilling.ciudadFiscal || "") + ", " + (currentBilling.estadoFiscal || "") + ". C.P. " + (currentBilling.cpFiscal || "")}`,
      106, 81
    );

    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 92, 200, 92);

    // Table with currency-aware unit & total
    const tableData = items.map((it) => {
      const cur = (it.currency || "USD").toUpperCase();
      const unit =
        cur === "MXN"
          ? `$${Number(it.priceMXN ?? it.price).toFixed(2)} MXN`
          : `$${Number(it.priceUSD ?? it.price).toFixed(2)} USD`;
      const line =
        cur === "MXN"
          ? `$${(Number(it.amount) * Number(it.priceMXN ?? it.price)).toFixed(2)} MXN`
          : `$${(Number(it.amount) * Number(it.priceUSD ?? it.price)).toFixed(2)} USD`;

      const pack = it.packPresentation ? ` — ${it.packPresentation}` : "";
      return [it.product, `${it.presentation}${pack}`, it.amount, unit, line];
    });

    autoTable(doc, {
      head: [["Producto", "Presentación", "Cantidad", "Precio Unitario", "Total"]],
      body: tableData,
      startY: 100,
      headStyles: {
        fillColor: [149, 194, 61],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
    });

    let extraY = doc.lastAutoTable.finalY + 12;

    // Totals box (global totals)
    const boxX = 141;
    const boxY = extraY - 8;
    const boxWidth = 55;
    const boxHeight = 30;
    const radius = 4;

    if (doc.roundedRect) {
      doc.setFillColor(207, 242, 137);
      doc.roundedRect(boxX, boxY, boxWidth, boxHeight, radius, radius, "F");
    } else {
      doc.setFillColor(207, 242, 137);
      doc.rect(boxX, boxY, boxWidth, boxHeight, "F");
    }

    const y0 = extraY;
    doc.text(
      `Total en USD: ${totalAllUSD !== null ? `$${totalAllUSD.toFixed(2)}` : "—"}`,
      146,
      y0
    );
    doc.text(
      `Total en MXN: ${
        totalAllMXN !== null
          ? `$${totalAllMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "—"
      }`,
      146,
      y0 + 5
    );

    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text(
      dofRate ? `${dofRate.toFixed(2)} MXN/USD \n (DOF ${dofDate})` : "Tipo de cambio no disponible",
      146,
      y0 + 12
    );

    // AUG15
    const creditBoxX = 10;
    const creditBoxY = y0 + 30;
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
    doc.text(`Opción de Pago: ${paymentOption}` , 15, y0 + 36);
    if(paymentOption === "Crédito"){
        doc.text(`Plazo de Crédito: ${creditDays} Días` , 15, y0 + 41);
        doc.text(`Vigencia de Crédito: ${addDays(new Date(), creditDays).toLocaleDateString('en-GB') }` , 15, y0 + 46);
    }
    // END AUG15

    // Payment accounts second page (unchanged design)
    let y = 35;
    doc.addPage();
    doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);

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
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`CUENTA EN PESOS MEXICANOS`, 15, y + 17);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV`, 15, y + 24);
    doc.text(`TRANSFERENCIA:`, 15, y + 31);

    doc.setFont("helvetica", "normal");
    doc.text(`BANCO: BBVA`, 15, y + 37);
    doc.text(`NO. DE CUENTA: 010 115 1207`, 15, y + 42);
    doc.text(`CLABE: 012 320 001 011 512 076`, 15, y + 47);

    doc.setFont("helvetica", "bold");
    doc.text(`DEPÓSITO BANCARIO:`, 120, y + 31);
    doc.setFont("helvetica", "normal");
    doc.text(`BANCO: BBVA`, 120, y + 37);
    doc.text(`NO. DE CUENTA: 010 115 1207`, 120, y + 42);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`CUENTA EN PESOS MEXICANOS - SIN FACTURA`, 15, y + 59);

    doc.setFontSize(11);
    doc.text(`TRANSFERENCIA O DEPÓSITO BANCARIO`, 15, y + 66);
    doc.setFont("helvetica", "normal");
    doc.text(`NOMBRE: ALEJANDRO GONZALEZ AGUIRRE`, 15, y + 72);
    doc.text(`BANCO: BBVA`, 15, y + 77);
    doc.text(`NO. DE CUENTA: 124 525 4078`, 15, y + 82);
    doc.text(`CLABE: 012 320 012 452 540 780`, 15, y + 87);
    doc.text(`NO. DE TARJETA: 4152 3141 1021 5384`, 15, y + 92);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`CUENTA EN DÓLARES AMERICANOS`, 15, y + 105);

    doc.setFontSize(11);
    doc.text(`NOMBRE: GREEN IMPORT SOLUTIONS SA DE CV`, 15, y + 112);
    doc.text(`TRANSFERENCIA`, 15, y + 119);

    // lastly, this is my handleDownloadAndSave bottom part (where most likely all updates you highlight should be made). Can you direct edit too
    doc.setFont("helvetica", "normal");
    doc.text(`BANCO: GRUPO FINANCIERO MONEX`, 15, y + 125);
    doc.text(`CLABE: 112 180 000 028 258 341`, 15, y + 130);
    doc.text(`BANCO: BANCO INVEX, S.A.`, 120, y + 125);
    doc.text(`CLABE: 059 180 030 020 014 234`, 120, y + 130);

    // SEP01 5:32
    // 2) Prepare Order payload (same as before)
    const userEmail = userCredentials?.correo;
    const creditDue =
      paymentOption === "Crédito" && creditAllowed
        ? addDays(new Date(), creditDays).toISOString()
        : null;

    const orderInfo = {
      userEmail,
      items, // includes currency + packPresentation if present
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
      requestBill: requestBill === "true",
      shippingInfo: { ...currentShipping },
      billingInfo: { ...currentBilling },
      orderDate: new Date().toISOString(),
      orderStatus: "Pedido Realizado",
      paymentOption,
      creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
      creditDueDate: creditDue,
    };

    try {
      // 3) Create the PDF blob & multipart form
      const pdfBlob = doc.output("blob"); // mobile-safe
      const form = new FormData();
      form.append("order", JSON.stringify(orderInfo));
      form.append("pdf", pdfBlob, "order_summary.pdf"); // filename MUST be a string

      // 4) Upload (create order + upload PDF)
      let createdOrderId = null;

      // Prefer fetch first (no custom Content-Type → fewer CORS preflights)
      try {
        // Optional: small timeout for fetch on some mobile browsers
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
        // Fallback: axios handles some quirky engines better
        const { data } = await axios.post(`${API}/orderDets`, form, {
          // DO NOT set Content-Type; axios will set proper multipart boundary
          withCredentials: false,
          timeout: 20000,
        });
        createdOrderId =
          data?.id || data?.data?._id || data?._id || data?.order?._id || null;
      }

      // 5) Optional: place a 120-minute inventory hold
      try {
        const holdLines = buildHoldLines();
        if (createdOrderId && holdLines.length > 0) {
          await axios.post(
            `${API}/inventory/hold`,
            { orderId: createdOrderId, holdMinutes: 120, lines: holdLines },
            { withCredentials: false, timeout: 15000 }
          );
        } else {
          console.warn("Reserva omitida: faltan orderId o líneas.", {
            createdOrderId,
            holdLines,
          });
        }
      } catch (holdErr) {
        console.error("Error al reservar inventario:", holdErr);
        // don’t block success
      }

      // 6) NOW trigger the local download (after successful server save)
      doc.save("order_summary.pdf");

      // 7) Success → show it in My Orders
      alert("Orden guardada exitosamente");
      // navigate("/myOrders");
      // HERE!! 4:17
      navigate("/myOrders", { state: { from: "orderNow" } });
    } catch (error) {
      console.error("Error al guardar la orden o al reservar inventario", error);
      const msg =
        error?.message ||
        error?.response?.data?.error ||
        "Revisa tu conexión y vuelve a intentar.";
      alert(`Ocurrió un error al guardar la orden o al reservar inventario\n${msg}`);
    }
    // SEP01 5:32

    // // HERE
    // doc.save("order_summary.pdf");

    //   // 2) Prepare Order payload (same as before)
    //   const userEmail = userCredentials?.correo;
    //   const creditDue =
    //     paymentOption === "Crédito" && creditAllowed
    //       ? addDays(new Date(), creditDays).toISOString()
    //       : null;

    //   const orderInfo = {
    //     userEmail,
    //     items, // includes currency + packPresentation if present
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
    //     requestBill: requestBill === "true",
    //     shippingInfo: { ...currentShipping },
    //     billingInfo: { ...currentBilling },
    //     orderDate: new Date().toISOString(),
    //     orderStatus: "Pedido Realizado",
    //     paymentOption,
    //     creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
    //     creditDueDate: creditDue,
    //   };

    //   try {
    //     // 3) Create the PDF blob & multipart form
    //     const pdfBlob = doc.output("blob"); // mobile-safe blob
    //     const form = new FormData();
    //     form.append("order", JSON.stringify(orderInfo));
    //     form.append("pdf", pdfBlob, "order_summary.pdf"); // filename MUST be a string

    //     // 4) Upload (create order + upload PDF)
    //     // Try fetch first (minimal headers = fewer CORS preflights)
    //     let createdOrderId = null;
    //     try {
    //       const res = await fetch(`${API}/orderDets`, {
    //         method: "POST",
    //         body: form,
    //         mode: "cors",
    //         cache: "no-store",
    //         credentials: "omit",
    //       });
    //       if (!res.ok) {
    //         const text = await res.text().catch(() => "");
    //         throw new Error(text || `HTTP ${res.status}`);
    //       }
    //       const data = await res.json().catch(() => ({}));
    //       createdOrderId =
    //         data?.order?._id || data?.data?._id || data?._id || data?.id || null;
    //     } catch (fetchErr) {
    //       // Fallback to axios if some mobile engines choke on fetch+FormData
    //       const { data } = await axios.post(`${API}/orderDets`, form, {
    //         withCredentials: false,
    //         // DO NOT set Content-Type; axios will set proper multipart boundary
    //       });
    //       createdOrderId =
    //         data?.order?._id || data?.data?._id || data?._id || data?.id || null;
    //     }

    //     // 5) Optional: place a 120-minute inventory hold (don’t block success if it fails)
    //     try {
    //       const holdLines = buildHoldLines();
    //       if (createdOrderId && holdLines.length > 0) {
    //         await axios.post(
    //           `${API}/inventory/hold`,
    //           {
    //             orderId: createdOrderId,
    //             holdMinutes: 120,
    //             lines: holdLines,
    //           },
    //           { withCredentials: false }
    //         );
    //       } else {
    //         console.warn("Reserva omitida: faltan orderId o líneas.", {
    //           createdOrderId,
    //           holdLines,
    //         });
    //       }
    //     } catch (holdErr) {
    //       console.error("Error al reservar inventario:", holdErr);
    //       // continue anyway
    //     }

    //     // 6) Trigger the local download AFTER server save (best for mobile)
    //     doc.save("order_summary.pdf");

    //     // 7) Success UX: go to My Orders so the new order is visible
    //     alert("Orden guardada exitosamente");
    //     navigate("/myOrders");
    //   } catch (error) {
    //     console.error("Error al guardar la orden o al reservar inventario", error);
    //     const msg =
    //       error?.message ||
    //       error?.response?.data?.error ||
    //       "Revisa tu conexión y vuelve a intentar.";
    //     alert(`Ocurrió un error al guardar la orden o al reservar inventario\n${msg}`);
    //   }

    // // END

    // NEW VERSION
    // doc.save("order_summary.pdf");

    // SEP01
    // const pdfBlob = doc.output("blob");

    // const form = new FormData();
    // form.append("order", JSON.stringify(orderInfo));
    // form.append("pdf", pdfBlob, "order_summary.pdf"); // filename must be a string

    // let createdOrderId = null;

    // // Prefer fetch on mobile (simpler CORS), no custom headers = no forced preflight
    // try {
    //   const res = await fetch(`${API}/orderDets`, {
    //     method: "POST",
    //     body: form,
    //     cache: "no-store",
    //     credentials: "omit", // we don’t need cookies
    //     mode: "cors",
    //   });
    //   if (!res.ok) {
    //     let errText = await res.text().catch(() => "");
    //     throw new Error(errText || `HTTP ${res.status}`);
    //   }
    //   const data = await res.json();
    //   createdOrderId = data?.order?._id || data?.data?._id || data?._id || data?.id || null;
    // } catch (e) {
    //   // Axios fallback if fetch fails on some engines
    //   const { data } = await axios.post(`${API}/orderDets`, form, {
    //     withCredentials: false,
    //     // DO NOT set Content-Type; let Axios set multipart boundary
    //     // timeout: 20000, // optional
    //   });
    //   createdOrderId = data?.order?._id || data?.data?._id || data?._id || data?.id || null;
    // }

    // END OF NEW VERSION

    //  ORIGINAL VERSION 
    // Save order in DB
    // const userEmail = userCredentials?.correo;
    // const creditDue =
    //   paymentOption === "Crédito" && creditAllowed
    //     ? addDays(new Date(), creditDays).toISOString()
    //     : null;

    // const orderInfo = {
    //   userEmail,
    //   items,
    //   totals: {
    //     totalUSDNative: Number(totalUSDNative.toFixed(2)),
    //     totalMXNNative: Number(totalMXNNative.toFixed(2)),
    //     totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
    //     totalAllMXN: totalAllMXN !== null ? Number(totalAllMXN.toFixed(2)) : null,
    //     dofRate,
    //     dofDate,
    //     discountUSD: Number(discountTotal || 0),
    //     vatUSD: Number(vatUSD.toFixed(2)),
    //     finalAllUSD: Number(finalAllUSD.toFixed(2)),
    //     vatMXN: finalAllMXN !== null ? Number(vatMXN.toFixed(2)) : null,
    //     finalAllMXN: finalAllMXN !== null ? Number(finalAllMXN.toFixed(2)) : null,
    //   },
    //   requestBill: requestBill === "true",
    //   shippingInfo: { ...currentShipping },
    //   billingInfo: { ...currentBilling },
    //   orderDate: new Date().toISOString(),
    //   orderStatus: "Pedido Realizado",
    //   paymentOption,
    //   creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
    //   creditDueDate: creditDue,
    // };

    // try {
    //   // Build the PDF blob once
    //   const pdfBlob = doc.output("blob");

    //   // Prepare multipart form
    //   const form = new FormData();
    //   form.append("order", JSON.stringify(orderInfo));
    //   form.append("pdf", pdfBlob, "order_summary.pdf"); // <-- filename as string

    //   // Mobile-friendly upload: try fetch (no keepalive), then axios fallback
    //   let createdOrderId = null;

    //   try {
    //     const res = await fetch(`${API}/orderDets`, {
    //       method: "POST",
    //       body: form,
    //       headers: { Accept: "application/json" },
    //       cache: "no-store",
    //     });

    //     if (!res.ok) {
    //       const errJson = await res.json().catch(() => ({}));
    //       throw new Error(errJson?.error || `Error ${res.status}`);
    //     }
    //     const data = await res.json();
    //     createdOrderId =
    //       data?.order?._id || data?.data?._id || data?._id || data?.id || null;
    //   } catch (fetchErr) {
    //     // Fallback for quirky mobile engines
    //     const { data } = await axios.post(`${API}/orderDets`, form, {
    //       headers: { Accept: "application/json" },
    //       withCredentials: false,
    //     });
    //     createdOrderId =
    //       data?.order?._id || data?.data?._id || data?._id || data?.id || null;
    //   }

    //   // Optional: Place a 120-minute hold if we have an order ID
    //   try {
    //     const holdLines = buildHoldLines();
    //     if (createdOrderId && holdLines.length > 0) {
    //       await axios.post(`${API}/inventory/hold`, {
    //         orderId: createdOrderId,
    //         holdMinutes: 120,
    //         lines: holdLines,
    //       });
    //     } else {
    //       console.warn("Reserva omitida: faltan orderId o líneas.", {
    //         createdOrderId,
    //         holdLines,
    //       });
    //     }
    //   } catch (holdErr) {
    //     console.error("Error al reservar inventario:", holdErr);
    //     // don't block the flow if the hold fails
    //   }

    //   // Trigger local download AFTER a successful upload (helps mobile)
    //   doc.save("order_summary.pdf");

    //   alert("Orden guardada exitosamente");
    //   navigate("/myOrders");
    // } catch (error) {
    //   console.error("Error al guardar la orden o al reservar inventario", error);
    //   const msg =
    //     error?.message ||
    //     error?.response?.data?.error ||
    //     "Revisa tu conexión y vuelve a intentar.";
    //   alert(`Ocurrió un error al guardar la orden o al reservar inventario\n${msg}`);
    // }

    // END OF ORIGINAL VERSION


    // ------

    // OG
    // Save order in DB
    // const userEmail = userCredentials?.correo;
    // const creditDue =
    //   paymentOption === "Crédito" && creditAllowed ? addDays(new Date(), creditDays).toISOString() : null;

    // const orderInfo = {
    //   userEmail,
    //   items, // now includes currency and packPresentation when present
    //   totals: {
    //     totalUSDNative: Number(totalUSDNative.toFixed(2)),
    //     totalMXNNative: Number(totalMXNNative.toFixed(2)),
    //     totalAllUSD: totalAllUSD !== null ? Number(totalAllUSD.toFixed(2)) : null,
    //     totalAllMXN:
    //       totalAllMXN !== null
    //         ? Number(totalAllMXN.toFixed(2))
    //         : null,
    //     dofRate,
    //     dofDate,
    //     discountUSD: Number(discountTotal || 0),
    //     vatUSD: Number(vatUSD.toFixed(2)),
    //     finalAllUSD: Number(finalAllUSD.toFixed(2)),
    //     vatMXN: finalAllMXN !== null ? Number(vatMXN.toFixed(2)) : null,
    //     finalAllMXN: finalAllMXN !== null ? Number(finalAllMXN.toFixed(2)) : null,
    //   },
    //   requestBill: requestBill === "true",
    //   shippingInfo: { ...currentShipping },
    //   billingInfo: { ...currentBilling },
    //   orderDate: new Date().toISOString(),
    //   orderStatus: "Pedido Realizado",
    //   paymentOption,
    //   creditTermDays: paymentOption === "Crédito" ? creditDays : 0,
    //   creditDueDate: creditDue,
    // };

    // try {
    //   // IMPORTANT: use arraybuffer to preserve binary; jsPDF's blob is okay too
    //   const pdfBlob = doc.output('blob');
    //   // const file = new File([pdfBlob], "order_summary.pdf", { type: "application/pdf" });

    //   const form = new FormData();
    //   form.append("order", JSON.stringify(orderInfo));
    //   form.append("pdf", pdfBlob, "order_summary.pdf");
    //   // form.append("pdf", pdfBlob, file);

    //   // 1) Create order + upload PDF
    //   const createRes = await axios.post(`${API}/orderDets`, form, {
    //     headers: { "Content-Type": "multipart/form-data" },
    //   });

    //   // Try several common shapes to find the new order id
    //   const createdOrderId =
    //     createRes?.data?.order?._id ||
    //     createRes?.data?.data?._id ||
    //     createRes?.data?._id ||
    //     createRes?.data?.id ||
    //     null;

    //   // 2) NEW — Place a 120-minute hold for selected items
    //   try {
    //     const holdLines = buildHoldLines();
    //     if (createdOrderId && holdLines.length > 0) {

    //       await axios.post(`${API}/inventory/hold`, {
    //         orderId: createdOrderId,
    //         holdMinutes: 120,
    //         lines: holdLines,
    //       });
    //     } else {
    //       console.warn("No se pudo colocar la reserva: faltan orderId o líneas.", {
    //         createdOrderId,
    //         holdLines,
    //       });
    //     }
    //   } catch (holdErr) {
    //     console.error("Error al reservar inventario:", holdErr);
    //     // You can still allow navigation; the order exists, but without a hold.
    //   }

    //   alert("Orden guardada exitosamente");
    //   navigate("/myOrders");
    // } catch (error) {
    //   console.error("Error al guardar la orden o al reservar inventario", error);
    //   alert("Ocurrió un error al guardar la orden o al reservar inventario");
    // }

    // ----->
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
        {/* Shipping */}
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

        {/* Billing */}
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
          <div className="orderNow-summaryDiv">
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
              {requestBill === "true" && (
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
              {requestBill === "true" && (
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
          </div>
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
                Vigencia: {creditDays} día(s). Fecha de vencimiento:{" "}
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