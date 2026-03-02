// In generatedQuotes.jsx, we are populating with all orders who's status has changed to "Pago Verificado". However, if status changes as flow continues, order disappear from here before the admin time has time to procces invoice. I'd like for all order that fall here to only move out once admin has decided if order is having an invoice issued or a remission note, regardless of the stage it is in. As well, I'd like to add - from mongodb - the items that are being bought in this order (in mongo we have array "items" that contains that info.) I'm attaching current generatedQuotes.jsx, as well as newOrders.jsx so you can see how products ordered are presented, and copy same logic and format to invoiceDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import Logo from "/src/assets/images/GIS_Logo.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHouse, faCartShopping, faCheckToSlot } from "@fortawesome/free-solid-svg-icons";

import { API } from "/src/lib/api";

const ALLOWED_ADMIN_EMAILS = new Set([
  "ventas@greenimportsol.com",
  "info@greenimportsol.com",
  "administracion@greenimportsol.com",
  "administracion2@greenimportsol.com",
  "majo_test@gmail.com",
]);

export default function GeneratedQuotes() {
  const navigate = useNavigate();

  const goToAdminHome = () => navigate("/adminHome");
  const goToNewOrders = () => navigate("/newOrders");
  const goToDeliverReady = () => navigate("/deliverReady");
  const goHomeLogo = () => navigate("/adminHome");

  const [orders, setOrders] = useState([]);
  const [csvData, setCsvData] = useState([]);
  const [mongoUsers, setMongoUsers] = useState({});
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  useEffect(() => {
    const creds = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
    setCurrentUserEmail((creds?.correo || "").trim().toLowerCase());
  }, []);

  const canUseScreen = ALLOWED_ADMIN_EMAILS.has(currentUserEmail);

  useEffect(() => {
    if (!canUseScreen && currentUserEmail) {
      navigate("/adminHome");
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseScreen, currentUserEmail]);

  useEffect(() => {
    fetchOrders();
    fetchCSVData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refresh
  useEffect(() => {
    const id = setInterval(() => fetchOrders(), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API}/orders`);
    //   const arr = (res.data || []).filter((o) => o.orderStatus === "Pago Verificado");
        const arr = (res.data || []).filter((o) => {
            const note = String(o.invoiceNoteType || "").trim(); // "" | "Factura" | "Nota de Remisión"
            const inBillingQueue = !!o.paymentVerifiedAt || o.orderStatus === "Pago Verificado"; // fallback for old orders
            const notDecidedYet = note === "";
            return inBillingQueue && notDecidedYet;
        });
      setOrders(arr);
    } catch (e) {
      console.error("Error fetching orders:", e);
      setOrders([]);
    }
  };

  const fetchCSVData = async () => {
    const csvUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv";
    try {
      const res = await axios.get(csvUrl);
      setCsvData(parseCSV(res.data) || []);
    } catch (e) {
      console.error("Error fetching client CSV:", e);
      setCsvData([]);
    }
  };

  function parseCSV(csvText) {
    const rows = String(csvText || "").split(/\r?\n/).filter(Boolean);
    if (rows.length === 0) return [];
    const headers = rows[0].split(",");
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const parts = rows[i].split(",");
      const obj = {};
      headers.forEach((h, j) => (obj[h] = parts[j] ?? ""));
      out.push(obj);
    }
    return out;
  }

  // CSV lookup fallback
  const emailToClientCSV = useMemo(() => {
    const map = {};
    const norm = (s) => String(s || "").trim().toLowerCase();
    csvData.forEach((row) => {
      const email = norm(row.CORREO_EMPRESA);
      if (!email) return;
      map[email] = { name: row.NOMBRE_APELLIDO || "" };
    });
    return map;
  }, [csvData]);

  // fetch Mongo user names for emails present (like pendingPack/newOrders)
  useEffect(() => {
    const emails = Array.from(
      new Set(
        (orders || [])
          .map((o) => String(o.userEmail || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
    if (emails.length === 0) return;

    const missing = emails.filter((e) => !mongoUsers[e]);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.allSettled(
          missing.map((email) => axios.get(`${API}/users/by-email`, { params: { email } }))
        );
        const next = { ...mongoUsers };
        results.forEach((r, idx) => {
          const email = missing[idx];
          if (r.status === "fulfilled") {
            const u = r.value?.data || {};
            const nombre = (u.nombre || "").toString().trim();
            const apellido = (u.apellido || "").toString().trim();
            const full = [nombre, apellido].filter(Boolean).join(" ");
            next[email] = { name: full || email };
          }
        });
        if (!cancelled) setMongoUsers(next);
      } catch {
        // ignore
      }
    })();

    return () => { cancelled = true; };
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayForEmail = (email) => {
    const key = String(email || "").trim().toLowerCase();
    return mongoUsers[key]?.name || emailToClientCSV[key]?.name || email || "";
  };

  const sortedOrders = useMemo(() => {
    const arr = [...orders];
    arr.sort((a, b) => {
      const da = new Date(a.orderDate || a.createdAt || 0).getTime();
      const db = new Date(b.orderDate || b.createdAt || 0).getTime();
      return db - da;
    });
    return arr;
  }, [orders]);

  const fmtDate = (d) => {
    if (!d) return "Sin fecha";
    const date = new Date(d);
    const day = date.getDate().toString().padStart(2, "0");
    const month = date.toLocaleString("es-MX", { month: "short" });
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const goToInvoiceDetails = (orderId) => {
    navigate(`/invoiceDetails/${orderId}`);
  };

  return (
    <body className="body-BG-Gradient">
      {/* LOGO */}
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

      <label className="sectionHeader-Label">Facturas Generadas</label>

      <ul>
        {sortedOrders.map((order) => {
          const displayName = displayForEmail(order.userEmail);
          return (
            <li key={order._id} onClick={() => goToInvoiceDetails(order._id)}>
              <div className="orderQuickDetails-Div">
                <label className="orderQuick-Label">No. {String(order._id).slice(-5)}</label>
                <label className="orderQuick-Label">{fmtDate(order.orderDate)}</label>
                <label className="orderQuick-Label">{displayName}</label>
              </div>
            </li>
          );
        })}
      </ul>

      {sortedOrders.length === 0 && (
        <p style={{ textAlign: "center", marginTop: "2rem" }}>
          No hay pedidos nuevos.
        </p>
      )}

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
          <div className="footerIcon-NameDiv" onClick={goToDeliverReady}>
            <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
            <label className="footerIcon-Name">ENTREGAR</label>
          </div>
        </div>
      </div>
    </body>
  );
}







// import { useState, useEffect } from "react"
// import { useLocation, useParams, useNavigate } from "react-router-dom";
// import axios from "axios"

// import FileDownloadIcon from "/src/assets/images/Icono_fileDownload.png";

// import Logo from "/src/assets/images/GIS_Logo.png";
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
// import { faHouse, faCartShopping, faCheckToSlot } from "@fortawesome/free-solid-svg-icons";

// import { API } from "/src/lib/api";

// export default function GeneratedQuotes() {

//     const navigate = useNavigate();

//     const goToAdminHome = () => navigate("/adminHome");
//     const goToNewOrders = () => navigate("/newOrders");
//     const goToDeliverReady = () => navigate("/deliverReady");

//     function downloadQuote(){
//         console.log("Download quote clicked")
//     }

//     const[productDetails, setProductDetails] = useState({
//         nombreProducto:"",
//         precioProducto:"",
//         cantidadProducto:""
//     })

//     function handleInput(event) {
//         setProductDetails((prevState) => {
//             return {...prevState, [event.target.name]:event.target.value}
//         })
//     }

//     const [message, setMessage] = useState({
//         type:"invisible-msg",
//         text:""
//     })

//     // UPLOAD DATA
//     function handleSubmit() {
//         event.preventDefault();
//         console.log(productDetails)

//         const formData = new FormData()

//         formData.append("nombreProducto", productDetails.nombreProducto)
//         formData.append("precioProducto", productDetails.precioProducto)
//         formData.append("cantidadProducto", productDetails.cantidadProducto)
        
//         axios.post(`${API}/quoter`, formData, {
//             headers: {
//                 'Content-Type': "application/json"
//               },
//               nombreProducto: productDetails.nombreProducto,
//               precioProducto: productDetails.precioProducto,
//               cantidadProducto: productDetails.cantidadProducto,
//         })
//         .then((data) => {
//             setMessage({type:"success", text:data.message})

//             console.log(data)
//             setTimeout(() => {
//                         setMessage({type:"invisible-msg", text:"Exit"})
//                     }, 1300)
//                     setTimeout(() => {
//                         window.location.href="/"
//                     }, 1000)
//         })
//         .catch(err => console.log(err))
//     }
//     // UPLOAD DATA END
//     function goHomeLogo(){
//         console.log("Return home clicked")
//         location.replace("/adminHome")
//     }

//     function goToQuoteDetails(){
//         console.log("Go to quote details clicked")
//         location.replace("/quoteDetails")
//     }

//     // NEW APR08 --> This data is for CID contact information
//     useEffect(() => {
//         fetchCSVData();
//     },[])

//     const [csvData, setCsvData] = useState([]);
    
//     const fetchCSVData = () => {
//         const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=0&single=true&output=csv'
//             axios.get(csvUrl) 
//                 .then((response) => {
//                     const parsedCsvData = parseCSV(response.data);       
//                     setCsvData(parsedCsvData);       
//                     // console.log(parsedCsvData);        
//                 })
//                 .catch((error) => {
//                     console.error('Error fetching CSV data:', error);
//                 });
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

//     let nombreProducto = "Nombre del producto"
//     let precioProducto = "Precio en dolares"

//     let productArr = []

//     for(let i in csvData) {
//         // console.log(csvData[i].NOMBRE_PRODUCTO)
//         nombreProducto = (csvData[i].NOMBRE_PRODUCTO)
//         productArr.push(csvData[i].NOMBRE_PRODUCTO)

//         if(productDetails.nombreProducto === csvData[i].NOMBRE_PRODUCTO) {
//             precioProducto = (csvData[i].PRECIO_DOLARES)
//         }
//     }

//     return (
//         <body className="body-BG-Gradient">

//             {/* LOGOS DIV */}
//             <div className="loginLogo-ParentDiv">
//                 <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
//             </div>
//             {/* LOGOS END*/}

//             <label className="sectionHeader-Label">Facturas Generadas</label>

//             {/* FOOTER MENU */}
//             <div className="footerMenuDiv">
//                 <div className="footerHolder">
//                 <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
//                     <FontAwesomeIcon icon={faHouse} className="footerIcons" />
//                     <label className="footerIcon-Name">PRINCIPAL</label>
//                 </div>
//                 <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
//                     <FontAwesomeIcon icon={faCartShopping} className="footerIcons" />
//                     <label className="footerIcon-Name">ORDENES</label>
//                 </div>
//                 <div className="footerIcon-NameDiv" onClick={goToDeliverReady}>
//                     <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons" />
//                     <label className="footerIcon-Name">ENTREGAR</label>
//                 </div>
//                 </div>
//             </div>
//             {/* FOOTER MENU END */}
//         </body>
//     )
// }