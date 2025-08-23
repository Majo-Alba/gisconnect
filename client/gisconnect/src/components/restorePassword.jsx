import { useState } from "react";

import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";

export default function RestorePassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    fetch(`${API}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
      .then((res) => res.json())
      .then((data) => setMessage(data.message || "Revisa tu correo."))
      .catch((err) => {
        console.error("Forgot password error:", err);
        setMessage("Error al procesar la solicitud.");
      });
  };

    return (
        <body className="body-BG-Gradient">
            <form onSubmit={handleSubmit} className="form-card">
                {/* LOGOS DIV */}
                <div className="loginLogo-ParentDiv">
                    <img className="signup-GISLogo" src={Logo} alt="Home Icon" width="230" height="70"/>
                    <img className="signup-VeggieBasket" src={Basket} alt="Home Icon" width="400" height="250"/>
                    <label className="welcome-Label">Restablecer<br></br>Contraseña</label>
                </div>
                {/* LOGOS END*/}

                <p className="restorePass-Subnote">Ingresa el correo electrónico con el que <br></br>te registraste en la plataforma</p>

                <input className="returningUser-Input" type="email" placeholder="Correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)} required/>
                <button className="restorePass-Btn" type="submit">Enviar enlace <br></br> a correo</button>
                <div className="restorePass-popUpMessage">
                    {message && <p className={message.type}>{message}</p>}
                </div>
                <label className="restorePass-Slogan">Bienvenido<br></br> a casa</label>

            </form>

            {/* FOOTER MENU */}
            <div className="footerMenuDiv">
            </div> 
            {/* FOOTER MENU */}
        </body>
    );
}