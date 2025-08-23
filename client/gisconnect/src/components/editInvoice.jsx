import { useState, useEffect } from "react"
import { useNavigate } from 'react-router-dom';

import { Link } from "react-router-dom"
import axios from "axios"

import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import InvoiceIcon from "/src/assets/images/Icon_edit-Invoice.png"

export default function EditInvoice() {

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

    // NEW JUN26
    const [newBillingInfo, setNewBillingInfo] = useState({
        apodo:"",
        razonSocial:"",
        rfcEmpresa:"",
        calleFiscal:"",
        exteriorFiscal:"",
        interiorFiscal:"",
        coloniaFiscal:"",
        ciudadFiscal:"",
        estadoFiscal:"",
        cpFiscal:"",
        usoCFDI:"",
        regimenFiscal:"",
    })

    function handleInput(event) {
        setNewBillingInfo((prevState) => {
            return{...prevState, [event.target.name]: event.target.value}
        })
    }

    // new jul30
    const handleSubmit = async (event) => {
        event.preventDefault();
      
        const userEmail = localStorage.getItem("userEmail");
        if (!userEmail) {
          alert("No se encontró el correo del usuario.");
          return;
        }
      
        const payload = {
          ...newBillingInfo,
          userEmail: userEmail
        };
      
        try {
          const response = await fetch("http://localhost:4000/billing-address", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });
      
          if (response.ok) {
            alert("Dirección guardada exitosamente.");
            navigate('/userProfile');
          } else {
            const error = await response.json();
            alert("Error al guardar dirección: " + error.message);
          }
        } catch (err) {
          console.error("Error al guardar dirección:", err);
          alert("Error del servidor al guardar la dirección.");
        }
      };

    return (
        <body className="body-BG-Gradient">

            {/* LOGOS DIV */}
            <div className="loginLogo-ParentDiv">
                <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
            </div>
            {/* LOGOS END*/}

            <div className="edit-titleIcon-Div">
                <label className="editAddress-headerLabel">Edita tus datos de facturación</label>
                <img src={InvoiceIcon} alt="Home Icon" width="35" height="35"/>
            </div>


            <div className="editInstructions-Div">
                <label className="editInstructions-Label">Ingresa tus datos de facturación para simplificar el trámite de tus facturas.<br></br>
                <br></br>Recuerda que puedes guardar tantos perfiles como necesites para usarlos cuando lo requieras.
                </label>
            </div>

            <div className="billingInputs-Div">

                <label className="newUserData-Label">Apodo del Domicilio</label>
                <input className="addressInfo-Input" type="text" value={newBillingInfo.apodo} onChange={handleInput} required placeholder="Apodo o identificador de facturación" name="apodo"></input>
                
                <label className="newUserData-Label">Nombre o Razón Social</label>
                <input className="addressInfo-Input" type="text" value={newBillingInfo.razonSocial} onChange={handleInput} required placeholder="Ingrese nombre o razón social" name="razonSocial"></input>

                <label className="newUserData-Label">R.F.C.</label>
                <input className="addressInfo-Input" type="text" value={newBillingInfo.rfcEmpresa} onChange={handleInput} required placeholder="R.F.C. con homoclave" name="rfcEmpresa"></input>
            
                <label className="newUserData-Label">Calle</label>
                <input className="addressInfo-Input" type="text" value={newBillingInfo.calleFiscal} onChange={handleInput} required placeholder="Nombre de vialidad principal" name="calleFiscal"></input>

                <div className="addressNumbers-Div">
                    <div className="numberAndLabel-Div"> 
                        <label className="newUserData-Label">Num. Ext.</label>
                        <input className="productInfo-Input" type="text" value={newBillingInfo.exteriorFiscal} onChange={handleInput} required placeholder="Núm. Exterior" name="exteriorFiscal"></input>
                    </div>
                    <div className="numberAndLabel-Div">
                        <label className="newUserData-Label">Num.Int</label>
                        <input className="productInfo-Input" type="text" value={newBillingInfo.interiorFiscal} onChange={handleInput} required placeholder="Núm. Interior" name="interiorFiscal"></input>
                    </div>
                </div>

                <label className="newUserData-Label">Colonia</label>
                <input className="addressInfo-Input" type="text" value={newBillingInfo.coloniaFiscal} onChange={handleInput} required placeholder="Colonia o sector" name="coloniaFiscal"></input>

                <label className="newUserData-Label">Ciudad</label>
                <input className="addressInfo-Input" type="text" value={newBillingInfo.ciudadFiscal} onChange={handleInput} required placeholder="Ingrese ciudad" name="ciudadFiscal"></input>

                <label className="newUserData-Label">Estado</label>
                <input className="addressInfo-Input" type="text" value={newBillingInfo.estadoFiscal} onChange={handleInput} required placeholder="Ingrese estado" name="estadoFiscal"></input>

                <label className="newUserData-Label">Código Postal</label>
                <input className="addressInfo-Input" type="text" value={newBillingInfo.cpFiscal} onChange={handleInput} required placeholder="Código Postal" name="cpFiscal"></input>

                <label className="newUserData-Label">CFDI</label>
                <select className="addressInfo-Input" type="text" value={newBillingInfo.usoCFDI} onChange={handleInput} required placeholder="Elija CFDI" name="usoCFDI">
                    <option>Escoger Uso CFDI...</option>
                    <option value="G01: Adquisición de mercancías">G01: Adquisición de mercancías</option>
                    <option>G03: Gastos en general</option>
                    <option>P01: Por definir</option>
                    <option>S01: Sin efectos fiscales</option>
                </select>

                <label className="newUserData-Label">Régimen Fiscal</label>
                <select className="addressInfo-Input" type="text" value={newBillingInfo.regimenFiscal} onChange={handleInput} required placeholder="Escoga su régimen fiscal" name="regimenFiscal">
                    <option>Escoger régimen fiscal...</option>
                    <option>601: General de Ley Personas Morales</option>
                    <option>603: Personas Morales con Fines no Lucrativos</option>
                    <option>605: Sueldos y Salarios e Ingresos Asimilados a Salarios</option>
                    <option>607: Régimen de Enajenación o Adquisición de Bienes</option>
                    <option>611: Ingresos por Dividendos - Socios y accionistas</option>
                    <option>612: Personas Físicas con Actividades Empresariales y Profesionales</option>
                    <option>616: Sin obligaciones fiscales</option>
                    <option>620: Sociedades Cooperativas de Producción que optan por diferir sus ingresos</option>
                    <option>621: Incorporación Fiscal</option>
                    <option>622: Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras</option>
                    <option>626: Régimen Simplificado de Confianza</option>
                </select>

            <button className="addInvoiceInfo-Button" type="submit" onClick={handleSubmit}>Agregar</button>   
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