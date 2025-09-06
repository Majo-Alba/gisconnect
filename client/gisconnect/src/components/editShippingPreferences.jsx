import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png";

import { API } from "/src/lib/api";

export default function EditShippingPreferences() {
  const navigate = useNavigate();

  const goHomeLogo = () => navigate("/userHome");
  const goToHome = () => navigate("/userHome");
  const goToNewOrder = () => navigate("/newOrder");
  const goToMyProfile = () => navigate("/userProfile");

  // NOTE: removed stray leading space before "Autocamiones..."
  const CARRIER_OPTIONS = [
    "Recoger en sucursal",
    "Autocamiones del Pacífico",
    "Castores",
    "DHL",
    "Estafeta",
    "Express Manzanillo-Guadalajara",
    "Kora Express",
    "Paquete Express",
    "Paqueteria Vallarta Plus",
    "Paquetería y Mensajería de Michoacán",
    "PCP - Paquetería y Carga del Pacífico",
    "Tamazula Express",
    "Transportes Unidos de Tepa",
    "Tres Guerras",
    "Otro",
  ];

  const [email, setEmail] = useState("");
  const [preferredCarrier, setPreferredCarrier] = useState("");
  const [customCarrier, setCustomCarrier] = useState(""); // only used when "Otro"
  const [insureShipment, setInsureShipment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Helper: normalize comparison
  const eqi = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

  useEffect(() => {
    // Resolve email robustly and lowercase to match server lookup
    const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    const e =
      creds?.correo ||
      JSON.parse(localStorage.getItem("gis-user") || "null")?.email ||
      localStorage.getItem("userEmail") ||
      "";
    const normalizedEmail = String(e || "").trim().toLowerCase();
    setEmail(normalizedEmail);

    // Load current server values → fallback to localStorage
    (async () => {
      try {
        if (!normalizedEmail) throw new Error("No email");
        const res = await fetch(`${API}/users/by-email?email=${encodeURIComponent(normalizedEmail)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (res.ok) {
          const data = await res.json();
          const prefs = data?.shippingPreferences || {
            preferredCarrier: data?.preferredCarrier || "",
            insureShipment: !!data?.insureShipment,
          };

          const current = String(prefs?.preferredCarrier || "").trim();

          // If the current carrier isn't in the predefined list → show "Otro" + prefill custom field
          const isKnown = CARRIER_OPTIONS.some(opt => eqi(opt, current));
          if (current && !isKnown) {
            setPreferredCarrier("Otro");
            setCustomCarrier(current);
          } else {
            setPreferredCarrier(current);
            setCustomCarrier("");
          }
          setInsureShipment(!!prefs?.insureShipment);
          return;
        }

        // Fallback: local storage
        const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
        if (local) {
          const current = String(local.preferredCarrier || "").trim();
          const isKnown = CARRIER_OPTIONS.some(opt => eqi(opt, current));
          if (current && !isKnown) {
            setPreferredCarrier("Otro");
            setCustomCarrier(current);
          } else {
            setPreferredCarrier(current);
            setCustomCarrier("");
          }
          setInsureShipment(!!local.insureShipment);
        }
      } catch {
        const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
        if (local) {
          const current = String(local.preferredCarrier || "").trim();
          const isKnown = CARRIER_OPTIONS.some(opt => eqi(opt, current));
          if (current && !isKnown) {
            setPreferredCarrier("Otro");
            setCustomCarrier(current);
          } else {
            setPreferredCarrier(current);
            setCustomCarrier("");
          }
          setInsureShipment(!!local.insureShipment);
        }
      }
    })();
  }, []);

  const effectiveCarrier = () => (preferredCarrier === "Otro" ? customCarrier.trim() : preferredCarrier.trim());

  const save = async () => {
    if (!email) {
      setMsg("No se encontró el correo del usuario.");
      return;
    }
    if (preferredCarrier === "Otro" && !customCarrier.trim()) {
      setMsg("Por favor especifica la paquetería en el campo de 'Otro'.");
      return;
    }

    setSaving(true);
    setMsg("");

    const payload = {
      email,
      shippingPreferences: {
        preferredCarrier: effectiveCarrier(),
        insureShipment,
      },
    };

    try {
      const res = await fetch(`${API}/users/shipping-prefs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      // Backup locally — IMPORTANT: use the flattened values, not nested payload
      localStorage.setItem(
        "userShippingPrefs",
        JSON.stringify({
          preferredCarrier: payload.shippingPreferences.preferredCarrier,
          insureShipment: payload.shippingPreferences.insureShipment,
        })
      );

      setMsg("Preferencias de envío guardadas.");
      setTimeout(() => navigate("/userProfile"), 700);
    } catch (err) {
      console.error("Save shipping prefs error:", err);
      // Fallback local if server not reachable
      localStorage.setItem(
        "userShippingPrefs",
        JSON.stringify({
          preferredCarrier: effectiveCarrier(),
          insureShipment,
        })
      );
      setMsg("Guardado local realizado. (El servidor no respondió)");
      setTimeout(() => navigate("/userProfile"), 900);
    } finally {
      setSaving(false);
    }
  };

  return (
    <body className="app-shell body-BG-Gradient">
      <div className="app-header loginLogo-ParentDiv">
        <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={goHomeLogo} />
      </div>

      <div className="app-main">
        <div className="edit-titleIcon-Div">
          <label className="editAddress-headerLabel">Preferencias de Envío</label>
          <img src={GestionaIcono} alt="Home Icon" width="35" height="35" />
        </div>

        <div className="editInstructions-Div">
          <label className="editInstructions-Label">
            Dinos cómo prefieres que te enviemos tus paquetes (transportista específico o recoger en sucursal) y si deseas
            que tus paquetes viajen asegurados.
            <br />
            <br />
            Recuerda que puedes actualizar estas preferencias cuando lo necesites.
          </label>
        </div>

        <div className="addressInputs-Div">
          <label className="newUserData-Label">Paquetería preferida</label>
          <select
            className="productInfo-Input"
            value={preferredCarrier}
            onChange={(e) => {
              setPreferredCarrier(e.target.value);
              if (e.target.value !== "Otro") setCustomCarrier("");
            }}
          >
            <option value="">Selecciona una opción</option>
            {CARRIER_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          {preferredCarrier === "Otro" && (
            <>
              <label className="newUserData-Label" style={{ marginTop: 10 }}>
                Especifica la paquetería
              </label>
              <input
                className="productInfo-Input"
                type="text"
                placeholder="Nombre de la paquetería"
                value={customCarrier}
                onChange={(e) => setCustomCarrier(e.target.value)}
              />
            </>
          )}

          <label className="newUserData-Label" style={{ marginTop: 12 }}>
            ¿Deseas asegurar los envíos?
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 60, marginTop: 10 }}>
            <input
              type="checkbox"
              id="insure"
              checked={insureShipment}
              onChange={(e) => setInsureShipment(e.target.checked)}
            />
            <label htmlFor="insure" className="summary-Label">
              Sí, asegurar envío
            </label>
          </div>

          <div className="actionButtons-Div" style={{ marginTop: 16 }}>
            <button
              className="savePrefs-Btn"
              type="button"
              onClick={save}
              disabled={saving || (preferredCarrier === "Otro" && !customCarrier.trim())}
            >
              {saving ? "Guardando..." : "Guardar preferencias"}
            </button>
            {/* <button className="generatePDF-Btn" type="button" onClick={() => navigate("/userProfile")}>
              Cancelar
            </button> */}
          </div>

          {msg && (
            <div className="popUp-Message" style={{ marginTop: 10 }}>
              <p className="success">{msg}</p>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER MENU */}
      <div className="app-footer footerMenuDiv">
        <div className="footerHolder">
          <div className="footerIcon-NameDiv" onClick={goToHome}>
            <FontAwesomeIcon icon={faHouse} className="footerIcons" />
            <label className="footerIcon-Name">PRINCIPAL</label>
          </div>

          <div className="footerIcon-NameDiv" onClick={goToMyProfile}>
            <FontAwesomeIcon icon={faUser} className="footerIcons" />
            <label className="footerIcon-Name">MI PERFIL</label>
          </div>

          <div className="footerIcon-NameDiv" onClick={goToNewOrder}>
            <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
            <label className="footerIcon-Name">ORDENA</label>
          </div>
        </div>
      </div>
      {/* FOOTER MENU END */}
    </body>
  );
}