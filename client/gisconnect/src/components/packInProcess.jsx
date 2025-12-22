import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import { API } from "/src/lib/api";
import Logo from "/src/assets/images/GIS_Logo.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxOpen, faHouse, faCartShopping, faCheckToSlot } from "@fortawesome/free-solid-svg-icons";

import EmpacandoIcono from "/src/assets/images/Icono_packing.png"


export default function PackInProcess() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [names, setNames] = useState({}); // email -> "Nombre Apellido" (from Mongo)
  const pollRef = useRef(null);

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToDeliverReady = () => navigate("/deliverReady");

  // --- helpers ---
  const compactId = (id) => `#${String(id || "").slice(-5)}`;
  const safeLen = (a) => (Array.isArray(a) ? a.length : 0);

  // Try dedicated endpoint first (?packingStatus=in_progress). Fallback to all and client-side filter.
  const fetchOrders = async () => {
    setErr("");
    setLoading(true);
    try {
      let res;
      try {
        res = await axios.get(`${API}/orders`, { params: { packingStatus: "in_progress" } });
      } catch {
        // fallback if API doesn’t support the filter param
        res = await axios.get(`${API}/orders`);
      }
      const list = Array.isArray(res.data) ? res.data : (res.data?.orders || []);
      setOrders(list);
    } catch (e) {
      console.error("Empacando load error:", e);
      setErr("No pudimos cargar los pedidos en proceso de empaque.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  // Resolve human name for emails (cached)
  const resolveNames = async (emails) => {
    const unknown = emails.filter((em) => !names[em]);
    if (!unknown.length) return;
    const updates = {};
    await Promise.all(
      unknown.map(async (email) => {
        try {
          const { data } = await axios.get(`${API}/users/by-email`, { params: { email } });
          const nombre = (data?.nombre || "").toString().trim();
          const apellido = (data?.apellido || "").toString().trim();
          const full = [nombre, apellido].filter(Boolean).join(" ");
          updates[email] = full || email;
        } catch {
          updates[email] = email;
        }
      })
    );
    setNames((prev) => ({ ...prev, ...updates }));
  };

  // initial + polling
  useEffect(() => {
    fetchOrders();
    pollRef.current = setInterval(fetchOrders, 15000); // refresh every 15s
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After each fetch, resolve display names for visible orders
  useEffect(() => {
    const emails = orders
      .filter((o) => (o?.packing?.status || "").toLowerCase() === "in_progress")
      .map((o) => String(o.userEmail || "").trim().toLowerCase())
      .filter(Boolean);
    if (emails.length) resolveNames([...new Set(emails)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // Filter to show only those actively being packed (claimed and in_progress)
  const inProcess = useMemo(() => {
    const list = orders.filter((o) => {
      const s = (o?.packing?.status || "").toLowerCase();
      const who = (o?.packing?.claimedBy || "").trim();
      return s === "in_progress" && !!who; // exclude ready / idle / unclaimed
    });

    // sort by claim time (if available) else by orderDate desc
    return list.sort((a, b) => {
      const aT = new Date(a?.packing?.claimedAt || a?.orderDate || 0).getTime();
      const bT = new Date(b?.packing?.claimedAt || b?.orderDate || 0).getTime();
      return bT - aT;
    });
  }, [orders]);

  if (loading) return <p style={{ padding: 20 }}>Cargando pedidos en proceso…</p>;

  return (
    <body className="body-BG-Gradient">
      {/* Header / Logo */}
      <div className="loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Logo"
          width="180"
          height="55"
          onClick={goToAdminHome}
        />
      </div>

      {/* Title row mirrors your existing secondary screens */}
      <div className="edit-titleIcon-Div">
        <label className="editAddress-headerLabel">Empacando</label>
        <img className="homeQuoter-Icon" src={EmpacandoIcono} alt="Home Icon" width="45" height="45"/>
      </div>

      <div className="newQuotesDetail-Div">
        <label>Pedidos actualmente tomados por <br></br>el equipo de almacen</label>
        <label style={{ opacity: 0.75, marginTop: 7 }}>Se actualiza cada 15 s</label>
      </div>

      <div className="newOrderDets-Scroll">
        {/* List container—reuse your product card look for consistency */}
        <div className="orderDelivered-ProductsDiv">
          {err && (
            <div style={{ color: "#b91c1c", padding: "8px 12px", borderRadius: 8, background: "#fee2e2", marginBottom: 8 }}>
              {err}
            </div>
          )}

          {inProcess.length === 0 ? (
            <div className="newOrderDets-Div" style={{ textAlign: "center", opacity: 0.7 }}>
              <div className="orderDetails-Div">
                <label className="orderDets-Label">No hay pedidos en proceso de empaque.</label>
              </div>
            </div>
          ) : (
            inProcess.map((o) => {
              const packer = o?.packing?.claimedBy || "—";
              const email = String(o?.userEmail || "").trim().toLowerCase();
              const display = names[email] || email || "Cliente";
              const itemsCount = safeLen(o?.items);

              return (
                <div
                  key={o._id}
                  className="newOrderDets-Div"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/packDetails/${o._id}`)}
                  title="Abrir detalle de empaque"
                >
                  <div className="orderDetails-Div">
                    <label className="orderDets-Label">
                      <b>Pedido:</b> {compactId(o._id)}
                    </label>
                    <label className="orderDets-Label">
                      <b>Cliente:</b> {display}
                    </label>
                    <label className="orderDets-Label">
                      <b>Ítems:</b> {itemsCount}
                    </label>
                    <label className="orderDets-Label">
                      <b>Encargado:</b> {packer}
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer menu (consistent with your app) */}
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
          <div className="footerIcon-NameDiv" onClick={goToDeliverReady}>
            <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
            <label className="footerIcon-Name">ENTREGAR</label>
          </div>
        </div>
      </div>
    </body>
  );
}
