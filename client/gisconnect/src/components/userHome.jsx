import { useState, useEffect } from "react"
import { useNavigate } from 'react-router-dom';

import { useLocation } from 'react-router-dom';
import axios from "axios"

import { faCircleQuestion, faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";
import CotizaIcon from "/src/assets/images/Icono_Cotiza.png"
import CarritoIcon from "/src/assets/images/Icono_Carrito.png"
import PedidosIcon from "/src/assets/images/Icono_Pedidos.png"
import RecompraIcon from "/src/assets/images/Icono_Recompra.png"
import PerfilIcon from "/src/assets/images/Icono_Perfil.png"
import CatalogoIcon from "/src/assets/images/Icono_Catalogo.png"

import Modal from "./Modal";

export default function UserHome() {

    const navigate = useNavigate();

    function goToHome() {
        console.log("Go to home")
        navigate("/userHome")
    }
    
    function goToExpressQuote() {
        console.log("Go to quoter")
        navigate("/expressQuote")
    }
    
    function goToNewOrder() {
        console.log("Go to new order")
        navigate("/newOrder")
    }
    
    function goToMyOrders() {
        console.log("Go to my orders")
        navigate("/myOrders")
    }
    
    function goToReOrder() {
        console.log("Go to re-order")
    }
    
    function goToMyProfile() {
        console.log("Go to my profile")
        navigate("/userProfile")
    }
    
    function goToCatalogue() {
        console.log("Go to product catalogue")
        navigate("/catalogue")
    }


    const [showModal, setShowModal] = useState(false)

    const [userCredentials, setUserCredentials] = useState([]);

    useEffect(() => {
        const savedCreds = JSON.parse(localStorage.getItem('userLoginCreds'));
        setUserCredentials(savedCreds || []);
    }, [])

    console.log(userCredentials.correo)
    // END JUN25

    return (
        <body className="app-shell body-BG-Gradient">

            {/* LOGOS DIV */}
            <div className="app-header loginLogo-ParentDiv">
                <img className="userHome-GISLogo" src={Logo} alt="Home Icon" width="230" height="70"/>
                {/* <img className="signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/> */}
            </div>
            {/* LOGOS END*/}

            {/* here aug27 */}
            <div className="app-main has-fixed-footer">
            {/* NEW JUN05 */}
            <label className="userHomeHeader-Label">¡Bienvenido de vuelta!</label>
            {/* END JUN05 */}

            {/* BODY */}
            <div className="userHome-BodyDiv">
                {/* INDIVIDUAL BLOCKS */}
                <div className="home-iconLabel-Div" onClick={goToExpressQuote}>
                    <img className="homeQuoter-Icon" src={CotizaIcon} alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Cotiza al <br></br>instante</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToNewOrder}>
                    <img className="homeQuoter-Icon" src={CarritoIcon} alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Pedido <br></br>nuevo</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToMyOrders}>
                    <img className="homeQuoter-Icon" src={PedidosIcon} alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Mis <br></br>pedidos</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToReOrder}>
                    <img className="homeQuoter-Icon" src={RecompraIcon} alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Comprar <br></br>de nuevo</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToMyProfile}>
                    <img className="homeQuoter-Icon" src={PerfilIcon} alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Mi <br></br>perfil</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToCatalogue}>
                    <img className="homeQuoter-Icon" src={CatalogoIcon} alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Nuestro <br></br>catálogo</label>
                </div>
            </div>
            {/* BODY END */}

            <div className="footerIcon-NameDiv" onClick={() => setShowModal(true)}>
                <button className="userHomeQuestions-Btn"><FontAwesomeIcon icon={faCircleQuestion}/></button>
            </div>
            {/* new jun03 */}
            {showModal && <Modal onClose={() => setShowModal(false)}/>}
            {/* end jun03 */}
            </div>

            {/* FOOTER MENU */}
            {/* Basket image (behind) */}
            {/* <img className="newData-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/> */}
            <img className="userHome-VeggieBasket" src={Basket} alt="Basket" width="420" height="260" />

            {/* Footer bar (front) */}
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
            {/* <div className="app-footer footerMenuDiv">
            <div className="basketWrapper">
                <img
                className="signup-VeggieBasket"
                src={Basket}
                alt="Basket"
                width="400"
                height="250"
                />
            </div>

            <div className="footerStack">
            <img
                className="signup-VeggieBasket"
                src={Basket}
                alt="Basket"
                width="420"
                height="260"
            />

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
            </div> */}

        </body>
    )
}