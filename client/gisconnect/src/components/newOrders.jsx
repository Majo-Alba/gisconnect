import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";

import { API } from "/src/lib/api";

export default function NewOrders() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filter, setFilter] = useState("today");
  const [searchName, setSearchName] = useState("");

  // ===== Client DB (Google Sheets CSV) =====
  const [csvData, setCsvData] = useState([]);

  // NEW: cache for mongo lookups: email -> "Nombre Apellido"
  const [namesByEmail, setNamesByEmail] = useState({});

  useEffect(() => {
    fetchOrders();
    fetchCSVData();
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, searchName, csvData, namesByEmail]);

  // After orders load/update, fetch missing names from Mongo once per unique email
  useEffect(() => {
    if (!orders || orders.length === 0) return;

    const uniqueEmails = Array.from(
      new Set(
        orders
          .map((o) => String(o.userEmail || "").trim().toLowerCase())
          .filter((e) => e)
      )
    );

    const toFetch = uniqueEmails.filter((e) => !(e in namesByEmail));
    if (toFetch.length === 0) return;

    let cancelled = false;

    (async () => {
      const updates = {};
      await Promise.all(
        toFetch.map(async (email) => {
          try {
            const res = await axios.get(`${API}/users/by-email`, { params: { email } });
            const u = res?.data || {};
            const nombre = (u.nombre || "").toString().trim();
            const apellido = (u.apellido || "").toString().trim();
            const full = [nombre, apellido].filter(Boolean).join(" ");
            if (full) updates[email] = full;
          } catch (_err) {
            // ignore (404 or other), we'll fall back to CSV/email
          }
        })
      );

      if (!cancelled && Object.keys(updates).length > 0) {
        setNamesByEmail((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => { cancelled = true; };
  }, [orders, namesByEmail]);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API}/orders`);
      setOrders(response.data || []);
    } catch (err) {
      console.error("Error fetching orders", err);
      setOrders([]);
    }
  };

  const fetchCSVData = () => {
    const csvUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
    axios
      .get(csvUrl)
      .then((res) => {
        const parsed = parseCSV(res.data);
        setCsvData(parsed || []);
      })
      .catch((error) => {
        console.error("Error fetching client CSV:", error);
        setCsvData([]);
      });
  };

  function parseCSV(csvText) {
    const rows = String(csvText || "").split(/\r?\n/).filter(Boolean);
    if (rows.length === 0) return [];
    const headers = rows[0].split(",");
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const parts = rows[i].split(",");
      const obj = {};
      headers.forEach((h, j) => (obj[h] = parts[j] ?? ""));
      out.push(obj);
    }
    return out;
  }

  // Build a lookup from CSV: email -> { name, company }
  const emailToClient = useMemo(() => {
    const map = {};
    const norm = (s) => String(s || "").trim().toLowerCase();
    csvData.forEach((row) => {
      const email = norm(row.CORREO_EMPRESA);
      if (!email) return;
      map[email] = {
        name: row.NOMBRE_APELLIDO || "",
        company: row.NOMBRE_EMPRESA || "",
      };
    });
    return map;
  }, [csvData]);

  // Prefer Mongo full name; fallback to CSV name; fallback to raw email
  const displayForEmail = (email) => {
    const key = String(email || "").trim().toLowerCase();
    return namesByEmail[key] || emailToClient[key]?.name || email || "";
  };

  const companyForEmail = (email) => {
    const key = String(email || "").trim().toLowerCase();
    return emailToClient[key]?.company || "";
  };

  const applyFilters = () => {
    const now = new Date();
    const current = new Date();
    const startOfDay = new Date(current.setHours(0, 0, 0, 0));

    let filtered = [...orders];

    // Only orders waiting validation: "Evidencia Subida"
    filtered = filtered.filter((order) => order.orderStatus === "Evidencia Subida");

    // Time filter
    if (filter !== "all") {
      filtered = filtered.filter((order) => {
        const orderDate = new Date(order.orderDate);
        switch (filter) {
          case "today":
            return orderDate >= startOfDay;
          case "week": {
            const startOfWeek = new Date();
            startOfWeek.setDate(now.getDate() - now.getDay());
            return orderDate >= startOfWeek;
          }
          case "month":
            return (
              orderDate.getMonth() === now.getMonth() &&
              orderDate.getFullYear() === now.getFullYear()
            );
          case "bimester": {
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
            return orderDate >= twoMonthsAgo;
          }
          case "semester": {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            return orderDate >= sixMonthsAgo;
          }
          default:
            return true;
        }
      });
    }

    // Search by client (name/company/email)
    if (searchName) {
      const q = searchName.toLowerCase();
      filtered = filtered.filter((order) => {
        const email = String(order.userEmail || "");
        const name = displayForEmail(email);
        const company = companyForEmail(email);
        return (
          email.toLowerCase().includes(q) ||
          String(name).toLowerCase().includes(q) ||
          String(company).toLowerCase().includes(q)
        );
      });
    }

    setFilteredOrders(filtered);
  };

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  // (kept) Computes final totals in USD/MXN
  const computeDisplayTotals = (order) => {
    if (!order) return { finalUSD: null, finalMXN: null };

    const t = order.totals || {};
    const dofRate = Number(t.dofRate) || null;          // MXN per USD
    const requestBill = !!order.requestBill;            // IVA?
    const discountUSD = Number(t.discountUSD || 0);     // discount tracked in USD

    if (Number.isFinite(t.finalAllUSD) || Number.isFinite(t.finalAllMXN)) {
      return {
        finalUSD: Number.isFinite(t.finalAllUSD) ? Number(t.finalAllUSD) : null,
        finalMXN: Number.isFinite(t.finalAllMXN) ? Number(t.finalAllMXN) : null,
      };
    }

    const items = Array.isArray(order.items) ? order.items : [];
    let usdNative = 0;
    let mxnNative = 0;

    items.forEach((it) => {
      const qty = Number(it.amount) || 0;
      const cur = (it.currency || "USD").toUpperCase();
      if (cur === "MXN") {
        const unit = Number(it.priceMXN ?? it.price);
        if (Number.isFinite(unit)) mxnNative += qty * unit;
      } else {
        const unit = Number(it.priceUSD ?? it.price);
        if (Number.isFinite(unit)) usdNative += qty * unit;
      }
    });

    const allUSD = dofRate ? usdNative + mxnNative / dofRate : null;
    const allMXN = dofRate ? mxnNative + usdNative * dofRate : null;

    const finalUSD = allUSD == null
      ? null
      : requestBill
        ? (allUSD - discountUSD) * 1.16
        : (allUSD - discountUSD);

    const finalMXN = (allMXN == null || !dofRate)
      ? null
      : requestBill
        ? (allMXN - discountUSD * dofRate) * 1.16
        : (allMXN - discountUSD * dofRate);

    return {
      finalUSD: Number.isFinite(finalUSD) ? Number(finalUSD) : null,
      finalMXN: Number.isFinite(finalMXN) ? Number(finalMXN) : null,
    };
  };

  return (
    <body className="body-BG-Gradient">
      {/* LOGO */}
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

      <div>
        <label className="sectionHeader-Label">Nuevas Ordenes</label>

        <div className="searchFilters-Div">
          <input
            className="sectionFilter-Client"
            type="text"
            placeholder="Buscar por cliente"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
          />
          <select
            className="sectionFilter-Date"
            required
            onChange={(e) => setFilter(e.target.value)}
            value={filter}
          >
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
            <option value="bimester">Bimestre</option>
            <option value="semester">Semestre</option>
            <option value="all">Todo</option>
          </select>
        </div>

        <ul>
          {filteredOrders.map((order) => {
            const { finalUSD, finalMXN } = computeDisplayTotals(order);
            const displayName = displayForEmail(order.userEmail);
            return (
              <li
                key={order._id}
                onClick={() => navigate(`/newOrders/${order._id}`)}
              >
                <div className="orderQuickDetails-Div">
                  <label className="orderQuick-Label">
                    No. {String(order._id).slice(-5)}
                  </label>
                  <label className="orderQuick-Label">
                    {order.orderDate
                      ? (() => {
                          const date = new Date(order.orderDate);
                          const day = date.getDate().toString().padStart(2, "0");
                          const month = date.toLocaleString("en-MX", { month: "short" });
                          const year = date.getFullYear();
                          return `${day}/${month}/${year}`;
                        })()
                      : "Sin fecha"}
                  </label>
                  <label className="orderQuick-Label">
                    {displayName}
                  </label>

                  {/* If you want to show totals, uncomment:
                  <label className="orderQuick-Label">
                    {finalUSD != null ? `$${finalUSD.toFixed(2)} USD` : "—"}
                  </label>
                  {finalMXN != null && (
                    <label className="orderQuick-Label" style={{ display: "block", opacity: 0.8 }}>
                      {`$${finalMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`}
                    </label>
                  )} */}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* FOOTER */}
      <div className="footerMenuDiv">
        <div className="footerHolder">
          <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons" />
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>

          <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
            <label className="footerIcon-Name">ORDENES</label>
          </div>

          <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
            <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
            <label className="footerIcon-Name">ENTREGAR</label>
          </div>
        </div>
      </div>
    </body>
  );
}