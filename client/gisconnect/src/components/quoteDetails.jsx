import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png"

import { API } from "/src/lib/api";

export default function QuoteDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();

  const [quote, setQuote] = useState(location.state?.quote || null);
  const [loading, setLoading] = useState(!location.state?.quote);

  const goBack = () => navigate(-1);
  const goHomeLogo = () => navigate("/adminHome");

    function goToAdminHome() {
        navigate("/adminHome")
    }

    function goToNewOrders() {
        navigate("/newOrders")
    }

    function goToPackageReady() {
        navigate("/deliverReady")
    }

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
    return () => {
      mounted = false;
    };
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

  // Provide a file URL or a route that streams the PDF by id.
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
            {meta.userEmail || quote.userEmail || "—"}
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

        {/* Items */}
        <div className="orderNumberAndDate-Div" style={{ marginTop: 20 }}>
          <label className="orderNumber-Label">ARTÍCULOS</label>
          <div style={{ padding: "8px 0" }}>
            {items.length === 0 && (
              <div className="orderDate-Label">Sin artículos registrados.</div>
            )}
            {items.map((it, idx) => {
              const unitCur = (it.currency || "USD").toUpperCase();
              const unit =
                unitCur === "MXN"
                  ? `$${fmtMoney(Number(it.priceMXN ?? it.price))} MXN`
                  : `$${fmtMoney(Number(it.priceUSD ?? it.price))} USD`;
              const line =
                unitCur === "MXN"
                  ? `$${fmtMoney((Number(it.amount) || 0) * Number(it.priceMXN ?? it.price))} MXN`
                  : `$${fmtMoney((Number(it.amount) || 0) * Number(it.priceUSD ?? it.price))} USD`;

              return (
                <div key={idx}>
                  <div className="orderDetails-Div">
                    <label className="orderDets-Label">
                      <b>{it.product}</b>
                    </label>
                    <label className="orderDets-Label">
                      <b>Presentación:</b> {it.presentation}
                      {it.packPresentation ? ` — ${it.packPresentation}` : ""}
                    </label>
                    <label className="orderDets-Label">
                      <b>Cantidad:</b> {it.amount}
                    </label>
                    <label className="orderDets-Label">
                      <b>Precio Unitario:</b> {unit}
                    </label>
                    <label className="orderDetsTotal-Label">
                      <b>Total:</b> {line}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* here */}
        <div className="quoteDetails-TotalsDiv">
            <div className="summary-Label" style={{ textAlign: "right" }}>
                <b>Total USD:</b>{" "}
                {typeof totals.allUSD === "number"
                ? `$${fmtMoney(totals.allUSD)} USD`
                : typeof totals.totalUSD === "number"
                ? `$${fmtMoney(totals.totalUSD)} USD`
                : "—"}
                <br />
                <b>Total MXN:</b>{" "}
                {typeof totals.allMXN === "number"
                ? `$${fmtMoney(totals.allMXN)} MXN`
                : typeof totals.totalMXN === "number"
                ? `$${fmtMoney(totals.totalMXN)} MXN`
                : "—"}
                <br />
                {(totals?.dofRate || totals?.dofDate) && (
                <div className="orderNumberAndDate-Div" style={{ marginTop: 10 }}>
                <b>Tipo de Cambio:</b>
                <div className="orderNow-Label" style={{ marginTop: 6 }}>
                    {totals?.dofRate
                        ? `${Number(totals.dofRate).toFixed(2)} MXN/USD ${
                            totals.dofDate ? ` (DOF ${totals.dofDate})` : ""
                        }`
                        : "—"}
                    </div>
                </div>
                )}
            </div>
        </div>
        {/* end */}


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
                    {/* HOME FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
                        <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
                        <label className="footerIcon-Name">PRINCIPAL</label>
                    </div>

                    {/* USER FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
                        <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
                        <label className="footerIcon-Name">ORDENES</label>
                    </div>

                    {/* SETTINGS FOOTER DIV */}
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
