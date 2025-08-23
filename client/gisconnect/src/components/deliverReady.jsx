import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function DeliverReady() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);

  // ===== Google Sheets client DB (email → name/company) =====
  const [csvData, setCsvData] = useState([]);

  useEffect(() => {
    fetchOrders();
    fetchClientCSV();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API}/orders`);
      const deliverableOrders = response.data.filter(
        (order) => order.orderStatus === "Etiqueta Generada"
      );
      setOrders(deliverableOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
    }
  };

  // Pull from your Google Sheets DB (same sheet you’ve been using elsewhere)
  const fetchClientCSV = () => {
    const csvUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
    axios
      .get(csvUrl)
      .then((response) => {
        const parsed = parseCSV(response.data);
        setCsvData(parsed);
      })
      .catch((error) => {
        console.error("Error fetching CSV data:", error);
      });
  };

  function parseCSV(csvText) {
    const rows = csvText.split(/\r?\n/);
    const headers = rows[0]?.split(",") || [];
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i]) continue;
      const rowData = rows[i].split(",");
      const rowObject = {};
      for (let j = 0; j < headers.length; j++) {
        rowObject[headers[j]] = rowData[j];
      }
      data.push(rowObject);
    }
    return data;
  }

  // Build a quick lookup: email → { name, company }
  const clientLookup = useMemo(() => {
    const map = new Map();
    csvData.forEach((r) => {
      const email = (r.CORREO_EMPRESA || "").trim().toLowerCase();
      if (!email) return;
      map.set(email, {
        name: (r.NOMBRE_APELLIDO || "").trim(),
        company: (r.NOMBRE_EMPRESA || "").trim(),
      });
    });
    return map;
  }, [csvData]);

  const handleOrderClick = (orderId) => {
    navigate(`/deliveryDetails/${orderId}`);
  };

  function goToAdminHome() {
    navigate("/adminHome");
  }

  function goToNewOrders() {
    navigate("/newOrders");
  }

  function goToPackageReady() {
    navigate("/deliverReady");
  }

  const goHomeLogo = () => {
    navigate("/adminHome");
  };

  return (
    <body className="body-BG-Gradient">
      {/* LOGOS DIV */}
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
      {/* LOGOS END*/}

      <label className="sectionHeader-Label">Por Entregar</label>

      <div>
        <select className="sectionFilter-Dropdown" type="text" required>
          <option>Filtrar por...</option>
          <option>Día</option>
          <option>Semana</option>
          <option>Mes</option>
          <option>Bimestre</option>
          <option>Trimestre</option>
          <option>Semestre</option>
        </select>
      </div>

      <div className="newQuotesScroll-Div">
        {orders.map((order) => {
          const email = (order.userEmail || "").trim().toLowerCase();
          const meta = clientLookup.get(email);
          const displayName = meta?.name || order.userEmail || "Cliente";
          const company = meta?.company || "";
          const orderDate = (order.orderDate || "")

          return (
            <div className="existingQuote-Div" key={order._id}>
              <div
                className="quoteAndFile-Div"
                onClick={() => handleOrderClick(order._id)}
              >
                <label className="orderQuick-Label">{displayName}</label>
                {/* aug18 */}
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
                  No.
                  {String(order._id).slice(-5)}
                </label>
              </div>
            </div>
          );
        })}
        {orders.length === 0 && (
          <p style={{ textAlign: "center", marginTop: "2rem" }}>
            No hay pedidos por entregar.
          </p>
        )}
      </div>

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