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
              className="submitOrder-Btn"
              type="button"
              onClick={save}
              disabled={saving || (preferredCarrier === "Otro" && !customCarrier.trim())}
            >
              {saving ? "Guardando..." : "Guardar preferencias"}
            </button>
            <button className="generatePDF-Btn" type="button" onClick={() => navigate("/userProfile")}>
              Cancelar
            </button>
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


// // can you help me direct edit editShippingPreferences.jsx

// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";

// import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

// import Logo from "/src/assets/images/GIS_Logo.png";
// import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png"

// import { API } from "/src/lib/api";

// export default function EditShippingPreferences() {
//   const navigate = useNavigate();

//   function goHomeLogo(){ navigate("/userHome"); }
//   function goToHome() { navigate("/userHome"); }
//   function goToNewOrder() { navigate("/newOrder"); }
//   function goToMyProfile() { navigate("/userProfile"); }

//   const CARRIER_OPTIONS = [
//     "Recoger en sucursal",
//     " Autocamiones del Pacífico",
//     "Castores",
//     "DHL",
//     "Estafeta",
//     "Express Manzanillo-Guadalajara",
//     "Kora Express",
//     "Paquete Express",
//     "Paqueteria Vallarta Plus",
//     "Paquetería y Mensajería de Michoacán",
//     "PCP - Paquetería y Carga del Pacífico",
//     "Tamazula Express",
//     "Transportes Unidos de Tepa",
//     "Tres Guerras",
//     "Otro",
//   ];

//   const [email, setEmail] = useState("");
//   const [preferredCarrier, setPreferredCarrier] = useState("");
//   const [customCarrier, setCustomCarrier] = useState("");   // NEW: for "Otro"
//   const [insureShipment, setInsureShipment] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [msg, setMsg] = useState("");

//   useEffect(() => {
//     const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     const e =
//       creds?.correo ||
//       JSON.parse(localStorage.getItem("gis-user") || "null")?.email ||
//       localStorage.getItem("userEmail") ||
//       "";
//     setEmail(e);

//     // Cargar valores actuales (Mongo → fallback localStorage)
//     (async () => {
//       try {
//         const res = await fetch(`${API}/users/by-email?email=${encodeURIComponent(e)}`, {
//           method: "GET",
//           headers: { Accept: "application/json" },
//           cache: "no-store",
//         });
//         if (res.ok) {
//           const data = await res.json();
//           const prefs =
//             data?.shippingPreferences || {
//               preferredCarrier: data?.preferredCarrier || "",
//               insureShipment: !!data?.insureShipment,
//             };
//           const current = (prefs?.preferredCarrier || "").trim();

//           // If current value isn't one of the predefined options, treat it as "Otro"
//           const isKnown = CARRIER_OPTIONS.some(opt => opt.toLowerCase() === current.toLowerCase());
//           if (current && !isKnown) {
//             setPreferredCarrier("Otro");
//             setCustomCarrier(current);
//           } else {
//             setPreferredCarrier(current);
//             setCustomCarrier("");
//           }
//           setInsureShipment(!!prefs?.insureShipment);
//         } else {
//           // fallback local
//           const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
//           if (local) {
//             const current = (local.preferredCarrier || "").trim();
//             const isKnown = CARRIER_OPTIONS.some(opt => opt.toLowerCase() === current.toLowerCase());
//             if (current && !isKnown) {
//               setPreferredCarrier("Otro");
//               setCustomCarrier(current);
//             } else {
//               setPreferredCarrier(current);
//               setCustomCarrier("");
//             }
//             setInsureShipment(!!local.insureShipment);
//           }
//         }
//       } catch {
//         const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
//         if (local) {
//           const current = (local.preferredCarrier || "").trim();
//           const isKnown = CARRIER_OPTIONS.some(opt => opt.toLowerCase() === current.toLowerCase());
//           if (current && !isKnown) {
//             setPreferredCarrier("Otro");
//             setCustomCarrier(current);
//           } else {
//             setPreferredCarrier(current);
//             setCustomCarrier("");
//           }
//           setInsureShipment(!!local.insureShipment);
//         }
//       }
//     })();
//   }, []);

//   const effectiveCarrier = () =>
//     preferredCarrier === "Otro" ? customCarrier.trim() : preferredCarrier.trim();

//   const save = async () => {
//     if (!email) {
//       setMsg("No se encontró el correo del usuario.");
//       return;
//     }
//     if (preferredCarrier === "Otro" && !customCarrier.trim()) {
//       setMsg("Por favor especifica la paquetería en el campo de 'Otro'.");
//       return;
//     }

