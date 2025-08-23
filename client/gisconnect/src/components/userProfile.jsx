import { useState, useEffect } from "react"
import { useNavigate } from 'react-router-dom';

import { Link } from "react-router-dom"
import axios from "axios"

import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import LocationIcon from "/src/assets/images/Icon_location-pin.png"
import InvoiceIcon from "/src/assets/images/Icon_edit-Invoice.png"


export default function UserProfile() {

    const navigate = useNavigate();

    function goHomeLogo(){
        console.log("Return home clicked")
        navigate("/userHome")
    }

    function goToHome() {
        console.log("Go to home")
        navigate("/userHome")
    }

    function goToNewOrder() {
        console.log("Go to new order")
        navigate("/newOrder")
    }

    function goToMyProfile() {
        console.log("Go to my profile")
        navigate("/userProfile")
    }

    function editAddresses(){
        console.log("Edit addresses clicked")
        location.replace("/editAddress")
    }

    function editInvoiceInfo(){
        console.log("Edit invoice info clicked")
        location.replace("/editInvoice")
    }

    // NEW APR21
    let [food, setFood] = useState()

    useEffect(() => {
        console.log(JSON.stringify(food))
    })

    let [projects, setProjects] = useState([])

    console.log(projects)

    // NEW JUN25
    const [userCredentials, setUserCredentials] = useState([]);
    const [additionalAddress, setAdditionalAddress] = useState([])
    const [additionalBilling, setAdditionalBilling] = useState([])

    useEffect(() => {
        //IMPORT DISCOUNT AMOUNT FROM /expressQuote
        const savedCreds = JSON.parse(localStorage.getItem('userLoginCreds'));
        setUserCredentials(savedCreds || []);

        const savedAddress = JSON.parse(localStorage.getItem('userNewShippingAddress'));
        setAdditionalAddress(savedAddress || []);

        const savedBilling = JSON.parse(localStorage.getItem('userNewBillingInfo'));
        setAdditionalBilling(savedBilling || []);

        getAllProjects()
        fetchCSVData()
    },[])

    console.log(userCredentials)
    console.log(additionalAddress)
    console.log(additionalBilling)

    const getAllProjects =()=> {
        // fetch('https://orion-backend-z5yv.onrender.com/project')
        fetch(`${API}/register`)
        .then((response) => response.json())
        .then((data) => {
            setProjects(data)
            console.log(data)
            if(data.message === undefined) {
                setFood()
            }
            else {
                setFood(data)
            }
        })
        .catch((err) => {
            console.log(err)
        })
    }

    // new jun12
    const [csvData, setCsvData] = useState([]);

    useEffect(() => {
        fetchCSVData();    // Fetch the CSV data when the component mounts
    }, []); // The empty array ensures that this effect runs only once, like componentDidMount

    const fetchCSVData = () => {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv'; // Replace with your Google Sheets CSV file URL

        axios.get(csvUrl)    // Use Axios to fetch the CSV data
            .then((response) => {
                const parsedCsvData = parseCSV(response.data);        // Parse the CSV data into an array of objects
                setCsvData(parsedCsvData);        // Set the fetched data in the component's state
                console.log(parsedCsvData);        // Now you can work with 'csvData' in your component's state.
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

    let correoUsuarioSheets 

    let nombreUsuario
    let nombreEmpresa     
    let regionEmpresa 

    let correoFiscal
    let razonSocial 
    let rfcEmpresa 
    let regimenFiscal 
    let usoCFDI 
    let calleFiscal
    let exteriorFiscal
    let interiorFiscal
    let coloniaFiscal
    let cpFiscal
    let ciudadFiscal 
    let estadoFiscal 
    // let direccionFiscal 

    let calleEnvio 
    let exteriorEnvio 
    let interiorEnvio 
    let coloniaEnvio 
    let cpEnvio 
    let ciudadEnvio 
    let estadoEnvio 
    let paqueteria
    let seguroEnvio

    let nivelCliente 
    let clienteDesde 

    // here
    for(let i in csvData) {
        if((csvData[i].CORREO_EMPRESA) === userCredentials.correo) {
            correoUsuarioSheets = (csvData[i].CORREO_EMPRESA)

            nombreUsuario = (csvData[i].NOMBRE_APELLIDO)
            nombreEmpresa = (csvData[i].NOMBRE_EMPRESA)
            regionEmpresa = (csvData[i].REGION_EMPRESA)

            correoFiscal = (csvData[i].CORREO_FISCAL)
            razonSocial = (csvData[i].RAZON_SOCIAL)
            rfcEmpresa = (csvData[i].RFC_EMPRESA)
            regimenFiscal = (csvData[i].REGIMEN_FISCAL)
            usoCFDI = (csvData[i].USO_CFDI)
            calleFiscal = (csvData[i].CALLE_FISCAL)
            exteriorFiscal = (csvData[i].EXTERIOR_FISCAL)
            interiorFiscal = (csvData[i].INTERIOR_FISCAL)
            coloniaFiscal = (csvData[i].COLONIA_FISCAL)
            cpFiscal = (csvData[i].CP_FISCAL)
            ciudadFiscal = (csvData[i].CIUDAD_EMPRESA)
            estadoFiscal = (csvData[i].ESTADO_EMPRESA)
            // direccionFiscal = (csvData[i].DIRECCION_FISCAL)

            calleEnvio = (csvData[i].CALLE_ENVIO)
            exteriorEnvio = (csvData[i].EXTERIOR_ENVIO)
            interiorEnvio = (csvData[i].INTERIOR_ENVIO)
            coloniaEnvio = (csvData[i].COLONIA_ENVIO)
            ciudadEnvio = (csvData[i].CIUDAD_ENVIO)
            estadoEnvio = (csvData[i].ESTADO_ENVIO)
            cpEnvio = (csvData[i].CP_ENVIO)

            paqueteria = (csvData[i].PAQUETERIA_ENVIO)
            seguroEnvio = (csvData[i].SEGURO_ENVIO)

            nivelCliente = (csvData[i].NIVEL_CLIENTE)
            clienteDesde = (csvData[i].FECHA_INCORPORACION)
        }
    }
    // here

   

    return (
        <body className="body-BG-Gradient">
            {/* LOGOS DIV */}
            <div className="loginLogo-ParentDiv">
                <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
                {/* <img className="signup-VeggieBasket" src="./src/assets/images/BG-veggieBasket.png" alt="Home Icon" width="400" height="250"/> */}
            </div>
            {/* LOGOS END*/}

            <h3 className="clientProfile-headerLabel">Hola {nombreUsuario}</h3>
            {/* <h3 className="clientProfile-headerLabel">Hola {nombreUsuario}</h3> */}

            <div className="clientInfo-Div">
                <h3 className="clientProfile-sectionContent">{nombreEmpresa}</h3>
                <h3 className="clientProfile-sectionContent">Cliente desde: {clienteDesde}</h3>
                {/* <h3 className="clientProfile-sectionContent">Puntos: 500 </h3> */}

            </div>

            <div className="extraInfo-Div">
                <label className="clientProfile-subHeaderTitle">DETALLES DE TU CUENTA</label>

                {/* ADDRESSES */}
                <div className="sectionHeader-iconEdit-Div">
                    <label className="subSection-headerLabel">Datos de Envío</label>
                    <div>
                    {/* <div className="editSection-Div"> */}
                        <div className="icon-editLabel-Div" onClick={editAddresses}>
                            <img src={LocationIcon} alt="Home Icon" width="25" height="25"/>
                            <label className="edit-Label">Administrar <br></br>direcciones</label>
                        </div>
                    </div>
                </div>

                <div className="address-summaryDiv">
                    <label className="summary-Label"><b>Domicilio:</b> {calleEnvio}, Ext. #{exteriorEnvio}, Int. {interiorEnvio}</label>
                    {/* <label className="summary-Label"><b>Calle:</b> {calleEnvio}</label>
                    <label className="summary-Label"><b>Número Ext.:</b> {exteriorEnvio}</label>
                    <label className="summary-Label"><b>Número Int.:</b> {interiorEnvio}</label> */}
                    <label className="summary-Label"><b>Col.:</b> {coloniaEnvio}</label>
                    <label className="summary-Label"><b>Ciudad:</b> {ciudadEnvio}</label>
                    <label className="summary-Label"><b>Estado:</b> {estadoEnvio}</label> <br></br>
                    <label className="summary-Label"><b>Servicio de Paquetería:</b> {paqueteria}</label>
                    <label className="summary-Label"><b>Seguro de envío:</b> {seguroEnvio}</label>

                </div>

                {/* INVOICE INFO */}
                <div className="sectionHeader-iconEdit-Div">
                    <label className="subSection-invoiceLabel">Datos de Facturación</label>
                    <div>
                        <div className="icon-editLabel-Div" onClick={editInvoiceInfo}>
                            <img src={InvoiceIcon} alt="Home Icon" width="25" height="25"/>
                            <label className="edit-Label">Administrar datos <br></br>de facturación</label>
                        </div>
                    </div>
                </div>

                <div className="address-summaryDiv">
                    <label className="summary-Label"><b>Correo de facturación:</b> {correoFiscal}</label> <br></br>
                    <label className="summary-Label"><b>Nombre o Razón Social:</b> {razonSocial}</label>
                    <label className="summary-Label"><b>RFC:</b> {rfcEmpresa}</label>
                    <label className="summary-Label"><b>CFDI:</b> {usoCFDI}</label>
                    <label className="summary-Label"><b>Régimen Fiscal:</b> {regimenFiscal}</label> <br></br>
                    <label className="summary-Label"><b>Domicilio:</b> {calleFiscal}, Ext. #{exteriorFiscal}, Int. {interiorFiscal}</label>
                    <label className="summary-Label"><b>Col.:</b> {coloniaFiscal}</label>
                    <label className="summary-Label"><b>Ciudad:</b> {ciudadFiscal}</label>
                    <label className="summary-Label"><b>Estado:</b> {estadoFiscal}</label> 
                </div>
            </div>            

            {/* FOOTER MENU */}
            <div className="footerMenuDiv">
                <div className="footerHolder">
                    {/* HOME FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToHome}>
                        <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
                        <label className="footerIcon-Name">PRINCIPAL</label>
                    </div>

                    {/* USER FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToMyProfile}>
                        <FontAwesomeIcon icon={faUser} className="footerIcons"/>
                        <label className="footerIcon-Name">MI PERFIL</label>
                    </div>

                    {/* SETTINGS FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToNewOrder}>
                        <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
                        <label className="footerIcon-Name">ORDENA</label>
                    </div>
                </div>

            </div>
            {/* FOOTER MENU END */}
        </body>
    )
}