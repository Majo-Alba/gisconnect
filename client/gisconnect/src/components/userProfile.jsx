import { useState, useEffect, useMemo } from "react";
import { useNavigate } from 'react-router-dom';
import axios from "axios";

import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons";
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

  // (Opcionales que antes venían del CSV y ahora podrían faltar)
  const clienteDesde = ""; // si quieres mostrar algo, podrías guardarlo en users o calcularlo

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
      {/* LOGOS END*/}

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

          {/* DIRECCIONES */}
          <div className="sectionHeader-iconEdit-Div">
            <label className="subSection-headerLabel">Datos de Envío</label>
            <div className="icon-editLabel-Div" onClick={editAddresses}>
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
            <div className="icon-editLabel-Div" onClick={editShippingPrefs}>
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
            <div className="icon-editLabel-Div" onClick={editInvoiceInfo}>
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
      {/* FOOTER MENU END */}
    </body>
  );
}

// // hey chatgpt, in my userProfile.jsx, currently the fields are being populated from my google sheets database, however, I would like to swith this to get data from mongodb collections "billingaddresses" and "shippingaddresses". Here are my GET endpoints for each. Help me do a direct edit to my userProfile. jsx 

// // ENDPOINT FOR RETRIEVING ALTERNATE SHIPPING ADDRESS
// router.get('/shipping-address/:email', async (req, res) => {
//     try {
//       const email = req.params.email;
//       const addresses = await ShippingAddress.find({ userEmail: email });
//       res.json(addresses);
//     } catch (error) {
//       console.error("Error fetching billing addresses:", error);
//       res.status(500).json({ error: "Server error" });
//     }
//   });

// // ENDPOINT FOR RETRIEVING ALTERNATE BILLING ADDRESS
// router.get('/billing-address/:email', async (req, res) => {
//   try {
//     const email = req.params.email;
//     const addresses = await BillingAddress.find({ userEmail: email });
//     res.json(addresses);
//   } catch (error) {
//     console.error("Error fetching billing addresses:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // ----> ACTUAL userProfile.jsx CODE

// import { useState, useEffect } from "react"
// import { useNavigate } from 'react-router-dom';
// import axios from "axios"

// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

// import Logo from "/src/assets/images/GIS_Logo.png";
// import LocationIcon from "/src/assets/images/Icon_location-pin.png"
// import InvoiceIcon from "/src/assets/images/Icon_edit-Invoice.png"
// import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png"

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
//         // Recomendado en backend: GET /users/by-email?email=...
//         const res = await fetch(`${API}/users/by-email?email=${encodeURIComponent(email)}`, {
//           method: "GET",
//           headers: { Accept: "application/json" },
//           cache: "no-store",
//         });
//         if (res.ok) {
//           const data = await res.json();
//           setUserDoc(data || null);

//           // Intenta leer shipping prefs del documento:
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
//           // Fallback: si tu backend aún no tiene esa ruta, intenta un endpoint existente
//           // que devuelva el usuario, o simplemente ignora.
//           console.warn("users/by-email not available. Using local fallback.");
//           const local = JSON.parse(localStorage.getItem("userShippingPrefs") || "null");
//           if (local) setShipPrefs(local);
//         }
//       } catch (err) {
//         console.error("Error fetching user from Mongo:", err);
//         // Fallback local
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

//   // =================== Google Sheets (para los demás datos ya existentes) ===================
//   const [csvData, setCsvData] = useState([]);

//   useEffect(() => {
//     const csvUrl =
//       "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
//     axios
//       .get(csvUrl)
//       .then((response) => {
//         const rows = response.data.split(/\r?\n/);
//         const headers = rows[0].split(",");
//         const parsed = [];
//         for (let i = 1; i < rows.length; i++) {
//           const cols = rows[i].split(",");
//           const obj = {};
//           for (let j = 0; j < headers.length; j++) obj[headers[j]] = cols[j];
//           parsed.push(obj);
//         }
//         setCsvData(parsed);
//       })
//       .catch((error) => console.error("Error fetching CSV data:", error));
//   }, []);

//   // Variables provenientes del CSV
//   let correoUsuarioSheets;
//   let regionEmpresa;

//   let correoFiscal;
//   let razonSocial;
//   let rfcEmpresa;
//   let regimenFiscal;
//   let usoCFDI;
//   let calleFiscal;
//   let exteriorFiscal;
//   let interiorFiscal;
//   let coloniaFiscal;
//   let cpFiscal;
//   let ciudadFiscal;
//   let estadoFiscal;

