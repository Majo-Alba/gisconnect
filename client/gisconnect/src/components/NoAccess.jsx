import React from "react";
import Logo from "/src/assets/images/GIS_Logo.png";
import Basket from "/src/assets/images/BG-veggieBasket.png";

export default function NoAccess() {
  return (
    <body className="app-shell body-BG-Gradient">
      <div className="loginLogo-ParentDiv" style={{ textAlign: "center", paddingTop: "50px" }}>
        <img
          className="secondaryPages-GISLogo"
          src={Logo}
          alt="Logo GIS"
          width="200"
          height="60"
        />
        <h2 style={{ marginTop: "40px", color: "#075f2b" }}>
          🚫 Su usuario no tiene acceso a esta área
        </h2>
        <p style={{ marginTop: "20px", fontSize: "16px", color: "#333" }}>
          Por favor contacte al administrador si cree que esto es un error.
        </p>
        <img
          className="og-signup-VeggieBasket"
          src={Basket}
          alt="Decoración"
          width="350"
          height="200"
          style={{ marginTop: "50px" }}
        />
      </div>
    </body>
  );
}
