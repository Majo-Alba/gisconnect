import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { faEye } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";

import { API } from "/src/lib/api";


export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

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

  const handleSubmit = (e) => {
    e.preventDefault();

    fetch(`${API}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    })
      .then((res) => res.json())
      .then((data) => {
        setMessage(data.message);
        if (data.success) {
          setTimeout(() => navigate("/"), 3000);
        }
      })
      .catch((err) => {
        console.error(err);
        setMessage("Error al restablecer la contraseña.");
      });
  };

    return (
        <body className="body-BG-Gradient">
        {/* <div className="body-BG-Gradient"> */}
            <form onSubmit={handleSubmit} className="form-card">
                {/* LOGOS DIV */}
                <div className="loginLogo-ParentDiv">
                    <img className="signup-GISLogo" src={Logo} alt="Home Icon" width="230" height="70" />
                    <img className="signup-VeggieBasket" src={Basket} alt="Veggie Basket" width="400" height="250" />
                    <label className="welcome-Label">Establece una<br></br>nueva contraseña</label>
                </div>
                {/* LOGOS END*/}

                <p className="restorePass-Subnote">Ingresa una nueva contraseña <br></br>para tu cuenta de GISConnect</p>

                <div>
                    <div className="newUserPassword-Div">
                        <input className="resetPass-Input" minLength={5} type="password" id="password" placeholder="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required/>
                        <FontAwesomeIcon className="resetPass-EyeIcon" onClick={toggleEye} icon={faEye}/>
                    </div>
                </div>  

                <button className="resetPass-Btn" type="submit">Restablecer</button>
                {message && <p>{message}</p>}

                <label className="restorePass-Slogan">Bienvenido<br></br> a casa</label>

            </form>

            {/* FOOTER MENU */}
            <div className="footerMenuDiv">
            </div> 
            {/* FOOTER MENU */}
        </body>
    );
}