//     setSaving(true);
//     setMsg("");

//     // const payload = {
//     //   email,
//     //   preferredCarrier: effectiveCarrier(), // send the resolved carrier
//     //   insureShipment,
//     // };

//     const payload = {
//         email,
//         shippingPreferences: {
//           preferredCarrier: effectiveCarrier(),
//           insureShipment,
//         },
//     };

//     try {
//       const res = await fetch(`${API}/users/shipping-prefs`, {
//         method: "PUT",
//         headers: { "Content-Type": "application/json", Accept: "application/json" },
//         body: JSON.stringify(payload),
//       });

//       if (!res.ok) {
//         const txt = await res.text().catch(() => "");
//         throw new Error(txt || `HTTP ${res.status}`);
//       }

//       // Guarda como respaldo local (PWA/offline)
//       localStorage.setItem("userShippingPrefs", JSON.stringify({
//         preferredCarrier: payload.preferredCarrier,
//         insureShipment
//       }));

//       setMsg("Preferencias de envío guardadas.");
//       setTimeout(() => navigate("/userProfile"), 700);
//     } catch (err) {
//       console.error("Save shipping prefs error:", err);
//       // Fallback local si la API aún no existe
//       localStorage.setItem("userShippingPrefs", JSON.stringify({
//         preferredCarrier: effectiveCarrier(),
//         insureShipment
//       }));
//       setMsg("Guardado local realizado. (El servidor no respondió)");
//       setTimeout(() => navigate("/userProfile"), 900);
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <body className="app-shell body-BG-Gradient">
//       <div className="app-header loginLogo-ParentDiv">
//         <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={() => navigate("/userHome")} />
//       </div>

//       <div className="app-main">
//         <div className="edit-titleIcon-Div">
//           <label className="editAddress-headerLabel">Preferencias de Envío</label>
//           <img src={GestionaIcono} alt="Home Icon" width="35" height="35"/>
//         </div>

//         <div className="editInstructions-Div">
//           <label className="editInstructions-Label">
//             Dinos como prefieres que te enviemos tus paquetes, ya sea por medio de un transportista específico o si prefieres pasar a sucursal por él. 
//             Al igual, haznos saber si quisieras que tus paquetes viajen asegurados.
//             <br/><br/>
//             Recuerda que puedes agregar más de una preferencia, así podremos manejar tus pedidos a tu medida 
//           </label>
//         </div>

//         <div className="addressInputs-Div">
//           <label className="newUserData-Label">Paquetería preferida</label>
//           <select
//             className="productInfo-Input"
//             value={preferredCarrier}
//             onChange={(e) => setPreferredCarrier(e.target.value)}
//           >
//             <option value="">Selecciona una opción</option>
//             {CARRIER_OPTIONS.map((opt) => (
//               <option key={opt} value={opt}>{opt}</option>
//             ))}
//           </select>

//           {/* NEW: custom carrier input only when "Otro" */}
//           {preferredCarrier === "Otro" && (
//             <>
//               <label className="newUserData-Label" style={{ marginTop: 10 }}>
//                 Especifica la paquetería
//               </label>
//               <input
//                 className="productInfo-Input"
//                 type="text"
//                 placeholder="Nombre de la paquetería"
//                 value={customCarrier}
//                 onChange={(e) => setCustomCarrier(e.target.value)}
//               />
//             </>
//           )}

//           <label className="newUserData-Label" style={{ marginTop: 12 }}>
//             ¿Deseas asegurar los envíos?
//           </label>
//           <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 60, marginTop: 10 }}>
//             <input
//               type="checkbox"
//               id="insure"
//               checked={insureShipment}
//               onChange={(e) => setInsureShipment(e.target.checked)}
//             />
//             <label htmlFor="insure" className="summary-Label">Sí, asegurar envío</label>
//           </div>

//           <div className="actionButtons-Div" style={{ marginTop: 16 }}>
//             <button
//               className="submitOrder-Btn"
//               type="button"
//               onClick={save}
//               disabled={saving || (preferredCarrier === "Otro" && !customCarrier.trim())}
//             >
//               {saving ? "Guardando..." : "Guardar preferencias"}
//             </button>
//             <button className="generatePDF-Btn" type="button" onClick={() => navigate("/userProfile")}>
//               Cancelar
//             </button>
//           </div>

//           {msg && (
//             <div className="popUp-Message" style={{ marginTop: 10 }}>
//               <p className="success">{msg}</p>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* FOOTER MENU */}
//     <div className="app-footer footerMenuDiv">
//         <div className="footerHolder">
//             {/* HOME FOOTER DIV */}
//             <div className="footerIcon-NameDiv" onClick={goToHome}>
//                 <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
//                 <label className="footerIcon-Name">PRINCIPAL</label>
//             </div>

