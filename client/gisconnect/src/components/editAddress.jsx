import { useState, useEffect } from "react"
import { useNavigate } from 'react-router-dom';

import { Link } from "react-router-dom"
import axios from "axios"

import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import LocationIcono from "/src/assets/images/Icon_location-pin.png"

export default function EditAddress() {

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

    // NEW JUN25
    const [newShippingAddress, setNewShippingAddress] = useState({
        apodo:"",
        calleEnvio:"",
        exteriorEnvio:"",
        interiorEnvio:"",
        coloniaEnvio:"",
        ciudadEnvio:"",
        estadoEnvio:"",
        cpEnvio:"",
    })

    function handleInput(event) {
        setNewShippingAddress((prevState) => {
            return{...prevState, [event.target.name]: event.target.value}
        })
    }
    // END JUN25

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        // 'Authorization': 'Bearer your_token'
        // 'Authorization': 
        'Access-Control-Allow-Origin': '*'
      };

    // HERE JUL30
    const handleSubmit = async (event) => {
        event.preventDefault();
      
        const userEmail = localStorage.getItem("userEmail");
        if (!userEmail) {
          alert("No se encontró el correo del usuario.");
          return;
        }
      
        const payload = {
          ...newShippingAddress,
          userEmail: userEmail
        //   email: userEmail
        };
      
        try {
          const response = await fetch(`${API}/shipping-address`, {
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

    let [food, setFood] = useState()

    useEffect(() => {
        console.log(JSON.stringify(food))
    })

    let [projects, setProjects] = useState([])

    console.log(projects)
    
    useEffect(() => {
        getAllProjects()
    },[])

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

    // END APR21

    return (
        <body className="body-BG-Gradient">

            {/* LOGOS DIV */}
            <div className="loginLogo-ParentDiv">
                <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
            </div>
            {/* LOGOS END*/}

            <div className="edit-titleIcon-Div">
                <label className="editAddress-headerLabel">Edita tus domicilios</label>
                <img src={LocationIcono} alt="Home Icon" width="35" height="35"/>
            </div>

            <div className="editInstructions-Div">
                <label className="editInstructions-Label">Completa tus datos de envío para tenerlos siempre disponibles y facilitar tu proceso de compra.<br></br> 
                    <br></br>Recuerda que puedes agregar todos los domicilios que necesites, así podremos enviar tus pedidos sin 
                    problema a donde tú desees
                </label>
            </div>

            <div className="addressInputs-Div">
                <label className="newUserData-Label">Apodo del Domicilio</label>
                <input className="addressInfo-Input" type="text" value={newShippingAddress.apodo} onChange={handleInput} required placeholder="Apodo o identificador del domicilio" name="apodo"></input>
                
                <label className="newUserData-Label">Calle</label>
                <input className="addressInfo-Input" type="text" value={newShippingAddress.calleEnvio} onChange={handleInput} required placeholder="Nombre de vialidad principal" name="calleEnvio" ></input>

                <div className="addressNumbers-Div">
                    <div className="numberAndLabel-Div"> 
                        <label className="newUserData-Label">Num. Ext.</label>
                        <input className="addressInfo-Input" type="text" value={newShippingAddress.exteriorEnvio} onChange={handleInput} required placeholder="Núm. Exterior" name="exteriorEnvio" ></input>
                    </div>
                    <div className="numberAndLabel-Div">
                        <label className="newUserData-Label">Num.Int</label>
                        <input className="addressInfo-Input" type="text" value={newShippingAddress.interiorEnvio} onChange={handleInput} required placeholder="Núm. Interior" name="interiorEnvio" ></input>
                    </div>
                </div>

                <label className="newUserData-Label">Colonia</label>
                <input className="addressInfo-Input" type="text" value={newShippingAddress.coloniaEnvio} onChange={handleInput} required placeholder="Colonia o sector" name="coloniaEnvio"></input>
            
                <label className="newUserData-Label">Ciudad</label>
                <input className="addressInfo-Input" type="text" value={newShippingAddress.ciudadEnvio} onChange={handleInput} required placeholder="Ingrese ciudad" name="ciudadEnvio" ></input>

                <label className="newUserData-Label">Estado</label>
                <input className="addressInfo-Input" type="text" value={newShippingAddress.estadoEnvio} onChange={handleInput} required placeholder="Ingrese estado" name="estadoEnvio"></input>

                <label className="newUserData-Label">Código Postal</label>
                <input className="addressInfo-Input" type="text" value={newShippingAddress.cpEnvio} onChange={handleInput} required placeholder="Código postal"  name="cpEnvio"></input>
            </div>

            <button className="addAddress-Button" type="submit" onClick={handleSubmit}>Agregar</button>            

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