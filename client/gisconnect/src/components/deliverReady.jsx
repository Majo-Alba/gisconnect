import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { API } from "/src/lib/api";

export default function DeliverReady() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);

  // ===== NEW: Mongo cache (email -> user) =====
  // user shape (from /users/by-email): { nombre, apellido, empresa?, shippingPreferences?: { preferredCarrier, insureShipment }, ... }
  const [mongoByEmail, setMongoByEmail] = useState({}); // { [email]: user | null }
  const [mongoLoading, setMongoLoading] = useState(false);

  useEffect(() => {
    fetchOrders();
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

  // Pull needed Mongo users for the list (dedup by email)
  useEffect(() => {
    const norm = (s) => String(s || "").trim().toLowerCase();
    const emails = Array.from(
      new Set(
        (orders || [])
          .map((o) => norm(o.userEmail))
          .filter((e) => !!e)
      )
    );

    // figure out which emails we still need
    const missing = emails.filter((e) => !(e in mongoByEmail));
    if (missing.length === 0) return;

    let cancelled = false;
    setMongoLoading(true);

    (async () => {
      try {
        const results = await Promise.allSettled(
          missing.map((email) =>
            axios
              .get(`${API}/users/by-email`, { params: { email } })
              .then((res) => ({ email, user: res.data || null }))
              .catch(() => ({ email, user: null }))
          )
        );

        if (cancelled) return;

        setMongoByEmail((prev) => {
          const next = { ...prev };
          results.forEach((r) => {
            if (r.status === "fulfilled") {
              const { email, user } = r.value;
              next[email] = user;
            } else {
              // Promise rejected (shouldn't happen due to catch above), keep null
            }
          });
          return next;
        });
      } finally {
        if (!cancelled) setMongoLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orders, mongoByEmail]);

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

  const normalize = (s) => String(s || "").trim().toLowerCase();

  const displayNameFor = (email) => {
    const user = mongoByEmail[normalize(email)];
    const nombre = (user?.nombre || "").trim();
    const apellido = (user?.apellido || "").trim();
    const full = [nombre, apellido].filter(Boolean).join(" ");
    return full || email || "Cliente";
  };

  const preferredCarrierFor = (email) => {
    const user = mongoByEmail[normalize(email)];
    return (
      (user?.shippingPreferences?.preferredCarrier ||
        user?.preferredCarrier ||
        "")?.toString()
        .trim() || ""
    );
  };

  const insureShipmentLabelFor = (email) => {
    const user = mongoByEmail[normalize(email)];
    const val =
      user?.shippingPreferences?.insureShipment ??
      user?.insureShipment;
    if (typeof val === "boolean") return val ? "Sí" : "No";
    return ""; // not specified
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
          const name = displayNameFor(order.userEmail);
          const carrier = preferredCarrierFor(order.userEmail);
          const insured = insureShipmentLabelFor(order.userEmail);

          return (
            <div className="existingQuote-Div" key={order._id}>
              <div
                className="quoteAndFile-Div"
                onClick={() => handleOrderClick(order._id)}
              >
                <label className="orderQuick-Label">{name}</label>
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
                  No. {String(order._id).slice(-5)}
                </label>

                {/* NEW: shipping preferences from Mongo */}
                <label className="orderQuick-Label">
                  <b>Paquetería:</b> {carrier || "No especificado"}
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
