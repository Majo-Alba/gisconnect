import { useState, useContext, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

import { UserContext } from "../contexts/UserContext";

import { faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";
import axios from "axios";
import { API } from "/src/lib/api";

export default function GeneralLogin() {
  // LOGIN FUNCTION
  const loggedData = useContext(UserContext);
  const navigate = useNavigate();

  const [userCreds, setUserCreds] = useState({
    correo: "",
    contrasena: "",
  });

  const [message, setMessage] = useState({
    type: "invisible-msg",
    text: "Exit",
  });

  // --- Admin allowlist fallback (use your real admin emails here) ---
  const ADMIN_EMAILS = new Set([
    "majo_test@gmail.com",
    "ventas@greenimportsol.com",
    "info@greenimpoortsol.com",
    "administracion@greenimportsol.com",
    "administracion2@greenimportsol.com",
    "logistica@greenimportsol.com",
    "almacen@greenimportsol.com",
    "almacen2@greenimportsol.com",
    "almacen3@greenimportsol.com",
    // "admin@gisconnect.com",
    // "alejandro@gisconnect.com",
    // "miguel@gisconnect.com",
  ]);
  // -----------------------------------------------------------------

  // PASSWORD EYE (useRef instead of document.getElementById)
  const passwordRef = useRef(null);
  function toggleEye() {
    const input = passwordRef.current;
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  }
  // PASSWORD EYE END

  function handleInput(event) {
    setUserCreds((prevState) => ({
      ...prevState,
      [event.target.name]: event.target.value,
    }));
  }

  // NEW JUL21 (with admin redirect)
  async function handleSubmit(event) {
    event.preventDefault();
    try {
      // keep creds if you need them later
      localStorage.setItem("userLoginCreds", JSON.stringify(userCreds));

      const resp = await fetch(`${API}/login`, {
        method: "POST",
        body: JSON.stringify(userCreds),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (resp.status === 404) {
        setMessage({ type: "error", text: "El usuario no se encontró" });
      } else if (resp.status === 403) {
        setMessage({ type: "error", text: "Contraseña incorrecta" });
      }

      // hide message later
      setTimeout(() => {
        setMessage({ type: "invisible-msg", text: "Exit" });
      }, 5000);

      const data = await resp.json();

      if (data?.token !== undefined) {
        // Store token and email
        localStorage.setItem("gis-user", JSON.stringify(data));
        localStorage.setItem("userEmail", userCreds.correo);

        loggedData.setLoggedUser?.(data);

        // --- Determine admin ---
        const apiSaysAdmin =
          data?.isAdmin === true ||
          data?.role === "admin" ||
          data?.user?.role === "admin";
        const emailSaysAdmin = ADMIN_EMAILS.has(
          String(userCreds.correo || "").trim().toLowerCase()
        );
        const isAdmin = Boolean(apiSaysAdmin || emailSaysAdmin);

        localStorage.setItem("isAdmin", isAdmin ? "true" : "false");

        // Redirect
        if (isAdmin) {
          navigate("/adminHome");
        } else {
          navigate("/userHome");
        }
      }
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        text: "Ocurrió un error de red. Intenta de nuevo.",
      });
      setTimeout(() => {
        setMessage({ type: "invisible-msg", text: "Exit" });
      }, 5000);
    }
  }
  // END JUL21

  function goToUser() {
    // left for analytics if you need it
    // console.log("user clicked Clicked")
  }

  return (
    <body className="app-shell body-BG-Gradient">
      <form onSubmit={handleSubmit}>
        <div className="app-header loginLogo-ParentDiv">
          <img
            className="signup-GISLogo"
            src={Logo}
            alt="Home Icon"
            width="230"
            height="70"
          />
          <label className="welcome-Label">
            Where passion
            <br />
            meets nature
          </label>
        </div>

        <div>
          <input
            className="returningUser-Input"
            required
            type="email"
            onChange={handleInput}
            placeholder="Correo electrónico"
            name="correo"
            value={userCreds.correo}
          />
        </div>

        <div>
          <div>
            <input
              className="returningUser-Input"
              minLength={5}
              type="password"
              id="password"
              ref={passwordRef}
              required
              onChange={handleInput}
              placeholder="Contraseña"
              name="contrasena"
              value={userCreds.contrasena}
            />
            <FontAwesomeIcon className="icon" onClick={toggleEye} icon={faEye} />
          </div>
        </div>

        <p className="forgotPassword-Subnote">
          ¿Olvidaste tu contraseña?{" "}
          <Link to="/restorePassword" className="login-SubLink">
            Da click aquí
          </Link>
        </p>

        <button
          className="returningUser-GeneralLoginButton"
          type="submit"
          onClick={goToUser}
        >
          Ingresar
        </button>

        <p className="login-Subnote">
          ¿Aún no te registras?{" "}
          <Link to="/newSignup" className="login-SubLink">
            Crea una cuenta
          </Link>
        </p>

        <label className="login-Slogan">
          Bienvenido
          <br /> a casa
        </label>

        <div className="popUp-Message">
          <p className={message.type}>{message.text}</p>
        </div>
        <img
          className="og-signup-VeggieBasket"
          src={Basket}
          alt="Home Icon"
          width="400"
          height="250"
        />
      </form>
    </body>
  );
}

// // hey chatgpt, when logging in, I want to determine certain accounts that, instead of navigating to /userHome when clicking "Ingresar", take you to /adminHome, since these accounts are the admin accounts. This is my current generalLogin.jsx, can you help me direct edit

// import { useState, useContext } from "react"
// import { Link, useNavigate } from "react-router-dom"

// import { UserContext } from "../contexts/UserContext"

// import { faEye } from "@fortawesome/free-solid-svg-icons"
// import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

// import Logo from "/src/assets/images/GIS_Logo.png";
// import Basket from "/src/assets/images/BG-veggieBasket.png";
// import axios from "axios";
// import { API } from "/src/lib/api";

// export default function GeneralLogin() {

//     // LOGIN FUNCTION
//     const loggedData = useContext(UserContext)

//     const navigate = useNavigate()

//     const [userCreds, setUserCreds] = useState({
//         correo:"",
//         contrasena:""
//     })

//     const [message, setMessage] = useState({
//         type:"invisible-msg",
//         test:"Exit"
//     })

//     // PASSWORD EYE
//     const passwordField = document.getElementById("password");

//     function toggleEye() {
//         if (passwordField.type === "password") {
//             passwordField.type = "text";
//         } else {
//             passwordField.type = "password";
//         }
//     }
//      // PASSWORD EYE END

//     function handleInput(event) {
//         setUserCreds((prevState) => {
//             return{...prevState, [event.target.name]:event.target.value}
//         })
//     }

//     // NEW JUL21
//     function handleSubmit(event) {
//         event.preventDefault();
//         console.log(userCreds);
    
//         localStorage.setItem('userLoginCreds', JSON.stringify(userCreds)); // Keep this if you need it
    
//         fetch(`${API}/login`, {
//             method: "POST",
//             body: JSON.stringify(userCreds),
//             headers: {
//                 "Content-Type": "application/json"
//             }
//         })
//         .then((response) => {
//             if (response.status === 404) {
//                 setMessage({ type: "error", text: "El usuario no se encontró" });
//             } else if (response.status === 403) {
//                 setMessage({ type: "error", text: "Contraseña incorrecta" });
//             }
    
//             setTimeout(() => {
//                 setMessage({ type: "invisible-msg", text: "Exit" });
//             }, 5000);
    
//             return response.json();
//         })
//         .then((data) => {
//             if (data.token !== undefined) {
//                 // ✅ Store token and user email
//                 localStorage.setItem("gis-user", JSON.stringify(data));
//                 localStorage.setItem("userEmail", userCreds.correo); // ✅ This is what you're missing
    
//                 loggedData.setLoggedUser(data);
    
//                 navigate("/userHome");
//             }
//         })
//         .catch((err) => {
//             console.log(err);
//         });
//     }
//     // END JUL21


    
//     function goToUser() {
//         console.log("user clicked Clicked")
//     }

//     return (
//         <body className="app-shell body-BG-Gradient">
//             <form onSubmit={handleSubmit}>

//                 <div className="app-header loginLogo-ParentDiv">
//                     <img className="signup-GISLogo" src={Logo} alt="Home Icon" width="230" height="70"/>
//                     {/* <img className="og-signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/> */}
//                     <label className="welcome-Label">Where passion<br></br>meets nature</label>

//                 </div>

//                 <div>
//                     <input className="returningUser-Input" required type="email" onChange={handleInput} placeholder="Correo electrónico" name="correo" value={userCreds.correo}></input>
//                 </div>

//                 <div>
//                     <div>
//                         <input className="returningUser-Input" minLength={5} type="password" id="password" required onChange={handleInput} placeholder="Contraseña" name="contrasena" value={userCreds.contrasena}></input>
//                         <FontAwesomeIcon className="icon" onClick={toggleEye} icon={faEye}/>
//                     </div>
//                 </div>

//                 <p className="forgotPassword-Subnote">¿Olvidaste tu contraseña?  <Link to="/restorePassword" className="login-SubLink">Da click aquí</Link></p>

//                 <button className="returningUser-GeneralLoginButton" type="submit" onClick={goToUser}>Ingresar</button>

//                 <p className="login-Subnote">¿Aún no te registras?  <Link to="/newSignup" className="login-SubLink">Crea una cuenta</Link></p>

//                 <label className="login-Slogan">Bienvenido<br></br> a casa</label>
//                 {/* <img className="og-signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/> */}

//                 <div className="popUp-Message">
//                     <p className={message.type}>{message.text}</p>
//                 </div>
//                 <img className="og-signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/>


//             </form>
//         </body>
//     )
// }