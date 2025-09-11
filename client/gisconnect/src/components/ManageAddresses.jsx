import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import {
  faArrowLeft,
  faPen,
  faTrash,
  faStar as faStarSolid,
  faTruckFast,
  faFloppyDisk,
  faStar,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHouse, faUser, faCartShopping, faListCheck } from "@fortawesome/free-solid-svg-icons";

import Logo from "/src/assets/images/GIS_Logo.png";
import { API } from "/src/lib/api";

export default function ManageAddresses() {
  const navigate = useNavigate();

  const goHomeLogo = () => navigate("/userHome");
  const goToHome = () => navigate("/userHome");
  const goToNewOrder = () => navigate("/newOrder");
  const goToMyProfile = () => navigate("/userProfile");

  // Logged-in user/email
  const [userCredentials, setUserCredentials] = useState(null);
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    setUserCredentials(saved);
  }, []);

  const userEmail = useMemo(() => {
    return (
      userCredentials?.correo ||
      JSON.parse(localStorage.getItem("gis-user") || "null")?.email ||
      localStorage.getItem("userEmail") ||
      ""
    );
  }, [userCredentials]);

  // ---- Carrier options + custom ("Otro") handling ----
  const CARRIERS = [
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

  // User + preferences
  const [userDoc, setUserDoc] = useState(null);
  const [prefCarrier, setPrefCarrier] = useState("");
  const [customCarrier, setCustomCarrier] = useState(""); // for "Otro"
  const [prefInsured, setPrefInsured] = useState(false);

  // Address lists
  const [shipping, setShipping] = useState([]);
  const [billing, setBilling] = useState([]);

  // Inline edit states
  const [editId, setEditId] = useState(null);
  const [editType, setEditType] = useState(null);
  const [form, setForm] = useState({});

  const [loading, setLoading] = useState(true);

  // small helper for axios with explicit success checks
  const ok = (status) => status >= 200 && status < 300;

  // Fetch everything
  useEffect(() => {
    const run = async () => {
      if (!userEmail) return;
      try {
        setLoading(true);

        const [prefsRes, sRes, bRes] = await Promise.all([
          axios.get(`${API}/users/shipping-prefs`, {
            params: { email: userEmail },
            validateStatus: () => true,
          }),
          axios.get(`${API}/shipping-address/${encodeURIComponent(userEmail)}`),
          axios.get(`${API}/billing-address/${encodeURIComponent(userEmail)}`),
        ]);

        if (prefsRes.status === 200) {
          const p = prefsRes.data?.shippingPreferences || {};
          const raw = (p.preferredCarrier ?? "").toString().trim();
          if (!raw) {
            setPrefCarrier("");
            setCustomCarrier("");
          } else if (CARRIERS.includes(raw)) {
            setPrefCarrier(raw);
            setCustomCarrier("");
          } else {
            setPrefCarrier("Otro");
            setCustomCarrier(raw);
          }
          setPrefInsured(!!p.insureShipment);
        } else {
          // fallback to full user if GET /users/shipping-prefs not available
          const uRes = await fetch(
            `${API}/users/by-email?email=${encodeURIComponent(userEmail)}`,
            { headers: { Accept: "application/json" }, cache: "no-store" }
          );
          if (uRes.ok) {
            const u = await uRes.json();
            setUserDoc(u || null);
            const prefs = u?.shippingPreferences || {};
            const raw = (prefs?.preferredCarrier ?? "").toString().trim();
            if (!raw) {
              setPrefCarrier("");
              setCustomCarrier("");
            } else if (CARRIERS.includes(raw)) {
              setPrefCarrier(raw);
              setCustomCarrier("");
            } else {
              setPrefCarrier("Otro");
              setCustomCarrier(raw);
            }
            setPrefInsured(!!prefs?.insureShipment);
          } else {
            setUserDoc(null);
            setPrefCarrier("");
            setCustomCarrier("");
            setPrefInsured(false);
          }
        }

        setShipping(Array.isArray(sRes.data) ? sRes.data : []);
        setBilling(Array.isArray(bRes.data) ? bRes.data : []);
      } catch (err) {
        console.error("Manage load error:", err);
        setShipping([]);
        setBilling([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [userEmail]);

  const startEdit = (type, a) => {
    setEditType(type);
    setEditId(a?._id);

    if (type === "shipping") {
      setForm({
        apodo: a?.apodo || "",
        calleEnvio: a?.calleEnvio || "",
        exteriorEnvio: a?.exteriorEnvio || "",
        interiorEnvio: a?.interiorEnvio || "",
        coloniaEnvio: a?.coloniaEnvio || "",
        ciudadEnvio: a?.ciudadEnvio || "",
        estadoEnvio: a?.estadoEnvio || "",
        cpEnvio: a?.cpEnvio || "",
        isDefault: !!(a?.isDefault || a?.default),
      });
    } else {
      setForm({
        apodo: a?.apodo || "",
        razonSocial: a?.razonSocial || a?.businessName || "",
        rfcEmpresa: a?.rfcEmpresa || a?.rfc || "",
        correoFiscal: a?.correoFiscal || "",
        calleFiscal: a?.calleFiscal || "",
        exteriorFiscal: a?.exteriorFiscal || "",
        interiorFiscal: a?.interiorFiscal || "",
        coloniaFiscal: a?.coloniaFiscal || "",
        ciudadFiscal: a?.ciudadFiscal || "",
        estadoFiscal: a?.estadoFiscal || "",
        cpFiscal: a?.cpFiscal || "",
        isDefault: !!(a?.isDefault || a?.default),
      });
    }
  };

  const cancelEdit = () => {
    setEditType(null);
    setEditId(null);
    setForm({});
  };

  const refreshLists = async () => {
    const [sRes, bRes] = await Promise.all([
      axios.get(`${API}/shipping-address/${encodeURIComponent(userEmail)}`),
      axios.get(`${API}/billing-address/${encodeURIComponent(userEmail)}`),
    ]);
    setShipping(Array.isArray(sRes.data) ? sRes.data : []);
    setBilling(Array.isArray(bRes.data) ? bRes.data : []);
  };

  const saveEdit = async () => {
    try {
      if (!editId || !editType) return;

      const endpoint =
        editType === "shipping"
          ? `${API}/shipping-address/${editId}`
          : `${API}/billing-address/${editId}`;

      const payload =
        editType === "shipping"
          ? {
              userEmail,
              apodo: form.apodo,
              calleEnvio: form.calleEnvio,
              exteriorEnvio: form.exteriorEnvio,
              interiorEnvio: form.interiorEnvio,
              coloniaEnvio: form.coloniaEnvio,
              ciudadEnvio: form.ciudadEnvio,
              estadoEnvio: form.estadoEnvio,
              cpEnvio: form.cpEnvio,
              isDefault: !!form.isDefault,
            }
          : {
              userEmail,
              apodo: form.apodo,
              razonSocial: form.razonSocial,
              rfcEmpresa: form.rfcEmpresa,
              correoFiscal: form.correoFiscal,
              calleFiscal: form.calleFiscal,
              exteriorFiscal: form.exteriorFiscal,
              interiorFiscal: form.interiorFiscal,
              coloniaFiscal: form.coloniaFiscal,
              ciudadFiscal: form.ciudadFiscal,
              estadoFiscal: form.estadoFiscal,
              cpFiscal: form.cpFiscal,
              isDefault: !!form.isDefault,
            };

      const res = await axios.patch(endpoint, payload, { validateStatus: () => true });
      if (!ok(res.status)) {
        console.error("PATCH address failed:", res.status, res.data);
        alert(
          `No se pudo actualizar la dirección (HTTP ${res.status}). ` +
            `Asegúrate de tener en tu servidor: PATCH ${
              editType === "shipping" ? "/shipping-address/:id" : "/billing-address/:id"
            }`
        );
        return;
      }

      if (payload.isDefault) {
        const list = editType === "shipping" ? shipping : billing;
        await Promise.all(
          list
            .filter((a) => a._id !== editId && (a.isDefault || a.default))
            .map((a) =>
              axios
                .patch(
                  editType === "shipping"
                    ? `${API}/shipping-address/${a._id}`
                    : `${API}/billing-address/${a._id}`,
                  { userEmail, isDefault: false },
                  { validateStatus: () => true }
                )
                .catch(() => null)
            )
        );
      }

      await refreshLists();
      cancelEdit();
      alert("Dirección actualizada.");
    } catch (err) {
      console.error("Save edit error:", err);
      alert("No se pudo actualizar la dirección.");
    }
  };

  const deleteAddress = async (type, id) => {
    if (!window.confirm("¿Eliminar esta dirección? Esta acción no se puede deshacer.")) return;
    try {
      const endpoint =
        type === "shipping"
          ? `${API}/shipping-address/${id}`
          : `${API}/billing-address/${id}`;

      const res = await axios.delete(endpoint, { validateStatus: () => true });
      if (!ok(res.status)) {
        console.error("DELETE address failed:", res.status, res.data);
        alert(
          `No se pudo eliminar (HTTP ${res.status}). ` +
            `Agrega en el backend: DELETE ${
              type === "shipping" ? "/shipping-address/:id" : "/billing-address/:id"
            }`
        );
        return;
      }

      if (type === "shipping") setShipping((prev) => prev.filter((a) => a._id !== id));
      else setBilling((prev) => prev.filter((a) => a._id !== id));
      alert("Dirección eliminada.");
    } catch (err) {
      console.error("Delete error:", err);
      alert("No se pudo eliminar la dirección.");
    }
  };

  const setDefault = async (type, id) => {
    try {
      const endpoint =
        type === "shipping"
          ? `${API}/shipping-address/${id}`
          : `${API}/billing-address/${id}`;

      const res = await axios.patch(
        endpoint,
        { userEmail, isDefault: true },
        { validateStatus: () => true }
      );
      if (!ok(res.status)) {
        console.error("Set default failed:", res.status, res.data);
        alert(
          `No se pudo establecer como predeterminada (HTTP ${res.status}). ` +
            `Agrega en el backend: PATCH ${
              type === "shipping" ? "/shipping-address/:id" : "/billing-address/:id"
            }`
        );
        return;
      }

      const list = type === "shipping" ? shipping : billing;
      await Promise.all(
        list
          .filter((a) => a._id !== id && (a.isDefault || a.default))
          .map((a) =>
            axios
              .patch(
                type === "shipping"
                  ? `${API}/shipping-address/${a._id}`
                  : `${API}/billing-address/${a._id}`,
                { userEmail, isDefault: false },
                { validateStatus: () => true }
              )
              .catch(() => null)
          )
      );

      await refreshLists();
    } catch (err) {
      console.error("Set default error:", err);
      alert("No se pudo establecer como predeterminada.");
    }
  };

  const savePreferences = async () => {
    try {
      const valueToSave =
        prefCarrier === "Otro"
          ? customCarrier.trim()
          : (prefCarrier || "").trim();

      if (prefCarrier === "Otro" && !valueToSave) {
        alert("Escribe el nombre de la paquetería en el campo de 'Otro'.");
        return;
      }

      const res = await axios.put(
        `${API}/users/shipping-prefs`,
        {
          email: userEmail,
          shippingPreferences: {
            preferredCarrier: valueToSave,
            insureShipment: !!prefInsured,
          },
        },
        { validateStatus: () => true }
      );

      if (res.status >= 200 && res.status < 300) {
        alert("Preferencias de envío actualizadas.");
      } else {
        console.error("PUT /users/shipping-prefs failed:", res.status, res.data);
        alert(`No se pudieron guardar las preferencias (HTTP ${res.status}).`);
      }
    } catch (err) {
      console.error("Save preferences error:", err);
      alert("No se pudieron guardar las preferencias.");
    }
  };

  // ===== BUTTONS IN CORNERS (unchanged visually) =====
  const ShippingToolbarCorners = ({ a, isEditing }) => {
    if (isEditing) return null;
    return (
      <>
        <button
          className="pencilButton-ManageAddress"
          title="Editar"
          onClick={() => startEdit("shipping", a)}
          style={{ position: "absolute", top: 8, right: 8, padding: 6, minWidth: 34 }}
        >
          <FontAwesomeIcon icon={faPen} />
        </button>
        <button
          className="trashButton-ManageAddress"
          title="Eliminar"
          onClick={() => deleteAddress("shipping", a._id)}
          style={{ position: "absolute", bottom: 8, right: 8, padding: 6, minWidth: 34 }}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </>
    );
  };

  const BillingToolbarCorners = ({ a, isEditing }) => {
    if (isEditing) return null;
    return (
      <>
        <button
          className="pencilButton-ManageAddress"
          title="Editar"
          onClick={() => startEdit("billing", a)}
          style={{ position: "absolute", top: 8, right: 8, padding: 6, minWidth: 34 }}
        >
          <FontAwesomeIcon icon={faPen} />
        </button>
        <button
          className="trashButton-ManageAddress"
          title="Eliminar"
          onClick={() => deleteAddress("billing", a._id)}
          style={{ position: "absolute", bottom: 8, right: 8, padding: 6, minWidth: 34 }}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </>
    );
  };

  // ===== RENDERERS =====
  const renderShippingCard = (a) => {
    const isEditing = editId === a._id && editType === "shipping";
    const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    return (
      <div key={a._id} className="manageAdd-AddGeneralDiv" style={{ padding: 12, marginBottom: 10, position: "relative" }}>
        <div className="manageAdd-NicknameStarDiv">
          <label className="productDetail-Label" style={{ fontWeight: 600 }}>
            {a?.apodo || "Dirección de envío"}
          </label>
          {/* Star button can be re-enabled if needed */}
        </div>

        <ShippingToolbarCorners a={a} isEditing={isEditing} />

        {!isEditing ? (
          <div className="manageAdd-ShippAddDiv">
            <label className="productDetail-Label">
              {a?.calleEnvio || "—"} {a?.exteriorEnvio ? `#${a.exteriorEnvio}` : ""} {a?.interiorEnvio ? `Int. ${a.interiorEnvio}` : ""}
            </label>
            <label className="productDetail-Label">Col. {a?.coloniaEnvio || "—"}</label>
            <label className="productDetail-Label">
              {a?.ciudadEnvio || "—"}, {a?.estadoEnvio || "—"}
            </label>
            <label className="productDetail-Label">C.P. {a?.cpEnvio || "—"}</label>
          </div>
        ) : (
          <>
            <div className="manageAdd-editInputsDiv">
              <label className="productDetail-Label"><b>Apodo</b></label>
              <input className="manageAdd-InputEditField" value={form.apodo} onChange={(e) => onChange("apodo", e.target.value)} />

              <label className="productDetail-Label"><b>Calle</b></label>
              <input className="manageAdd-InputEditField" value={form.calleEnvio} onChange={(e) => onChange("calleEnvio", e.target.value)} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label className="productDetail-Label"><b>No. Exterior</b></label>
                  <input className="manageAdd-InputEditField" value={form.exteriorEnvio} onChange={(e) => onChange("exteriorEnvio", e.target.value)} />
                </div>
                <div>
                  <label className="productDetail-Label"><b>No. Interior</b></label>
                  <input className="manageAdd-InputEditField" value={form.interiorEnvio} onChange={(e) => onChange("interiorEnvio", e.target.value)} />
                </div>
              </div>

              <label className="productDetail-Label"><b>Colonia</b></label>
              <input className="manageAdd-InputEditField" value={form.coloniaEnvio} onChange={(e) => onChange("coloniaEnvio", e.target.value)} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label className="productDetail-Label"><b>Ciudad</b></label>
                  <input className="manageAdd-InputEditField" value={form.ciudadEnvio} onChange={(e) => onChange("ciudadEnvio", e.target.value)} />
                </div>
                <div>
                  <label className="productDetail-Label"><b>Estado</b></label>
                  <input className="manageAdd-InputEditField" value={form.estadoEnvio} onChange={(e) => onChange("estadoEnvio", e.target.value)} />
                </div>
              </div>

              <label className="productDetail-Label"><b>C.P.</b></label>
              <input className="manageAdd-InputEditField" value={form.cpEnvio} onChange={(e) => onChange("cpEnvio", e.target.value)} />
            </div>

            <div className="manageAdd-SaveCancelDiv">
              <button className="manageAdd-SaveBtn" onClick={saveEdit} title="Guardar">
                <FontAwesomeIcon icon={faFloppyDisk} /> Guardar
              </button>
              <button className="manageAdd-CancelBtn" onClick={cancelEdit} title="Cancelar">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderBillingCard = (a) => {
    const isEditing = editId === a._id && editType === "billing";
    const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    return (
      <div key={a._id} className="manageAdd-AddGeneralDiv" style={{ padding: 12, marginBottom: 10, position: "relative" }}>
        <div className="manageAdd-NicknameStarDiv">
          <label className="productDetail-Label" style={{ fontWeight: 600 }}>
            {a?.razonSocial || "Datos de facturación"}
          </label>
        </div>

        <BillingToolbarCorners a={a} isEditing={isEditing} />

        {!isEditing ? (
          <div className="manageAdd-ShippAddDiv">
            <label className="productDetail-Label"><b>RFC:</b> {a?.rfcEmpresa || "—"}</label><br />
            <label className="productDetail-Label"><b>Correo Facturación:</b> {a?.correoFiscal || "—"}</label><br />

            <label className="productDetail-Label">
              {a?.calleFiscal || "—"} {a?.exteriorFiscal ? `#${a.exteriorFiscal}` : ""} {a?.interiorFiscal ? `Int. ${a.interiorFiscal}` : ""}
            </label>
            <label className="productDetail-Label">Col. {a?.coloniaFiscal || "—"}</label>
            <label className="productDetail-Label">
              {a?.ciudadFiscal || "—"}, {a?.estadoFiscal || "—"}
            </label>
            <label className="productDetail-Label">C.P. {a?.cpFiscal || "—"}</label>
          </div>
        ) : (
          <>
            <div className="manageAdd-editInputsDiv">
              <label className="productDetail-Label"><b>Razón Social</b></label>
              <input className="manageAdd-InputEditField" value={form.razonSocial} onChange={(e) => onChange("razonSocial", e.target.value)} />

              <label className="productDetail-Label"><b>RFC</b></label>
              <input className="manageAdd-InputEditField" value={form.rfcEmpresa} onChange={(e) => onChange("rfcEmpresa", e.target.value)} />

              <label className="productDetail-Label"><b>Correo Fiscal</b></label>
              <input className="manageAdd-InputEditField" value={form.correoFiscal} onChange={(e) => onChange("correoFiscal", e.target.value)} />

              <label className="productDetail-Label"><b>Calle</b></label>
              <input className="manageAdd-InputEditField" value={form.calleFiscal} onChange={(e) => onChange("calleFiscal", e.target.value)} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label className="productDetail-Label"><b>No. Exterior</b></label>
                  <input className="manageAdd-InputEditField" value={form.exteriorFiscal} onChange={(e) => onChange("exteriorFiscal", e.target.value)} />
                </div>
                <div>
                  <label className="productDetail-Label"><b>No. Interior</b></label>
                  <input className="manageAdd-InputEditField" value={form.interiorFiscal} onChange={(e) => onChange("interiorFiscal", e.target.value)} />
                </div>
              </div>

              <label className="productDetail-Label"><b>Colonia</b></label>
              <input className="manageAdd-InputEditField" value={form.coloniaFiscal} onChange={(e) => onChange("coloniaFiscal", e.target.value)} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label className="productDetail-Label"><b>Ciudad</b></label>
                  <input className="manageAdd-InputEditField" value={form.ciudadFiscal} onChange={(e) => onChange("ciudadFiscal", e.target.value)} />
                </div>
                <div>
                  <label className="productDetail-Label"><b>Estado</b></label>
                  <input className="manageAdd-InputEditField" value={form.estadoFiscal} onChange={(e) => onChange("estadoFiscal", e.target.value)} />
                </div>
              </div>

              <label className="productDetail-Label"><b>C.P.</b></label>
              <input className="manageAdd-InputEditField" value={form.cpFiscal} onChange={(e) => onChange("cpFiscal", e.target.value)} />
            </div>

            <div className="manageAdd-SaveCancelDiv">
              <button className="manageAdd-SaveBtn" onClick={saveEdit} title="Guardar">
                <FontAwesomeIcon icon={faFloppyDisk} /> Guardar
              </button>
              <button className="manageAdd-CancelBtn" onClick={cancelEdit} title="Cancelar">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  if (!userEmail) {
    return (
      <body className="app-shell body-BG-Gradient">
        <div className="app-main" style={{ padding: 16 }}>
          Inicia sesión para administrar tus direcciones.
        </div>
      </body>
    );
  }

  return (
    <body className="app-shell body-BG-Gradient">
      {/* HEADER */}
      <div className="app-header loginLogo-ParentDiv" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Logo"
          width="180"
          height="55"
          onClick={() => navigate("/userHome")}
          style={{ cursor: "pointer" }}
        />
      </div>

      {/* MAIN */}
      <div className="app-main">
        <label className="manageAddHeader-Label">Gestionar preferencias</label>

        {loading ? (
          <p style={{ textAlign: "center", marginTop: 12 }}>Cargando...</p>
        ) : (
          <div className="newQuotesScroll-Div" style={{ paddingBottom: 80 }}>
            {/* Shipping Preferences */}
            <div className="manageAdd-ShippPrefGeneralDiv">
              <div>
                <label className="manageAdd-ShippPrefLabel">Preferencias de Envío</label>

                <div className="address-summaryDiv" style={{ marginTop: 6 }}>
                  <label className="summary-Label"><b>Paquetería</b></label>

                  <select
                    className="productInfo-Input"
                    value={prefCarrier}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPrefCarrier(v);
                      if (v !== "Otro") setCustomCarrier("");
                    }}
                  >
                    <option value="">Selecciona...</option>
                    {CARRIERS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  {prefCarrier === "Otro" && (
                    <input
                      className="productInfo-Input"
                      style={{ marginTop: 6 }}
                      type="text"
                      placeholder="Especifica la paquetería"
                      value={customCarrier}
                      onChange={(e) => setCustomCarrier(e.target.value)}
                    />
                  )}

                  <label className="summary-Label" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <input type="checkbox" checked={prefInsured} onChange={(e) => setPrefInsured(e.target.checked)} />
                    <b>¿Asegurar envío?</b>
                  </label>

                  <button className="submitOrder-Btn" onClick={savePreferences} type="button" style={{ marginTop: 8, alignSelf: "flex-start" }}>
                    <FontAwesomeIcon icon={faFloppyDisk} /> Guardar preferencias
                  </button>
                </div>
              </div>
            </div>

            {/* Shipping Addresses */}
            <div className="deliveryDets-AddressDiv" style={{ marginTop: 12 }}>
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">Direcciones de Envío</label>
              </div>
              {shipping.length === 0 ? (
                <p style={{ padding: "8px 12px" }}>No hay direcciones de envío.</p>
              ) : (
                shipping.map((a) => renderShippingCard(a))
              )}
            </div>

            {/* Billing Addresses */}
            <div className="deliveryDets-AddressDiv" style={{ marginTop: 12 }}>
              <div className="headerEditIcon-Div">
                <label className="newUserData-Label">Direcciones de Facturación</label>
              </div>
              {billing.length === 0 ? (
                <p style={{ padding: "8px 12px" }}>No hay direcciones de facturación.</p>
              ) : (
                billing.map((a) => renderBillingCard(a))
              )}
            </div>
          </div>
        )}
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
    </body>
  );
}

// import { useEffect, useMemo, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import axios from "axios";

// import {
//   faArrowLeft,
//   faPen,
//   faTrash,
//   faStar as faStarSolid,
//   faTruckFast,
//   faFloppyDisk,
//   faStar,
// } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import { faHouse, faUser, faCartShopping, faListCheck } from "@fortawesome/free-solid-svg-icons";


// import Logo from "/src/assets/images/GIS_Logo.png";
// import { API } from "/src/lib/api";

// export default function ManageAddresses() {
//   const navigate = useNavigate();

//   const goHomeLogo = () => navigate("/userHome");
//   const goToHome = () => navigate("/userHome");
//   const goToNewOrder = () => navigate("/newOrder");
//   const goToMyProfile = () => navigate("/userProfile")

//   // Logged-in user/email
//   const [userCredentials, setUserCredentials] = useState(null);
//   useEffect(() => {
//     const saved = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     setUserCredentials(saved);
//   }, []);

//   const userEmail = useMemo(() => {
//     return (
//       userCredentials?.correo ||
//       JSON.parse(localStorage.getItem("gis-user") || "null")?.email ||
//       localStorage.getItem("userEmail") ||
//       ""
//     );
//   }, [userCredentials]);

//   // User + preferences
//   const [userDoc, setUserDoc] = useState(null);
//   const [prefCarrier, setPrefCarrier] = useState("");
//   const [prefInsured, setPrefInsured] = useState(false);

//   // Address lists
//   const [shipping, setShipping] = useState([]);
//   const [billing, setBilling] = useState([]);

//   // Inline edit states
//   const [editId, setEditId] = useState(null);
//   const [editType, setEditType] = useState(null);
//   const [form, setForm] = useState({});

//   const [loading, setLoading] = useState(true);

//   // small helper for axios with explicit success checks
//   const ok = (status) => status >= 200 && status < 300;

//   // Fetch everything
//   useEffect(() => {
//     const run = async () => {
//       if (!userEmail) return;
//       try {
//         setLoading(true);
  
//         const [prefsRes, sRes, bRes] = await Promise.all([
//           axios.get(`${API}/users/shipping-prefs`, {
//             params: { email: userEmail },
//             validateStatus: () => true,
//           }),
//           axios.get(`${API}/shipping-address/${encodeURIComponent(userEmail)}`),
//           axios.get(`${API}/billing-address/${encodeURIComponent(userEmail)}`),
//         ]);
  
//         if (prefsRes.status === 200) {
//           const p = prefsRes.data?.shippingPreferences || {};
//           setPrefCarrier((p.preferredCarrier ?? '').toString());
//           setPrefInsured(!!p.insureShipment);
//         } else {
//           // fallback to full user if GET /users/shipping-prefs not available
//           const uRes = await fetch(
//             `${API}/users/by-email?email=${encodeURIComponent(userEmail)}`,
//             { headers: { Accept: 'application/json' }, cache: 'no-store' }
//           );
//           if (uRes.ok) {
//             const u = await uRes.json();
//             setUserDoc(u || null);
//             const prefs = u?.shippingPreferences || {};
//             setPrefCarrier((prefs?.preferredCarrier ?? '').toString());
//             setPrefInsured(!!prefs?.insureShipment);
//           } else {
//             setUserDoc(null);
//             setPrefCarrier('');
//             setPrefInsured(false);
//           }
//         }
  
//         setShipping(Array.isArray(sRes.data) ? sRes.data : []);
//         setBilling(Array.isArray(bRes.data) ? bRes.data : []);
//       } catch (err) {
//         console.error('Manage load error:', err);
//         setShipping([]);
//         setBilling([]);
//       } finally {
//         setLoading(false);
//       }
//     };
//     run();
//   }, [userEmail]);
// //   useEffect(() => {
// //     const run = async () => {
// //       if (!userEmail) return;
// //       try {
// //         setLoading(true);

// //         const [uRes, sRes, bRes] = await Promise.all([
// //           fetch(`${API}/users/by-email?email=${encodeURIComponent(userEmail)}`, {
// //             headers: { Accept: "application/json" },
// //             cache: "no-store",
// //           }),
// //           axios.get(`${API}/shipping-address/${encodeURIComponent(userEmail)}`),
// //           axios.get(`${API}/billing-address/${encodeURIComponent(userEmail)}`),
// //         ]);

// //         if (uRes.ok) {
// //           const u = await uRes.json();
// //           setUserDoc(u || null);
// //           const prefs = u?.shippingPreferences || {};
// //           setPrefCarrier((prefs?.preferredCarrier ?? "").toString());
// //           setPrefInsured(!!prefs?.insureShipment);
// //         } else {
// //           setUserDoc(null);
// //         }

// //         setShipping(Array.isArray(sRes.data) ? sRes.data : []);
// //         setBilling(Array.isArray(bRes.data) ? bRes.data : []);
// //       } catch (err) {
// //         console.error("Manage load error:", err);
// //         setShipping([]);
// //         setBilling([]);
// //       } finally {
// //         setLoading(false);
// //       }
// //     };
// //     run();
// //   }, [userEmail]);

//   const startEdit = (type, a) => {
//     setEditType(type);
//     setEditId(a?._id);

//     if (type === "shipping") {
//       setForm({
//         apodo: a?.apodo || "",
//         calleEnvio: a?.calleEnvio || "",
//         exteriorEnvio: a?.exteriorEnvio || "",
//         interiorEnvio: a?.interiorEnvio || "",
//         coloniaEnvio: a?.coloniaEnvio || "",
//         ciudadEnvio: a?.ciudadEnvio || "",
//         estadoEnvio: a?.estadoEnvio || "",
//         cpEnvio: a?.cpEnvio || "",
//         isDefault: !!(a?.isDefault || a?.default),
//       });
//     } else {
//       // billing
//       setForm({
//         apodo: a?.apodo || "",
//         razonSocial: a?.razonSocial || a?.businessName || "",
//         rfcEmpresa: a?.rfcEmpresa || a?.rfc || "",
//         correoFiscal: a?.correoFiscal || "",
//         calleFiscal: a?.calleFiscal || "",
//         exteriorFiscal: a?.exteriorFiscal || "",
//         interiorFiscal: a?.interiorFiscal || "",
//         coloniaFiscal: a?.coloniaFiscal || "",
//         ciudadFiscal: a?.ciudadFiscal || "",
//         estadoFiscal: a?.estadoFiscal || "",
//         cpFiscal: a?.cpFiscal || "",
//         isDefault: !!(a?.isDefault || a?.default),
//       });
//     }
//   };

//   const cancelEdit = () => {
//     setEditType(null);
//     setEditId(null);
//     setForm({});
//   };

//   const refreshLists = async () => {
//     const [sRes, bRes] = await Promise.all([
//       axios.get(`${API}/shipping-address/${encodeURIComponent(userEmail)}`),
//       axios.get(`${API}/billing-address/${encodeURIComponent(userEmail)}`),
//     ]);
//     setShipping(Array.isArray(sRes.data) ? sRes.data : []);
//     setBilling(Array.isArray(bRes.data) ? bRes.data : []);
//   };

//   const saveEdit = async () => {
//     try {
//       if (!editId || !editType) return;

//       const endpoint =
//         editType === "shipping"
//           ? `${API}/shipping-address/${editId}`
//           : `${API}/billing-address/${editId}`;

//       // send ONLY the model fields + userEmail for safety  <-- important
//       const payload =
//         editType === "shipping"
//           ? {
//               userEmail, // <--
//               apodo: form.apodo,
//               calleEnvio: form.calleEnvio,
//               exteriorEnvio: form.exteriorEnvio,
//               interiorEnvio: form.interiorEnvio,
//               coloniaEnvio: form.coloniaEnvio,
//               ciudadEnvio: form.ciudadEnvio,
//               estadoEnvio: form.estadoEnvio,
//               cpEnvio: form.cpEnvio,
//               isDefault: !!form.isDefault,
//             }
//           : {
//               userEmail, // <--
//               apodo: form.apodo,
//               razonSocial: form.razonSocial,
//               rfcEmpresa: form.rfcEmpresa,
//               correoFiscal: form.correoFiscal,
//               calleFiscal: form.calleFiscal,
//               exteriorFiscal: form.exteriorFiscal,
//               interiorFiscal: form.interiorFiscal,
//               coloniaFiscal: form.coloniaFiscal,
//               ciudadFiscal: form.ciudadFiscal,
//               estadoFiscal: form.estadoFiscal,
//               cpFiscal: form.cpFiscal,
//               isDefault: !!form.isDefault,
//             };

//       const res = await axios.patch(endpoint, payload, { validateStatus: () => true }); // <--
//       if (!ok(res.status)) {
//         // likely 404 because route doesn't exist
//         console.error("PATCH address failed:", res.status, res.data);
//         alert(
//           `No se pudo actualizar la dirección (HTTP ${res.status}). ` +
//           `Asegúrate de tener en tu servidor: PATCH ${editType === "shipping" ? "/shipping-address/:id" : "/billing-address/:id"}`
//         );
//         return;
//       }

//       // If set as default, unset others (best-effort)
//       if (payload.isDefault) {
//         const list = editType === "shipping" ? shipping : billing;
//         await Promise.all(
//           list
//             .filter((a) => a._id !== editId && (a.isDefault || a.default))
//             .map((a) =>
//               axios
//                 .patch(
//                   editType === "shipping"
//                     ? `${API}/shipping-address/${a._id}`
//                     : `${API}/billing-address/${a._id}`,
//                   { userEmail, isDefault: false }, // <--
//                   { validateStatus: () => true }
//                 )
//                 .catch(() => null)
//             )
//         );
//       }

//       await refreshLists();
//       cancelEdit();
//       alert("Dirección actualizada.");
//     } catch (err) {
//       console.error("Save edit error:", err);
//       alert("No se pudo actualizar la dirección.");
//     }
//   };

//   const deleteAddress = async (type, id) => {
//     if (!window.confirm("¿Eliminar esta dirección? Esta acción no se puede deshacer.")) return;
//     try {
//       const endpoint =
//         type === "shipping"
//           ? `${API}/shipping-address/${id}`
//           : `${API}/billing-address/${id}`;

//       const res = await axios.delete(endpoint, { validateStatus: () => true }); // <--
//       if (!ok(res.status)) {
//         console.error("DELETE address failed:", res.status, res.data);
//         alert(
//           `No se pudo eliminar (HTTP ${res.status}). ` +
//           `Agrega en el backend: DELETE ${type === "shipping" ? "/shipping-address/:id" : "/billing-address/:id"}`
//         );
//         return;
//       }

//       if (type === "shipping") setShipping((prev) => prev.filter((a) => a._id !== id));
//       else setBilling((prev) => prev.filter((a) => a._id !== id));
//       alert("Dirección eliminada.");
//     } catch (err) {
//       console.error("Delete error:", err);
//       alert("No se pudo eliminar la dirección.");
//     }
//   };

//   const setDefault = async (type, id) => {
//     try {
//       const endpoint =
//         type === "shipping"
//           ? `${API}/shipping-address/${id}`
//           : `${API}/billing-address/${id}`;

//       // set the selected one to default
//       const res = await axios.patch(
//         endpoint,
//         { userEmail, isDefault: true }, // <--
//         { validateStatus: () => true }
//       );
//       if (!ok(res.status)) {
//         console.error("Set default failed:", res.status, res.data);
//         alert(
//           `No se pudo establecer como predeterminada (HTTP ${res.status}). ` +
//           `Agrega en el backend: PATCH ${type === "shipping" ? "/shipping-address/:id" : "/billing-address/:id"}`
//         );
//         return;
//       }

//       // unset others
//       const list = type === "shipping" ? shipping : billing;
//       await Promise.all(
//         list
//           .filter((a) => a._id !== id && (a.isDefault || a.default))
//           .map((a) =>
//             axios
//               .patch(
//                 type === "shipping"
//                   ? `${API}/shipping-address/${a._id}`
//                   : `${API}/billing-address/${a._id}`,
//                 { userEmail, isDefault: false }, // <--
//                 { validateStatus: () => true }
//               )
//               .catch(() => null)
//           )
//       );

//       await refreshLists();
//     } catch (err) {
//       console.error("Set default error:", err);
//       alert("No se pudo establecer como predeterminada.");
//     }
//   };

//   const savePreferences = async () => {
//     try {
//       const res = await axios.put(`${API}/users/shipping-prefs`, {
//         email: userEmail,
//         shippingPreferences: {
//           preferredCarrier: prefCarrier,
//           insureShipment: !!prefInsured,
//         },
//       }, { validateStatus: () => true });
  
//       if (res.status >= 200 && res.status < 300) {
//         alert('Preferencias de envío actualizadas.');
//       } else {
//         console.error('PUT /users/shipping-prefs failed:', res.status, res.data);
//         alert(`No se pudieron guardar las preferencias (HTTP ${res.status}).`);
//       }
//     } catch (err) {
//       console.error('Save preferences error:', err);
//       alert('No se pudieron guardar las preferencias.');
//     }
//   };

// //   const savePreferences = async () => {
// //     try {
// //       if (userDoc?._id) {
// //         await axios.patch(`${API}/users/${userDoc._id}`, {
// //           shippingPreferences: {
// //             preferredCarrier: prefCarrier,
// //             insureShipment: !!prefInsured,
// //           },
// //         });
// //       } else {
// //         await axios.put(`${API}/users/shipping-prefs`, {
// //           email: userEmail,
// //           shippingPreferences: {
// //             preferredCarrier: prefCarrier,
// //             insureShipment: !!prefInsured,
// //           },
// //         });
// //       }
// //       alert("Preferencias de envío actualizadas.");
// //     } catch (err) {
// //       console.error("Save preferences error:", err);
// //       alert("No se pudieron guardar las preferencias.");
// //     }
// //   };

//   // ===== BUTTONS IN CORNERS (unchanged visually) =====
//   const ShippingToolbarCorners = ({ a, isEditing }) => {
//     if (isEditing) return null;
//     return (
//       <>
//         <button
//           className="pencilButton-ManageAddress"
//           title="Editar"
//           onClick={() => startEdit("shipping", a)}
//           style={{ position: "absolute", top: 8, right: 8, padding: 6, minWidth: 34 }}
//         >
//           <FontAwesomeIcon icon={faPen} />
//         </button>
//         <button
//           className="trashButton-ManageAddress"
//           title="Eliminar"
//           onClick={() => deleteAddress("shipping", a._id)}
//           style={{ position: "absolute", bottom: 8, right: 8, padding: 6, minWidth: 34 }}
//         >
//           <FontAwesomeIcon icon={faTrash} />
//         </button>
//       </>
//     );
//   };

//   const BillingToolbarCorners = ({ a, isEditing }) => {
//     if (isEditing) return null;
//     return (
//       <>
//         <button
//           className="pencilButton-ManageAddress"
//           title="Editar"
//           onClick={() => startEdit("billing", a)}
//           style={{ position: "absolute", top: 8, right: 8, padding: 6, minWidth: 34 }}
//         >
//           <FontAwesomeIcon icon={faPen} />
//         </button>
//         <button
//           className="trashButton-ManageAddress"
//           title="Eliminar"
//           onClick={() => deleteAddress("billing", a._id)}
//           style={{ position: "absolute", bottom: 8, right: 8, padding: 6, minWidth: 34 }}
//         >
//           <FontAwesomeIcon icon={faTrash} />
//         </button>
//       </>
//     );
//   };

//   // ===== RENDERERS (same layout you wanted) =====
//   const renderShippingCard = (a) => {
//     const isEditing = editId === a._id && editType === "shipping";
//     const isDefault = !!(a?.isDefault || a?.default);
//     const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

//     return (
//       <div key={a._id} className="manageAdd-AddGeneralDiv" style={{ padding: 12, marginBottom: 10, position: "relative" }}>
//         <div className="manageAdd-NicknameStarDiv">
//           <label className="productDetail-Label" style={{ fontWeight: 600 }}>
//             {a?.apodo || "Dirección de envío"}
//           </label>
//           {/* {!isEditing && (
//             <button
//               className="starButton-ManageAddress"
//               title="Predeterminada"
//               onClick={() => setDefault("shipping", a._id)}
//             >
//               <FontAwesomeIcon icon={isDefault ? faStarSolid : faStar} />
//               <span style={{ fontSize: 12 }}>Predeterminada</span>
//             </button>
//           )} */}
//         </div>

//         <ShippingToolbarCorners a={a} isEditing={isEditing} />

//         {!isEditing ? (
//           <div className="manageAdd-ShippAddDiv">
//             <label className="productDetail-Label">
//               {a?.calleEnvio || "—"} {a?.exteriorEnvio ? `#${a.exteriorEnvio}` : ""} {a?.interiorEnvio ? `Int. ${a.interiorEnvio}` : ""}
//             </label>
//             <label className="productDetail-Label">Col. {a?.coloniaEnvio || "—"}</label>
//             <label className="productDetail-Label">{a?.ciudadEnvio || "—"}, {a?.estadoEnvio || "—"}</label>
//             <label className="productDetail-Label">C.P. {a?.cpEnvio || "—"}</label>
//           </div>
//         ) : (
//           <>
//             <div className="manageAdd-editInputsDiv">
//               <label className="productDetail-Label"><b>Apodo</b></label>
//               <input className="manageAdd-InputEditField" value={form.apodo} onChange={(e)=>onChange("apodo", e.target.value)} />

//               <label className="productDetail-Label"><b>Calle</b></label>
//               <input className="manageAdd-InputEditField" value={form.calleEnvio} onChange={(e)=>onChange("calleEnvio", e.target.value)} />

//               <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
//                 <div>
//                   <label className="productDetail-Label"><b>No. Exterior</b></label>
//                   <input className="manageAdd-InputEditField" value={form.exteriorEnvio} onChange={(e)=>onChange("exteriorEnvio", e.target.value)} />
//                 </div>
//                 <div>
//                   <label className="productDetail-Label"><b>No. Interior</b></label>
//                   <input className="manageAdd-InputEditField" value={form.interiorEnvio} onChange={(e)=>onChange("interiorEnvio", e.target.value)} />
//                 </div>
//               </div>

//               <label className="productDetail-Label"><b>Colonia</b></label>
//               <input className="manageAdd-InputEditField" value={form.coloniaEnvio} onChange={(e)=>onChange("coloniaEnvio", e.target.value)} />

//               <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
//                 <div>
//                   <label className="productDetail-Label"><b>Ciudad</b></label>
//                   <input className="manageAdd-InputEditField" value={form.ciudadEnvio} onChange={(e)=>onChange("ciudadEnvio", e.target.value)} />
//                 </div>
//                 <div>
//                   <label className="productDetail-Label"><b>Estado</b></label>
//                   <input className="manageAdd-InputEditField" value={form.estadoEnvio} onChange={(e)=>onChange("estadoEnvio", e.target.value)} />
//                 </div>
//               </div>

//               <label className="productDetail-Label"><b>C.P.</b></label>
//               <input className="manageAdd-InputEditField" value={form.cpEnvio} onChange={(e)=>onChange("cpEnvio", e.target.value)} />
//             </div>

//             <div className="manageAdd-SaveCancelDiv">
//               <button className="manageAdd-SaveBtn" onClick={saveEdit} title="Guardar">
//                 <FontAwesomeIcon icon={faFloppyDisk} /> Guardar
//               </button>
//               <button className="manageAdd-CancelBtn" onClick={cancelEdit} title="Cancelar">
//                 Cancelar
//               </button>
//             </div>
//           </>
//         )}
//       </div>
//     );
//   };

//   const renderBillingCard = (a) => {
//     const isEditing = editId === a._id && editType === "billing";
//     const isDefault = !!(a?.isDefault || a?.default);
//     const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

//     return (
//       <div key={a._id} className="manageAdd-AddGeneralDiv" style={{ padding: 12, marginBottom: 10, position: "relative" }}>
//         <div className="manageAdd-NicknameStarDiv">
//           <label className="productDetail-Label" style={{ fontWeight: 600 }}>
//             {a?.razonSocial || "Datos de facturación"}
//           </label>
//           {/* {!isEditing && (
//             <button
//               className="starButton-ManageAddress"
//               title="Predeterminada"
//               onClick={() => setDefault("billing", a._id)}
//             >
//               <FontAwesomeIcon icon={isDefault ? faStarSolid : faStar} />
//               <span style={{ fontSize: 12 }}>Predeterminada</span>
//             </button>
//           )} */}
//         </div>

//         <BillingToolbarCorners a={a} isEditing={isEditing} />

//         {!isEditing ? (
//           <div className="manageAdd-ShippAddDiv">
//             <label className="productDetail-Label"><b>RFC:</b> {a?.rfcEmpresa || "—"}</label><br/>
//             <label className="productDetail-Label"><b>Correo Facturación:</b> {a?.correoFiscal || "—"}</label><br/>

//             <label className="productDetail-Label">
//               {a?.calleFiscal || "—"} {a?.exteriorFiscal ? `#${a.exteriorFiscal}` : ""} {a?.interiorFiscal ? `Int. ${a.interiorFiscal}` : ""}
//             </label>
//             <label className="productDetail-Label">Col. {a?.coloniaFiscal || "—"}</label>
//             <label className="productDetail-Label">{a?.ciudadFiscal || "—"}, {a?.estadoFiscal || "—"}</label>
//             <label className="productDetail-Label">C.P. {a?.cpFiscal || "—"}</label>
//           </div>
//         ) : (
//           <>
//             <div className="manageAdd-editInputsDiv">
//               <label className="productDetail-Label"><b>Razón Social</b></label>
//               <input className="manageAdd-InputEditField" value={form.razonSocial} onChange={(e)=>onChange("razonSocial", e.target.value)} />

//               <label className="productDetail-Label"><b>RFC</b></label>
//               <input className="manageAdd-InputEditField" value={form.rfcEmpresa} onChange={(e)=>onChange("rfcEmpresa", e.target.value)} />
              
//               <label className="productDetail-Label"><b>Correo Fiscal</b></label>
//               <input className="manageAdd-InputEditField" value={form.correoFiscal} onChange={(e)=>onChange("correoFiscal", e.target.value)} />
              
//               <label className="productDetail-Label"><b>Calle</b></label>
//               <input className="manageAdd-InputEditField" value={form.calleFiscal} onChange={(e)=>onChange("calleFiscal", e.target.value)} />

//               <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
//                 <div>
//                   <label className="productDetail-Label"><b>No. Exterior</b></label>
//                   <input className="manageAdd-InputEditField" value={form.exteriorFiscal} onChange={(e)=>onChange("exteriorFiscal", e.target.value)} />
//                 </div>
//                 <div>
//                   <label className="productDetail-Label"><b>No. Interior</b></label>
//                   <input className="manageAdd-InputEditField" value={form.interiorFiscal} onChange={(e)=>onChange("interiorFiscal", e.target.value)} />
//                 </div>
//               </div>

//               <label className="productDetail-Label"><b>Colonia</b></label>
//               <input className="manageAdd-InputEditField" value={form.coloniaFiscal} onChange={(e)=>onChange("coloniaFiscal", e.target.value)} />

//               <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
//                 <div>
//                   <label className="productDetail-Label"><b>Ciudad</b></label>
//                   <input className="manageAdd-InputEditField" value={form.ciudadFiscal} onChange={(e)=>onChange("ciudadFiscal", e.target.value)} />
//                 </div>
//                 <div>
//                   <label className="productDetail-Label"><b>Estado</b></label>
//                   <input className="manageAdd-InputEditField" value={form.estadoFiscal} onChange={(e)=>onChange("estadoFiscal", e.target.value)} />
//                 </div>
//               </div>

//               <label className="productDetail-Label"><b>C.P.</b></label>
//               <input className="manageAdd-InputEditField" value={form.cpFiscal} onChange={(e)=>onChange("cpFiscal", e.target.value)} />
//             </div>

//             <div className="manageAdd-SaveCancelDiv">
//               <button className="manageAdd-SaveBtn" onClick={saveEdit} title="Guardar">
//                 <FontAwesomeIcon icon={faFloppyDisk} /> Guardar
//               </button>
//               <button className="manageAdd-CancelBtn" onClick={cancelEdit} title="Cancelar">
//                 Cancelar
//               </button>
//             </div>
//           </>
//         )}
//       </div>
//     );
//   };

//   if (!userEmail) {
//     return (
//       <body className="app-shell body-BG-Gradient">
//         <div className="app-main" style={{ padding: 16 }}>
//           Inicia sesión para administrar tus direcciones.
//         </div>
//       </body>
//     );
//   }

//   return (
//     <body className="app-shell body-BG-Gradient">
//       {/* HEADER */}
//       <div className="app-header loginLogo-ParentDiv" style={{ display: "flex", alignItems: "center", gap: 10 }}>
//         <img
//           className="secondaryPages-GISLogo"
//           src={Logo}
//           alt="Logo"
//           width="180"
//           height="55"
//           onClick={() => navigate("/userHome")}
//           style={{ cursor: "pointer" }}
//         />
//         {/* <button
//           className="quoter-AddMoreButton"
//           onClick={() => navigate(-1)}
//           title="Regresar"
//           style={{ marginLeft: "auto" }}
//         >
//           <FontAwesomeIcon icon={faArrowLeft} /> Regresar
//         </button> */}
//       </div>

//       {/* MAIN */}
//       <div className="app-main">
//         <label className="manageAddHeader-Label">Gestionar preferencias</label>

//         {loading ? (
//           <p style={{ textAlign: "center", marginTop: 12 }}>Cargando...</p>
//         ) : (
//           <div className="newQuotesScroll-Div" style={{ paddingBottom: 80 }}>
//             {/* Shipping Preferences */}
//             <div className="manageAdd-ShippPrefGeneralDiv">
//               <div>
//                 <label className="manageAdd-ShippPrefLabel">
//                   {/* <FontAwesomeIcon icon={faTruckFast} /> */}
//                   Preferencias de Envío
//                 </label>

//                 <div className="address-summaryDiv" style={{ marginTop: 6 }}>
//                   <label className="summary-Label"><b>Paquetería</b></label>
//                   <select className="productInfo-Input" value={prefCarrier} onChange={(e) => setPrefCarrier(e.target.value)}>
//                     <option value="">Selecciona...</option>
//                     <option value="DHL">DHL</option>
//                     <option value="FedEx">FedEx</option>
//                     <option value="Estafeta">Estafeta</option>
//                     <option value="Paquetexpress">Paquetexpress</option>
//                     <option value="Redpack">Redpack</option>
//                     <option value="UPS">UPS</option>
//                     <option value="Otro">Otro</option>
//                   </select>

//                   <label className="summary-Label" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6 }}>
//                     <input type="checkbox" checked={prefInsured} onChange={(e) => setPrefInsured(e.target.checked)} />
//                     <b>¿Asegurar envío?</b>
//                   </label>

//                   <button className="submitOrder-Btn" onClick={savePreferences} type="button" style={{ marginTop: 8, alignSelf: "flex-start" }}>
//                     <FontAwesomeIcon icon={faFloppyDisk} /> Guardar preferencias
//                   </button>
//                 </div>
//               </div>
//             </div>

//             {/* Shipping Addresses */}
//             <div className="deliveryDets-AddressDiv" style={{ marginTop: 12 }}>
//               <div className="headerEditIcon-Div">
//                 <label className="newUserData-Label">Direcciones de Envío</label>
//               </div>
//               {shipping.length === 0 ? (
//                 <p style={{ padding: "8px 12px" }}>No hay direcciones de envío.</p>
//               ) : (
//                 shipping.map((a) => renderShippingCard(a))
//               )}
//             </div>

//             {/* Billing Addresses */}
//             <div className="deliveryDets-AddressDiv" style={{ marginTop: 12 }}>
//               <div className="headerEditIcon-Div">
//                 <label className="newUserData-Label">Direcciones de Facturación</label>
//               </div>
//               {billing.length === 0 ? (
//                 <p style={{ padding: "8px 12px" }}>No hay direcciones de facturación.</p>
//               ) : (
//                 billing.map((a) => renderBillingCard(a))
//               )}
//             </div>
//           </div>
//         )}
//       </div>

//         {/* FOOTER MENU */}
//         <div className="app-footer footerMenuDiv">
//         <div className="footerHolder">
//           <div className="footerIcon-NameDiv" onClick={goToHome}>
//             <FontAwesomeIcon icon={faHouse} className="footerIcons" />
//             <label className="footerIcon-Name">PRINCIPAL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={goToMyProfile}>
//             <FontAwesomeIcon icon={faUser} className="footerIcons" />
//             <label className="footerIcon-Name">MI PERFIL</label>
//           </div>
//           <div className="footerIcon-NameDiv" onClick={goToNewOrder}>
//             <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
//             <label className="footerIcon-Name">ORDENA</label>
//           </div>
//         </div>
//       </div>
//     </body>
//   );
// }