//             {/* USER FOOTER DIV */}
//             <div className="footerIcon-NameDiv" onClick={goToMyProfile}>
//                 <FontAwesomeIcon icon={faUser} className="footerIcons"/>
//                 <label className="footerIcon-Name">MI PERFIL</label>
//             </div>

//             {/* SETTINGS FOOTER DIV */}
//             <div className="footerIcon-NameDiv" onClick={goToNewOrder}>
//                 <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
//                 <label className="footerIcon-Name">ORDENA</label>
//             </div>
//         </div>
//     </div>
//     {/* FOOTER MENU END */}
//     </body>
//   );
// }


// ----------

// // this is pur current editShippingPreferences.jsx. I just added "Otro" as an option in the dropdown to select carrier. Cam you help me add an input field that appears only if user has selected "otro" right under the dropdown menu and that allows user to input a different carrier option than those in the dropdown. Direct edit please and make sure to add/mention the needed changes to newUserModel schema and, if neede to router, too
// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";

// import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

// import Logo from "/src/assets/images/GIS_Logo.png";
// import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png"

// import { API } from "/src/lib/api";

// export default function EditShippingPreferences() {
//   const navigate = useNavigate();

//     function goHomeLogo(){
//         console.log("Return home clicked")
//         navigate("/userHome")
//     }

//     function goToHome() {
//         console.log("Go to home")
//         navigate("/userHome")
//     }

//     function goToNewOrder() {
//         console.log("Go to new order")
//         navigate("/newOrder")
//     }

//     function goToMyProfile() {
//         console.log("Go to my profile")
//         navigate("/userProfile")
//     }

//   const [email, setEmail] = useState("");
//   const [preferredCarrier, setPreferredCarrier] = useState("");
//   const [insureShipment, setInsureShipment] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [msg, setMsg] = useState("");

//   useEffect(() => {
//     const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     const e =
//       creds?.correo ||
//       JSON.parse(localStorage.getItem("gis-user") || "null")?.email ||
//       localStorage.getItem("userEmail") ||
//       "";
//     setEmail(e);

//     // Cargar valores actuales (Mongo → fallback localStorage)
//     (async () => {
//       try {
//         const res = await fetch(`${API}/users/by-email?email=${encodeURIComponent(e)}`, {
//           method: "GET",
//           headers: { Accept: "application/json" },
//           cache: "no-store",
//         });
//         if (res.ok) {
//           const data = await res.json();
//           const prefs =
//             data?.shippingPreferences || {
//               preferredCarrier: data?.preferredCarrier || "",
//               insureShipment: !!data?.insureShipment,
//             };
//           setPreferredCarrier(prefs?.preferredCarrier || "");
//           setInsureShipment(!!prefs?.insureShipment);
//         } else {
//           const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
//           if (local) {
//             setPreferredCarrier(local.preferredCarrier || "");
//             setInsureShipment(!!local.insureShipment);
//           }
//         }
//       } catch {
//         const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
//         if (local) {
//           setPreferredCarrier(local.preferredCarrier || "");
//           setInsureShipment(!!local.insureShipment);
//         }
//       }
//     })();
//   }, []);

//   const save = async () => {
//     if (!email) {
//       setMsg("No se encontró el correo del usuario.");
//       return;
//     }
//     setSaving(true);
//     setMsg("");

//     const payload = {
//       email,
//       preferredCarrier,
//       insureShipment,
//     };

//     try {
//       // Recomendado: PUT /users/shipping-prefs
//       const res = await fetch(`${API}/users/shipping-prefs`, {
//         method: "PUT",
//         headers: { "Content-Type": "application/json", Accept: "application/json" },
//         body: JSON.stringify(payload),
//       });

//       if (!res.ok) {
//         const txt = await res.text().catch(() => "");
//         throw new Error(txt || `HTTP ${res.status}`);
//       }

//       // También guarda como respaldo local (útil PWA/offline)
//       localStorage.setItem("userShippingPrefs", JSON.stringify({ preferredCarrier, insureShipment }));

//       setMsg("Preferencias de envío guardadas.");
//       setTimeout(() => navigate("/userProfile"), 700);
//     } catch (err) {
//       console.error("Save shipping prefs error:", err);
//       // Fallback local si la API aún no existe
//       localStorage.setItem("userShippingPrefs", JSON.stringify({ preferredCarrier, insureShipment }));
//       setMsg("Guardado local realizado. (El servidor no respondió)");
//       setTimeout(() => navigate("/userProfile"), 900);
//     } finally {
//       setSaving(false);
//     }
//   };

