import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png"

import { API } from "/src/lib/api";

export default function NewQuotes() {
  const navigate = useNavigate();

  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRange, setFilterRange] = useState("Filtrar por..."); // Día | Semana | Mes | Bimestre | Trimestre | Semestre

  // NEW: cache for "email -> nombre completo"
  const [namesByEmail, setNamesByEmail] = useState({}); // { [emailLower]: "Nombre Apellido" }

  const goHomeLogo = () => navigate("/adminHome");
  function goToAdminHome() { navigate("/adminHome"); }
  function goToNewOrders() { navigate("/newOrders"); }
  function goToPackageReady() { navigate("/deliverReady"); }

  // Fetch all pdfquotes from backend
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/pdfquotes`);
        if (mounted) setQuotes(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Failed to fetch pdfquotes:", e);
        if (mounted) setQuotes([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // NEW: When quotes arrive, fetch display names for each unique email (once)
  useEffect(() => {
    const emails = Array.from(
      new Set(
        (quotes || [])
          .map((q) => (q.metadata?.userEmail || q.userEmail || "").trim().toLowerCase())
          .filter((e) => e && e !== "sin correo")
      )
    );

    // which emails are not cached yet?
    const toFetch = emails.filter((e) => !(e in namesByEmail));
    if (toFetch.length === 0) return;

    let cancelled = false;

    (async () => {
      const updates = {};
      await Promise.all(
        toFetch.map(async (email) => {
          try {
            const res = await axios.get(`${API}/users/by-email`, {
              params: { email },
            });
            const u = res?.data || {};
            const nombre = (u.nombre || "").toString().trim();
            const apellido = (u.apellido || "").toString().trim();
            const full = [nombre, apellido].filter(Boolean).join(" ");
            if (full) updates[email] = full; // only set if we have at least one part
          } catch (err) {
            // 404 or other error → leave it unmapped; we'll fall back to raw email
          }
        })
      );

      if (!cancelled && Object.keys(updates).length > 0) {
        setNamesByEmail((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => { cancelled = true; };
  }, [quotes, namesByEmail]);

  // Helpers
  const asDate = (v) => (v ? new Date(v) : null);
  const fmtMoney = (n) =>
    typeof n === "number"
      ? n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";

  const calcStartDate = useMemo(() => {
    const now = new Date();
    const d = new Date(now);
    switch (filterRange) {
      case "Día":
        d.setDate(now.getDate() - 1); return d;
      case "Semana":
        d.setDate(now.getDate() - 7); return d;
      case "Mes":
        d.setMonth(now.getMonth() - 1); return d;
      case "Bimestre":
        d.setMonth(now.getMonth() - 2); return d;
      case "Trimestre":
        d.setMonth(now.getMonth() - 3); return d;
      case "Semestre":
        d.setMonth(now.getMonth() - 6); return d;
      default:
        return null; // no filter
    }
  }, [filterRange]);

  const filteredQuotes = useMemo(() => {
    if (!calcStartDate) return quotes;
    const startTs = +calcStartDate;
    return quotes.filter((q) => {
      const d = asDate(q.createdAt) || asDate(q.metadata?.createdAt);
      return d ? +d >= startTs : false;
    });
  }, [quotes, calcStartDate]);

  const openDetails = (q) => {
    navigate(`/quoteDetails/${q._id}`, { state: { quote: q } });
  };

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

      <label className="sectionHeader-Label">Nuevas Cotizaciones</label>

      {/* Filter */}
      <div>
        <select
          className="sectionFilter-Dropdown"
          value={filterRange}
          onChange={(e) => setFilterRange(e.target.value)}
        >
          <option>Filtrar por...</option>
          <option>Día</option>
          <option>Semana</option>
          <option>Mes</option>
          <option>Bimestre</option>
          <option>Trimestre</option>
          <option>Semestre</option>
        </select>
      </div>

      {/* List */}
      <div className="newQuotesScroll-Div" style={{ minHeight: 200 }}>
        {loading && <div className="summary-Label">Cargando cotizaciones…</div>}

        {!loading && filteredQuotes.length === 0 && (
          <div className="summary-Label">No hay cotizaciones en el rango seleccionado.</div>
        )}

        {!loading &&
          filteredQuotes.map((q) => {
            const emailRaw = q.metadata?.userEmail || q.userEmail || "sin correo";
            const emailKey = emailRaw.trim().toLowerCase();
            // Prefer "Nombre Apellido" if fetched; otherwise show email
            const displayName = namesByEmail[emailKey] || emailRaw;

            const when =
              asDate(q.createdAt) || asDate(q.metadata?.createdAt) || new Date();
            const totals = q.metadata?.totals || {};
            const amount =
              typeof totals.allUSD === "number"
                ? `$${fmtMoney(totals.allUSD)} USD`
                : typeof totals.totalUSD === "number"
                ? `$${fmtMoney(totals.totalUSD)} USD`
                : typeof totals.totalMXN === "number"
                ? `$${fmtMoney(totals.totalMXN)} MXN`
                : typeof totals.allMXN === "number"
                ? `$${fmtMoney(totals.allMXN)} MXN`
                : "—";

            return (
              <div
                key={q._id}
                className="quoteDetails-Div"
                onClick={() => openDetails(q)}
                style={{ cursor: "pointer" }}
              >
                <label className="summary-Label">
                  {displayName}
                  <br />
                  <span style={{ fontSize: 12, color: "#666" }}>
                    {when.toLocaleDateString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    {when.toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </label>
                <label className="summary-Label">{amount}</label>
              </div>
            );
          })}
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