//   let calleEnvio;
//   let exteriorEnvio;
//   let interiorEnvio;
//   let coloniaEnvio;
//   let cpEnvio;
//   let ciudadEnvio;
//   let estadoEnvio;

//   let paqueteriaCSV;
//   let seguroEnvioCSV;

//   let nivelCliente;
//   let clienteDesde;

//   const emailToMatch = userCredentials?.correo;

//   for (let i in csvData) {
//     if (csvData[i].CORREO_EMPRESA === emailToMatch) {
//       correoUsuarioSheets = csvData[i].CORREO_EMPRESA;

//       // (Ahora estos vienen de Mongo) nombreUsuario / nombreEmpresa
//       regionEmpresa = csvData[i].REGION_EMPRESA;

//       correoFiscal = csvData[i].CORREO_FISCAL;
//       razonSocial = csvData[i].RAZON_SOCIAL;
//       rfcEmpresa = csvData[i].RFC_EMPRESA;
//       regimenFiscal = csvData[i].REGIMEN_FISCAL;
//       usoCFDI = csvData[i].USO_CFDI;
//       calleFiscal = csvData[i].CALLE_FISCAL;
//       exteriorFiscal = csvData[i].EXTERIOR_FISCAL;
//       interiorFiscal = csvData[i].INTERIOR_FISCAL;
//       coloniaFiscal = csvData[i].COLONIA_FISCAL;
//       cpFiscal = csvData[i].CP_FISCAL;
//       ciudadFiscal = csvData[i].CIUDAD_EMPRESA;
//       estadoFiscal = csvData[i].ESTADO_EMPRESA;

//       calleEnvio = csvData[i].CALLE_ENVIO;
//       exteriorEnvio = csvData[i].EXTERIOR_ENVIO;
//       interiorEnvio = csvData[i].INTERIOR_ENVIO;
//       coloniaEnvio = csvData[i].COLONIA_ENVIO;
//       ciudadEnvio = csvData[i].CIUDAD_ENVIO;
//       estadoEnvio = csvData[i].ESTADO_ENVIO;
//       cpEnvio = csvData[i].CP_ENVIO;

//       paqueteriaCSV = csvData[i].PAQUETERIA_ENVIO;
//       seguroEnvioCSV = csvData[i].SEGURO_ENVIO;

//       nivelCliente = csvData[i].NIVEL_CLIENTE;
//       clienteDesde = csvData[i].FECHA_INCORPORACION;
//     }
//   }

//   // === Nombres desde Mongo (con fallback al CSV si existiera algo) ===
//   const nombreUsuario =
//     userDoc?.nombre ||
//     userDoc?.name ||
//     userDoc?.fullName ||
//     ""; // fallback vacío; puedes añadir otra lógica si tu colección usa otro nombre de campo

//   const nombreEmpresa =
//     userDoc?.nombreEmpresa ||
//     userDoc?.companyName ||
//     userDoc?.empresa ||
//     ""; // idem

//   // === Preferencias de envío a mostrar (Mongo primero, luego CSV como respaldo visual) ===
//   const preferredCarrier = shipPrefs.preferredCarrier || paqueteriaCSV || "";
//   const insureShipment = shipPrefs.insureShipment ?? (String(seguroEnvioCSV || "").toLowerCase() === "si");

  
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
//               <b>Domicilio:</b> {calleEnvio || "—"}, Ext. #{exteriorEnvio || "—"}, Int. {interiorEnvio || "—"}
//             </label>
//             <label className="summary-Label"><b>Col.:</b> {coloniaEnvio || "—"}</label>
//             <label className="summary-Label"><b>Ciudad:</b> {ciudadEnvio || "—"}</label>
//             <label className="summary-Label"><b>Estado:</b> {estadoEnvio || "—"}</label>
//             <label className="summary-Label"><b>C.P.:</b> {cpEnvio || "—"}</label>
//           </div>

