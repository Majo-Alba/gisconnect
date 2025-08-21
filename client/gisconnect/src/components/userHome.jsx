import { useState, useEffect } from "react"
import { useNavigate } from 'react-router-dom';

import { useLocation } from 'react-router-dom';
import axios from "axios"

import { faCircleQuestion, faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

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
        <body className="body-BG-Gradient">

            {/* LOGOS DIV */}
            <div className="loginLogo-ParentDiv">
                <img className="userHome-GISLogo" src="./src/assets/images/GIS_Logo.png" alt="Home Icon" width="230" height="70"/>
                <img className="signup-VeggieBasket" src="./src/assets/images/BG-veggieBasket.png" alt="Home Icon" width="400" height="250"/>
            </div>
            {/* LOGOS END*/}

            {/* NEW JUN05 */}
            <label className="userHomeHeader-Label">Bienvenido de vuelta!</label>
            {/* END JUN05 */}

            {/* BODY */}
            <div className="userHome-BodyDiv">
                {/* INDIVIDUAL BLOCKS */}
                <div className="home-iconLabel-Div" onClick={goToExpressQuote}>
                    <img className="homeQuoter-Icon" src="./src/assets/images/Icono_Cotiza.png" alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Cotiza al <br></br>instante</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToNewOrder}>
                    <img className="homeQuoter-Icon" src="./src/assets/images/Icono_Carrito.png" alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Pedido <br></br>nuevo</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToMyOrders}>
                    <img className="homeQuoter-Icon" src="./src/assets/images/Icono_Pedidos.png" alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Mis <br></br>pedidos</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToReOrder}>
                    <img className="homeQuoter-Icon" src="./src/assets/images/Icono_Recompra.png" alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Comprar <br></br>de nuevo</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToMyProfile}>
                    <img className="homeQuoter-Icon" src="./src/assets/images/Icono_Perfil.png" alt="Home Icon" width="60" height="60"/>
                    <label className="homeIcon-Label">Mi <br></br>perfil</label>
                </div>
                <div className="home-iconLabel-Div" onClick={goToCatalogue}>
                    <img className="homeQuoter-Icon" src="./src/assets/images/Icono_Catalogo.png" alt="Home Icon" width="60" height="60"/>
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