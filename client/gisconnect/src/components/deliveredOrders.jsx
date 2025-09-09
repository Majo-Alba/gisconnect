import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { API } from "/src/lib/api";

export default function DeliveredOrders() {
  const navigate = useNavigate();

  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // === NEW: Mongo users cache (email -> user)
  const [usersByEmail, setUsersByEmail] = useState({});
  const [usersLoading, setUsersLoading] = useState(false);

  // ---- fetch delivered orders
  useEffect(() => {
    const fetchDeliveredOrders = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API}/orders`);
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

  // ---- fetch users from Mongo by distinct emails found in deliveredOrders
  useEffect(() => {
    const emails = Array.from(
      new Set(
        deliveredOrders
          .map((o) => (o.userEmail || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (emails.length === 0) return;

    let cancelled = false;
    setUsersLoading(true);

    (async () => {
      try {
        const results = await Promise.allSettled(
          emails.map((email) =>
            axios
              .get(`${API}/users/by-email`, { params: { email } })
              .then((res) => ({ email, user: res.data }))
          )
        );

        if (cancelled) return;

        const map = {};
        results.forEach((r) => {
          if (r.status === "fulfilled" && r.value?.email) {
            map[r.value.email] = r.value.user || null;
          }
        });
        setUsersByEmail(map);
      } catch (err) {
        console.error("Error fetching users by email:", err);
        setUsersByEmail({});
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deliveredOrders]);

  // ---- helpers
  const displayNameFor = (email) => {
    const key = (email || "").trim().toLowerCase();
    const u = usersByEmail[key];
    if (u) {
      const nombre = (u.nombre || "").trim();
      const apellido = (u.apellido || "").trim();
      const full = [nombre, apellido].filter(Boolean).join(" ");
      if (full) return full;
    }
    return email || "";
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

      <div className="deliveredOrders-OrderDiv">
        {(loading || usersLoading) && (
          <p style={{ textAlign: "center", marginTop: "1.5rem" }}>Cargando órdenes...</p>
        )}

        {!loading &&
          deliveredOrders.map((order) => (
            <div className="existingQuote-Div" key={order._id}>
              <div className="quoteAndFile-Div" onClick={() => goToOrderSummary(order._id)}>
                {/* Show actual name from Mongo (fallback to email if not found) */}
                <label className="productDetail-Label">{displayNameFor(order.userEmail)}</label>

                <label className="productDetail-Label">
                  Pedido: {(order._id || "").slice(-5)}
                </label>
                <br />
                <label className="productDetail-Label">
                  Enviado:{" "}
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