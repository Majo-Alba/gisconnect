// though file pushClient.js does indeed exist (server/src/lib/pushClient.js) Im still getting the error. Here is my current adminHome.jsx, mind taking a look and make neccesary tweaks
// import { useState } from "react"
import { useState, useEffect } from "react"

import { Link, useNavigate } from "react-router-dom"
import axios from "axios"

import { faHouse, faCheckToSlot, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";
import HomeIcon from "/src/assets/images/Icono_Home.png";
import UserIcon from "/src/assets/images/Icono_User.png";
import SettingsIcon from "/src/assets/images/Icono_Settings.png";

import CotizaIcono from "/src/assets/images/Icono_Cotiza.png";
import CarritoIcono from "/src/assets/images/Icono_Carrito.png";
import CotizacionIcon from "/src/assets/images/Icono_cotizacionesNuevas.png";
import PorEmpacarIcono from "/src/assets/images/Icono_porEmpacar.png"
import GestionaIcono from "/src/assets/images/Icono_gestionarEntrega.png"
import PorEntregarIcono from "/src/assets/images/Icono_porEntregar.png"
import EntregadoIcono from "/src/assets/images/Icono_entregado.png"

import { registerAdminPushToken } from "../lib/pushClient";
import { API } from "/src/lib/api";

export default function AdminHome() {

    const navigate = useNavigate();

    function goToNewQuotes() {
        console.log("Go to new quotes")
        navigate("/newQuotes")
    }
    
    function goToNewOrders() {
        console.log("Go to new orders")
        navigate("/newOrders")
    }
    
    function goToGeneratedQuotes() {
        console.log("Go to generated quotes")
        navigate("/quotes")
    }
    
    function goToForPacking() {
        console.log("Go to for packing")
        navigate("/toPack")
    }
    
    function goToManageDelivery() {
        console.log("Go to manage delivery")
        navigate("/manageDelivery")
    }
    
    function goToPackageReady() {
        console.log("Go to package ready")
        navigate("/deliverReady")
    }
    
    function goToDelivered() {
        console.log("Go to delivered")
        navigate("/delivered")
    }

    function goToAdminHome() {
        console.log("Go to admin home")
        navigate("/adminHome")
    }

    // SEP10
    // Register push token for signed-in admin
    useEffect(() => {
        const raw = JSON.parse(localStorage.getItem("userLoginCreds") || "null");
        const email = raw?.correo || localStorage.getItem("userEmail") || "";
        if (!email) return;
        // Optional: gate by your known admin list here before calling
        registerAdminPushToken(API, email);
    }, []);
    // SEP10

    return (
        <body className="body-BG-Gradient">

            {/* LOGOS DIV */}
            <div className="loginLogo-ParentDiv">
                <img className="userHome-GISLogo" src={Logo} alt="Home Icon" width="230" height="70"/>
                <img className="signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/>
            </div>
            {/* LOGOS END*/}

            {/* NEW JUN05 */}
                <label className="userHomeHeader-Label">¡Bienvenido a casa!</label>
            {/* END JUN05 */}

            {/* BODY */}
            <div className="userHome-BodyDiv">
                {/* INDIVIDUAL BLOCKS */}
                <div className="adminHome-iconLabel-Div" onClick={goToNewQuotes}>
                    <img className="homeQuoter-Icon" src={CotizaIcono} alt="Home Icon" width="50" height="50"/>
                    <label className="homeIcon-Label">Cotizaciones <br></br>nuevas</label>
                </div>
                <div className="adminHome-iconLabel-Div" onClick={goToNewOrders}>
                    <img className="homeQuoter-Icon" src={CarritoIcono} alt="Home Icon" width="50" height="50"/>
                    <label className="homeIcon-Label">Pedidos <br></br>nuevos</label>
                </div>
                <div className="adminHome-iconLabel-Div" onClick={goToGeneratedQuotes}>
                    <img className="homeQuoter-Icon" src={CotizacionIcon} alt="Home Icon" width="50" height="50"/>
                    <label className="homeIcon-Label">Facturas <br></br>generadas</label>
                </div>
                <div className="adminHome-iconLabel-Div" onClick={goToForPacking}>
                    <img className="homeQuoter-Icon" src={PorEmpacarIcono} alt="Home Icon" width="50" height="50"/>
                    <label className="homeIcon-Label">Por <br></br>empacar</label>
                </div>
                <div className="adminHome-iconLabel-Div" onClick={goToManageDelivery}>
                    <img className="homeQuoter-Icon" src={GestionaIcono} alt="Home Icon" width="50" height="50"/>
                    <label className="homeIcon-Label">Gestionar <br></br>entrega</label>
                </div>
                <div className="adminHome-iconLabel-Div" onClick={goToPackageReady}>
                    <img className="homeQuoter-Icon" src={PorEntregarIcono} alt="Home Icon" width="50" height="50"/>
                    <label className="homeIcon-Label">Por <br></br>entregar</label>
                </div>
                <div className="adminHome-iconLabel-Div" onClick={goToDelivered}>
                    <img className="homeQuoter-Icon" src={EntregadoIcono} alt="Home Icon" width="50" height="50"/>
                    <label className="homeIcon-Label">Pedidos <br></br>Entregados</label>
                </div>
            </div>
            {/* BODY END */}

            {/* FOOTER MENU */}
            <div className="footerMenuDiv">
                <div className="footerHolder">
                    {/* HOME FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToAdminHome}>
                        <FontAwesomeIcon icon={faHouse} className="footerIcons"/>
                        <label className="footerIcon-Name">PRINCIPAL</label>
                    </div>

                    {/* USER FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToNewOrders}>
                        <FontAwesomeIcon icon={faCartShopping} className="footerIcons"/>
                        <label className="footerIcon-Name">ORDENES</label>
                    </div>

                    {/* SETTINGS FOOTER DIV */}
                    <div className="footerIcon-NameDiv" onClick={goToPackageReady}>
                        <FontAwesomeIcon icon={faCheckToSlot} className="footerIcons"/>
                        <label className="footerIcon-Name">ENTREGAR</label>
                    </div>
                </div>
            </div>
            {/* FOOTER MENU END */}
        </body>
    )
}