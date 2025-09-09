import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import Logo from "/src/assets/images/GIS_Logo.png";
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { API } from "/src/lib/api";

export default function PendingPack() {
  const navigate = useNavigate();

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");

  // ===== Client DB (Google Sheets CSV) =====
  const [csvData, setCsvData] = useState([]);

  // ===== Mongo users (email -> { name, company }) =====
  const [mongoUsers, setMongoUsers] = useState({}); // { [email]: { name, company } }

  useEffect(() => {
    fetchOrders();
    fetchCSVData();
  }, []);

  useEffect(() => {
    // After orders arrive, fetch Mongo user info for involved emails (deduped)
    const emails = Array.from(
      new Set(
        (orders || [])
          .map((o) => String(o.userEmail || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (emails.length === 0) return;

    // Only fetch missing ones
    const missing = emails.filter((e) => !mongoUsers[e]);

    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.allSettled(
          missing.map((email) =>
            axios.get(`${API}/users/by-email`, { params: { email } })
          )
        );

        const next = { ...mongoUsers };
        results.forEach((res, idx) => {
          const email = missing[idx];
          if (res.status === "fulfilled") {
            const u = res.value?.data || {};
            const nombre = (u.nombre || "").toString().trim();
            const apellido = (u.apellido || "").toString().trim();
            const empresa = (u.empresa || "").toString().trim();
            const full = [nombre, apellido].filter(Boolean).join(" ");
            next[email] = {
              name: full || email,
              company: empresa || "",
            };
          } else {
            // keep absent; we’ll fall back to CSV/email
          }
        });

        if (!cancelled) setMongoUsers(next);
      } catch {
        // ignore — fallbacks will handle display
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API}/orders`);
      const pagoVerificado = (response.data || []).filter(
        (order) => order.orderStatus === "Pago Verificado"
      );
      setOrders(pagoVerificado);
    } catch (error) {
      console.error("Error fetching orders:", error);
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

  // Build lookup: email -> { name, company } from CSV (fallback)
  const emailToClientCSV = useMemo(() => {
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

  // Prefer Mongo full name → CSV → email
  const displayForEmail = (email) => {
    const key = String(email || "").trim().toLowerCase();
    const mongoHit = mongoUsers[key];
    if (mongoHit?.name) return mongoHit.name;

    const csvHit = emailToClientCSV[key];
    if (csvHit?.name) return csvHit.name;

    return email || "";
  };

  // Optional company display helper (Mongo first → CSV)
  const companyForEmail = (email) => {
    const key = String(email || "").trim().toLowerCase();
    const mongoHit = mongoUsers[key];
    if (mongoHit?.company) return mongoHit.company;

    const csvHit = emailToClientCSV[key];
    if (csvHit?.company) return csvHit.company;

    return "";
  };

  // Homologated “final USD” extraction (same idea as NewOrders.jsx) — kept in case you need it later
  const getFinalUSD = (order) => {
    const t = order?.totals;
    if (t && typeof t === "object" && !Array.isArray(t)) {
      if (typeof t.finalAllUSD === "number") return t.finalAllUSD;
      if (typeof t.totalAllUSD === "number") return t.totalAllUSD;
    }
    if (Array.isArray(t) && t[0]) {
      if (typeof t[0].finalAllUSD === "number") return t[0].finalAllUSD;
      if (typeof t[0].totalAllUSD === "number") return t[0].totalAllUSD;
    }
    if (typeof order?.finalAllUSD === "number") return order.finalAllUSD;
    if (typeof order?.totalCost === "number") return order.totalCost;
    return 0;
  };

  const handleFilterChange = (event) => {
    setFilter(event.target.value);
  };

  const goToPackDetails = (order) => {
    navigate(`/packDetails/${order._id}`);
  };

  // Apply frontend time filter
  const filteredOrders = orders.filter((order) => {
    const orderDate = new Date(order.orderDate);
    const now = new Date();

    switch (filter) {
      case "Día":
        return orderDate.toDateString() === now.toDateString();
      case "Semana": {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        return orderDate >= startOfWeek;
      }
      case "Mes":
        return (
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        );
      case "Bimestre": {
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        return orderDate >= twoMonthsAgo;
      }
      case "Trimestre": {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        return orderDate >= threeMonthsAgo;
      }
      case "Semestre": {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        return orderDate >= sixMonthsAgo;
      }
      default:
        return true;
    }
  });

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

      <label className="sectionHeader-Label">Por Empacar</label>

      <div>
        <select className="sectionFilter-Dropdown" onChange={handleFilterChange}>
          <option>Filtrar por...</option>
          <option>Día</option>
          <option>Semana</option>
          <option>Mes</option>
          <option>Bimestre</option>
          <option>Trimestre</option>
          <option>Semestre</option>
        </select>
      </div>

      {/* LIST — homologated styles with NewOrders.jsx */}
      <ul>
        {filteredOrders.map((order) => {
          const displayName = displayForEmail(order.userEmail);
          // const company = companyForEmail(order.userEmail); // available if you want to show it too
          // const finalUSD = getFinalUSD(order); // available if you want to display totals
          return (
            <li key={order._id} onClick={() => goToPackDetails(order)}>
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
                <label className="orderQuick-Label">{displayName}</label>
                {/* <label className="orderQuick-Label">{company}</label> */}
              </div>
            </li>
          );
        })}
      </ul>

      {filteredOrders.length === 0 && (
        <p style={{ textAlign: "center", marginTop: "2rem" }}>
          No hay pedidos por empacar.
        </p>
      )}

      {/* FOOTER MENU */}
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
      {/* FOOTER MENU END */}
    </body>
  );
}