import { useState } from "react"
import { Link } from "react-router-dom"
import axios from "axios"

import { faEye } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";

import { API } from "/src/lib/api";

export default function NewSignupData() {

    const[userDetails, setUserDetails] = useState({
        nombre:"",
        apellido:"",
        empresa:"",
        correo:"",
        contrasena:"",
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
        setUserDetails((prevState) => {
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
        console.log(userDetails)

        const formData = new FormData()

        formData.append("nombre", userDetails.nombre)
        formData.append("apellido", userDetails.apellido)
        formData.append("empresa", userDetails.empresa)
        formData.append("correo", userDetails.correo)
        formData.append("contrasena", userDetails.contrasena)

        // JUL21
        axios.post(`${API}/register`, formData, {
            headers: { 'Content-Type': 'application/json' }
          })
          .then((response) => {
            // ✅ Save user email to localStorage
            localStorage.setItem("userEmail", userDetails.correo);
        
            setMessage({ type: "success", text: response.data.message });
            setTimeout(() => {
              setMessage({ type: "invisible-msg", text: "" });
            }, 1300);
            setTimeout(() => {
              window.location.href = "/";
            }, 1000);
          })
          .catch(err => console.log(err));
    }
    // UPLOAD DATA END

    return (
        <body className="body-BG-Gradient">

            {/* LOGOS DIV */}
            <div className="loginLogo-ParentDiv">
                <img className="signup-GISLogo" src={Logo} alt="Home Icon" width="230" height="70"/>
                <img className="signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/>
            </div>
            {/* LOGOS END*/}

            {/* INPUTS DIV */}
            <div className="newUser-LabelsAndInputs-Div">
                <div>
                    <label className="newUserData-Label">Nombre</label>
                    <input className="newUserData-Input" type="text"required onChange={handleInput} placeholder="Dinos tu nombre" name="nombre" value={userDetails.nombre}></input>
                </div>
                <div>
                    <label className="newUserData-Label">Apellido</label>
                    <input className="newUserData-Input" type="text"required onChange={handleInput} placeholder="Ingresa tu apellido" name="apellido" value={userDetails.apellido}></input>
                </div>
                <div>
                    <label className="newUserData-Label">Empresa</label>
                    <input className="newUserData-Input" type="text"required onChange={handleInput} placeholder="Cuál es el nombre de tu empresa" name="empresa" value={userDetails.empresa}></input>
                </div>
                <div>
                    <label className="newUserData-Label">Correo</label>
                    <input className="newUserData-Input" type="text"required onChange={handleInput} placeholder="Tu correo será tu usuario" name="correo" value={userDetails.correo}></input>
                </div>
                <div>
                    <label className="newUserData-Label">Contraseña</label>
                    {/* NEW JUN04 */}
                    <div className="newUserPassword-Div">
                        <input className="newUserPassword-Input" minLength={5} type="password" id="password" required onChange={handleInput} placeholder="Genera tu contraseña" name="contrasena" value={userDetails.contrasena}></input>
                        <FontAwesomeIcon className="newUser-EyeIcon" onClick={toggleEye} icon={faEye}/>
                    </div>
                </div>    
            </div>

            <button className="newUser-SendButton" type="submit" onClick={handleSubmit}>Agregar</button>
            
        </body>
    )
}