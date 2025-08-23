import { useState } from "react"
import { Link } from "react-router-dom"
import axios from "axios"

import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";
import HomeIcon from "/src/assets/images/Icono_Home.png"
import UserIcon from "/src/assets/images/Icono_User.png"
import SettingsIcon from "/src/assets/images/Icono_Settings.png"
// function goToAdminCode() {
//     console.log("Go to admin code")
// }

export default function AdminData() {

    const[adminDetails, setAdminDetails] = useState({
        idAdmin:"",
        nombreAdmin:"",
        apellidoAdmin:"",
        correoAdmin:"",
        contrasenaAdmin:"",
        confirmarContrasenaAdmin:"",
    })

    function handleInput(event) {
        setAdminDetails((prevState) => {
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
        console.log(adminDetails)

        const formData = new FormData()

        formData.append("idAdmin", adminDetails.idAdmin)
        formData.append("nombreAdmin", adminDetails.nombreAdmin)
        formData.append("apellidoAdmin", adminDetails.apellidoAdmin)
        formData.append("correoAdmin", adminDetails.correoAdmin)
        formData.append("contrasenaAdmin", adminDetails.contrasenaAdmin)
        formData.append("confirmarContrasenaAdmin", adminDetails.confirmarContrasenaAdmin)

        axios.post(`${API}/userAdmin`, formData, {
            headers: {
                'Content-Type': "application/json"
              },
              idAdmin: adminDetails.idAdmin,
              nombreAdmin: adminDetails.nombreAdmin,
              apellidoAdmin: adminDetails.apellidoAdmin,
              correoAdmin: adminDetails.correoAdmin,
              contrasenaAdmin: adminDetails.contrasenaAdmin,
              confirmarContrasenaAdmin: adminDetails.confirmarContrasenaAdmin,
        })
        .then((data) => {
            setMessage({type:"success", text:data.message})

            console.log(data)
            setTimeout(() => {
                        setMessage({type:"invisible-msg", text:"Exit"})
                    }, 1300)
                    setTimeout(() => {
                        window.location.href="/adminConfirm"
                    }, 1000)
        })
        .catch(err => console.log(err))
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
                    <input className="newUserData-Input" type="text"required onChange={handleInput} placeholder="Nombre" name="idAdmin" value={adminDetails.idAdmin}></input>
                    {/* <input className="adminData-Input" placeholder="ID Administrador"></input> */}
                </div>
                <div>
                {/* <div className="adminSignup-LabelInputDiv"> */}
                    <label className="newUserData-Label">Apellido</label>
                    <input className="newUserData-Input" type="text"required onChange={handleInput} placeholder="Apellido" name="nombreAdmin" value={adminDetails.nombreAdmin}></input>
                    {/* <input className="adminData-Input" placeholder="Nombre del administrador"></input> */}
                </div>
                <div>
                {/* <div className="adminSignup-LabelInputDiv"> */}
                    <label className="newUserData-Label">Correo</label>
                    <input className="newUserData-Input" type="text"required onChange={handleInput} placeholder="Ingresa tu correo" name="correoAdmin" value={adminDetails.correoAdmin}></input>
                    {/* <input className="adminData-Input" placeholder="Correo autorizado del administrador"></input> */}
                </div>
                <div>
                {/* <div className="adminSignup-LabelInputDiv"> */}
                    <label className="newUserData-Label">Contraseña</label>
                    <input className="newUserData-Input" type="text"required onChange={handleInput} placeholder="Genera tu contraseña" name="contrasenaAdmin" value={adminDetails.contrasenaAdmin}></input>
                    {/* <input className="adminData-Input" placeholder="Genera tu contraseña"></input> */}
                </div>                  
            </div>
            {/* INPUTS DIV END */}

            {/* SUBMIT BUTTON */}
            <button className="newUser-SendButton" type="submit" onClick={handleSubmit}>Enviar</button>
            {/* SUBMIT BUTTON END */}

            {/* SUBMIT BUTTON */}
            {/* <div className="admin-SendButton" onClick={goToAdminCode}>
                    <label>Enviar</label>
                </div> */}
            {/* SUBMIT BUTTON END */}

            

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