//           {/* PREFERENCIAS DE ENVÍO (NUEVO) */}
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
//               {/* <label className="summary-Label"><b>Servicio de Paquetería:</b> {user?.shippingPreferences?.preferredCarrier || '-'}</label> */}
//             </label>
//             <label className="summary-Label">
//               <b>Seguro de envío:</b> {insureShipment ? "Sí" : "No"}
//               {/* <label className="summary-Label"><b>Seguro de envío:</b> {user?.shippingPreferences?.insureShipment ? 'Sí' : 'No'}</label> */}
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
//             <label className="summary-Label"><b>Correo de facturación:</b> {correoFiscal || "—"}</label>
//             <label className="summary-Label"><b>Nombre o Razón Social:</b> {razonSocial || "—"}</label>
//             <label className="summary-Label"><b>RFC:</b> {rfcEmpresa || "—"}</label>
//             <label className="summary-Label"><b>CFDI:</b> {usoCFDI || "—"}</label>
//             <label className="summary-Label"><b>Régimen Fiscal:</b> {regimenFiscal || "—"}</label>
//             <label className="summary-Label">
//               <b>Domicilio:</b> {calleFiscal || "—"}, Ext. #{exteriorFiscal || "—"}, Int. {interiorFiscal || "—"}
//             </label>
//             <label className="summary-Label"><b>Col.:</b> {coloniaFiscal || "—"}</label>
//             <label className="summary-Label"><b>Ciudad:</b> {ciudadFiscal || "—"}</label>
//             <label className="summary-Label"><b>Estado:</b> {estadoFiscal || "—"}</label>
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


// // Hey chatgpt, in userProfile.jsx I want to do some modifications. 1) nombreUsuario and nombreEmpresa currently are retrieved from google sheets, but now I want to get those from my mongodb "newusers". 2) I want to add another segment for "Shipping Preferences" called "Preferencias de Envío". In this segment I want the user to be able to see preferred carrier and ask for shippment to be insured. Now, we also need to include an "editShippingPreferences.jsx" file that will host the input fields for the "Shipping Preferences" display. Take as a base what we did for editAddress.jsx and the current aesthetics that we are using to do these additions. Here is my current userProfile.jsx, please direct edit modifications  
// import { useState, useEffect } from "react"
// import { useNavigate } from 'react-router-dom';

// import { Link } from "react-router-dom"
// import axios from "axios"

// import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

// import Logo from "/src/assets/images/GIS_Logo.png";
// import LocationIcon from "/src/assets/images/Icon_location-pin.png"
// import InvoiceIcon from "/src/assets/images/Icon_edit-Invoice.png"

// import { API } from "/src/lib/api";


// export default function UserProfile() {

//     const navigate = useNavigate();

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

//     function editAddresses(){
//         console.log("Edit addresses clicked")
//         navigate("/editAddress")
//     }

//     function editInvoiceInfo(){
//         console.log("Edit invoice info clicked")
//         navigate("/editInvoice")
//     }

//     // NEW APR21
//     let [food, setFood] = useState()

//     useEffect(() => {
//         console.log(JSON.stringify(food))
//     })

//     let [projects, setProjects] = useState([])

//     console.log(projects)

//     // NEW JUN25
//     const [userCredentials, setUserCredentials] = useState([]);
//     const [additionalAddress, setAdditionalAddress] = useState([])
//     const [additionalBilling, setAdditionalBilling] = useState([])

//     useEffect(() => {
//         //IMPORT DISCOUNT AMOUNT FROM /expressQuote
//         const savedCreds = JSON.parse(localStorage.getItem('userLoginCreds'));
//         setUserCredentials(savedCreds || []);

//         const savedAddress = JSON.parse(localStorage.getItem('userNewShippingAddress'));
//         setAdditionalAddress(savedAddress || []);

//         const savedBilling = JSON.parse(localStorage.getItem('userNewBillingInfo'));
//         setAdditionalBilling(savedBilling || []);

//         getAllProjects()
//         fetchCSVData()
//     },[])

//     console.log(userCredentials)
//     console.log(additionalAddress)
//     console.log(additionalBilling)

//     const getAllProjects =()=> {
//         // fetch('https://orion-backend-z5yv.onrender.com/project')
//         fetch(`${API}/register`)
//         .then((response) => response.json())
//         .then((data) => {
//             setProjects(data)
//             console.log(data)
//             if(data.message === undefined) {
//                 setFood()
//             }
//             else {
//                 setFood(data)
//             }
//         })
//         .catch((err) => {
//             console.log(err)
//         })
//     }

//     // new jun12
//     const [csvData, setCsvData] = useState([]);

//     useEffect(() => {
//         fetchCSVData();    // Fetch the CSV data when the component mounts
//     }, []); // The empty array ensures that this effect runs only once, like componentDidMount

