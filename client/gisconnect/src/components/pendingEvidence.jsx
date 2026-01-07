import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { faArrowLeftLong, faFileCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import { API } from "/src/lib/api";

const ALLOWED_ADMIN_EMAILS = new Set([
  "ventas@greenimportsol.com",
  "majo_test@gmail.com",
]);

export default function PendingEvidence() {
  const navigate = useNavigate();

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  const [me, setMe] = useState(null);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setMe(JSON.parse(localStorage.getItem("userLoginCreds") || "null"));
  }, []);

  const myEmail = (me?.correo || "").trim().toLowerCase();
  const isAllowed = ALLOWED_ADMIN_EMAILS.has(myEmail);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/orders`);
        const all = Array.isArray(res.data) ? res.data : [];
        // Only "Pedido Realizado"
        setOrders(all.filter((o) => (o.orderStatus || "").toLowerCase().includes("realizado")));
      } catch (e) {
        console.error("Error fetching orders:", e);
        setOrders([]);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const id = String(o._id || "");
      const email = String(o.userEmail || "");
      const byAdmin = String(o.placedByAdmin?.adminEmail || "");
      const name = String(o.userName || "");
      const comp = String(o.userCompany || "");
      return (
        id.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        byAdmin.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        comp.toLowerCase().includes(q)
      );
    });
  }, [orders, search]);

  const badgeForAdmin = (email) => {
    const e = (email || "").toLowerCase();
    if (e === "ventas@greenimportsol.com") return "Registrado por Alex";
    if (e === "majo_test@gmail.com") return "Registrado por Majo";
    return null;
  };

  if (!isAllowed) {
    return (
      <body className="body-BG-Gradient">
        <div className="loginLogo-ParentDiv">
          <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={() => navigate("/adminHome")} />
        </div>
        <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
          <div className="orderNow-AddressDiv" style={{ maxWidth: 520, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Acceso restringido</div>
            <div>Esta sección solo está disponible para ventas@greenimportsol.com y majo_test@gmail.com.</div>
          </div>
          <button className="submitOrder-Btn" style={{ marginTop: 16 }} onClick={() => navigate("/adminHome")}>
            Regresar
          </button>
        </div>
      </body>
    );
  }

  return (
    <body className="body-BG-Gradient">
      <div className="loginLogo-ParentDiv">
        <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={() => navigate("/adminHome")} />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <label className="sectionHeader-Label">Pendientes de Evidencia</label>
          {/* <button
            className="submitOrder-Btn"
            type="button"
            onClick={() => navigate("/newOrders")}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", marginRight: "8%" }}
          >
            <FontAwesomeIcon icon={faArrowLeftLong} />
            Regresar
          </button> */}
        </div>

        <div className="searchFilters-Div">
          <input
            className="sectionFilter-Client"
            type="text"
            placeholder="Buscar pedido, cliente o empresa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ul>
          {filtered.map((o) => {
            const tag = badgeForAdmin(o.placedByAdmin?.adminEmail);
            return (
              <li key={o._id} onClick={() => navigate(`/pendingEvidence/${o._id}`)}>
                <div className="orderQuickDetails-Div" style={{ alignItems: "center" }}>
                  <label className="orderQuick-Label">No. {String(o._id).slice(-5)}</label>
                  <label className="orderQuick-Label">
                    {o.orderDate
                      ? new Date(o.orderDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                      : "Sin fecha"}
                  </label>
                  <label className="orderQuick-Label">{o.userName || o.userEmail}</label>
                  {o.userCompany && <label className="orderQuick-Label">{o.userCompany}</label>}

                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    {tag && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,.15)",
                          border: "1px solid rgba(255,255,255,.25)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tag}
                      </span>
                    )}
                    <span
                      title="Pedido Realizado"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 }}
                    >
                      <FontAwesomeIcon icon={faFileCircleCheck} /> Pedido Realizado
                    </span>
                  </div>
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
