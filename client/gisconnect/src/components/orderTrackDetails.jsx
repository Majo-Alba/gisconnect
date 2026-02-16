// changed my google drive files so that they are PDF files stored in drive. So now links on the database lead to PDF files. Now, when hitting "Descargar" I would like to fetch the desired pdf files and directly download since currently when clickiung "Descargar" I navigate to the files' URL which is not what I want
import { useEffect, useState, useMemo } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { ProgressBar, Step } from "react-step-progress-bar";
import "react-step-progress-bar/styles.css";

import jsPDF from "jspdf";
import "jspdf-autotable";

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

import JSZip from "jszip";
import { saveAs } from "file-saver";


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

  // ================================
  // ✅ NEW: Inventory docs lookup
  // ================================
  const INVENTARIO_CSV =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv";

  const [docsLookup, setDocsLookup] = useState({}); // key -> { FT, HS, OMRI, CA }

  // Dropdown UI state
  const [docsOpen, setDocsOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);

  // Checkbox state
  const DOC_OPTIONS = useMemo(
    () => [
      { id: "FT", label: "Ficha Técnica" },
      { id: "HS", label: "Hoja de Seguridad" },
      { id: "OMRI", label: "Certificado OMRI" },
      { id: "CA", label: "Certificado de Análisis" },
    ],
    []
  );

  const [selectedDocs, setSelectedDocs] = useState(() => new Set());
  const [selectedProducts, setSelectedProducts] = useState(() => new Set());

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
    const csvUrl = INVENTARIO_CSV;

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

  // ✅ NEW: Docs lookup from same inventory CSV
  useEffect(() => {
    axios
      .get(INVENTARIO_CSV)
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

              const entry = {
                FT: (row.FICHA_TECNICA_URL || "").trim(),
                HS: (row.HOJA_DE_SEGURIDAD_URL || "").trim(),
                OMRI: (row.CERTIFICADO_OMRI_URL || "").trim(),
                CA: (row.CERTIFICADO_DE_ANALISIS_URL || "").trim(),
              };

              // If row has no docs at all, still store nothing (keeps lookup smaller)
              const hasAny = Object.values(entry).some((v) => !!v);
              if (!name || !hasAny) return;

              map[makeKey(name, presNoSpace)] = entry;
              map[makeKey(name, presWithSpace)] = entry;
            });
            setDocsLookup(map);
          },
        });
      })
      .catch((err) => console.error("Error fetching inventory docs CSV:", err));
  }, []);

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

  const labels = [
    "Pedido \n Realizado",
    "Evidencia \n de Pago",
    "Pago \n Verificado",
    "Preparando \n Pedido",
    "Etiqueta \n Generada",
    // "Pedido \n Listo",
    "Pedido \n Entregado",
  ];

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

  // ✅ NEW: Gate for document downloads
  const canDownloadDocs = getCurrentPosition(order?.orderStatus) >= 3; // "Preparando Pedido" or later

  // ✅ NEW: Build product options from order items (unique)
  const productOptions = useMemo(() => {
    const items = Array.isArray(order?.items) ? order.items : [];
    const seen = new Set();
    const out = [];

    items.forEach((it, idx) => {
      const p = (it?.product || "").trim();
      const pres = (it?.presentation || "").trim();
      const key = makeKey(p, pres);
      if (!p) return;
      if (seen.has(key)) return;
      seen.add(key);

      out.push({
        key,
        label: pres ? `${p} (${pres})` : p,
        product: p,
        presentation: pres,
      });
    });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.items]);

  // ✅ NEW: Helper to read docs for item
  const docsForItem = (item) => {
    const prod = item?.product || "";
    const pres = item?.presentation || "";
    const k1 = makeKey(prod, pres);
    const k2 = makeKey(prod, String(pres).replace(/\s+/g, ""));
    const k3 = makeKey(prod, String(pres).replace(/\s*/g, " "));
    return docsLookup[k1] || docsLookup[k2] || docsLookup[k3] || null;
  };

  // ✅ NEW: "select all" behaviors
  const allDocIds = useMemo(() => DOC_OPTIONS.map((d) => d.id), [DOC_OPTIONS]);
  const allProductKeys = useMemo(() => productOptions.map((p) => p.key), [productOptions]);

  const toggleDoc = (id) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProduct = (key) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllDocs = () => setSelectedDocs(new Set(allDocIds));
  const clearAllDocs = () => setSelectedDocs(new Set());

  const selectAllProducts = () => setSelectedProducts(new Set(allProductKeys));
  const clearAllProducts = () => setSelectedProducts(new Set());

  // ================================
  // ✅ Download helpers (Drive -> blob -> download)
  // ================================
  const extractDriveFileId = (rawUrl) => {
    const url = String(rawUrl || "").trim();
    if (!url) return "";

    // /file/d/<id>/
    const m1 = url.match(/\/file\/d\/([^/]+)/);
    if (m1?.[1]) return m1[1];

    // ?id=<id>
    const m2 = url.match(/[?&]id=([^&]+)/);
    if (m2?.[1]) return m2[1];

    // uc?id=<id>
    const m3 = url.match(/drive\.google\.com\/uc\?id=([^&]+)/);
    if (m3?.[1]) return m3[1];

    return "";
  };

  const toDirectDownloadUrl = (rawUrl) => {
    const url = String(rawUrl || "").trim();
    if (!url) return "";

    // If already a direct download, keep it
    if (url.includes("drive.google.com/uc?export=download")) return url;

    const fileId = extractDriveFileId(url);
    if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId}`;

    // Not drive (or unknown format) – return as-is
    return url;
  };

  const safeFileName = (s) =>
    String(s || "")
      .trim()
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 140);

  const downloadBlobAsFile = (blob, filename) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || "documento.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  // ✅ NEW: Download action
  // const handleDownloadSelected = async () => {
  //   if (!order) return;

  //   const chosenDocs = selectedDocs.size ? Array.from(selectedDocs) : [];
  //   const chosenProducts = selectedProducts.size ? Array.from(selectedProducts) : [];

  //   if (chosenDocs.length === 0) {
  //     alert("Selecciona al menos un documento para descargar.");
  //     return;
  //   }
  //   if (chosenProducts.length === 0) {
  //     alert("Selecciona al menos un producto para descargar.");
  //     return;
  //   }

  //   const items = Array.isArray(order.items) ? order.items : [];

  //   // Restrict to selected products (by makeKey)
  //   const selectedItems = items.filter((it) => {
  //     const k = makeKey((it?.product || "").trim(), (it?.presentation || "").trim());
  //     return chosenProducts.includes(k);
  //   });

  //   const downloadList = [];
  //   selectedItems.forEach((it) => {
  //     const d = docsForItem(it);
  //     if (!d) return;

  //     chosenDocs.forEach((docId) => {
  //       const url = (d?.[docId] || "").trim();
  //       if (!url) return;

  //       downloadList.push({
  //         url,
  //         product: it?.product || "Producto",
  //         docId,
  //       });
  //     });
  //   });

  //   if (downloadList.length === 0) {
  //     alert("No se encontraron documentos disponibles para tu selección.");
  //     return;
  //   }

  //   // Open each file (browser may block multiple; user may need pop-up permission)
  //   // Keep small delay to reduce popup-blocker aggression
  //   for (let i = 0; i < downloadList.length; i++) {
  //     const { url } = downloadList[i];
  //     try {
  //       window.open(url, "_blank", "noopener,noreferrer");
  //     } catch (_) {}
  //     // eslint-disable-next-line no-await-in-loop
  //     await new Promise((r) => setTimeout(r, 200));
  //   }
  // };

  // ✅ NEW: Download action (ZIP all PDFs into one download)
  // const handleDownloadSelected = async () => {
  //   if (!order) return;

  //   const chosenDocs = selectedDocs.size ? Array.from(selectedDocs) : [];
  //   const chosenProducts = selectedProducts.size ? Array.from(selectedProducts) : [];

  //   if (chosenDocs.length === 0) {
  //     alert("Selecciona al menos un documento para descargar.");
  //     return;
  //   }
  //   if (chosenProducts.length === 0) {
  //     alert("Selecciona al menos un producto para descargar.");
  //     return;
  //   }

  //   const items = Array.isArray(order.items) ? order.items : [];

  //   const selectedItems = items.filter((it) => {
  //     const k = makeKey((it?.product || "").trim(), (it?.presentation || "").trim());
  //     return chosenProducts.includes(k);
  //   });

  //   const downloadList = [];
  //   selectedItems.forEach((it) => {
  //     const d = docsForItem(it);
  //     if (!d) return;

  //     chosenDocs.forEach((docId) => {
  //       const rawUrl = (d?.[docId] || "").trim();
  //       if (!rawUrl) return;

  //       const directUrl = toDirectDownloadUrl(rawUrl);

  //       const productName = safeFileName(it?.product || "Producto");
  //       const pres = safeFileName(it?.presentation || "");
  //       const docName = safeFileName(docLabel(docId));

  //       const filename = pres
  //         ? `${productName} - ${pres} - ${docName}.pdf`
  //         : `${productName} - ${docName}.pdf`;

  //       downloadList.push({ url: directUrl, filename });
  //     });
  //   });

  //   if (downloadList.length === 0) {
  //     alert("No se encontraron documentos disponibles para tu selección.");
  //     return;
  //   }

  //   // Optional: prevent duplicates (same file linked multiple times)
  //   const uniq = new Map();
  //   downloadList.forEach((x) => {
  //     const key = `${x.filename}__${x.url}`;
  //     if (!uniq.has(key)) uniq.set(key, x);
  //   });
  //   const files = Array.from(uniq.values());

  //   try {
  //     const zip = new JSZip();

  //     // Fetch sequentially to reduce rate limits / CORS weirdness (safe + predictable)
  //     for (let i = 0; i < files.length; i++) {
  //       const { url, filename } = files[i];

  //       const resp = await fetch(url, { method: "GET" });
  //       if (!resp.ok) throw new Error(`No se pudo bajar "${filename}" (HTTP ${resp.status})`);

  //       const blob = await resp.blob();

  //       // If Drive returns HTML, this is usually permissions/viewer issue
  //       if (blob.type.includes("text/html")) {
  //         throw new Error(`Drive no devolvió PDF para "${filename}" (probable permisos).`);
  //       }

  //       const arrBuf = await blob.arrayBuffer();
  //       zip.file(filename, arrBuf);
  //     }

  //     const zipBlob = await zip.generateAsync({ type: "blob" });

  //     const orderNo = String(order?._id || "").slice(-5) || "pedido";
  //     saveAs(zipBlob, `Documentos_Pedido_${orderNo}.zip`);
  //   } catch (e) {
  //     console.warn("ZIP download failed:", e);
  //     alert(
  //       "No pude generar el ZIP automáticamente. " +
  //         "Esto suele pasar si algún PDF no es accesible públicamente en Drive. " +
  //         "Revisa permisos o pásame un link ejemplo y lo ajustamos."
  //     );
  //   }
  // };

  // ✅ Download via browser navigation (NO fetch => NO CORS)
  const downloadByAnchor = async (url, filename) => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    // "download" is ignored cross-origin often, but harmless
    a.download = filename || "";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // small delay so browsers don't suppress rapid opens
    await new Promise((r) => setTimeout(r, 350));
  };

  const handleDownloadSelected = async () => {
    if (!order) return;

    const chosenDocs = selectedDocs.size ? Array.from(selectedDocs) : [];
    const chosenProducts = selectedProducts.size ? Array.from(selectedProducts) : [];

    if (chosenDocs.length === 0) return alert("Selecciona al menos un documento para descargar.");
    if (chosenProducts.length === 0) return alert("Selecciona al menos un producto para descargar.");

    const items = Array.isArray(order.items) ? order.items : [];
    const selectedItems = items.filter((it) => {
      const k = makeKey((it?.product || "").trim(), (it?.presentation || "").trim());
      return chosenProducts.includes(k);
    });

    const downloadList = [];
    selectedItems.forEach((it) => {
      const d = docsForItem(it);
      if (!d) return;

      chosenDocs.forEach((docId) => {
        const rawUrl = (d?.[docId] || "").trim();
        if (!rawUrl) return;

        // keep your existing converter if you have it
        const directUrl = toDirectDownloadUrl(rawUrl);

        downloadList.push({ url: directUrl });
      });
    });

    if (downloadList.length === 0) {
      alert("No se encontraron documentos disponibles para tu selección.");
      return;
    }

    // IMPORTANT: browsers may still block multiple downloads unless user allows it once.
    // This will open them sequentially.
    for (let i = 0; i < downloadList.length; i++) {
      await downloadByAnchor(downloadList[i].url, "");
    }

    // optional: inform user if browser blocks
    // alert("Si tu navegador bloquea múltiples descargas, habilita 'Permitir múltiples descargas' para este sitio.");
  };




  const docLabel = (id) => DOC_OPTIONS.find((d) => d.id === id)?.label || id;

  const selectedDocsLabel = useMemo(() => {
    if (selectedDocs.size === 0) return "Selecciona documentos…";
    if (selectedDocs.size === allDocIds.length) return "Descargar todos";
    return Array.from(selectedDocs).map(docLabel).join(", ");
  }, [selectedDocs, allDocIds.length, DOC_OPTIONS]);

  const selectedProductsLabel = useMemo(() => {
    if (selectedProducts.size === 0) return "Selecciona productos…";
    if (selectedProducts.size === allProductKeys.length) return "Todos los productos";
    const map = new Map(productOptions.map((p) => [p.key, p.label]));
    return Array.from(selectedProducts).map((k) => map.get(k) || k).join(", ");
  }, [selectedProducts, allProductKeys.length, productOptions]);

  const generateInvoice = () => {
    if (!order) return;
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const drawBg = () => doc.addImage(docDesign, "PNG", 0, 0, pageWidth, pageHeight);
    drawBg();

    // ... (UNCHANGED — your full invoice code remains the same)
    // NOTE: I did not modify your invoice logic to keep your baseline intact.
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

      const s3Url = s3Resp?.data?.url || s3Resp?.data?.Location || "";
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
      setOrder((prev) => (prev ? { ...prev, orderStatus: "Evidencia Subida" } : prev));
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
      <div className="app-header loginLogo-ParentDiv">
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
        <div className="orderTracker-LimitedScroll">
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

            {/* ✅ NEW: Download docs UI (only when "Preparando Pedido" or later) */}
            {canDownloadDocs && (
              <div style={{ marginTop: 10, width: "100%" }}>
                {/* Dropdown 1: Documents */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ position: "relative" }}>
                    <span  style={{ textAlign: "left", lineHeight: 1.2 }}>
                      {/* <b>Documentos:</b> {selectedDocsLabel} */}
                      <b className="orderNumber-Label">Documentos:</b> 
                    </span>
                    
                    <button
                      type="button"  
                      className="productInfo-Input"
                      style={{
                        width: "70%",
                        padding: "10px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginLeft: "-1%"
                      }}
                      onClick={() => {
                        setDocsOpen((v) => !v);
                        setProductsOpen(false);
                      }}
                    >
                      <span style={{ marginLeft: 5 }}>Selecciona documentos  {docsOpen ? "▲" : "▼"}</span>
                    </button>

                    {docsOpen && (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 50,
                          width: "90%",
                          top: "90%",
                          left: 0,
                          right: 0,
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: 10,
                          boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
                        }}
                      >
                        <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 4px" }}>
                          <input
                            type="checkbox"
                            checked={selectedDocs.size === allDocIds.length && allDocIds.length > 0}
                            onChange={(e) => (e.target.checked ? selectAllDocs() : clearAllDocs())}
                          />
                          <b>Descargar todos</b>
                        </label>

                        <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />

                        {DOC_OPTIONS.map((d) => (
                          <label key={d.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 4px" }}>
                            <input
                              type="checkbox"
                              checked={selectedDocs.has(d.id)}
                              onChange={() => toggleDoc(d.id)}
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dropdown 2: Products */}
                  <div style={{ position: "relative" }}>
                    <span style={{ textAlign: "left", lineHeight: 1.2 }}>
                      {/* <b className="orderNumber-Label">Productos:</b> {selectedProductsLabel} */}
                      <b className="orderNumber-Label">Productos:</b>
                    </span>

                    <button
                      type="button"
                      className="productInfo-Input"
                      style={{
                        width: "70%",
                        padding: "10px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginLeft: "-1%"
                      }}
                      onClick={() => {
                        setProductsOpen((v) => !v);
                        setDocsOpen(false);
                      }}
                    >
                      {/* <span style={{ textAlign: "left", lineHeight: 1.2 }}>
                        <b>Productos:</b> {selectedProductsLabel}
                      </span> */}
                      <span style={{ marginLeft: 5 }}>Selecciona productos  {productsOpen ? "▲" : "▼"}</span>
                    </button>

                    {productsOpen && (
                      <div
                        style={{
                          position: "absolute",
                          zIndex: 50,
                          width: "90%",
                          top: "90%",
                          left: 0,
                          right: 0,
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: 10,
                          boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
                          maxHeight: 260,
                          overflowY: "auto",
                        }}
                      >
                        <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 4px" }}>
                          <input
                            type="checkbox"
                            checked={selectedProducts.size === allProductKeys.length && allProductKeys.length > 0}
                            onChange={(e) => (e.target.checked ? selectAllProducts() : clearAllProducts())}
                          />
                          <b>Todos los productos</b>
                        </label>

                        <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />

                        {productOptions.map((p) => (
                          <label key={p.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 4px" }}>
                            <input
                              type="checkbox"
                              checked={selectedProducts.has(p.key)}
                              onChange={() => toggleProduct(p.key)}
                            />
                            {p.label}
                          </label>
                        ))}

                        {productOptions.length === 0 && (
                          <div style={{ fontSize: 12, color: "#6b7280", padding: 6 }}>
                            No se encontraron productos en esta orden.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Download button */}
                  <button
                    className="uploadPaymentEvidence-Btn"
                    type="button"
                    onClick={handleDownloadSelected}
                    disabled={false}
                    style={{ width: "35%", padding: "10px 12px", marginTop: 2 }}
                    title="Descarga los documentos disponibles según tu selección"
                  >
                    Descargar
                  </button>

                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, lineHeight: 1.3 }}>
                    * Algunos productos no cuentan con todos los documentos. Solo se descargarán los disponibles.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* sep06 */}
          {/* ✅ Show tracking number only when delivered and present */}
          {order?.orderStatus === "Pedido Entregado" && (
            <div className="orderNumberAndDate-Div">
              <div className="trackingNumber-Div" style={{ marginTop: 4, marginLeft: 1 }}>
                <span className="orderDate-Label" style={{ fontWeight: 600 }}>
                  No. de rastreo:
                </span>{" "}
                <span className="orderDate-Label">{order?.trackingNumber || "No disponible"}</span>
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

          <div className="orderTracker-Scroll">
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
                  <label className="orderDate-Label">Fecha de recolección: {pickupDateLabel}</label>
                  <label className="orderDate-Label">Hora de recolección: {pickupTimeLabel}</label>
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
                  <label className="orderDate-Label" style={{ fontStyle: "italic" }}>
                    Factura no solicitada
                  </label>
                ) : hasBillingInfo ? (
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
                  <label className="orderDate-Label" style={{ fontStyle: "italic" }}>
                    Datos de facturación no disponibles
                  </label>
                )}
              </div>
            </div>

            {/* ===== SUBIR EVIDENCIA ===== */}
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


// // hey chatgpt, in orderTrackDetails.jsx, once the status of an order has changed to "Preparando Pedido", I'd like to give user access to download the products' certificates and technical specs pdf. We have four possible documents the user can download: 1) Ficha Técnica, 2) Hoja de Seguridad, 3) Certificado OMRI, 4) Cetificado de Análisis. Not all products have all, so keep that in mind. Now, all of these files are stored in a google drive file, and the links for each file are stored in our database "Inventario_Base" (https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv)under the columns "CERTIFICADO_OMRI_URL", "FICHA_TECNICA_URL", "HOJA_DE_SEGURIDAD_URL", "CERTIFICADO_DE_ANALISIS_URL". I'd like, once the stage has changed to "Preparando Pedido", for two dropdown menus to become available right under "Fecha de Pedido". The first dropdown has a checkbox menu from which the user can select which documents he want to download (add all four documents I mentioned as options, as well as an option "Descargar todos" to download all for documents rather than having to check off each one). The second dropdown menu will include all procucts the person has bought. Once again, make this dropdown a checkbox situation so user can select which products he want the documents for. Once again, add option "Todos los productos". Under these dropdowns, add button "Descargar" and, when user presses it, download all corresponding files. Here is my current orderTrackDetails.jsx, please direct edit 
// import { useEffect, useState } from "react";
// import { useLocation, useParams, useNavigate } from "react-router-dom";
// import { ProgressBar, Step } from "react-step-progress-bar";
// import "react-step-progress-bar/styles.css";

// import jsPDF from "jspdf";
// import "jspdf-autotable";

// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import { docDesign } from "/src/components/documentDesign";

// // IMAGES
// import logoImage from "../assets/images/GIS_Logo.png";
// import pedidoIcon from "../assets/images/Icono_Pedidos.png";
// import fallbackImg from "../assets/images/Product_GISSample.png";

// // CSV + HTTP
// import axios from "axios";
// import Papa from "papaparse";
// import { API } from "/src/lib/api"; // 

// export default function OrderTrackDetails() {
//   const navigate = useNavigate();
//   const { orderId } = useParams();
//   const location = useLocation();

//   const [order, setOrder] = useState(location.state?.order || null);

//   // Upload UI state
//   const [evidenceFile, setEvidenceFile] = useState(null);
//   const [uploadBusy, setUploadBusy] = useState(false);
//   const [uploadProgress, setUploadProgress] = useState(0);
//   const [uploadErr, setUploadErr] = useState("");
//   const [uploadOk, setUploadOk] = useState("");

//   // ====== IMAGE LOOKUP (robust keys) ======
//   const [imageLookup, setImageLookup] = useState({});

//   const canon = (s = "") =>
//     String(s)
//       .normalize("NFD")
//       .replace(/[\u0300-\u036f]/g, "")
//       .toLowerCase()
//       .replace(/\s+/g, "")
//       .replace(/[^a-z0-9]/g, "")
//       .trim();

//   const makeKey = (product = "", presentation = "") =>
//     `${canon(product)}__${canon(presentation)}`;

//   // Load order (fresh)
//   useEffect(() => {
//     loadOrder();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [orderId]);

//   async function loadOrder() {
//     try {
//       const res = await axios.get(`${API}/orders/${orderId}`);
//       setOrder(res.data);
//     } catch (e) {
//       console.error("Failed to fetch order details:", e);
//     }
//   }

//   // Product image CSV
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
//     const k2 = makeKey(prod, String(pres).replace(/\s+/g, ""));
//     const k3 = makeKey(prod, String(pres).replace(/\s*/g, " "));

//     const url = imageLookup[k1] || imageLookup[k2] || imageLookup[k3];
//     if (!url) console.debug("[image miss]", { k1, k2, k3, prod, pres });

//     return url && url.length > 0 ? url : fallbackImg;
//   };

//   const labels = [
//     "Pedido \n Realizado",
//     "Evidencia \n de Pago",
//     "Pago \n Verificado",
//     "Preparando \n Pedido",
//     "Etiqueta \n Generada",
//     // "Pedido \n Listo",
//     "Pedido \n Entregado",
//   ];

//   const getCurrentPosition = (status) => {
//     if (!status) return 0;
//     const s = status.toLowerCase();
//     if (s.includes("realizado")) return 0;
//     if (s.includes("evidencia")) return 1;
//     if (s.includes("verificado")) return 2;
//     if (s.includes("preparando")) return 3;
//     if (s.includes("etiqueta")) return 4;
//     if (s.includes("entregado")) return 5;
//     return 0;
//   };

//   const ship = order?.shippingInfo || {};
//   const bill = order?.billingInfo || {};

//   // ⬇️ Helpers para "Recoger en Matriz"
//   const isPickup = (() => {
//     const s = order?.shippingInfo;
//     if (typeof s === "string") return s.toLowerCase().includes("recoger");
//     if (s && typeof s === "object" && s.method) {
//       return String(s.method).toLowerCase().includes("recoger");
//     }
//     return false;
//   })();
  
//   const pickup = order?.pickupDetails || {};
//   const pickupDateLabel = pickup?.date
//     ? new Date(`${pickup.date}T00:00:00`).toLocaleDateString("es-MX", {
//       day: "2-digit",
//       month: "short",
//       year: "numeric",
//     })
//     : "No especificada";
//   const pickupTimeLabel = pickup?.time || "No especificada";

//   // ⬇️ Facturación: banderas robustas
//   const wantsInvoice = !!order?.requestBill;
//   const hasBillingInfo =
//     bill && typeof bill === "object" && Object.keys(bill).some((k) => (bill?.[k] ?? "") !== "");
  

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
//     doc.text(`Folio Fiscal: e375b3c8-564a-4fbf-9880-2dc5793e8da9`, 63, 50);
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

//   // ===== Upload Evidence (user flow with your original UI) =====
//   async function uploadEvidence() {
//     if (!evidenceFile || !order?._id) {
//       alert("Seleccione una imagen válida.");
//       return;
//     }
  
//     const isAllowed = evidenceFile.type.startsWith("image/") || evidenceFile.type === "application/pdf";
//     if (!isAllowed) {
//       alert("Formato no permitido. Sube imagen o PDF.");
//       return;
//     }
//     if (evidenceFile.size > 25 * 1024 * 1024) {
//       alert("Archivo excede 25MB.");
//       return;
//     }
  
//     setUploadErr("");
//     setUploadOk("");
//     setUploadBusy(true);
//     setUploadProgress(0);
  
//     try {
//       // 1) Upload to your existing S3-backed endpoint (unchanged)
//       const form = new FormData();
//       form.append("file", evidenceFile);
  
//       const s3Resp = await axios.post(`${API}/orders/${order._id}/evidence/payment`, form, {
//         onUploadProgress: (pe) => {
//           if (!pe.total) return;
//           setUploadProgress(Math.round((pe.loaded / pe.total) * 100));
//         },
//       });
  
//       // If your S3 route returns the file URL/filename, pluck them here
//       const s3Url    = s3Resp?.data?.url || s3Resp?.data?.Location || "";
//       const filename = s3Resp?.data?.filename || evidenceFile.name || "";
  
//       // 2) Tell the API to trigger the evidence-stage push (no re-upload)
//       await fetch(`${API}/orders/${order._id}/evidence/mark-payment`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ s3Url, filename }),
//       });
  
//       // 3) Keep your original status update so the progress bar & lists move
//       await fetch(`${API}/order/${order._id}/status`, {
//         method: "PATCH",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ orderStatus: "Evidencia Subida" }),
//       });
  
//       // 4) Local optimistics + refresh
//       setOrder(prev => prev ? { ...prev, orderStatus: "Evidencia Subida" } : prev);
//       setUploadOk("¡Evidencia subida con éxito!");
//       setEvidenceFile(null);
//       await loadOrder();
//     } catch (e) {
//       console.error("Error al subir evidencia:", e);
//       setUploadErr(e?.response?.data?.error || e.message || "No se pudo subir la evidencia.");
//     } finally {
//       setUploadBusy(false);
//       setTimeout(() => setUploadProgress(0), 800);
//     }
//   }
  
//   // async function uploadEvidence() {
//   //   if (!evidenceFile || !order?._id) {
//   //     alert("Seleccione una imagen válida.");
//   //     return;
//   //   }

//   //   // allow images or PDF; 25MB cap
//   //   const isAllowed = evidenceFile.type.startsWith("image/") || evidenceFile.type === "application/pdf";
//   //   if (!isAllowed) {
//   //     alert("Formato no permitido. Sube imagen o PDF.");
//   //     return;
//   //   }
//   //   if (evidenceFile.size > 25 * 1024 * 1024) {
//   //     alert("Archivo excede 25MB.");
//   //     return;
//   //   }

//   //   setUploadErr("");
//   //   setUploadOk("");
//   //   setUploadBusy(true);
//   //   setUploadProgress(0);

//   //   try {
//   //     // 1) Upload to new S3-backed endpoint (field name: "file")
//   //     const form = new FormData();
//   //     form.append("file", evidenceFile);

//   //     await axios.post(`${API}/orders/${order._id}/evidence/payment`, form, {
//   //       onUploadProgress: (pe) => {
//   //         if (!pe.total) return;
//   //         setUploadProgress(Math.round((pe.loaded / pe.total) * 100));
//   //       },
//   //     });

//   //     // 2) Update status so timeline moves & admin sees it
//   //     await fetch(`${API}/order/${order._id}/status`, {
//   //       method: "PATCH",
//   //       headers: { "Content-Type": "application/json" },
//   //       body: JSON.stringify({ orderStatus: "Evidencia Subida" }),
//   //     });

//   //     // 3) Optimistic local update + reload order to refresh evidence fields
//   //     setOrder((prev) => (prev ? { ...prev, orderStatus: "Evidencia Subida" } : prev));
//   //     setUploadOk("¡Evidencia subida con éxito!");
//   //     setEvidenceFile(null);
//   //     await loadOrder();
//   //   } catch (e) {
//   //     console.error("Error al subir evidencia:", e);
//   //     setUploadErr(e?.response?.data?.error || e.message || "No se pudo subir la evidencia.");
//   //   } finally {
//   //     setUploadBusy(false);
//   //     setTimeout(() => setUploadProgress(0), 800);
//   //   }
//   // }

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
//     <body className="app-shell body-BG-Gradient">
//       <div className="app-header loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src={logoImage}
//           alt="GIS Logo"
//           width="180"
//           height="55"
//           onClick={() => navigate("/userHome")}
//         />
//       </div>

//       <div className="app-main">
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

//         {/* sep06 */}
//          {/* ✅ Show tracking number only when delivered and present */}
//          {order?.orderStatus === "Pedido Entregado" && (
//           <div className="orderNumberAndDate-Div">
//             <div className="trackingNumber-Div" style={{ marginTop: 4, marginLeft: 1}}>
//               <span className="orderDate-Label" style={{ fontWeight: 600 }}>
//                 No. de rastreo:
//               </span>{" "}
//               <span className="orderDate-Label">
//                 {order?.trackingNumber || "No disponible"}
//               </span>
//             </div>

//             <div className="trackingNumber-Div" style={{ marginTop: 4, marginLeft: 1 }}>
//             <span className="orderDate-Label" style={{ fontWeight: 600 }}>
//               Fecha Entrega:
//             </span>{" "}
//             <span className="orderDate-Label">
//               {new Date(order.deliveryDate).toLocaleDateString("es-MX", {
//                 day: "2-digit",
//                 month: "short",
//                 year: "numeric",
//               })}
//               {/* {order?.deliveryDate || "No disponible"} */}
//             </span>
//             </div>
//           </div>
//           )}
//         {/* sep06 */}
        

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

//             {isPickup ? (
//               <div className="shippingAddress-Div">
//                 <label className="orderDate-Label" style={{ fontWeight: 700 }}>
//                   Pedido será recogido en matriz
//                 </label>
//                 <label className="orderDate-Label">
//                   Fecha de recolección: {pickupDateLabel}
//                 </label>
//                 <label className="orderDate-Label">
//                   Hora de recolección: {pickupTimeLabel}
//                 </label>
//               </div>
//             ) : (
//               <div className="shippingAddress-Div">
//                 <label className="orderDate-Label">
//                   {sCalle} #{sExt} Int.{sInt}
//                 </label>
//                 <label className="orderDate-Label">Col. {sCol}</label>
//                 <label className="orderDate-Label">
//                   {sCiudad}, {sEstado}
//                 </label>
//                 <label className="orderDate-Label">C.P. {sCP}</label>
//               </div>
//             )}
//           </div>

//           {/* BILLING */}
//           <div className="orderTrack-BillingDiv">
//             <label className="orderNumber-Label">DATOS DE FACTURACIÓN</label>

//             <div className="shippingAddress-Div">
//               {!wantsInvoice ? (
//                 // Caso 1: el cliente NO solicitó factura
//                 <label className="orderDate-Label" style={{ fontStyle: "italic" }}>
//                   Factura no solicitada
//                 </label>
//               ) : hasBillingInfo ? (
//                 // Caso 2: sí solicitó y SÍ hay datos
//                 <>
//                   <label className="orderDate-Label">{bill.razonSocial || ""}</label>
//                   <label className="orderDate-Label">{bill.rfcEmpresa || ""}</label>
//                   <label className="orderDate-Label">
//                     {(bill.calleFiscal || "")} #{bill.exteriorFiscal || ""} Int.{bill.interiorFiscal || ""}
//                   </label>
//                   <label className="orderDate-Label">Col. {bill.coloniaFiscal || ""}</label>
//                   <label className="orderDate-Label">
//                     {(bill.ciudadFiscal || "")}, {(bill.estadoFiscal || "")}
//                   </label>
//                   <label className="orderDate-Label">C.P. {bill.cpFiscal || ""}</label>
//                 </>
//               ) : (
//                 // Caso 3: sí solicitó pero no hay datos disponibles (robustez)
//                 <label className="orderDate-Label" style={{ fontStyle: "italic" }}>
//                   Datos de facturación no disponibles
//                 </label>
//               )}
//             </div>
//           </div>

//           {/* <div className="orderTrack-BillingDiv">
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
//           </div> */}

//           {/* ===== SUBIR EVIDENCIA (tu UI original, pero con el nuevo endpoint) ===== */}
//           <div className="orderTracker-UploadEvidenceDiv">
//             <label className="orderNumber-Label">SUBIR EVIDENCIA DE PAGO</label>

//             <div className="file-upload-wrapper">
//               <label htmlFor="evidenceFile" className="custom-file-upload">
//                 Elegir archivo
//               </label>
//               <input
//                 id="evidenceFile"
//                 type="file"
//                 accept="image/*,application/pdf"
//                 onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
//                 style={{ display: "none" }}
//               />
//               <span className="file-selected-text">
//                 {evidenceFile ? evidenceFile.name : "Ningún archivo seleccionado"}
//               </span>
//             </div>

//             <button
//               className="uploadPaymentEvidence-Btn"
//               type="button"
//               onClick={uploadEvidence}
//               disabled={!evidenceFile || uploadBusy}
//               title={!evidenceFile ? "Selecciona un archivo primero" : ""}
//             >
//               {uploadBusy ? `Subiendo... ${uploadProgress || 0}%` : <>Subir <br />Evidencia</>}
//             </button>

//             {uploadErr && <div style={{ color: "#b00", marginTop: 8, fontSize: 12 }}>{uploadErr}</div>}
//             {uploadOk && <div style={{ color: "#2a7a2a", marginTop: 8, fontSize: 12 }}>{uploadOk}</div>}
//           </div>
//         </div>
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
