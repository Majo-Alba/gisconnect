// --- DeliveredOrders.jsx ---
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function DeliveredOrders() {
  const navigate = useNavigate();

  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [csvData, setCsvData] = useState([]); // Google Sheets client DB
  const [loading, setLoading] = useState(false);

  // ---- fetch delivered orders
  useEffect(() => {
    const fetchDeliveredOrders = async () => {
      try {
        setLoading(true);
        const response = await axios.get("http://localhost:4000/orders");
        const filtered = response.data.filter(
          (order) => order.orderStatus === "Pedido Entregado"
        );
        setDeliveredOrders(filtered);
      } catch (error) {
        console.error("Error fetching delivered orders:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDeliveredOrders();
  }, []);

  // ---- fetch Google Sheets CSV (clients master)
  useEffect(() => {
    const csvUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
    axios
      .get(csvUrl)
      .then((res) => {
        setCsvData(parseCSV(res.data));
      })
      .catch((err) => console.error("Error fetching CSV data:", err));
  }, []);

  // ---- build fast lookup by email: { emailLower: { nombre, empresa } }
  const emailToClient = useMemo(() => {
    const map = {};
    for (const row of csvData) {
      const email = (row.CORREO_EMPRESA || "").trim().toLowerCase();
      if (!email) continue;
      map[email] = {
        nombre: (row.NOMBRE_APELLIDO || "").trim(),
        empresa: (row.NOMBRE_EMPRESA || "").trim(),
      };
    }
    return map;
  }, [csvData]);

  const displayNameFor = (email) => {
    const key = (email || "").trim().toLowerCase();
    return emailToClient[key]?.nombre || email || "";
  };

  // ---- navigation
  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");
  const goToOrderSummary = (orderId) => navigate(`/deliveredSummary/${orderId}`);

  return (
    <body className="body-BG-Gradient">
      <div className="loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Home Icon"
          width="180"
          height="55"
          onClick={goToAdminHome}
        />
      </div>

      <label className="sectionHeader-Label">Entregados</label>

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
        {loading && (
          <p style={{ textAlign: "center", marginTop: "1.5rem" }}>Cargando órdenes...</p>
        )}

        {!loading &&
          deliveredOrders.map((order) => (
            <div className="existingQuote-Div" key={order._id}>
              <div className="quoteAndFile-Div" onClick={() => goToOrderSummary(order._id)}>
                {/* Show actual name from Sheets (fallback to email if not found) */}
                <label className="productDetail-Label">{displayNameFor(order.userEmail)}</label>

                <label className="productDetail-Label">
                  Pedido: {(order._id || "").slice(-5)}
                </label>
                <br />
                <label className="productDetail-Label"> Enviado: 
                  {order.deliveryDate
                    ? new Date(order.deliveryDate).toLocaleDateString("es-MX")
                    : "Sin fecha"}
                </label>
              </div>
            </div>
          ))}

        {!loading && deliveredOrders.length === 0 && (
          <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
            No hay pedidos entregados.
          </p>
        )}
      </div>

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

/* ---- helpers ---- */
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