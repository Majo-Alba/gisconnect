import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png"
import Papa from "papaparse";
import fallbackImg from "../assets/images/Product_GISSample.png";

import { API } from "/src/lib/api";

export default function QuoteDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();

  const [quote, setQuote] = useState(location.state?.quote || null);
  const [loading, setLoading] = useState(!location.state?.quote);

  // === NEW: client display name from Mongo ===
  const [clientDisplayName, setClientDisplayName] = useState("");

  // === product-image lookup (same logic as orderNow.jsx) ===
  const [imageLookup, setImageLookup] = useState({});
  const makeKey = (name = "", pres = "") =>
    `${String(name).trim().toLowerCase()}__${String(pres).trim().toLowerCase()}`;

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
              const pres = (row.PESO_PRODUCTO || "") + (row.UNIDAD_MEDICION || "");
              const img = row.IMAGE_URL || row.IMAGE || "";
              if (name && pres && img) {
                map[makeKey(name, pres)] = img;
              }
            });
            setImageLookup(map);
          },
        });
      })
      .catch((err) => console.error("Error fetching product CSV for images:", err));
  }, []);

  const getItemImage = (item) => {
    const url = imageLookup[makeKey(item.product, item.presentation)];
    return url && url.length > 0 ? url : fallbackImg;
  };

  const goHomeLogo = () => navigate("/adminHome");
  function goToAdminHome() { navigate("/adminHome"); }
  function goToNewOrders() { navigate("/newOrders"); }
  function goToPackageReady() { navigate("/deliverReady"); }

  useEffect(() => {
    if (quote) return;
    let mounted = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/pdfquotes/${id}`);
        if (mounted) setQuote(data);
      } catch (e) {
        console.error("Failed to fetch quote detail:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id, quote]);

  const fmtMoney = (n) =>
    typeof n === "number"
      ? n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";

  if (loading || !quote) {
    return (
      <body className="body-BG-Gradient">
        <div className="loginLogo-ParentDiv">
          <img
            className="secondaryPages-GISLogo"
            src={Logo}
            alt="Home Icon"
            width="180"
            height="55"
            onClick={goHomeLogo}
          />
        </div>
        <label className="sectionHeader-Label">Detalle de Cotización</label>
        <div className="newQuotesScroll-Div">
          <div className="summary-Label">Cargando detalle…</div>
        </div>
      </body>
    );
  }

  const created =
    new Date(quote.createdAt || quote.metadata?.createdAt || Date.now());

  const meta = quote.metadata || {};
  const items = Array.isArray(meta.items) ? meta.items : [];
  const totals = meta.totals || {};

  // === NEW: fetch client name via /users/by-email ===
  const quotedEmail = (meta.userEmail || quote.userEmail || "").trim().toLowerCase();
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (!quotedEmail) return;
        const res = await fetch(`${API}/users/by-email?email=${encodeURIComponent(quotedEmail)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) throw new Error("User not found");
        const user = await res.json();
        const full = `${user?.nombre || ""} ${user?.apellido || ""}`.trim();
        if (!cancel) setClientDisplayName(full || quotedEmail);
      } catch {
        if (!cancel) setClientDisplayName(quotedEmail || "—");
      }
    })();
    return () => { cancel = true; };
  }, [quotedEmail]);

  // === Currency / totals helpers (same logic pattern you used) ===
  const preferredCurrency = String(
    (quote?.preferredCurrency ?? totals?.preferredCurrency ?? localStorage.getItem("preferredCurrency") ?? "USD")
  ).toUpperCase();

  const dofRate = Number(totals?.dofRate) || null;
  const dofDate = totals?.dofDate || null;
  const wantsInvoice = !!(quote?.wantsInvoice ?? totals?.ivaApplied);

  const fmtUSD = (v) => `$${(Number(v) || 0).toFixed(2)} USD`;
  const fmtMXN = (v) =>
    `$${(Number(v) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

  const {
    subtotalUSD,
    subtotalMXN,
    isMixed, hasUSD, hasMXN,
    splitUSD_withIVA,
    splitMXN_withIVA,
    grandMXN_withIVA,
    usdInMXN_detail,
  } = (() => {
    let usd = 0;
    let mxn = 0;

    (items || []).forEach((it) => {
      const qty = Number(it.amount) || 0;
      const cur = String(it.currency || "USD").toUpperCase();
      if (cur === "MXN") {
        const unit = Number(it.priceMXN ?? it.price);
        if (Number.isFinite(unit)) mxn += qty * unit;
      } else {
        const unit = Number(it.priceUSD ?? it.price);
        if (Number.isFinite(unit)) usd += qty * unit;
      }
    });

    const addIVA = (v) => (wantsInvoice ? v * 1.16 : v);
    const mixed = usd > 0 && mxn > 0;

    const usdWithIVA = addIVA(usd);
    const mxnWithIVA = addIVA(mxn);

    let usdToMXN = null;
    let mxnGrand = null;
    if (dofRate && Number.isFinite(dofRate)) {
      usdToMXN = usd * dofRate;
      mxnGrand = addIVA(mxn + usdToMXN);
    }

    return {
      subtotalUSD: usd,
      subtotalMXN: mxn,
      isMixed: mixed,
      hasUSD: usd > 0,
      hasMXN: mxn > 0,
      splitUSD_withIVA: usdWithIVA,
      splitMXN_withIVA: mxnWithIVA,
      grandMXN_withIVA: mxnGrand,
      usdInMXN_detail: usdToMXN,
    };
  })();

  const fileUrl =
    quote.fileUrl || `${API}/pdfquotes/${quote._id}/file`;

  return (
    <body className="body-BG-Gradient">
      {/* Header */}
      <div className="loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Home Icon"
          width="180"
          height="55"
          onClick={goHomeLogo}
        />
      </div>

      <label className="sectionHeader-Label">Detalle de Cotización</label>

      <div className="quoteDetails-ScrollDiv" style={{ padding: 16 }}>
        {/* Top summary */}
        <div className="quoteDetails-Div" style={{ cursor: "default" }}>
          <div className="summary-Label" style={{ textAlign: "left" }}>
            <b>Cliente:</b>{" "}
            {clientDisplayName || quotedEmail || "—"}
            <br />
            <br />
            <b>Fecha:</b>{" "}
            {created.toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}{" "}
            {created.toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>

        {/* Resumen de orden (ITEMS ONLY) */}
        <div className="headerAndDets-Div">
          <label className="orderSummary-Label">Resumen de orden</label>
        </div>

        <div className="products-Div">
          <ul>
            {items.length === 0 && (
              <div className="orderDate-Label" style={{ padding: "8px 0" }}>
                Sin artículos registrados.
              </div>
            )}

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

                  {/* === INDEPENDENT MINI-BOX: Financial Summary (outside of items) === */}
        <div className="orderNow-summaryDiv" style={{ marginTop: 12 }}>
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
              if (isMixed) {
                rows.push({
                  label: "Tipo de Cambio (referencia):",
                  value: dofRate
                    ? `${dofRate.toFixed(4)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
                    : "—",
                  boldLabel: true,
                });
              }
            } else {
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
                      ? `USD (${fmtUSD(subtotalUSD)}) × ${Number(dofRate).toFixed(4)} = ${fmtMXN(usdInMXN_detail)}; + MXN nativo ${fmtMXN(subtotalMXN)}`
                      : "No se pudo obtener el tipo de cambio DOF; no es posible calcular el total global en MXN.",
                });
                rows.push({
                  label: "Tipo de cambio:",
                  value: dofRate
                    ? `${dofRate.toFixed(4)} MXN/USD${dofDate ? ` (DOF ${dofDate})` : ""}`
                    : "—",
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
        </div>

        {/* Actions */}
        <div className="orderReqBts-Div" style={{ marginTop: 16, gap: 12 }}>
          <a
            className="quoteDetails-ViewPDFBtn"
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Descargar PDF
          </a>
        </div>
      </div>

      {/* FOOTER MENU */}
      <div className="footerMenuDiv">
        <div className="footerHolder">
          <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
            <label className="footerIcon-Name">ORDENES</label>
          </div>
          <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
            <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons"/>
            <label className="footerIcon-Name">ENTREGAR</label>
          </div>
        </div>
      </div>
      {/* FOOTER MENU END */}
    </body>
  );
}