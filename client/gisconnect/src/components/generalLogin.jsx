import { useState, useContext } from "react"
import { Link, useNavigate } from "react-router-dom"

import { UserContext } from "../contexts/UserContext"

import { faEye } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";
import axios from "axios";
import { API } from "/src/lib/api";

export default function GeneralLogin() {

    // LOGIN FUNCTION
    const loggedData = useContext(UserContext)

    const navigate = useNavigate()

    const [userCreds, setUserCreds] = useState({
        correo:"",
        contrasena:""
    })

    const [message, setMessage] = useState({
        type:"invisible-msg",
        test:"Exit"
    })

    // PASSWORD EYE
    const passwordField = document.getElementById("password");

    function toggleEye() {
        if (passwordField.type === "password") {
            passwordField.type = "text";
        } else {
            passwordField.type = "password";
        }
    }
     // PASSWORD EYE END

    function handleInput(event) {
        setUserCreds((prevState) => {
            return{...prevState, [event.target.name]:event.target.value}
        })
    }

    // NEW JUL21
    function handleSubmit(event) {
        event.preventDefault();
        console.log(userCreds);
    
        localStorage.setItem('userLoginCreds', JSON.stringify(userCreds)); // Keep this if you need it
    
        fetch(`${API}/login`, {
            method: "POST",
            body: JSON.stringify(userCreds),
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then((response) => {
            if (response.status === 404) {
                setMessage({ type: "error", text: "El usuario no se encontró" });
            } else if (response.status === 403) {
                setMessage({ type: "error", text: "Contraseña incorrecta" });
            }
    
            setTimeout(() => {
                setMessage({ type: "invisible-msg", text: "Exit" });
            }, 5000);
    
            return response.json();
        })
        .then((data) => {
            if (data.token !== undefined) {
                // ✅ Store token and user email
                localStorage.setItem("gis-user", JSON.stringify(data));
                localStorage.setItem("userEmail", userCreds.correo); // ✅ This is what you're missing
    
                loggedData.setLoggedUser(data);
    
                navigate("/userHome");
            }
        })
        .catch((err) => {
            console.log(err);
        });
    }
    // END JUL21


    
    function goToUser() {
        console.log("user clicked Clicked")
    }

    return (
        <body className="body-BG-Gradient">
            <form onSubmit={handleSubmit}>

                <div className="loginLogo-ParentDiv">
                    <img className="signup-GISLogo" src={Logo} alt="Home Icon" width="230" height="70"/>
                    <img className="signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/>
                    <label className="welcome-Label">Where passion<br></br>meets nature</label>

                </div>

                <div>
                    <input className="returningUser-Input" required type="email" onChange={handleInput} placeholder="Correo electrónico" name="correo" value={userCreds.correo}></input>
                </div>

                <div>
                    <div>
                        <input className="returningUser-Input" minLength={5} type="password" id="password" required onChange={handleInput} placeholder="Contraseña" name="contrasena" value={userCreds.contrasena}></input>
                        <FontAwesomeIcon className="icon" onClick={toggleEye} icon={faEye}/>
                    </div>
                </div>

                {/* <p className="forgotPassword-Subnote">¿Olvidaste tu contraseña?  <Link to="/restorePassword" className="login-SubLink">Da click aquí</Link></p> */}
                <p className="forgotPassword-Subnote">¿Olvidaste tu contraseña?  <button onClick={() => navigate("/restorePassword")}>Da click aquí</button>
                </p>

                <button className="returningUser-GeneralLoginButton" type="submit" onClick={goToUser}>Ingresar</button>

                {/* <p className="login-Subnote">¿Aún no te registras?  <Link to="/newSignup" className="login-SubLink">Crea una cuenta</Link></p> */}
                <p className="login-Subnote">¿Aún no te registras?  <button onClick={() => navigate("/newData")}>Crea una cuenta</button>
                </p>

                <label className="login-Slogan">Bienvenido<br></br> a casa</label>

                <div className="popUp-Message">
                    <p className={message.type}>{message.text}</p>
                </div>

            </form>
        </body>
    )
}