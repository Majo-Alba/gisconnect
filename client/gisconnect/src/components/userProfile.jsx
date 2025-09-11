import { useState, useEffect, useMemo } from "react";
import { useNavigate } from 'react-router-dom';
import axios from "axios";

import { faHouse, faUser, faCartShopping, faListCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import LocationIcon from "/src/assets/images/Icon_location-pin.png";
import InvoiceIcon from "/src/assets/images/Icon_edit-Invoice.png";
import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png";

import { API } from "/src/lib/api";

export default function UserProfile() {
  const navigate = useNavigate();

  const goHomeLogo = () => navigate("/userHome");
  const goToHome = () => navigate("/userHome");
  const goToNewOrder = () => navigate("/newOrder");
  const goToMyProfile = () => navigate("/userProfile");
  const editAddresses = () => navigate("/editAddress");
  const editInvoiceInfo = () => navigate("/editInvoice");
  const editShippingPrefs = () => navigate("/editShippingPreferences");

  // NEW: go to full manager
  const goToManageAll = () => navigate("/manageAddresses");

  // --- Credenciales / email ---
  const [userCredentials, setUserCredentials] = useState(null);
  useEffect(() => {
    const savedCreds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    setUserCredentials(savedCreds);
  }, []);

  // --- Datos de usuario desde Mongo (newusers) ---
  const [userDoc, setUserDoc] = useState(null);
  const [shipPrefs, setShipPrefs] = useState({ preferredCarrier: "", insureShipment: false });

  useEffect(() => {
    const fetchMongoUser = async (email) => {
      if (!email) return;
      try {
        const res = await fetch(`${API}/users/by-email?email=${encodeURIComponent(email)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setUserDoc(data || null);

          const prefs =
            data?.shippingPreferences || {
              preferredCarrier: data?.preferredCarrier || "",
              insureShipment: !!data?.insureShipment,
            };
          setShipPrefs({
            preferredCarrier: prefs?.preferredCarrier || "",
            insureShipment: !!prefs?.insureShipment,
          });
        } else {
          console.warn("users/by-email not available. Using local fallback.");
          const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
          if (local) setShipPrefs(local);
        }
      } catch (err) {
        console.error("Error fetching user from Mongo:", err);
        const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
        if (local) setShipPrefs(local);
      }
    };

    const email =
      userCredentials?.correo ||
      JSON.parse(localStorage.getItem("gis-user") || "null")?.email ||
      localStorage.getItem("userEmail");

    fetchMongoUser(email);
  }, [userCredentials]);

  // =================== ADDRESSES FROM MONGODB ===================
  const [shippingAddresses, setShippingAddresses] = useState([]);
  const [billingAddresses, setBillingAddresses] = useState([]);
  const [addrLoading, setAddrLoading] = useState(false);

  const userEmail = useMemo(() => {
    return (
      userCredentials?.correo ||
      JSON.parse(localStorage.getItem("gis-user") || "null")?.email ||
      localStorage.getItem("userEmail") ||
      ""
    );
  }, [userCredentials]);

  useEffect(() => {
    if (!userEmail) return;

    const fetchAddresses = async () => {
      try {
        setAddrLoading(true);
        const [shipRes, billRes] = await Promise.all([
          axios.get(`${API}/shipping-address/${encodeURIComponent(userEmail)}`),
          axios.get(`${API}/billing-address/${encodeURIComponent(userEmail)}`),
        ]);

        setShippingAddresses(Array.isArray(shipRes.data) ? shipRes.data : []);
        setBillingAddresses(Array.isArray(billRes.data) ? billRes.data : []);
      } catch (err) {
        console.error("Error fetching addresses:", err);
        setShippingAddresses([]);
        setBillingAddresses([]);
      } finally {
        setAddrLoading(false);
      }
    };

    fetchAddresses();
  }, [userEmail]);

  // Choose default or first address
  const pickDefault = (arr = []) => {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const byFlag =
      arr.find((a) => a?.isDefault === true) ||
      arr.find((a) => a?.default === true) ||
      null;
    return byFlag || arr[0];
  };

  const shipping = pickDefault(shippingAddresses) || {};
  const billing = pickDefault(billingAddresses) || {};

  // === Nombres desde Mongo ===
  const nombreUsuario =
    userDoc?.nombre || userDoc?.name || userDoc?.fullName || "";

  const nombreEmpresa =
    userDoc?.nombreEmpresa || userDoc?.companyName || userDoc?.empresa || "";

  // === Preferencias de envío (Mongo) ===
  const preferredCarrier = shipPrefs.preferredCarrier || "";
  const insureShipment = !!shipPrefs.insureShipment;

  // === Campos de ENVÍO desde Mongo ===
  const calleEnvio = shipping?.calleEnvio || shipping?.street || "";
  const exteriorEnvio = shipping?.exteriorEnvio || shipping?.exteriorNumber || "";
  const interiorEnvio = shipping?.interiorEnvio || shipping?.interiorNumber || "";
  const coloniaEnvio = shipping?.coloniaEnvio || shipping?.colony || "";
  const cpEnvio = shipping?.cpEnvio || shipping?.postalCode || shipping?.cp || "";
  const ciudadEnvio = shipping?.ciudadEnvio || shipping?.city || "";
  const estadoEnvio = shipping?.estadoEnvio || shipping?.state || "";

  // === Campos de FACTURACIÓN desde Mongo ===
  const correoFiscal = billing?.correoFiscal || billing?.email || "";
  const razonSocial = billing?.razonSocial || billing?.businessName || "";
  const rfcEmpresa = billing?.rfcEmpresa || billing?.rfc || "";
  const regimenFiscal = billing?.regimenFiscal || billing?.taxRegime || "";
  const usoCFDI = billing?.usoCFDI || billing?.cfdiUse || "";

  const calleFiscal = billing?.calleFiscal || billing?.billingStreet || "";
  const exteriorFiscal = billing?.exteriorFiscal || billing?.billingExterior || "";
  const interiorFiscal = billing?.interiorFiscal || billing?.billingInterior || "";
  const coloniaFiscal = billing?.coloniaFiscal || billing?.billingColony || "";
  const cpFiscal = billing?.cpFiscal || billing?.billingCP || "";
  const ciudadFiscal = billing?.ciudadFiscal || billing?.billingCity || "";
  const estadoFiscal = billing?.estadoFiscal || billing?.billingState || "";

  const clienteDesde = "";

  return (
    <body className="app-shell body-BG-Gradient">
      {/* LOGOS DIV */}
      <div className="app-header loginLogo-ParentDiv">
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Home Icon"
          width="180"
          height="55"
          onClick={goHomeLogo}
        />
      </div>

      <div className="app-main">
        <h3 className="clientProfile-headerLabel">
          Hola {nombreUsuario || "usuario"}
        </h3>

        <div className="clientInfo-Div">
          <h3 className="clientProfile-sectionContent">{nombreEmpresa || "—"}</h3>
          <h3 className="clientProfile-sectionContent">Cliente desde: {clienteDesde || "—"}</h3>
        </div>

        <div className="extraInfo-Div">
          <label className="clientProfile-subHeaderTitle">DETALLES DE TU CUENTA</label>

          {/* ===== Manage all button (NEW) ===== */}
          {/* <div style={{ display: "flex", marginBottom: 8 }}> */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, marginRight: 10 }}>
            <button
              className="userProfile-ManageBtn"
              onClick={goToManageAll}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              type="button"
            >
              <FontAwesomeIcon icon={faListCheck} />
              Gestionar preferencias
            </button>
          </div>

          {/* DIRECCIONES */}
          <div className="sectionHeader-iconEdit-Div">
            <label className="subSection-headerLabel">Datos de Envío</label>
            <div className="icon-editLabel-Div" onClick={goToManageAll}>
              <img src={LocationIcon} alt="Editar" width="25" height="25" />
              <label className="edit-Label">Administrar <br /> direcciones</label>
            </div>
          </div>

          <div className="address-summaryDiv">
            <label className="summary-Label">
              <b>Domicilio:</b>{" "}
              {addrLoading
                ? "Cargando..."
                : `${calleEnvio || "—"}, Ext. #${exteriorEnvio || "—"}, Int. ${interiorEnvio || "—"}`}
            </label>
            <label className="summary-Label"><b>Col.:</b> {addrLoading ? "Cargando..." : (coloniaEnvio || "—")}</label>
            <label className="summary-Label"><b>Ciudad:</b> {addrLoading ? "Cargando..." : (ciudadEnvio || "—")}</label>
            <label className="summary-Label"><b>Estado:</b> {addrLoading ? "Cargando..." : (estadoEnvio || "—")}</label>
            <label className="summary-Label"><b>C.P.:</b> {addrLoading ? "Cargando..." : (cpEnvio || "—")}</label>
          </div>

          {/* PREFERENCIAS DE ENVÍO */}
          <div className="sectionHeader-iconEdit-Div" style={{ marginTop: 14 }}>
            <label className="subSection-headerLabel">Preferencias de Envío</label>
            <div className="icon-editLabel-Div" onClick={goToManageAll}>
              <img src={GestionaIcono} alt="Editar" width="29" height="29" />
              <label className="edit-Label">Administrar <br /> preferencias</label>
            </div>
          </div>

          <div className="address-summaryDiv">
            <label className="summary-Label">
              <b>Paquetería preferida:</b> {preferredCarrier || "—"}
            </label>
            <label className="summary-Label">
              <b>Seguro de envío:</b> {insureShipment ? "Sí" : "No"}
            </label>
          </div>

          {/* FACTURACIÓN */}
          <div className="sectionHeader-iconEdit-Div" style={{ marginTop: 14 }}>
            <label className="subSection-invoiceLabel">Datos de Facturación</label>
            <div className="icon-editLabel-Div" onClick={goToManageAll}>
              <img src={InvoiceIcon} alt="Editar" width="25" height="25" />
              <label className="edit-Label">Administrar datos <br /> de facturación</label>
            </div>
          </div>

          <div className="address-summaryDiv">
            <label className="summary-Label"><b>Correo de facturación:</b> {addrLoading ? "Cargando..." : (correoFiscal || "—")}</label>
            <label className="summary-Label"><b>Nombre o Razón Social:</b> {addrLoading ? "Cargando..." : (razonSocial || "—")}</label>
            <label className="summary-Label"><b>RFC:</b> {addrLoading ? "Cargando..." : (rfcEmpresa || "—")}</label>
            <label className="summary-Label"><b>CFDI:</b> {addrLoading ? "Cargando..." : (usoCFDI || "—")}</label>
            <label className="summary-Label"><b>Régimen Fiscal:</b> {addrLoading ? "Cargando..." : (regimenFiscal || "—")}</label>
            <label className="summary-Label">
              <b>Domicilio:</b>{" "}
              {addrLoading
                ? "Cargando..."
                : `${calleFiscal || "—"}, Ext. #${exteriorFiscal || "—"}, Int. ${interiorFiscal || "—"}`}
            </label>
            <label className="summary-Label"><b>Col.:</b> {addrLoading ? "Cargando..." : (coloniaFiscal || "—")}</label>
            <label className="summary-Label"><b>Ciudad:</b> {addrLoading ? "Cargando..." : (ciudadFiscal || "—")}</label>
            <label className="summary-Label"><b>Estado:</b> {addrLoading ? "Cargando..." : (estadoFiscal || "—")}</label>
            <label className="summary-Label"><b>C.P.:</b> {addrLoading ? "Cargando..." : (cpFiscal || "—")}</label>
          </div>
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
    </body>
  );
}
// // hey chatgpt, in userProfile.jsx the user can see some of his address preferences, but not all of them and neither can he edit or delete undesired addresses or shipping preferences. I'd like to add a button that takes the user to a secondary screen where all shipping and billing addresses and shipping preferences related to his email account are diplayed and where when hitting a little pencil he can edit a specific address or if the hits a trashcan he can delete it. As well if the stars an address, that address becomes his top preference. Use all icons from FontAwesome, as we've been doing so so far. Help me both edit my current userProfile.jsx and henerate the additional screen 
// import { useState, useEffect, useMemo } from "react";
// import { useNavigate } from 'react-router-dom';
// import axios from "axios";

// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import LocationIcon from "/src/assets/images/Icon_location-pin.png";
// import InvoiceIcon from "/src/assets/images/Icon_edit-Invoice.png";
// import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png";

// import { API } from "/src/lib/api";

// export default function UserProfile() {
//   const navigate = useNavigate();

//   const goHomeLogo = () => navigate("/userHome");
//   const goToHome = () => navigate("/userHome");
//   const goToNewOrder = () => navigate("/newOrder");
//   const goToMyProfile = () => navigate("/userProfile");
//   const editAddresses = () => navigate("/editAddress");
//   const editInvoiceInfo = () => navigate("/editInvoice");
//   const editShippingPrefs = () => navigate("/editShippingPreferences");

//   // --- Credenciales / email ---
//   const [userCredentials, setUserCredentials] = useState(null);
//   useEffect(() => {
//     const savedCreds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
//     setUserCredentials(savedCreds);
//   }, []);

//   // --- Datos de usuario desde Mongo (newusers) ---
//   const [userDoc, setUserDoc] = useState(null);
//   const [shipPrefs, setShipPrefs] = useState({ preferredCarrier: "", insureShipment: false });

//   useEffect(() => {
//     const fetchMongoUser = async (email) => {
//       if (!email) return;
//       try {
//         const res = await fetch(`${API}/users/by-email?email=${encodeURIComponent(email)}`, {
//           method: "GET",
//           headers: { Accept: "application/json" },
//           cache: "no-store",
//         });
//         if (res.ok) {
//           const data = await res.json();
//           setUserDoc(data || null);

//           const prefs =
//             data?.shippingPreferences || {
//               preferredCarrier: data?.preferredCarrier || "",
//               insureShipment: !!data?.insureShipment,
//             };
//           setShipPrefs({
//             preferredCarrier: prefs?.preferredCarrier || "",
//             insureShipment: !!prefs?.insureShipment,
//           });
//         } else {
//           console.warn("users/by-email not available. Using local fallback.");
//           const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
//           if (local) setShipPrefs(local);
//         }
//       } catch (err) {
//         console.error("Error fetching user from Mongo:", err);
//         const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
//         if (local) setShipPrefs(local);
//       }
//     };

//     const email =
//       userCredentials?.correo ||
//       JSON.parse(localStorage.getItem("gis-user") || "null")?.email ||
//       localStorage.getItem("userEmail");

//     fetchMongoUser(email);
//   }, [userCredentials]);

//   // =================== ADDRESSES FROM MONGODB ===================
//   const [shippingAddresses, setShippingAddresses] = useState([]);
//   const [billingAddresses, setBillingAddresses] = useState([]);
//   const [addrLoading, setAddrLoading] = useState(false);

//   const userEmail = useMemo(() => {
//     return (
//       userCredentials?.correo ||
//       JSON.parse(localStorage.getItem("gis-user") || "null")?.email ||
//       localStorage.getItem("userEmail") ||
//       ""
//     );
//   }, [userCredentials]);

//   useEffect(() => {
//     if (!userEmail) return;

//     const fetchAddresses = async () => {
//       try {
//         setAddrLoading(true);
//         const [shipRes, billRes] = await Promise.all([
//           axios.get(`${API}/shipping-address/${encodeURIComponent(userEmail)}`),
//           axios.get(`${API}/billing-address/${encodeURIComponent(userEmail)}`),
//         ]);

//         setShippingAddresses(Array.isArray(shipRes.data) ? shipRes.data : []);
//         setBillingAddresses(Array.isArray(billRes.data) ? billRes.data : []);
//       } catch (err) {
//         console.error("Error fetching addresses:", err);
//         setShippingAddresses([]);
//         setBillingAddresses([]);
//       } finally {
//         setAddrLoading(false);
//       }
//     };

//     fetchAddresses();
//   }, [userEmail]);

//   // Choose default or first address
//   const pickDefault = (arr = []) => {
//     if (!Array.isArray(arr) || arr.length === 0) return null;
//     const byFlag =
//       arr.find((a) => a?.isDefault === true) ||
//       arr.find((a) => a?.default === true) ||
//       null;
//     return byFlag || arr[0];
//   };

//   const shipping = pickDefault(shippingAddresses) || {};
//   const billing = pickDefault(billingAddresses) || {};

//   // === Nombres desde Mongo ===
//   const nombreUsuario =
//     userDoc?.nombre || userDoc?.name || userDoc?.fullName || "";

//   const nombreEmpresa =
//     userDoc?.nombreEmpresa || userDoc?.companyName || userDoc?.empresa || "";

//   // === Preferencias de envío (Mongo) ===
//   const preferredCarrier = shipPrefs.preferredCarrier || "";
//   const insureShipment = !!shipPrefs.insureShipment;

//   // === Campos de ENVÍO desde Mongo ===
//   const calleEnvio = shipping?.calleEnvio || shipping?.street || "";
//   const exteriorEnvio = shipping?.exteriorEnvio || shipping?.exteriorNumber || "";
//   const interiorEnvio = shipping?.interiorEnvio || shipping?.interiorNumber || "";
//   const coloniaEnvio = shipping?.coloniaEnvio || shipping?.colony || "";
//   const cpEnvio = shipping?.cpEnvio || shipping?.postalCode || shipping?.cp || "";
//   const ciudadEnvio = shipping?.ciudadEnvio || shipping?.city || "";
//   const estadoEnvio = shipping?.estadoEnvio || shipping?.state || "";

//   // === Campos de FACTURACIÓN desde Mongo ===
//   const correoFiscal = billing?.correoFiscal || billing?.email || "";
//   const razonSocial = billing?.razonSocial || billing?.businessName || "";
//   const rfcEmpresa = billing?.rfcEmpresa || billing?.rfc || "";
//   const regimenFiscal = billing?.regimenFiscal || billing?.taxRegime || "";
//   const usoCFDI = billing?.usoCFDI || billing?.cfdiUse || "";

//   const calleFiscal = billing?.calleFiscal || billing?.billingStreet || "";
//   const exteriorFiscal = billing?.exteriorFiscal || billing?.billingExterior || "";
//   const interiorFiscal = billing?.interiorFiscal || billing?.billingInterior || "";
//   const coloniaFiscal = billing?.coloniaFiscal || billing?.billingColony || "";
//   const cpFiscal = billing?.cpFiscal || billing?.billingCP || "";
//   const ciudadFiscal = billing?.ciudadFiscal || billing?.billingCity || "";
//   const estadoFiscal = billing?.estadoFiscal || billing?.billingState || "";

//   // (Opcionales que antes venían del CSV y ahora podrían faltar)
//   const clienteDesde = ""; // si quieres mostrar algo, podrías guardarlo en users o calcularlo

//   return (
//     <body className="app-shell body-BG-Gradient">
//       {/* LOGOS DIV */}
//       <div className="app-header loginLogo-ParentDiv">
//         <img
//           className="secondaryPages-GISLogo"
//           src={Logo}
//           alt="Home Icon"
//           width="180"
//           height="55"
//           onClick={goHomeLogo}
//         />
//       </div>
//       {/* LOGOS END*/}

//       <div className="app-main">
//         <h3 className="clientProfile-headerLabel">
//           Hola {nombreUsuario || "usuario"}
//         </h3>

//         <div className="clientInfo-Div">
//           <h3 className="clientProfile-sectionContent">{nombreEmpresa || "—"}</h3>
//           <h3 className="clientProfile-sectionContent">Cliente desde: {clienteDesde || "—"}</h3>
//         </div>

//         <div className="extraInfo-Div">
//           <label className="clientProfile-subHeaderTitle">DETALLES DE TU CUENTA</label>

//           {/* DIRECCIONES */}
//           <div className="sectionHeader-iconEdit-Div">
//             <label className="subSection-headerLabel">Datos de Envío</label>
//             <div className="icon-editLabel-Div" onClick={editAddresses}>
//               <img src={LocationIcon} alt="Editar" width="25" height="25" />
//               <label className="edit-Label">Administrar <br /> direcciones</label>
//             </div>
//           </div>

//           <div className="address-summaryDiv">
//             <label className="summary-Label">
//               <b>Domicilio:</b>{" "}
//               {addrLoading
//                 ? "Cargando..."
//                 : `${calleEnvio || "—"}, Ext. #${exteriorEnvio || "—"}, Int. ${interiorEnvio || "—"}`}
//             </label>
//             <label className="summary-Label"><b>Col.:</b> {addrLoading ? "Cargando..." : (coloniaEnvio || "—")}</label>
//             <label className="summary-Label"><b>Ciudad:</b> {addrLoading ? "Cargando..." : (ciudadEnvio || "—")}</label>
//             <label className="summary-Label"><b>Estado:</b> {addrLoading ? "Cargando..." : (estadoEnvio || "—")}</label>
//             <label className="summary-Label"><b>C.P.:</b> {addrLoading ? "Cargando..." : (cpEnvio || "—")}</label>
//           </div>

//           {/* PREFERENCIAS DE ENVÍO */}
//           <div className="sectionHeader-iconEdit-Div" style={{ marginTop: 14 }}>
//             <label className="subSection-headerLabel">Preferencias de Envío</label>
//             <div className="icon-editLabel-Div" onClick={editShippingPrefs}>
//               <img src={GestionaIcono} alt="Editar" width="29" height="29" />
//               <label className="edit-Label">Administrar <br /> preferencias</label>
//             </div>
//           </div>

//           <div className="address-summaryDiv">
//             <label className="summary-Label">
//               <b>Paquetería preferida:</b> {preferredCarrier || "—"}
//             </label>
//             <label className="summary-Label">
//               <b>Seguro de envío:</b> {insureShipment ? "Sí" : "No"}
//             </label>
//           </div>

//           {/* FACTURACIÓN */}
//           <div className="sectionHeader-iconEdit-Div" style={{ marginTop: 14 }}>
//             <label className="subSection-invoiceLabel">Datos de Facturación</label>
//             <div className="icon-editLabel-Div" onClick={editInvoiceInfo}>
//               <img src={InvoiceIcon} alt="Editar" width="25" height="25" />
//               <label className="edit-Label">Administrar datos <br /> de facturación</label>
//             </div>
//           </div>

//           <div className="address-summaryDiv">
//             <label className="summary-Label"><b>Correo de facturación:</b> {addrLoading ? "Cargando..." : (correoFiscal || "—")}</label>
//             <label className="summary-Label"><b>Nombre o Razón Social:</b> {addrLoading ? "Cargando..." : (razonSocial || "—")}</label>
//             <label className="summary-Label"><b>RFC:</b> {addrLoading ? "Cargando..." : (rfcEmpresa || "—")}</label>
//             <label className="summary-Label"><b>CFDI:</b> {addrLoading ? "Cargando..." : (usoCFDI || "—")}</label>
//             <label className="summary-Label"><b>Régimen Fiscal:</b> {addrLoading ? "Cargando..." : (regimenFiscal || "—")}</label>
//             <label className="summary-Label">
//               <b>Domicilio:</b>{" "}
//               {addrLoading
//                 ? "Cargando..."
//                 : `${calleFiscal || "—"}, Ext. #${exteriorFiscal || "—"}, Int. ${interiorFiscal || "—"}`}
//             </label>
//             <label className="summary-Label"><b>Col.:</b> {addrLoading ? "Cargando..." : (coloniaFiscal || "—")}</label>
//             <label className="summary-Label"><b>Ciudad:</b> {addrLoading ? "Cargando..." : (ciudadFiscal || "—")}</label>
//             <label className="summary-Label"><b>Estado:</b> {addrLoading ? "Cargando..." : (estadoFiscal || "—")}</label>
//             <label className="summary-Label"><b>C.P.:</b> {addrLoading ? "Cargando..." : (cpFiscal || "—")}</label>
//           </div>
//         </div>
//       </div>

//       {/* FOOTER MENU */}
//       <div className="app-footer footerMenuDiv">
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
//       {/* FOOTER MENU END */}
//     </body>
//   );
// }

