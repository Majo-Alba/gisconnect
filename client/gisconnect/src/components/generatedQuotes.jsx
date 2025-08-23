import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import axios from "axios"

import Logo from "/src/assets/images/GIS_Logo.png";
import FileDownloadIcon from "/src/assets/images/Icono_fileDownload.png";

import HomeIcon from "/src/assets/images/Icono_Home.png";
import UserIcon from "/src/assets/images/Icono_User.png";
import SettingsIcon from "/src/assets/images/Icono_Settings.png";


export default function GeneratedQuotes() {

    function downloadQuote(){
        console.log("Download quote clicked")
        // location.replace("/adminHome")
    }

    const[productDetails, setProductDetails] = useState({
        nombreProducto:"",
        precioProducto:"",
        cantidadProducto:""
    })

    function handleInput(event) {
        setProductDetails((prevState) => {
            return {...prevState, [event.target.name]:event.target.value}
        })
    }

    const [message, setMessage] = useState({
        type:"invisible-msg",
        text:""
    })

    // UPLOAD DATA
    function handleSubmit() {
        event.preventDefault();
        console.log(productDetails)

        const formData = new FormData()

        formData.append("nombreProducto", productDetails.nombreProducto)
        formData.append("precioProducto", productDetails.precioProducto)
        formData.append("cantidadProducto", productDetails.cantidadProducto)
        
        axios.post(`${API}/quoter`, formData, {
            headers: {
                'Content-Type': "application/json"
              },
              nombreProducto: productDetails.nombreProducto,
              precioProducto: productDetails.precioProducto,
              cantidadProducto: productDetails.cantidadProducto,
        })
        .then((data) => {
            setMessage({type:"success", text:data.message})

            console.log(data)
            setTimeout(() => {
                        setMessage({type:"invisible-msg", text:"Exit"})
                    }, 1300)
                    setTimeout(() => {
                        window.location.href="/"
                    }, 1000)
        })
        .catch(err => console.log(err))
    }
    // UPLOAD DATA END
    function goHomeLogo(){
        console.log("Return home clicked")
        location.replace("/adminHome")
    }

    function goToQuoteDetails(){
        console.log("Go to quote details clicked")
        location.replace("/quoteDetails")
    }

    // NEW APR08 --> This data is for CID contact information
    useEffect(() => {
        fetchCSVData();
    },[])

    const [csvData, setCsvData] = useState([]);
    
    const fetchCSVData = () => {
        const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=0&single=true&output=csv'
            axios.get(csvUrl) 
                .then((response) => {
                    const parsedCsvData = parseCSV(response.data);       
                    setCsvData(parsedCsvData);       
                    // console.log(parsedCsvData);        
                })
                .catch((error) => {
                    console.error('Error fetching CSV data:', error);
                });
    }
    
    function parseCSV(csvText) {
        const rows = csvText.split(/\r?\n/);        // Use a regular expression to split the CSV text into rows while handling '\r'
        const headers = rows[0].split(',');        // Extract headers (assumes the first row is the header row)
        const data = [];        // Initialize an array to store the parsed data
        for (let i = 1; i < rows.length; i++) {
            const rowData = rows[i].split(',');          // Use the regular expression to split the row while handling '\r'
            const rowObject = {};
            for (let j = 0; j < headers.length; j++) {
                rowObject[headers[j]] = rowData[j];
            }
            data.push(rowObject);
        }
        return data;
    }

    console.log(csvData)   

    let nombreProducto = "Nombre del producto"
    let precioProducto = "Precio en dolares"

    let productArr = []

    for(let i in csvData) {
        // console.log(csvData[i].NOMBRE_PRODUCTO)
        nombreProducto = (csvData[i].NOMBRE_PRODUCTO)
        productArr.push(csvData[i].NOMBRE_PRODUCTO)

        if(productDetails.nombreProducto === csvData[i].NOMBRE_PRODUCTO) {
            precioProducto = (csvData[i].PRECIO_DOLARES)
        }
    }

    return (
        <body className="body-BG-Gradient">

            {/* LOGOS DIV */}
            <div className="loginLogo-ParentDiv">
                <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
            </div>
            {/* LOGOS END*/}

            <label className="sectionHeader-Label">Facturas Generadas</label>

            <div>
                <select className="sectionFilter-Dropdown" type="text"required onChange={handleInput}>
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
                <label className="quotesDate-Label">Abril 30, 2025</label>

                <div className="existingQuote-Div">
                    <div className="quoteAndFile-Div" onClick={goToQuoteDetails}>
                        <label className="summary-Label">Razón Social: BEJJ6508713M14</label>
                        <label className="summary-Label">Juan Beltrán Jimenez</label>
                        <label className="summary-Label">Factura: 01-262</label>
                        <label className="summary-Label">Pedido: 327</label>
                        <label className="summary-Label">30/Abr/2025</label>
                    </div>
                    <div className="downloadBtn-Div">
                        <button className="downloadQuote-Btn" type="submit" onClick={downloadQuote}><img src={FileDownloadIcon} width="25" height="25"></img></button>
                    </div>
                </div>

                <div className="existingQuote-Div">
                    <div className="quoteAndFile-Div" onClick={goToQuoteDetails}>
                        <label className="summary-Label">Razón Social: BEJJ6508713M14</label>
                        <label className="summary-Label">Juan Beltrán Jimenez</label>
                        <label className="summary-Label">Factura: 01-262</label>
                        <label className="summary-Label">Pedido: 327</label>
                        <label className="summary-Label">30/Abr/2025</label>
                    </div>
                    <div className="downloadBtn-Div">
                        <button className="downloadQuote-Btn" type="submit" onClick={downloadQuote}><img src={FileDownloadIcon} width="25" height="25"></img></button>
                    </div>
                </div>

                <div className="existingQuote-Div">
                    <div className="quoteAndFile-Div" onClick={goToQuoteDetails}>
                        <label className="summary-Label">Razón Social: BEJJ6508713M14</label>
                        <label className="summary-Label">Juan Beltrán Jimenez</label>
                        <label className="summary-Label">Factura: 01-262</label>
                        <label className="summary-Label">Pedido: 327</label>
                        <label className="summary-Label">30/Abr/2025</label>
                    </div>
                    <div className="downloadBtn-Div">
                        <button className="downloadQuote-Btn" type="submit" onClick={downloadQuote}><img src={FileDownloadIcon} width="25" height="25"></img></button>
                    </div>
                </div>

                <label className="quotesDate-Label">Abril 29, 2025</label>

                <div className="existingQuote-Div">
                    <div className="quoteAndFile-Div" onClick={goToQuoteDetails}>
                        <label className="summary-Label">Razón Social: BEJJ6508713M14</label>
                        <label className="summary-Label">Juan Beltrán Jimenez</label>
                        <label className="summary-Label">Factura: 01-262</label>
                        <label className="summary-Label">Pedido: 327</label>
                        <label className="summary-Label">29/Abr/2025</label>
                    </div>
                    <div className="downloadBtn-Div">
                        <button className="downloadQuote-Btn" type="submit" onClick={downloadQuote}><img src={FileDownloadIcon} width="25" height="25"></img></button>
                    </div>
                </div>

                <div className="existingQuote-Div">
                    <div className="quoteAndFile-Div" onClick={goToQuoteDetails}>
                        <label className="summary-Label">Razón Social: BEJJ6508713M14</label>
                        <label className="summary-Label">Juan Beltrán Jimenez</label>
                        <label className="summary-Label">Factura: 01-262</label>
                        <label className="summary-Label">Pedido: 327</label>
                        <label className="summary-Label">29/Abr/2025</label>
                    </div>
                    <div className="downloadBtn-Div">
                        <button className="downloadQuote-Btn" type="submit" onClick={downloadQuote}><img src={FileDownloadIcon} width="25" height="25"></img></button>
                    </div>
                </div>
                
            </div>

            {/* FOOTER MENU */}
            <div className="footerMenuDiv">
                <div className="footerHolder">
                    {/* HOME FOOTER DIV */}
                    <div className="footerIcon-NameDiv">
                        <img className="footerIcons" src={HomeIcon} alt="Home Icon" width="25" height="25"/>
                        <label className="footerIcon-Name">PRINCIPAL</label>
                    </div>

                    {/* USER FOOTER DIV */}
                    <div className="footerIcon-NameDiv">
                        <img className="footerIcons" src={UserIcon} alt="User Icon" width="25" height="25"/>
                        <label className="footerIcon-Name">AVANCES</label>
                    </div>

                    {/* SETTINGS FOOTER DIV */}
                    <div className="footerIcon-NameDiv">
                        <img className="footerIcons" src={SettingsIcon} alt="Settings Icon" width="25" height="25"/>
                        <label className="footerIcon-Name">AJUSTES</label>
                    </div>
                </div>

            </div>
            {/* FOOTER MENU END */}
        </body>
    )
}