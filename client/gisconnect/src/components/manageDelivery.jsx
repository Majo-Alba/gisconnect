import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { API } from "/src/lib/api";

export default function ManageDelivery() {
  const navigate = useNavigate();

  function goToAdminHome() {
    navigate("/adminHome");
  }
  function goToNewOrders() {
    navigate("/newOrders");
  }
  function goToPackageReady() {
    navigate("/deliverReady");
  }
  const goHomeLogo = () => navigate("/adminHome");

  const [orders, setOrders] = useState([]);

  // ===== Google Sheets (Client DB) =====
  const [csvRows, setCsvRows] = useState([]);
  useEffect(() => {
    const fetchCSV = async () => {
      try {
        const url =
          "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
        const resp = await axios.get(url);
        setCsvRows(parseCSV(resp.data));
      } catch (e) {
        console.error("Error fetching client CSV:", e);
        setCsvRows([]);
      }
    };
    fetchCSV();
  }, []);

  const normalize = (s) => (s ?? "").toString().trim().toLowerCase();

  // Build quick lookup: email -> { name, company }
  const clientLookup = useMemo(() => {
    const map = {};
    csvRows.forEach((r) => {
      const email = normalize(r.CORREO_EMPRESA);
      if (!email) return;
      map[email] = {
        name: (r.NOMBRE_APELLIDO || "").trim(),
        company: (r.NOMBRE_EMPRESA || "").trim(),
        // aug18
        carrier: (r.PAQUETERIA_ENVIO || "").trim(),
        insurance: (r.SEGURO_ENVIO || "").trim(),
        // aug18
      };
    });
    return map;
  }, [csvRows]);

  // ===== Orders (only "Pedido Listo") =====
  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API}/orders`);
      const readyOrders = response.data.filter((order) => order.orderStatus === "Preparando Pedido");
      setOrders(readyOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
    }
  };

  const handleOrderClick = (orderId) => {
    navigate(`/manageDelivery/${orderId}`);
  };

  // Simple CSV parser
  function parseCSV(csvText) {
    const rows = csvText.split(/\r?\n/).filter(Boolean);
    if (rows.length === 0) return [];
    const headers = rows[0].split(",").map((h) => h.trim());
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(",");
      const obj = {};
      headers.forEach((h, idx) => (obj[h] = (cols[idx] || "").trim()));
      data.push(obj);
    }
    return data;
  }

  return (
    <body className="body-BG-Gradient">
      {/* LOGOS DIV */}
      <div className="loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Logo"
          width="180"
          height="55"
          onClick={goHomeLogo}
        />
      </div>

      <label className="sectionHeader-Label">Gestionar Entrega</label>

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
          const email = normalize(order.userEmail);
          const displayName = clientLookup[email]?.name || order.userEmail;
          const companyName = clientLookup[email]?.company || order.nombreEmpresa || "";
          // aug18
          const carrierName = clientLookup[email]?.carrier || "";
          const insurancePref = clientLookup[email]?.insurance || "";
          // aug18

          return (
            <div className="existingQuote-Div" key={order._id}>
              <div className="quoteAndFile-Div" onClick={() => handleOrderClick(order._id)}>
                <label className="orderQuick-Label">{displayName}</label>
                <label className="orderQuick-Label">{companyName}</label>
                <label className="orderQuick-Label">
                  <strong>Pedido: </strong>
                  {String(order._id).slice(-5)}
                </label>
                <label className="orderQuick-Label">
                  <b>Instrucción:</b><br></br> 
                  Paquetería: {carrierName || "Sin preferencia especificada"}<br></br>
                  Mercancía Asegurada: {insurancePref || "Sin preferencia especificada"}
                </label>
              </div>
            </div>
          );
        })}
        {orders.length === 0 && (
          <p style={{ textAlign: "center", marginTop: "2rem" }}>No hay pedidos listos para entrega.</p>
        )}
      </div>

      {/* FOOTER MENU */}
      <div className="footerMenuDiv">
        <div className="footerHolder">
          {/* HOME FOOTER DIV */}
          <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons" />
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>

          {/* USER FOOTER DIV */}
          <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
            <label className="footerIcon-Name">ORDENES</label>
          </div>

          {/* SETTINGS FOOTER DIV */}
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