//     const fetchCSVData = () => {
//     const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv'; // Replace with your Google Sheets CSV file URL

//         axios.get(csvUrl)    // Use Axios to fetch the CSV data
//             .then((response) => {
//                 const parsedCsvData = parseCSV(response.data);        // Parse the CSV data into an array of objects
//                 setCsvData(parsedCsvData);        // Set the fetched data in the component's state
//                 console.log(parsedCsvData);        // Now you can work with 'csvData' in your component's state.
//             })
//             .catch((error) => {
//                 console.error('Error fetching CSV data:', error);
//             });
//     }

//     function parseCSV(csvText) {
//         const rows = csvText.split(/\r?\n/);        // Use a regular expression to split the CSV text into rows while handling '\r'
//         const headers = rows[0].split(',');        // Extract headers (assumes the first row is the header row)
//         const data = [];        // Initialize an array to store the parsed data
//         for (let i = 1; i < rows.length; i++) {
//             const rowData = rows[i].split(',');          // Use the regular expression to split the row while handling '\r'
//             const rowObject = {};
//             for (let j = 0; j < headers.length; j++) {
//                 rowObject[headers[j]] = rowData[j];
//             }
//             data.push(rowObject);
//         }
//         return data;
//     }

//     console.log(csvData)

//     let correoUsuarioSheets 

//     let nombreUsuario
//     let nombreEmpresa     
//     let regionEmpresa 

//     let correoFiscal
//     let razonSocial 
//     let rfcEmpresa 
//     let regimenFiscal 
//     let usoCFDI 
//     let calleFiscal
//     let exteriorFiscal
//     let interiorFiscal
//     let coloniaFiscal
//     let cpFiscal
//     let ciudadFiscal 
//     let estadoFiscal 
//     // let direccionFiscal 

//     let calleEnvio 
//     let exteriorEnvio 
//     let interiorEnvio 
//     let coloniaEnvio 
//     let cpEnvio 
//     let ciudadEnvio 
//     let estadoEnvio 
//     let paqueteria
//     let seguroEnvio

//     let nivelCliente 
//     let clienteDesde 

//     // here
//     for(let i in csvData) {
//         if((csvData[i].CORREO_EMPRESA) === userCredentials.correo) {
//             correoUsuarioSheets = (csvData[i].CORREO_EMPRESA)

//             nombreUsuario = (csvData[i].NOMBRE_APELLIDO)
//             nombreEmpresa = (csvData[i].NOMBRE_EMPRESA)
//             regionEmpresa = (csvData[i].REGION_EMPRESA)

//             correoFiscal = (csvData[i].CORREO_FISCAL)
//             razonSocial = (csvData[i].RAZON_SOCIAL)
//             rfcEmpresa = (csvData[i].RFC_EMPRESA)
//             regimenFiscal = (csvData[i].REGIMEN_FISCAL)
//             usoCFDI = (csvData[i].USO_CFDI)
//             calleFiscal = (csvData[i].CALLE_FISCAL)
//             exteriorFiscal = (csvData[i].EXTERIOR_FISCAL)
//             interiorFiscal = (csvData[i].INTERIOR_FISCAL)
//             coloniaFiscal = (csvData[i].COLONIA_FISCAL)
//             cpFiscal = (csvData[i].CP_FISCAL)
//             ciudadFiscal = (csvData[i].CIUDAD_EMPRESA)
//             estadoFiscal = (csvData[i].ESTADO_EMPRESA)
//             // direccionFiscal = (csvData[i].DIRECCION_FISCAL)

//             calleEnvio = (csvData[i].CALLE_ENVIO)
//             exteriorEnvio = (csvData[i].EXTERIOR_ENVIO)
//             interiorEnvio = (csvData[i].INTERIOR_ENVIO)
//             coloniaEnvio = (csvData[i].COLONIA_ENVIO)
//             ciudadEnvio = (csvData[i].CIUDAD_ENVIO)
//             estadoEnvio = (csvData[i].ESTADO_ENVIO)
//             cpEnvio = (csvData[i].CP_ENVIO)

//             paqueteria = (csvData[i].PAQUETERIA_ENVIO)
//             seguroEnvio = (csvData[i].SEGURO_ENVIO)

//             nivelCliente = (csvData[i].NIVEL_CLIENTE)
//             clienteDesde = (csvData[i].FECHA_INCORPORACION)
//         }
//     }
//     // here

   

