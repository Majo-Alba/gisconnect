import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
// Removed faFileCircleCheck to reduce clutter in the list
import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import { API } from "/src/lib/api";

const ALLOWED_ADMIN_EMAILS = new Set([
  "ventas@greenimportsol.com",
  "info@greenimportsol.com",
  "majo_test@gmail.com",
]);

export default function PendingEvidence() {
  const navigate = useNavigate();

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToPackageReady = () => navigate("/deliverReady");

  const [me, setMe] = useState(null);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");

  // cache: email -> { name: "Nombre Apellido", company: "Empresa" }
  const [nameByEmail, setNameByEmail] = useState({});

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
        const onlyRealizados = all.filter((o) =>
          (o.orderStatus || "").toLowerCase().includes("realizado")
        );
        setOrders(onlyRealizados);

        // === Resolve display names + company from Mongo (nombre + apellido + empresa) ===
        const emails = Array.from(
          new Set(
            onlyRealizados
              .map((o) => (o.userEmail || "").trim().toLowerCase())
              .filter(Boolean)
          )
        );

        if (emails.length) {
          const pairs = await Promise.all(
            emails.map(async (email) => {
              try {
                const { data } = await axios.get(`${API}/users/by-email`, { params: { email } });
                const nombre = (data?.nombre || "").toString().trim();
                const apellido = (data?.apellido || "").toString().trim();
                const empresa = (data?.empresa || "").toString().trim();
                const fullName = [nombre, apellido].filter(Boolean).join(" ").trim();
                return [email, { name: fullName, company: empresa }];
              } catch {
                return [email, { name: "", company: "" }];
              }
            })
          );
          const map = Object.fromEntries(pairs);
          setNameByEmail(map);
        }
      } catch (e) {
        console.error("Error fetching orders:", e);
        setOrders([]);
      }
    })();
  }, []);

  const getDisplayName = (o) => {
    const email = (o.userEmail || "").trim().toLowerCase();
    const mongoName = nameByEmail[email]?.name;
    return (mongoName && mongoName.length > 0) ? mongoName : (o.userName || o.userEmail || "");
  };

  const getDisplayCompany = (o) => {
    const email = (o.userEmail || "").trim().toLowerCase();
    const mongoCompany = (nameByEmail[email]?.company || "").trim();
    // prefer Mongo `empresa`, fallback to order-level userCompany if present
    return mongoCompany || (o.userCompany || "");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const id = String(o._id || "");
      const email = String(o.userEmail || "");
      const byAdmin = String(o.placedByAdmin?.adminEmail || "");
      const name = String(getDisplayName(o) || "");
      const comp = String(getDisplayCompany(o) || "");
      return (
        id.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        byAdmin.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        comp.toLowerCase().includes(q)
      );
    });
  }, [orders, search, nameByEmail]);

  const badgeForAdmin = (email) => {
    const e = (email || "").toLowerCase();
    if (e === "ventas@greenimportsol.com") return "Registrado por Alex";
    if (e === "info@greenimportsol.com") return "Registrado por Miguel";
    if (e === "majo_test@gmail.com") return "Registrado por Majo";
    return null;
  };

  if (!isAllowed) {
    return (
      <body className="body-BG-Gradient">
        <div className="loginLogo-ParentDiv">
          <img
            className="secondaryPages-GISLogo"
            src={Logo}
            alt="GIS"
            width="180"
            height="55"
            onClick={() => navigate("/adminHome")}
          />
        </div>
        <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
          <div className="orderNow-AddressDiv" style={{ maxWidth: 520, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Acceso restringido</div>
            <div>
              Esta sección solo está disponible para ventas@greenimportsol.com, info@greenimportsol.com y
              majo_test@gmail.com.
            </div>
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
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="GIS"
          width="180"
          height="55"
          onClick={() => navigate("/adminHome")}
        />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <label className="sectionHeader-Label">Pendientes de Evidencia</label>
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

        {/* Scrollable list container */}
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            overflowY: "auto",
            maxHeight: "calc(100vh - 200px)", // adjust to your header/footer height
            paddingBottom: 120,               // keeps last item above the footer
          }}
        >
          {filtered.map((o) => {
            const tag = badgeForAdmin(o.placedByAdmin?.adminEmail);
            const displayName = getDisplayName(o);
            const displayCompany = getDisplayCompany(o); // <- NEW
            return (
              <li key={o._id} onClick={() => navigate(`/pendingEvidence/${o._id}`)}>
                <div className="orderQuickDetails-Div" style={{ alignItems: "center" }}>
                  <label className="orderQuick-Label">No. {String(o._id).slice(-5)}</label>
                  <label className="orderQuick-Label">
                    {o.orderDate
                      ? new Date(o.orderDate).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "Sin fecha"}
                  </label>

                  {/* Stacked Name + Company */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 180 }}>
                    <span className="orderQuick-Label" style={{ fontWeight: 700 }}>{displayName}</span>
                    {displayCompany && (
                      <span
                        className="orderQuick-Label"
                        style={{ opacity: 0.85, fontSize: 12, marginTop: -2 }}
                      >
                        {displayCompany}
                      </span>
                    )}
                  </div>

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
                    {/* Removed FontAwesome status icon to declutter; plain text instead */}
                    <span title="Pedido Realizado" style={{ fontSize: 12, opacity: 0.9 }}>
                      Pedido Realizado
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
