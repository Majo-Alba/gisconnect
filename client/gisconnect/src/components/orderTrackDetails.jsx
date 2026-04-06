// with this modificaction to downloadSelectedDocs, when downloading in iphone now I'm redirected to a secondary screen "drive.usercontent.google.com" that has a progress bar on top, but nothing else shows. Progress bar stops loading at about 10% full and rest of the page remains white with no documents showing or being downloaded
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { ProgressBar, Step } from "react-step-progress-bar";
import "react-step-progress-bar/styles.css";

import jsPDF from "jspdf";
import "jspdf-autotable";

import { saveAs } from "file-saver";

import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { docDesign } from "/src/components/documentDesign";

// IMAGES
import logoImage from "../assets/images/GIS_Logo.png";
import pedidoIcon from "../assets/images/Icono_Pedidos.png";
import fallbackImg from "../assets/images/Product_GISSample.png";

// CSV + HTTP
import axios from "axios";
import Papa from "papaparse";
import { API } from "/src/lib/api"; // 

export default function OrderTrackDetails() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const location = useLocation();

  const [order, setOrder] = useState(location.state?.order || null);

  // Upload UI state
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadErr, setUploadErr] = useState("");
  const [uploadOk, setUploadOk] = useState("");

  // ====== IMAGE LOOKUP (robust keys) ======
  const [imageLookup, setImageLookup] = useState({});

  // NEW MAR/31
  const INVENTARIO_BASE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

  const DOC_TYPES = [
    { key: "FICHA_TECNICA_URL", label: "Ficha Técnica" },
    { key: "HOJA_DE_SEGURIDAD_URL", label: "Hoja de Seguridad" },
    { key: "CERTIFICADO_OMRI_URL", label: "Certificado OMRI" },
    { key: "CERTIFICADO_DE_ANALISIS_URL", label: "Certificado de Análisis" },
  ];

  const [docLookup, setDocLookup] = useState({});
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [docsErr, setDocsErr] = useState("");

  const [docDropdownOpen, setDocDropdownOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  const [selectedDocTypes, setSelectedDocTypes] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  // END MAR/31

  const canon = (s = "") =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();

  const makeKey = (product = "", presentation = "") =>
    `${canon(product)}__${canon(presentation)}`;

  const getCurrentPosition = (status) => {
    if (!status) return 0;
    const s = status.toLowerCase();
    if (s.includes("realizado")) return 0;
    if (s.includes("evidencia")) return 1;
    if (s.includes("verificado")) return 2;
    if (s.includes("preparando")) return 3;
    if (s.includes("etiqueta")) return 4;
    if (s.includes("entregado")) return 5;
    return 0;
  };

  // NEW MAR/31
  // const normalizeUrl = (url = "") => {
  //   const clean = String(url || "").trim();
  
  //   const match = clean.match(/\/file\/d\/([^/]+)/);
  
  //   if (match && match[1]) {
  //     const fileId = match[1];
  
  //     // ✅ Use preview instead of forced download
  //     return `https://drive.google.com/file/d/${fileId}/preview`;
  //   }
  
  //   return clean;
  // };
  const normalizeUrl = (url = "") => {
    const clean = String(url || "").trim();
    const match = clean.match(/\/file\/d\/([^/]+)/);
  
    if (match && match[1]) {
      const fileId = match[1];
  
      return {
        download: `https://drive.google.com/uc?export=download&id=${fileId}`,
        fileId,
      };
    }
  
    return { download: clean, fileId: null };
  };

  const isPreparingOrLater = useMemo(() => {
    return getCurrentPosition(order?.orderStatus) >= 3;
  }, [order?.orderStatus]);

  const uniqueOrderProducts = useMemo(() => {
    const arr = Array.isArray(order?.items) ? order.items : [];
    const seen = new Set();

    return arr.filter((item) => {
      const key = makeKey(item?.product || "", item?.presentation || "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [order]);

  const selectedDocTypeKeys = useMemo(() => {
    if (selectedDocTypes.includes("ALL_DOCS")) {
      return DOC_TYPES.map((d) => d.key);
    }
    return selectedDocTypes;
  }, [selectedDocTypes]);

  const selectedProductKeys = useMemo(() => {
    if (selectedProducts.includes("ALL_PRODUCTS")) {
      return uniqueOrderProducts.map((item) => makeKey(item.product, item.presentation));
    }
    return selectedProducts;
  }, [selectedProducts, uniqueOrderProducts]);
  // END MAR/31

  // Load order (fresh)
  useEffect(() => {
    loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function loadOrder() {
    try {
      const res = await axios.get(`${API}/orders/${orderId}`);
      setOrder(res.data);
    } catch (e) {
      console.error("Failed to fetch order details:", e);
    }
  }

  // Product image CSV
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
              const peso = (row.PESO_PRODUCTO || "").toString().trim();
              const unidad = (row.UNIDAD_MEDICION || "").toString().trim();
              const presNoSpace = `${peso}${unidad}`;
              const presWithSpace = `${peso} ${unidad}`.trim();
              const img =
                row.IMAGE_URL ||
                row.IMAGE ||
                row.IMG_URL ||
                row.IMG ||
                row.FOTO ||
                row.PHOTO ||
                row.URL_IMAGEN ||
                "";
              if (!name || !img) return;
              map[makeKey(name, presNoSpace)] = img;
              map[makeKey(name, presWithSpace)] = img;
            });
            setImageLookup(map);
          },
        });
      })
      .catch((err) => console.error("Error fetching product image CSV:", err));
  }, []);

  // NEW MAR/31
  useEffect(() => {
    if (!isPreparingOrLater) return;
    if (docsLoaded) return;

    const cacheKey = "gis_inventory_docs_v1";

    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setDocLookup(parsed || {});
        setDocsLoaded(true);
        return;
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    setDocsLoading(true);
    setDocsErr("");

    axios
      .get(INVENTARIO_BASE_CSV_URL)
      .then((response) => {
        Papa.parse(response.data, {
          header: true,
          skipEmptyLines: true,
          complete: ({ data }) => {
            const map = {};

            data.forEach((row) => {
              const name = row.NOMBRE_PRODUCTO || "";
              const peso = (row.PESO_PRODUCTO || "").toString().trim();
              const unidad = (row.UNIDAD_MEDICION || "").toString().trim();

              const presNoSpace = `${peso}${unidad}`;
              const presWithSpace = `${peso} ${unidad}`.trim();

              const docs = {
                FICHA_TECNICA_URL: normalizeUrl(row.FICHA_TECNICA_URL),
                HOJA_DE_SEGURIDAD_URL: normalizeUrl(row.HOJA_DE_SEGURIDAD_URL),
                CERTIFICADO_OMRI_URL: normalizeUrl(row.CERTIFICADO_OMRI_URL),
                CERTIFICADO_DE_ANALISIS_URL: normalizeUrl(row.CERTIFICADO_DE_ANALISIS_URL),
              };

              if (!name) return;

              map[makeKey(name, presNoSpace)] = docs;
              map[makeKey(name, presWithSpace)] = docs;
            });

            setDocLookup(map);
            setDocsLoaded(true);
            sessionStorage.setItem(cacheKey, JSON.stringify(map));
          },
        });
      })
      .catch((err) => {
        console.error("Error fetching inventory docs CSV:", err);
        setDocsErr("No se pudieron cargar los documentos del producto.");
      })
      .finally(() => {
        setDocsLoading(false);
      });
  }, [isPreparingOrLater, docsLoaded]);
  // END MAR/31

  const getItemImage = (item) => {
    const prod = item?.product || "";
    const pres = item?.presentation || "";

    const k1 = makeKey(prod, pres);
    const k2 = makeKey(prod, String(pres).replace(/\s+/g, ""));
    const k3 = makeKey(prod, String(pres).replace(/\s*/g, " "));

    const url = imageLookup[k1] || imageLookup[k2] || imageLookup[k3];
    if (!url) console.debug("[image miss]", { k1, k2, k3, prod, pres });

    return url && url.length > 0 ? url : fallbackImg;
  };

  // NEW MAR/31
  const toggleDocType = (key) => {
    setSelectedDocTypes((prev) => {
      if (key === "ALL_DOCS") {
        return prev.includes("ALL_DOCS") ? [] : ["ALL_DOCS"];
      }

      const withoutAll = prev.filter((x) => x !== "ALL_DOCS");
      return withoutAll.includes(key)
        ? withoutAll.filter((x) => x !== key)
        : [...withoutAll, key];
    });
  };

  const toggleProduct = (key) => {
    setSelectedProducts((prev) => {
      if (key === "ALL_PRODUCTS") {
        return prev.includes("ALL_PRODUCTS") ? [] : ["ALL_PRODUCTS"];
      }

      const withoutAll = prev.filter((x) => x !== "ALL_PRODUCTS");
      return withoutAll.includes(key)
        ? withoutAll.filter((x) => x !== key)
        : [...withoutAll, key];
    });
  };

  const getDocsForItem = (item) => {
    const k1 = makeKey(item?.product || "", item?.presentation || "");
    const k2 = makeKey(item?.product || "", String(item?.presentation || "").replace(/\s+/g, ""));
    const k3 = makeKey(item?.product || "", String(item?.presentation || "").replace(/\s*/g, " "));
    return docLookup[k1] || docLookup[k2] || docLookup[k3] || null;
  };
  // END MAR/31

  const labels = [
    "Pedido \n Realizado",
    "Evidencia \n de Pago",
    "Pago \n Verificado",
    "Preparando \n Pedido",
    "Etiqueta \n Generada",
    // "Pedido \n Listo",
    "Pedido \n Entregado",
  ];

  const ship = order?.shippingInfo || {};
  const bill = order?.billingInfo || {};

  // ⬇️ Helpers para "Recoger en Matriz"
  const isPickup = (() => {
    const s = order?.shippingInfo;
    if (typeof s === "string") return s.toLowerCase().includes("recoger");
    if (s && typeof s === "object" && s.method) {
      return String(s.method).toLowerCase().includes("recoger");
    }
    return false;
  })();
  
  const pickup = order?.pickupDetails || {};
  const pickupDateLabel = pickup?.date
    ? new Date(`${pickup.date}T00:00:00`).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    : "No especificada";
  const pickupTimeLabel = pickup?.time || "No especificada";

  // ⬇️ Facturación: banderas robustas
  const wantsInvoice = !!order?.requestBill;
  const hasBillingInfo =
    bill && typeof bill === "object" && Object.keys(bill).some((k) => (bill?.[k] ?? "") !== "");
  

  const generateInvoice = () => {
    if (!order) return;
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const drawBg = () => doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
    drawBg();

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("GREEN IMPORT SOLUTIONS DOLARES", 60, 40);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Folio Fiscal: e375b3c8-564a-4fbf-9880-2dc5793e8da9`, 63, 50);
    doc.text(`601 GENERAL DE LEY DE LAS PERSONAS MORALES`, 60, 55);

    doc.setFontSize(10);
    doc.text(`Nombre: GREEN IMPORT SOLUTIONS`, 10, 65);
    doc.text(`RFC: GIS150804NV1`, 10, 70);
    doc.text(`País: MEXICO`, 10, 75);
    doc.text(`Dirección: MONTE EVEREST 2428`, 10, 80);
    doc.text(`LA FEDERACHA`, 27, 85);
    doc.text(`GUADALAJARA JAL MEXICO C.P. 44300`, 27, 90);
    doc.text(`Tel: 01 (33) 2016 8274`, 10, 95);

    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 100, 200, 100);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Información del Receptor`, 10, 110);

    doc.setFont("helvetica", "normal");
    doc.text(`612 PERSONAS FISICAS CON ACTIVIDADES`, 10, 120);
    doc.text(`EMPRESARIALES Y PROFESIONALES`, 10, 125);

    const razonSocial = bill.razonSocial || "";
    const rfc = bill.rfcEmpresa || "";
    const bCalle = bill.calleFiscal || "";
    const bExt = bill.exteriorFiscal || "";
    const bInt = bill.interiorFiscal || "";
    const bCol = bill.coloniaFiscal || "";
    const bCiudad = bill.ciudadFiscal || "";
    const bEstado = bill.estadoFiscal || "";
    const bCP = bill.cpFiscal || "";

    doc.text(`Nombre: ${razonSocial}`, 10, 130);
    doc.text(`RFC: ${rfc}`, 10, 135);
    doc.text(`Dirección: ${bCalle} #${bExt} Int.${bInt}`, 10, 140);
    doc.text(`${bCol}`, 26, 145);
    doc.text(`${bCiudad}, ${bEstado}. C.P.${bCP}`, 26, 150);

    doc.text(`Serie y Folio: GD00005755`, 130, 120);
    doc.text(`Lugar de Expedición: 44300`, 130, 125);
    doc.text(`Certificado Emisor: 00001000000707408883`, 130, 130);
    doc.text(`Certificado SAT: 00001000000509846663`, 130, 135);
    doc.text(`Fecha de Emisión: 2025-07-21T12:58:35`, 130, 140);
    doc.text(`Fecha Certificación: 2025-07-21T12:58:35`, 130, 145);
    doc.text(`Moneda: USD`, 130, 150);

    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 155, 200, 155);

    doc.text(`Forma de Pago: 03.-TRANSFERENCIA DE FONDOS`, 10, 165);
    doc.text(`Método de Pago: PUE.-PAGO EN UNA SOLA EXHIBICION`, 10, 170);
    doc.text(`Uso de CFDI: G03.-GASTOS EN GENERAL`, 10, 175);

    doc.text(`Tipo de Comprobante: I.-INGRESO`, 130, 165);
    doc.text(`Condiciones de Pago: CONTADO`, 130, 170);
    doc.text(`Nombre de Agente: AZUCENA RAMIREZ`, 130, 175);

    doc.setLineWidth(0.1);
    doc.setDrawColor(200, 200, 200);
    doc.line(10, 180, 200, 180);

    const itemRows = (order.items || []).map((item) => [
      item.product,
      item.amount,
      `$${Number(item.price).toFixed(2)}${item.currency ? ` ${item.currency}` : ""}`,
      `$${(Number(item.amount) * Number(item.price)).toFixed(2)}${item.currency ? ` ${item.currency}` : ""}`,
    ]);

    doc.autoTable({
      startY: 190,
      head: [["Producto", "Cantidad", "Precio Unitario", "Total"]],
      body: itemRows,
    });

    const totals = order.totals || {};
    const discountUSD = Number(totals.discountUSD ?? order.discountTotal ?? 0);
    const subtotalUSD =
      typeof totals.totalAllUSD === "number" ? totals.totalAllUSD : Number(order.totalCost ?? 0);
    const vatUSD =
      typeof totals.vatUSD === "number"
        ? totals.vatUSD
        : order.requestBill
        ? (subtotalUSD - discountUSD) * 0.16
        : 0;
    const finalUSD =
      typeof totals.finalAllUSD === "number"
        ? totals.finalAllUSD
        : Number(order.finalTotal ?? subtotalUSD - discountUSD + vatUSD);

    let extraY = doc.lastAutoTable.finalY + 12;

    const boxX = 141;
    const boxY = extraY - 8;
    const boxWidth = 55;
    const boxHeight = order.requestBill ? 30 : 22;
    const radius = 4;

    if (doc.roundedRect) {
      doc.setFillColor(207, 242, 137);
      doc.roundedRect(boxX, boxY, boxWidth, boxHeight, radius, radius, "F");
    } else {
      doc.setFillColor(207, 242, 137);
      doc.rect(boxX, boxY, boxWidth, boxHeight, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Subtotal: $${subtotalUSD.toFixed(2)} USD`, 151, extraY);

    if (order.requestBill === true) {
      doc.text(`IVA (+): $${vatUSD.toFixed(2)} USD`, 151, extraY + 10);
      doc.text(`TOTAL (=): $${finalUSD.toFixed(2)} USD`, 151, extraY + 15);
    } else {
      doc.text(`TOTAL (=): $${finalUSD.toFixed(2)} USD`, 151, extraY + 10);
    }

    const pdfBlob = doc.output("blob");
    const formData = new FormData();
    formData.append("invoicePDF", pdfBlob, `Factura_${order._id}.pdf`);
    formData.append("orderId", order._id);

    doc.save(`factura_${order._id}.pdf`);

    fetch(`${API}/upload-invoice`, {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then(() => {
        doc.save(`factura_${order._id}.pdf`);
        alert("Factura generada y cargada exitosamente.");
      })
      .catch((err) => console.error("Error al subir la factura:", err));
  };

  // ===== Upload Evidence (user flow with your original UI) =====
  async function uploadEvidence() {
    if (!evidenceFile || !order?._id) {
      alert("Seleccione una imagen válida.");
      return;
    }
  
    const isAllowed = evidenceFile.type.startsWith("image/") || evidenceFile.type === "application/pdf";
    if (!isAllowed) {
      alert("Formato no permitido. Sube imagen o PDF.");
      return;
    }
    if (evidenceFile.size > 25 * 1024 * 1024) {
      alert("Archivo excede 25MB.");
      return;
    }
  
    setUploadErr("");
    setUploadOk("");
    setUploadBusy(true);
    setUploadProgress(0);
  
    try {
      // 1) Upload to your existing S3-backed endpoint (unchanged)
      const form = new FormData();
      form.append("file", evidenceFile);
  
      const s3Resp = await axios.post(`${API}/orders/${order._id}/evidence/payment`, form, {
        onUploadProgress: (pe) => {
          if (!pe.total) return;
          setUploadProgress(Math.round((pe.loaded / pe.total) * 100));
        },
      });
  
      // If your S3 route returns the file URL/filename, pluck them here
      const s3Url    = s3Resp?.data?.url || s3Resp?.data?.Location || "";
      const filename = s3Resp?.data?.filename || evidenceFile.name || "";
  
      // 2) Tell the API to trigger the evidence-stage push (no re-upload)
      await fetch(`${API}/orders/${order._id}/evidence/mark-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Url, filename }),
      });
  
      // 3) Keep your original status update so the progress bar & lists move
      await fetch(`${API}/order/${order._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: "Evidencia Subida" }),
      });
  
      // 4) Local optimistics + refresh
      setOrder(prev => prev ? { ...prev, orderStatus: "Evidencia Subida" } : prev);
      setUploadOk("¡Evidencia subida con éxito!");
      setEvidenceFile(null);
      await loadOrder();
    } catch (e) {
      console.error("Error al subir evidencia:", e);
      setUploadErr(e?.response?.data?.error || e.message || "No se pudo subir la evidencia.");
    } finally {
      setUploadBusy(false);
      setTimeout(() => setUploadProgress(0), 800);
    }
  }

  // NEW MAR/31
  // async function downloadSelectedDocs() {
  //   if (!selectedDocTypeKeys.length) {
  //     alert("Selecciona al menos un tipo de documento.");
  //     return;
  //   }
  
  //   if (!selectedProductKeys.length) {
  //     alert("Selecciona al menos un producto.");
  //     return;
  //   }
  
  //   const chosenItems = uniqueOrderProducts.filter((item) =>
  //     selectedProductKeys.includes(makeKey(item.product, item.presentation))
  //   );
  
  //   const files = [];
  
  //   for (const item of chosenItems) {
  //     const docs = getDocsForItem(item);
  //     if (!docs) continue;
  
  //     for (const docKey of selectedDocTypeKeys) {
  //       const url = normalizeUrl(docs?.[docKey]);
  //       if (!url) continue;
  
  //       const cleanDocName = docKey.replace(/_URL$/, "").toLowerCase();
  
  //       const safeBaseName = `${item.product}_${cleanDocName}`
  //         .replace(/[^\w\-]+/g, "_")
  //         .replace(/^_+|_+$/g, "");
  
  //       files.push({
  //         url,
  //         name: `${safeBaseName}.pdf`,
  //       });
  //     }
  //   }
  
  //   if (!files.length) {
  //     alert("No encontramos documentos disponibles.");
  //     return;
  //   }
  
  //   try {
  //     const res = await fetch(`${API}/download-product-docs`, {
  //       method: "POST",
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //       body: JSON.stringify({ files }),
  //     });
  
  //     const blob = await res.blob();
  //     saveAs(blob, `documentos_pedido_${orderId}.zip`);
  //   } catch (err) {
  //     console.error(err);
  //     alert("Error descargando documentos.");
  //   }
  // }

  async function downloadSelectedDocs() {
    if (!selectedDocTypeKeys.length) {
      alert("Selecciona al menos un tipo de documento.");
      return;
    }
  
    if (!selectedProductKeys.length) {
      alert("Selecciona al menos un producto.");
      return;
    }
  
    const chosenItems = uniqueOrderProducts.filter((item) =>
      selectedProductKeys.includes(makeKey(item.product, item.presentation))
    );
  
    const files = [];
  
    for (const item of chosenItems) {
      const docs = getDocsForItem(item);
      if (!docs) continue;
  
      for (const docKey of selectedDocTypeKeys) {
        // const url = normalizeUrl(docs?.[docKey]);
        // if (!url) continue;
  
        // const cleanDocName = docKey.replace(/_URL$/, "").toLowerCase();
        // const safeBaseName = `${item.product}_${cleanDocName}`
        //   .replace(/[^\w\-]+/g, "_")
        //   .replace(/^_+|_+$/g, "");
  
        // files.push({
        //   url,
        //   name: `${safeBaseName}.pdf`,
        // });

        // apr06
        const { download, fileId } = normalizeUrl(docs?.[docKey]);

        const cleanDocName = docKey.replace(/_URL$/, "").toLowerCase();
        const safeBaseName = `${item.product}_${cleanDocName}`
          .replace(/[^\w\-]+/g, "_")
          .replace(/^_+|_+$/g, "");

        if (!fileId) {
          console.warn("⚠️ Invalid file skipped:", docs?.[docKey]);
          continue;
        }

        console.log("📄 FILE:", {
          product: item.product,
          docKey,
          originalUrl: docs?.[docKey],
          fileId,
        });

        files.push({
          fileId,
          name: `${safeBaseName}.pdf`,
        });
        // apr06
      }
    }
  
    if (!files.length) {
      alert("No encontramos documentos disponibles.");
      return;
    }
  
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  
    const isIOSPWA = isIOS && isStandalone;
  
    try {
      // iPhone installed app fallback:
      // if (isIOSPWA) {
      //   // open one by one instead of ZIP blob
      //   for (const file of files) {
      //     window.open(file.url, "_blank", "noopener,noreferrer");
      //   }
      //   return;
      // }
      if (isIOSPWA) {
        for (const file of files) {
          const link = `${API}/proxy-download?fileId=${file.fileId}&name=${file.name}`;
          // window.open(link, "_blank");
          window.location.href = link;
        }
        return;
      }
  
      // desktop / normal browsers
      const res = await fetch(`${API}/download-product-docs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files }),
      });
  
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
  
      const blob = await res.blob();
      saveAs(blob, `documentos_pedido_${orderId}.zip`);
    } catch (err) {
      console.error(err);
      alert("Error descargando documentos.");
    }
  }
  // END MAR/31
  
  // async function uploadEvidence() {
  //   if (!evidenceFile || !order?._id) {
  //     alert("Seleccione una imagen válida.");
  //     return;
  //   }

  //   // allow images or PDF; 25MB cap
  //   const isAllowed = evidenceFile.type.startsWith("image/") || evidenceFile.type === "application/pdf";
  //   if (!isAllowed) {
  //     alert("Formato no permitido. Sube imagen o PDF.");
  //     return;
  //   }
  //   if (evidenceFile.size > 25 * 1024 * 1024) {
  //     alert("Archivo excede 25MB.");
  //     return;
  //   }

  //   setUploadErr("");
  //   setUploadOk("");
  //   setUploadBusy(true);
  //   setUploadProgress(0);

  //   try {
  //     // 1) Upload to new S3-backed endpoint (field name: "file")
  //     const form = new FormData();
  //     form.append("file", evidenceFile);

  //     await axios.post(`${API}/orders/${order._id}/evidence/payment`, form, {
  //       onUploadProgress: (pe) => {
  //         if (!pe.total) return;
  //         setUploadProgress(Math.round((pe.loaded / pe.total) * 100));
  //       },
  //     });

  //     // 2) Update status so timeline moves & admin sees it
  //     await fetch(`${API}/order/${order._id}/status`, {
  //       method: "PATCH",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ orderStatus: "Evidencia Subida" }),
  //     });

  //     // 3) Optimistic local update + reload order to refresh evidence fields
  //     setOrder((prev) => (prev ? { ...prev, orderStatus: "Evidencia Subida" } : prev));
  //     setUploadOk("¡Evidencia subida con éxito!");
  //     setEvidenceFile(null);
  //     await loadOrder();
  //   } catch (e) {
  //     console.error("Error al subir evidencia:", e);
  //     setUploadErr(e?.response?.data?.error || e.message || "No se pudo subir la evidencia.");
  //   } finally {
  //     setUploadBusy(false);
  //     setTimeout(() => setUploadProgress(0), 800);
  //   }
  // }

  if (!order) return <p>Cargando detalles del pedido...</p>;

  const sCalle = order?.shippingInfo?.calleEnvio || "";
  const sExt = order?.shippingInfo?.exteriorEnvio || "";
  const sInt = order?.shippingInfo?.interiorEnvio || "";
  const sCol = order?.shippingInfo?.coloniaEnvio || "";
  const sCiudad = order?.shippingInfo?.ciudadEnvio || "";
  const sEstado = order?.shippingInfo?.estadoEnvio || "";
  const sCP = order?.shippingInfo?.cpEnvio || "";

  const userEmail = localStorage.getItem("userEmail") || "";
  const canRequestInvoice =
    userEmail === "mj_albanes@kangaroocacti.com" || getCurrentPosition(order.orderStatus) >= 2;

  return (
    <body className="app-shell body-BG-Gradient">

      <div className="app-header">
      {/* <div className="app-header loginLogo-ParentDiv"> */}
        <img
          className="secondaryPages-GISLogo"
          src={logoImage}
          alt="GIS Logo"
          width="180"
          height="55"
          onClick={() => navigate("/userHome")}
        />
      </div>

      <div className="app-main">

      <div>
      {/* <div className="orderTracker-LimitedScroll"> */}
      <div className="stickyTopSection">

        <div className="edit-titleIcon-Div">
          <label className="editAddress-headerLabel">Rastrea tu orden</label>
          <img src={pedidoIcon} alt="Pedido" width="35" height="35" />
        </div>

        <div className="orderNumberAndDate-Div">
          <label className="orderNumber-Label">PEDIDO #{String(order._id).slice(-5)}</label>
          <label className="orderDate-Label">
            Fecha de Pedido:{" "}
            {new Date(order.orderDate).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </label>
        </div>
        </div>

        {/* MAR/31 */}
        {isPreparingOrLater && (
          <div className="orderFiles-Div" style={{ marginTop: 10 }}>
            <label className="orderNumber-Label">DOCUMENTOS DEL PRODUCTO</label>

            <div className="selectFilesAndProducts-Div" style={{ display: "grid", gap: 10, marginTop: 10}}>
              {/* Dropdown documentos */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="selectFilesDropdown-Btn"
                  style={{ width: "100%", maxWidth: 250, marginLeft: "8.5%", marginTop: "6%", fontStyle: "italic", color: "gray", fontWeight:"normal", textAlign:"left", paddingLeft:"5%"  }}
                  onClick={() => setDocDropdownOpen((v) => !v)}
                >
                  Seleccionar documentos ▼
                </button>

                {docDropdownOpen && (
                  <div
                    style={{
                      marginTop: 8,
                      marginLeft: "8.5%",
                      background: "#fff",
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: 10,
                      boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
                      zIndex: 20,
                      position: "relative",
                      width: "100%",
                      maxWidth: 250,

                    }}
                  >
                    <label style={{ display: "block", marginBottom: 8,  }}>
                      <input
                        type="checkbox"
                        checked={selectedDocTypes.includes("ALL_DOCS")}
                        onChange={() => toggleDocType("ALL_DOCS")}
                      />{" "}
                      Descargar todos
                    </label>

                    {DOC_TYPES.map((doc) => (
                      <label key={doc.key} style={{ display: "block", marginBottom: 8 }}>
                        <input
                          type="checkbox"
                          checked={
                            selectedDocTypes.includes("ALL_DOCS") ||
                            selectedDocTypes.includes(doc.key)
                          }
                          onChange={() => toggleDocType(doc.key)}
                        />{" "}
                        {doc.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Dropdown productos */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="selectFilesDropdown-Btn"
                  style={{ width: "100%", maxWidth: 250, marginLeft: "8.5%", marginTop: "4%", fontStyle: "italic", color: "gray", fontWeight:"normal", textAlign:"left", paddingLeft:"5%" }}
                  onClick={() => setProductDropdownOpen((v) => !v)}
                >
                  Seleccionar productos  ▼
                </button>

                {productDropdownOpen && (
                  <div
                    style={{
                      marginTop: 8,
                      marginLeft: "8.5%",
                      background: "#fff",
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: 10,
                      boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
                      zIndex: 20,
                      position: "relative",
                      width: "100%",
                      maxWidth: 250,
                    }}
                  >
                    <label style={{ display: "block", marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes("ALL_PRODUCTS")}
                        onChange={() => toggleProduct("ALL_PRODUCTS")}
                      />{" "}
                      Todos los productos
                    </label>

                    {uniqueOrderProducts.map((item, idx) => {
                      const key = makeKey(item.product, item.presentation);
                      return (
                        <label key={`${key}-${idx}`} style={{ display: "block", marginBottom: 8 }}>
                          <input
                            type="checkbox"
                            checked={
                              selectedProducts.includes("ALL_PRODUCTS") ||
                              selectedProducts.includes(key)
                            }
                            onChange={() => toggleProduct(key)}
                          />{" "}
                          {item.product} {item.presentation ? `(${item.presentation})` : ""}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                className="uploadPaymentEvidence-Btn"
                style={{ width: "100%", maxWidth: 130, marginLeft: 145, marginTop: "4%" }}
                onClick={downloadSelectedDocs}
                disabled={docsLoading || !docsLoaded}
              >
                {docsLoading ? "Cargando..." : "Descargar"}
              </button>

              {docsErr && (
                <div style={{ color: "#b00", fontSize: 12 }}>{docsErr}</div>
              )}
            </div>
          </div>
        )}
        {/* MAR/31 */}

        {/* sep06 */}
         {/* ✅ Show tracking number only when delivered and present */}
         {order?.orderStatus === "Pedido Entregado" && (
          <div className="orderNumberAndDate-Div">
            <div className="trackingNumber-Div" style={{ marginTop: 4, marginLeft: 1}}>
              <span className="orderDate-Label" style={{ fontWeight: 600 }}>
                No. de rastreo:
              </span>{" "}
              <span className="orderDate-Label">
                {order?.trackingNumber || "No disponible"}
              </span>
            </div>

            <div className="trackingNumber-Div" style={{ marginTop: 4, marginLeft: 1 }}>
            <span className="orderDate-Label" style={{ fontWeight: 600 }}>
              Fecha Entrega:
            </span>{" "}
            <span className="orderDate-Label">
              {new Date(order.deliveryDate).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
              {/* {order?.deliveryDate || "No disponible"} */}
            </span>
            </div>
          </div>
          )}
        {/* sep06 */}
        

        <div style={{ margin: "20px", padding: "20px" }}>
          <ProgressBar
            percent={(getCurrentPosition(order.orderStatus) / (labels.length - 1)) * 100}
            filledBackground="linear-gradient(to right, #97d91a, #4caf50)"
            styles={{
              path: { height: "4px", marginTop: "-10px", borderRadius: "2px" },
              trail: { height: "4px", marginTop: "-10px", borderRadius: "2px", backgroundColor: "#eee" },
            }}
          >
            {labels.map((label, index) => (
              <Step key={index}>
                {({ accomplished }) => (
                  <div style={{ textAlign: "center", width: "100px" }}>
                    <div
                      style={{
                        backgroundColor: accomplished ? "#4caf50" : "#ccc",
                        borderRadius: "50%",
                        width: 20,
                        height: 20,
                        margin: "0 auto",
                      }}
                    ></div>
                    <div style={{ fontSize: "10px", marginTop: 5, whiteSpace: "pre-line" }}>{label}</div>
                  </div>
                )}
              </Step>
            ))}
          </ProgressBar>
        </div>

        <div>
        {/* <div className="orderTracker-Scroll"> */}
          <div className="orderNumberAndDate-Div">
            <label className="orderNumber-Label">DESCRIPCIÓN DEL PEDIDO</label>
            {(order.items || []).map((item, idx) => (
              <div className="orderImageAndDets-Div" key={idx}>
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
                    <b>Cantidad:</b> {item.amount}
                  </label>
                  <label className="orderDets-Label">
                    <b>Precio Unitario:</b> ${Number(item.price).toFixed(2)}
                    {item.currency ? ` ${item.currency}` : ""}
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* SHIPPING */}
          <div className="orderNumberAndDate-Div">
            <label className="orderNumber-Label">DIRECCIÓN DE ENVÍO</label>

            {isPickup ? (
              <div className="shippingAddress-Div">
                <label className="orderDate-Label" style={{ fontWeight: 700 }}>
                  Pedido será recogido en matriz
                </label>
                <label className="orderDate-Label">
                  Fecha de recolección: {pickupDateLabel}
                </label>
                <label className="orderDate-Label">
                  Hora de recolección: {pickupTimeLabel}
                </label>
              </div>
            ) : (
              <div className="shippingAddress-Div">
                <label className="orderDate-Label">
                  {sCalle} #{sExt} Int.{sInt}
                </label>
                <label className="orderDate-Label">Col. {sCol}</label>
                <label className="orderDate-Label">
                  {sCiudad}, {sEstado}
                </label>
                <label className="orderDate-Label">C.P. {sCP}</label>
              </div>
            )}
          </div>

          {/* BILLING */}
          <div className="orderTrack-BillingDiv">
            <label className="orderNumber-Label">DATOS DE FACTURACIÓN</label>

            <div className="shippingAddress-Div">
              {!wantsInvoice ? (
                // Caso 1: el cliente NO solicitó factura
                <label className="orderDate-Label" style={{ fontStyle: "italic" }}>
                  Factura no solicitada
                </label>
              ) : hasBillingInfo ? (
                // Caso 2: sí solicitó y SÍ hay datos
                <>
                  <label className="orderDate-Label">{bill.razonSocial || ""}</label>
                  <label className="orderDate-Label">{bill.rfcEmpresa || ""}</label>
                  <label className="orderDate-Label">
                    {(bill.calleFiscal || "")} #{bill.exteriorFiscal || ""} Int.{bill.interiorFiscal || ""}
                  </label>
                  <label className="orderDate-Label">Col. {bill.coloniaFiscal || ""}</label>
                  <label className="orderDate-Label">
                    {(bill.ciudadFiscal || "")}, {(bill.estadoFiscal || "")}
                  </label>
                  <label className="orderDate-Label">C.P. {bill.cpFiscal || ""}</label>
                </>
              ) : (
                // Caso 3: sí solicitó pero no hay datos disponibles (robustez)
                <label className="orderDate-Label" style={{ fontStyle: "italic" }}>
                  Datos de facturación no disponibles
                </label>
              )}
            </div>
          </div>

          {/* <div className="orderTrack-BillingDiv">
            <label className="orderNumber-Label">DATOS DE FACTURACIÓN</label>
            <div className="shippingAddress-Div">
              <label className="orderDate-Label">{order?.billingInfo?.razonSocial || ""}</label>
              <label className="orderDate-Label">{order?.billingInfo?.rfcEmpresa || ""}</label>
              <label className="orderDate-Label">
                {(order?.billingInfo?.calleFiscal || "")} #{order?.billingInfo?.exteriorFiscal || ""} Int.
                {order?.billingInfo?.interiorFiscal || ""}
              </label>
              <label className="orderDate-Label">Col. {order?.billingInfo?.coloniaFiscal || ""}</label>
              <label className="orderDate-Label">
                {(order?.billingInfo?.ciudadFiscal || "")}, {(order?.billingInfo?.estadoFiscal || "")}
              </label>
              <label className="orderDate-Label">C.P. {order?.billingInfo?.cpFiscal || ""}</label>
            </div>
          </div> */}

          {/* ===== SUBIR EVIDENCIA (tu UI original, pero con el nuevo endpoint) ===== */}
          <div className="orderTracker-UploadEvidenceDiv">
            <label className="orderNumber-Label">SUBIR EVIDENCIA DE PAGO</label>

            <div className="file-upload-wrapper">
              <label htmlFor="evidenceFile" className="custom-file-upload">
                Elegir archivo
              </label>
              <input
                id="evidenceFile"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
              <span className="file-selected-text">
                {evidenceFile ? evidenceFile.name : "Ningún archivo seleccionado"}
              </span>
            </div>

            <button
              className="uploadPaymentEvidence-Btn"
              type="button"
              onClick={uploadEvidence}
              disabled={!evidenceFile || uploadBusy}
              title={!evidenceFile ? "Selecciona un archivo primero" : ""}
            >
              {uploadBusy ? `Subiendo... ${uploadProgress || 0}%` : <>Subir <br />Evidencia</>}
            </button>

            {uploadErr && <div style={{ color: "#b00", marginTop: 8, fontSize: 12 }}>{uploadErr}</div>}
            {uploadOk && <div style={{ color: "#2a7a2a", marginTop: 8, fontSize: 12 }}>{uploadOk}</div>}
          </div>
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









// import { ProgressBar, Step } from "react-step-progress-bar";
// import "react-step-progress-bar/styles.css";

// import axios from "axios";
// import { API } from "/src/lib/api";
// import { useParams, useNavigate, useLocation } from "react-router-dom";
// import { useState, useEffect, useRef } from "react";

// import jsPDF from "jspdf";
// import "jspdf-autotable";

// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";

// import { docDesign } from "/src/components/documentDesign";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// // IMAGES
// import logoImage from "../assets/images/GIS_Logo.png";
// import pedidoIcon from "../assets/images/Icono_Pedidos.png";
// import fallbackImg from "../assets/images/Product_GISSample.png";

// // NEW: CSV for product images
// import Papa from "papaparse";

// export default function OrderTrackDetails() {
//   const navigate = useNavigate();
//   const { orderId } = useParams();
//   const location = useLocation();

//   const [order, setOrder] = useState(location.state?.order || null);
//   const [loading, setLoading] = useState(true);
//   const [err, setErr] = useState("");

//   // ====== IMAGE LOOKUP (robust keys) ======
//   const [imageLookup, setImageLookup] = useState({});

//   // Canonicalizer: remove accents, toLowerCase, strip non-alphanumerics
//   const canon = (s = "") =>
//     String(s)
//       .normalize("NFD")
//       .replace(/[\u0300-\u036f]/g, "")
//       .toLowerCase()
//       .replace(/\s+/g, "") // collapse/remove spaces
//       .replace(/[^a-z0-9]/g, "") // drop punctuation like ".", "-", "/"
//       .trim();

//   const makeKey = (product = "", presentation = "") =>
//     `${canon(product)}__${canon(presentation)}`;

//   useEffect(() => {
//     loadOrder();
//   }, [orderId]);

//   async function loadOrder() {
//     setLoading(true);
//     setErr("");
//     try {
//       const res = await axios.get(`${API}/orders/${orderId}`);
//       setOrder(res.data);
//     } catch (e) {
//       console.error("load order error", e);
//       setErr("No se pudo cargar la orden.");
//     } finally {
//       setLoading(false);
//     }
//   }

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

//               const peso = (row.PESO_PRODUCTO || "").toString().trim();
//               const unidad = (row.UNIDAD_MEDICION || "").toString().trim();

//               const presNoSpace = `${peso}${unidad}`;
//               const presWithSpace = `${peso} ${unidad}`.trim();

//               const img =
//                 row.IMAGE_URL ||
//                 row.IMAGE ||
//                 row.IMG_URL ||
//                 row.IMG ||
//                 row.FOTO ||
//                 row.PHOTO ||
//                 row.URL_IMAGEN ||
//                 "";

//               if (!name || !img) return;

//               map[makeKey(name, presNoSpace)] = img;
//               map[makeKey(name, presWithSpace)] = img;
//             });

//             setImageLookup(map);
//           },
//         });
//       })
//       .catch((err) => console.error("Error fetching product image CSV:", err));
//   }, []);

//   const getItemImage = (item) => {
//     const prod = item?.product || "";
//     const pres = item?.presentation || "";

//     const k1 = makeKey(prod, pres);
//     const k2 = makeKey(prod, String(pres).replace(/\s+/g, "")); // no spaces
//     const k3 = makeKey(prod, String(pres).replace(/\s*/g, " ")); // single space

//     const url = imageLookup[k1] || imageLookup[k2] || imageLookup[k3];

//     if (!url) {
//       console.debug("[image miss]", { k1, k2, k3, prod, pres });
//     }

//     return url && url.length > 0 ? url : fallbackImg;
//   };

//   const labels = [
//     "Pedido \n Realizado",
//     "Evidencia \n de Pago",
//     "Pago \n Verificado",
//     "Preparando \n Pedido",
//     "Pedido \n Listo",
//     "Pedido \n Entregado",
//   ];

//   const getCurrentPosition = (status) => {
//     if (!status) return 0;
//     const s = status.toLowerCase();
//     if (s.includes("realizado")) return 0;
//     if (s.includes("evidencia")) return 1;
//     if (s.includes("verificado")) return 2;
//     if (s.includes("etiqueta")) return 3;
//     if (s.includes("listo")) return 4;
//     if (s.includes("entregado")) return 5;
//     return 0;
//   };

//   const ship = order?.shippingInfo || {};
//   const bill = order?.billingInfo || {};

//   const generateInvoice = () => {
//     if (!order) return;
//     const doc = new jsPDF();

//     const pageWidth = doc.internal.pageSize.getWidth();
//     const pageHeight = doc.internal.pageSize.getHeight();
//     const drawBg = () => doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
//     drawBg();

//     doc.setFontSize(14);
//     doc.setFont("helvetica", "bold");
//     doc.text("GREEN IMPORT SOLUTIONS DOLARES", 60, 40);

//     doc.setFontSize(11);
//     doc.setFont("helvetica", "normal");
//     doc.text(`Folio Fiscal: e375b3c8-564a-4fb-9880-2dc5793e8da9`, 63, 50);
//     doc.text(`601 GENERAL DE LEY DE LAS PERSONAS MORALES`, 60, 55);

//     doc.setFontSize(10);
//     doc.text(`Nombre: GREEN IMPORT SOLUTIONS`, 10, 65);
//     doc.text(`RFC: GIS150804NV1`, 10, 70);
//     doc.text(`País: MEXICO`, 10, 75);
//     doc.text(`Dirección: MONTE EVEREST 2428`, 10, 80);
//     doc.text(`LA FEDERACHA`, 27, 85);
//     doc.text(`GUADALAJARA JAL MEXICO C.P. 44300`, 27, 90);
//     doc.text(`Tel: 01 (33) 2016 8274`, 10, 95);

//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 100, 200, 100);

//     doc.setFontSize(10);
//     doc.setFont("helvetica", "bold");
//     doc.text(`Información del Receptor`, 10, 110);

//     doc.setFont("helvetica", "normal");
//     doc.text(`612 PERSONAS FISICAS CON ACTIVIDADES`, 10, 120);
//     doc.text(`EMPRESARIALES Y PROFESIONALES`, 10, 125);

//     const razonSocial = bill.razonSocial || "";
//     const rfc = bill.rfcEmpresa || "";
//     const bCalle = bill.calleFiscal || "";
//     const bExt = bill.exteriorFiscal || "";
//     const bInt = bill.interiorFiscal || "";
//     const bCol = bill.coloniaFiscal || "";
//     const bCiudad = bill.ciudadFiscal || "";
//     const bEstado = bill.estadoFiscal || "";
//     const bCP = bill.cpFiscal || "";

//     doc.text(`Nombre: ${razonSocial}`, 10, 130);
//     doc.text(`RFC: ${rfc}`, 10, 135);
//     doc.text(`Dirección: ${bCalle} #${bExt} Int.${bInt}`, 10, 140);
//     doc.text(`${bCol}`, 26, 145);
//     doc.text(`${bCiudad}, ${bEstado}. C.P.${bCP}`, 26, 150);

//     doc.text(`Serie y Folio: GD00005755`, 130, 120);
//     doc.text(`Lugar de Expedición: 44300`, 130, 125);
//     doc.text(`Certificado Emisor: 00001000000707408883`, 130, 130);
//     doc.text(`Certificado SAT: 00001000000509846663`, 130, 135);
//     doc.text(`Fecha de Emisión: 2025-07-21T12:58:35`, 130, 140);
//     doc.text(`Fecha Certificación: 2025-07-21T12:58:35`, 130, 145);
//     doc.text(`Moneda: USD`, 130, 150);

//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 155, 200, 155);

//     doc.text(`Forma de Pago: 03.-TRANSFERENCIA DE FONDOS`, 10, 165);
//     doc.text(`Método de Pago: PUE.-PAGO EN UNA SOLA EXHIBICION`, 10, 170);
//     doc.text(`Uso de CFDI: G03.-GASTOS EN GENERAL`, 10, 175);

//     doc.text(`Tipo de Comprobante: I.-INGRESO`, 130, 165);
//     doc.text(`Condiciones de Pago: CONTADO`, 130, 170);
//     doc.text(`Nombre de Agente: AZUCENA RAMIREZ`, 130, 175);

//     doc.setLineWidth(0.1);
//     doc.setDrawColor(200, 200, 200);
//     doc.line(10, 180, 200, 180);

//     const itemRows = (order.items || []).map((item) => [
//       item.product,
//       item.amount,
//       `$${Number(item.price).toFixed(2)}${item.currency ? ` ${item.currency}` : ""}`,
//       `$${(Number(item.amount) * Number(item.price)).toFixed(2)}${item.currency ? ` ${item.currency}` : ""}`,
//     ]);

//     doc.autoTable({
//       startY: 190,
//       head: [["Producto", "Cantidad", "Precio Unitario", "Total"]],
//       body: itemRows,
//     });

//     const totals = order.totals || {};
//     const discountUSD = Number(totals.discountUSD ?? order.discountTotal ?? 0);
//     const subtotalUSD =
//       typeof totals.totalAllUSD === "number" ? totals.totalAllUSD : Number(order.totalCost ?? 0);
//     const vatUSD =
//       typeof totals.vatUSD === "number"
//         ? totals.vatUSD
//         : order.requestBill
//         ? (subtotalUSD - discountUSD) * 0.16
//         : 0;
//     const finalUSD =
//       typeof totals.finalAllUSD === "number"
//         ? totals.finalAllUSD
//         : Number(order.finalTotal ?? subtotalUSD - discountUSD + vatUSD);

//     let extraY = doc.lastAutoTable.finalY + 12;

//     const boxX = 141;
//     const boxY = extraY - 8;
//     const boxWidth = 55;
//     const boxHeight = order.requestBill ? 30 : 22;
//     const radius = 4;

//     if (doc.roundedRect) {
//       doc.setFillColor(207, 242, 137);
//       doc.roundedRect(boxX, boxY, boxWidth, boxHeight, radius, radius, "F");
//     } else {
//       doc.setFillColor(207, 242, 137);
//       doc.rect(boxX, boxY, boxWidth, boxHeight, "F");
//     }

//     doc.setFont("helvetica", "bold");
//     doc.setFontSize(10);
//     doc.text(`Subtotal: $${subtotalUSD.toFixed(2)} USD`, 151, extraY);

//     if (order.requestBill === true) {
//       doc.text(`IVA (+): $${vatUSD.toFixed(2)} USD`, 151, extraY + 10);
//       doc.text(`TOTAL (=): $${finalUSD.toFixed(2)} USD`, 151, extraY + 15);
//     } else {
//       doc.text(`TOTAL (=): $${finalUSD.toFixed(2)} USD`, 151, extraY + 10);
//     }

//     const pdfBlob = doc.output("blob");
//     const formData = new FormData();
//     formData.append("invoicePDF", pdfBlob, `Factura_${order._id}.pdf`);
//     formData.append("orderId", order._id);

//     doc.save(`factura_${order._id}.pdf`);

//     fetch(`${API}/upload-invoice`, {
//       method: "POST",
//       body: formData,
//     })
//       .then((res) => res.json())
//       .then(() => {
//         doc.save(`factura_${order._id}.pdf`);
//         alert("Factura generada y cargada exitosamente.");
//       })
//       .catch((err) => console.error("Error al subir la factura:", err));
//   };

//   // here aug 16
//   const updateOrderStatus = async (id, status) => {
//     try {
//       await fetch(`${API}/order/${id}/status`, {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ orderStatus: status }),
//       });
//     } catch (e) {
//       console.error("Failed to update order status on server:", e);
//     }
//   };

//   if (!order) return <p>Cargando detalles del pedido...</p>;

//   const sCalle = order?.shippingInfo?.calleEnvio || "";
//   const sExt = order?.shippingInfo?.exteriorEnvio || "";
//   const sInt = order?.shippingInfo?.interiorEnvio || "";
//   const sCol = order?.shippingInfo?.coloniaEnvio || "";
//   const sCiudad = order?.shippingInfo?.ciudadEnvio || "";
//   const sEstado = order?.shippingInfo?.estadoEnvio || "";
//   const sCP = order?.shippingInfo?.cpEnvio || "";

//   const userEmail = localStorage.getItem("userEmail") || "";
//   const canRequestInvoice =
//     userEmail === "mj_albanes@kangaroocacti.com" || getCurrentPosition(order.orderStatus) >= 2;

//   return (
//     <body className="body-BG-Gradient">
//       <div className="loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src={logoImage}
//           alt="GIS Logo"
//           width="180"
//           height="55"
//           onClick={() => navigate("/userHome")}
//         />
//       </div>

//       <div className="orderTracker-LimitedScroll">
//         <div className="edit-titleIcon-Div">
//           <label className="editAddress-headerLabel">Rastrea tu orden</label>
//           <img src={pedidoIcon} alt="Pedido" width="35" height="35" />
//         </div>

//         <div className="orderNumberAndDate-Div">
//           <label className="orderNumber-Label">PEDIDO #{String(order._id).slice(-5)}</label>
//           <label className="orderDate-Label">
//             Fecha de Pedido:{" "}
//             {new Date(order.orderDate).toLocaleDateString("es-MX", {
//               day: "2-digit",
//               month: "short",
//               year: "numeric",
//             })}
//           </label>
//         </div>

//         <div style={{ margin: "20px", padding: "20px" }}>
//           <ProgressBar
//             percent={(getCurrentPosition(order.orderStatus) / (labels.length - 1)) * 100}
//             filledBackground="linear-gradient(to right, #97d91a, #4caf50)"
//             styles={{
//               path: { height: "4px", marginTop: "-10px", borderRadius: "2px" },
//               trail: { height: "4px", marginTop: "-10px", borderRadius: "2px", backgroundColor: "#eee" },
//             }}
//           >
//             {labels.map((label, index) => (
//               <Step key={index}>
//                 {({ accomplished }) => (
//                   <div style={{ textAlign: "center", width: "100px" }}>
//                     <div
//                       style={{
//                         backgroundColor: accomplished ? "#4caf50" : "#ccc",
//                         borderRadius: "50%",
//                         width: 20,
//                         height: 20,
//                         margin: "0 auto",
//                       }}
//                     ></div>
//                     <div style={{ fontSize: "10px", marginTop: 5, whiteSpace: "pre-line" }}>{label}</div>
//                   </div>
//                 )}
//               </Step>
//             ))}
//           </ProgressBar>
//         </div>

//         <div className="orderTracker-Scroll">
//           <div className="orderNumberAndDate-Div">
//             <label className="orderNumber-Label">DESCRIPCIÓN DEL PEDIDO</label>
//             {(order.items || []).map((item, idx) => (
//               <div className="orderImageAndDets-Div" key={idx}>
//                 <img
//                   src={getItemImage(item)}
//                   alt={item.product}
//                   width="75"
//                   height="75"
//                   onError={(e) => {
//                     e.currentTarget.src = fallbackImg;
//                   }}
//                 />
//                 <div className="orderDetails-Div">
//                   <label className="orderDets-Label">
//                     <b>{item.product}</b>
//                   </label>
//                   <label className="orderDets-Label">
//                     <b>Cantidad:</b> {item.amount}
//                   </label>
//                   <label className="orderDets-Label">
//                     <b>Precio Unitario:</b> ${Number(item.price).toFixed(2)}
//                     {item.currency ? ` ${item.currency}` : ""}
//                   </label>
//                 </div>
//               </div>
//             ))}
//           </div>

//           {/* SHIPPING */}
//           <div className="orderNumberAndDate-Div">
//             <label className="orderNumber-Label">DIRECCIÓN DE ENVÍO</label>
//             <div className="shippingAddress-Div">
//               <label className="orderDate-Label">
//                 {sCalle} #{sExt} Int.{sInt}
//               </label>
//               <label className="orderDate-Label">Col. {sCol}</label>
//               <label className="orderDate-Label">
//                 {sCiudad}, {sEstado}
//               </label>
//               <label className="orderDate-Label">C.P. {sCP}</label>
//             </div>
//           </div>

//           {/* BILLING */}
//           <div className="orderTrack-BillingDiv">
//             <label className="orderNumber-Label">DATOS DE FACTURACIÓN</label>
//             <div className="shippingAddress-Div">
//               <label className="orderDate-Label">{order?.billingInfo?.razonSocial || ""}</label>
//               <label className="orderDate-Label">{order?.billingInfo?.rfcEmpresa || ""}</label>
//               <label className="orderDate-Label">
//                 {(order?.billingInfo?.calleFiscal || "")} #{order?.billingInfo?.exteriorFiscal || ""} Int.
//                 {order?.billingInfo?.interiorFiscal || ""}
//               </label>
//               <label className="orderDate-Label">Col. {order?.billingInfo?.coloniaFiscal || ""}</label>
//               <label className="orderDate-Label">
//                 {(order?.billingInfo?.ciudadFiscal || "")}, {(order?.billingInfo?.estadoFiscal || "")}
//               </label>
//               <label className="orderDate-Label">C.P. {order?.billingInfo?.cpFiscal || ""}</label>
//             </div>

//             {/* Gate “Solicitar Factura” by status >= “Pago Verificado” */}
//             <div className="requestBill-Div">
//               <button
//                 className="submitOrder-Btn"
//                 type="button"
//                 onClick={generateInvoice}
//                 disabled={!canRequestInvoice}
//                 title={!canRequestInvoice ? "Disponible cuando el pago sea verificado" : ""}
//               >
//                 Solicitar<br />Factura
//               </button>

//               {!canRequestInvoice && (
//                 <div style={{ fontSize: 10, color: "#b00", marginTop: 6 }}>
//                   Esta opción se habilita <br />cuando el pago se <br />verifique.
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* ===== Evidencia de Pago (Usuario) ===== */}
//           <div className="deliveryDets-AddressDiv">
//             <div className="headerEditIcon-Div">
//               <label className="newUserData-Label">Evidencia de Pago</label>
//             </div>

//             <PaymentEvidenceUploader
//               orderId={orderId}
//               onUploaded={loadOrder}
//               existing={order?.evidenceFileExt}
//             />

//             {loading && <div style={{ fontSize: 12, color: "#666" }}>Cargando...</div>}
//             {err && <div style={{ fontSize: 12, color: "#b00" }}>{err}</div>}
//           </div>
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

// /* ===== Helper component: PaymentEvidenceUploader (inline) ===== */
// function PaymentEvidenceUploader({ orderId, onUploaded, existing }) {
//   const inputRef = useRef(null);
//   const [busy, setBusy] = useState(false);
//   const [progress, setProgress] = useState(0);
//   const [msg, setMsg] = useState("");
//   const [error, setError] = useState("");

//   function openPicker(e) {
//     e?.preventDefault?.();
//     e?.stopPropagation?.();
//     inputRef.current?.click();
//   }

//   async function onFileChange(e) {
//     const file = e.target.files?.[0];
//     e.target.value = ""; // allow picking same file twice
//     if (!file) return;

//     const allowed = /^image\/|application\/pdf$/i.test(file.type);
//     if (!allowed) {
//       setError("Formato no permitido. Sube imagen o PDF.");
//       return;
//     }
//     if (file.size > 25 * 1024 * 1024) {
//       setError("Archivo excede 25MB.");
//       return;
//     }

//     setError("");
//     setMsg("");
//     setBusy(true);
//     setProgress(0);

//     try {
//       const form = new FormData();
//       form.append("file", file);

//       await axios.post(`${API}/orders/${orderId}/evidence/payment`, form, {
//         onUploadProgress: (pe) => {
//           if (!pe.total) return;
//           setProgress(Math.round((pe.loaded / pe.total) * 100));
//         },
//       });

//       setMsg("¡Evidencia subida con éxito!");
//       onUploaded?.();
//     } catch (err) {
//       console.error("upload error", err);
//       setError(err?.response?.data?.error || err.message || "Error al subir evidencia.");
//     } finally {
//       setBusy(false);
//       setTimeout(() => setProgress(0), 800);
//     }
//   }

//   const evidenceUrl = `${API}/orders/${orderId}/evidence/payment`;
//   const isImg = existing && /^image\//i.test(existing.mimetype || "");

//   return (
//     <div className="existingQuote-Div" style={{ display: "grid", gap: 10 }}>
//       {/* Hidden file input */}
//       <input
//         ref={inputRef}
//         type="file"
//         accept="image/*,application/pdf"
//         onChange={onFileChange}
//         style={{ display: "none" }}
//       />

//       {/* Button to open picker */}
//       <button
//         type="button"
//         className="quoter-AddMoreButton"
//         onClick={openPicker}
//         disabled={busy}
//       >
//         {busy ? "Subiendo..." : "Subir evidencia"}
//       </button>

//       {progress > 0 && <div style={{ fontSize: 12 }}>Progreso: {progress}%</div>}
//       {msg && <div style={{ fontSize: 12, color: "#2a7a2a" }}>{msg}</div>}
//       {error && <div style={{ fontSize: 12, color: "#b00" }}>{error}</div>}

//       {/* Existing preview/link */}
//       {existing ? (
//         <div style={{ marginTop: 8 }}>
//           <div style={{ fontWeight: 600, marginBottom: 6 }}>Archivo cargado</div>
//           <a
//             href={evidenceUrl}
//             target="_blank"
//             rel="noreferrer"
//             style={{ textDecoration: "underline" }}
//           >
//             {existing.filename || "Ver evidencia"}
//           </a>
//           {isImg && (
//             <div style={{ marginTop: 8 }}>
//               <img
//                 src={evidenceUrl}
//                 alt="Evidencia de pago"
//                 style={{ maxWidth: "100%", borderRadius: 8 }}
//               />
//             </div>
//           )}
//         </div>
//       ) : (
//         <div style={{ fontSize: 12, color: "#666" }}>Aún no hay evidencia cargada.</div>
//       )}
//     </div>
//   );
// }