//     return (
//         <body className="app-shell body-BG-Gradient">
//             {/* LOGOS DIV */}
//             <div className="app-header loginLogo-ParentDiv">
//                 <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
//                 {/* <img className="signup-VeggieBasket" src="./src/assets/images/BG-veggieBasket.png" alt="Home Icon" width="400" height="250"/> */}
//             </div>
//             {/* LOGOS END*/}

//             <div className="app-main">
//             <h3 className="clientProfile-headerLabel">Hola {nombreUsuario}</h3>
//             {/* <h3 className="clientProfile-headerLabel">Hola {nombreUsuario}</h3> */}

//             <div className="clientInfo-Div">
//                 <h3 className="clientProfile-sectionContent">{nombreEmpresa}</h3>
//                 <h3 className="clientProfile-sectionContent">Cliente desde: {clienteDesde}</h3>
//                 {/* <h3 className="clientProfile-sectionContent">Puntos: 500 </h3> */}

//             </div>

//             <div className="extraInfo-Div">
//                 <label className="clientProfile-subHeaderTitle">DETALLES DE TU CUENTA</label>

//                 {/* ADDRESSES */}
//                 <div className="sectionHeader-iconEdit-Div">
//                     <label className="subSection-headerLabel">Datos de Envío</label>
//                     <div>
//                     {/* <div className="editSection-Div"> */}
//                         <div className="icon-editLabel-Div" onClick={editAddresses}>
//                             <img src={LocationIcon} alt="Home Icon" width="25" height="25"/>
//                             <label className="edit-Label">Administrar <br></br>direcciones</label>
//                         </div>
//                     </div>
//                 </div>

//                 <div className="address-summaryDiv">
//                     <label className="summary-Label"><b>Domicilio:</b> {calleEnvio}, Ext. #{exteriorEnvio}, Int. {interiorEnvio}</label>
//                     {/* <label className="summary-Label"><b>Calle:</b> {calleEnvio}</label>
//                     <label className="summary-Label"><b>Número Ext.:</b> {exteriorEnvio}</label>
//                     <label className="summary-Label"><b>Número Int.:</b> {interiorEnvio}</label> */}
//                     <label className="summary-Label"><b>Col.:</b> {coloniaEnvio}</label>
//                     <label className="summary-Label"><b>Ciudad:</b> {ciudadEnvio}</label>
//                     <label className="summary-Label"><b>Estado:</b> {estadoEnvio}</label> <br></br>
//                     <label className="summary-Label"><b>Servicio de Paquetería:</b> {paqueteria}</label>
//                     <label className="summary-Label"><b>Seguro de envío:</b> {seguroEnvio}</label>

//                 </div>

//                 {/* INVOICE INFO */}
//                 <div className="sectionHeader-iconEdit-Div">
//                     <label className="subSection-invoiceLabel">Datos de Facturación</label>
//                     <div>
//                         <div className="icon-editLabel-Div" onClick={editInvoiceInfo}>
//                             <img src={InvoiceIcon} alt="Home Icon" width="25" height="25"/>
//                             <label className="edit-Label">Administrar datos <br></br>de facturación</label>
//                         </div>
//                     </div>
//                 </div>

//                 <div className="address-summaryDiv">
//                     <label className="summary-Label"><b>Correo de facturación:</b> {correoFiscal}</label> <br></br>
//                     <label className="summary-Label"><b>Nombre o Razón Social:</b> {razonSocial}</label>
//                     <label className="summary-Label"><b>RFC:</b> {rfcEmpresa}</label>
//                     <label className="summary-Label"><b>CFDI:</b> {usoCFDI}</label>
//                     <label className="summary-Label"><b>Régimen Fiscal:</b> {regimenFiscal}</label> <br></br>
//                     <label className="summary-Label"><b>Domicilio:</b> {calleFiscal}, Ext. #{exteriorFiscal}, Int. {interiorFiscal}</label>
//                     <label className="summary-Label"><b>Col.:</b> {coloniaFiscal}</label>
//                     <label className="summary-Label"><b>Ciudad:</b> {ciudadFiscal}</label>
//                     <label className="summary-Label"><b>Estado:</b> {estadoFiscal}</label> 
//                 </div>
//             </div>            
//             </div>

//             {/* FOOTER MENU */}
//             <div className="app-footer footerMenuDiv">
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
//         </body>
//     )
// }