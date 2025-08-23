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

  useEffect(() => {
    fetchOrders();
    fetchCSVData();
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, searchName, csvData]);

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

  // Build a lookup: email -> { name, company }
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

  const displayForEmail = (email) => {
    const norm = String(email || "").trim().toLowerCase();
    const hit = emailToClient[norm];
    return hit?.name || email || "";
  };

  const companyForEmail = (email) => {
    const norm = String(email || "").trim().toLowerCase();
    const hit = emailToClient[norm];
    return hit?.company || "";
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

  // Safely get final total in USD (supports object or legacy shapes)
  const getFinalUSD = (order) => {
    const t = order?.totals;
    // if stored as object (our current approach)
    if (t && typeof t === "object" && !Array.isArray(t)) {
      if (typeof t.finalAllUSD === "number") return t.finalAllUSD;
      if (typeof t.totalAllUSD === "number") return t.totalAllUSD;
    }
    // legacy: sometimes an array (just in case)
    if (Array.isArray(t) && t[0]) {
      if (typeof t[0].finalAllUSD === "number") return t[0].finalAllUSD;
      if (typeof t[0].totalAllUSD === "number") return t[0].totalAllUSD;
    }
    // last resort
    if (typeof order?.finalAllUSD === "number") return order.finalAllUSD;
    if (typeof order?.totalCost === "number") return order.totalCost;
    return 0;
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
            const displayName = displayForEmail(order.userEmail);
            const finalUSD = getFinalUSD(order);
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
                          const day = date
                            .getDate()
                            .toString()
                            .padStart(2, "0");
                          const month = date.toLocaleString("en-MX", {
                            month: "short",
                          });
                          const year = date.getFullYear();
                          return `${day}/${month}/${year}`;
                        })()
                      : "Sin fecha"}
                  </label>
                  <label className="orderQuick-Label">
                    {displayName}
                  </label>
                  <label className="orderQuick-Label">
                    ${Number(finalUSD).toFixed(2)}
                  </label>
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