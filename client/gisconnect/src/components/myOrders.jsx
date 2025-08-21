import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { faHouse, faUser, faCartShopping, faHouseMedicalCircleExclamation } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";

export default function MyOrders() {

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

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const userEmail = localStorage.getItem("userEmail");

    useEffect(() => {
        if (!userEmail) {
        console.warn("User email not found in localStorage");
        setLoading(false);
        return;
        }

        fetch(`http://localhost:4000/userOrders?email=${userEmail}`)
        .then((res) => res.json())
        .then((data) => {
            setOrders(data);
            setLoading(false);
        })
        .catch((err) => {
            console.error("Failed to fetch user orders:", err);
            setLoading(false);
        });
    }, []);

    const goToTrackingTimeline = (order) => {
        navigate(`/orderDetail/${order._id}`, { state: { order } });
    };

    return (
        <body className="body-BG-Gradient" >

            {/* LOGOS DIV */}
            <div className="loginLogo-ParentDiv">
                <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
            </div>
            {/* LOGOS END*/}


            <div className="order-tracker-container">
                <div className="edit-titleIcon-Div">
                    <label className="editAddress-headerLabel">Mis Pedidos</label>
                    <img className="myOrders-Icon" src="./src/assets/images/Icono_Pedidos.png" alt="Carrito" width="50" height="50" />
                </div>

                <div className="myOrders-DetailDiv">
                {loading ? (
                    <p>Cargando órdenes...</p>
                ) : orders.length === 0 ? (
                    <p>No hay órdenes registradas.</p>
                ) : (
                    <ul className="order-list">
                        {[...orders] // clone array so original isn't mutated
                            .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate)) // newest first
                            .map((order, index) => (
                            <li
                                key={order._id || index}
                                className="order-item"
                                onClick={() => goToTrackingTimeline(order)}
                                style={{
                                cursor: "pointer",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                margin: "10px 0",
                                padding: "12px"
                                }}
                            >
                                <strong className="orderNumber-MyOrders">Pedido #:</strong> {(order._id).slice(-5)} <br />

                                <strong className="orderNumber-MyOrders">Fecha:</strong>{" "}
                                {order.orderDate
                                ? (() => {
                                    const date = new Date(order.orderDate);
                                    const day = date.getDate().toString().padStart(2, "0");
                                    const month = date.toLocaleString("en-MX", { month: "short" });
                                    const year = date.getFullYear();
                                    return `${day}/${month}/${year}`;
                                    })()
                                : "Sin fecha"}
                                <br />

                                <strong className="orderNumber-MyOrders">Estado:</strong> {order.orderStatus || "Pendiente"} <br />
                            </li>
                            ))}
                        </ul>
                )}
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
    );
    }