//   return (
//     <body className="app-shell body-BG-Gradient">
//       <div className="app-header loginLogo-ParentDiv">
//         <img className="secondaryPages-GISLogo" src={Logo} alt="GIS" width="180" height="55" onClick={() => navigate("/userHome")} />
//       </div>

//       <div className="app-main">
//             <div className="edit-titleIcon-Div">
//                 <label className="editAddress-headerLabel">Preferencias de Envío</label>
//                 <img src={GestionaIcono} alt="Home Icon" width="35" height="35"/>
//             </div>

//             <div className="editInstructions-Div">
//                 <label className="editInstructions-Label">Dinos como prefieres que te enviemos tus paquetes, ya sea por medio de un transportista específico o si prefieres pasar a sucursal por él. Al igual, haznos saber si quisieras que tus paquetes viajen asegurados.<br></br> 
//                     <br></br>Recuerda que puedes agregar más de una preferencia, así podremos manejar tus pedidos a tu medida 
//                 </label>
//             </div>

//         <div className="addressInputs-Div">
//           <label className="newUserData-Label">Paquetería preferida</label>
//           <select
//             className="productInfo-Input"
//             value={preferredCarrier}
//             onChange={(e) => setPreferredCarrier(e.target.value)}
//           >
//             <option value="">Selecciona una opción</option>
//             <option value="Recoger en sucursal">Recoger en sucursal</option>
//             <option value=" Autocamiones del Pacífico"> Autocamiones del Pacífico</option>
//             <option value="Castores">Castores</option>
//             <option value="DHL">DHL</option>
//             <option value="Estafeta">Estafeta</option>
//             <option value="Express Manzanillo-Guadalajara">Express Manzanillo-Guadalajara</option>
//             <option value="Kora Express">Kora Express</option>
//             <option value="Paquete Express">Paquete Express</option>
//             <option value="Paqueteria Vallarta Plus">Paqueteria Vallarta Plus</option>
//             <option value="Paquetería y Mensajería de Michoacán">Paquetería y Mensajería de Michoacán</option>
//             <option value="PCP - Paquetería y Carga del Pacífico">PCP - Paquetería y Carga del Pacífico</option>
//             <option value="Tamazula Express">Tamazula Express</option>
//             <option value="Transportes Unidos de Tepa">Transportes Unidos de Tepa</option>
//             <option value="Tres Guerras">Tres Guerras</option>
//             <option value="Otro">Otro</option>
//           </select>

//           <label className="newUserData-Label" style={{ marginTop: 12 }}>
//             ¿Deseas asegurar los envíos?
//           </label>
//           <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 60, marginTop: 10 }}>
//             <input
//               type="checkbox"
//               id="insure"
//               checked={insureShipment}
//               onChange={(e) => setInsureShipment(e.target.checked)}
//             />
//             <label htmlFor="insure" className="summary-Label">Sí, asegurar envío</label>
//           </div>

//           <div className="actionButtons-Div" style={{ marginTop: 16 }}>
//             <button className="submitOrder-Btn" type="button" onClick={save} disabled={saving}>
//               {saving ? "Guardando..." : "Guardar preferencias"}
//             </button>
//             <button className="generatePDF-Btn" type="button" onClick={() => navigate("/userProfile")}>
//               Cancelar
//             </button>
//           </div>

//           {msg && (
//             <div className="popUp-Message" style={{ marginTop: 10 }}>
//               <p className="success">{msg}</p>
//             </div>
//           )}
//         </div>
//       </div>
//       {/* FOOTER MENU */}
//       <div className="app-footer footerMenuDiv">
//                 <div className="footerHolder">
//                     {/* HOME FOOTER DIV */}
//                     <div className="footerIcon-NameDiv" onClick={goToHome}>
//                         <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
//                         <label className="footerIcon-Name">PRINCIPAL</label>
//                     </div>

//                     {/* USER FOOTER DIV */}
//                     <div className="footerIcon-NameDiv" onClick={goToMyProfile}>
//                         <FontAwesomeIcon icon={faUser} className="footerIcons"/>
//                         <label className="footerIcon-Name">MI PERFIL</label>
//                     </div>

//                     {/* SETTINGS FOOTER DIV */}
//                     <div className="footerIcon-NameDiv" onClick={goToNewOrder}>
//                         <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
//                         <label className="footerIcon-Name">ORDENA</label>
//                     </div>
//                 </div>

//             </div>
//             {/* FOOTER MENU END */}
//     </body>
//   );
// }
