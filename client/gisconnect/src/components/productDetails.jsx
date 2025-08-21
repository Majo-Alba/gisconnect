import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

export default function ProductDetails() {
  const { state } = useLocation();
  const product = state?.product;
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

  if (!product) return <p>No hay datos del producto.</p>;
  
  console.log(product)

// here
const [prodImgActive, setProdImgActive] = useState(false);

function prodImgBtnClicked() {
    setProdImgActive(true)
}

  return (
    <body className="body-BG-Gradient">

        {/* LOGOS DIV */}
        <div className="loginLogo-ParentDiv">
            <img className="secondaryPages-GISLogo" src="./src/assets/images/GIS_Logo.png" alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
        </div>
        {/* LOGOS END*/}

        <button className="returnCat-Btn" onClick={() => navigate(-1)}>← Regresar</button>

        <div className='productDets-Div' style={{ padding: 20 }}>
            <div className="images-Details" style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                {product.IMAGE_URL && product.IMAGE_PRODUCT ? (
                    <>
                    <img
                        src={product.IMAGE_URL}
                        alt={product.NOMBRE_PRODUCTO}
                        style={{ width: '50%', height: 150, objectFit: 'contain', borderRadius: 8, marginBottom: 10 }}
                    />
                    <img
                        src={product.IMAGE_PRODUCT}
                        alt={product.NOMBRE_PRODUCTO}
                        style={{ width: '50%', height: 150, objectFit: 'contain', borderRadius: 8, marginBottom: 10 }}
                    />
                    </>
                ) : (
                    <>
                    {(product.IMAGE_URL || product.IMAGE_PRODUCT) && (
                        <img
                        src={product.IMAGE_URL || product.IMAGE_PRODUCT}
                        alt={product.NOMBRE_PRODUCTO}
                        style={{ width: '100%', height: 150, objectFit: 'contain', borderRadius: 8, marginBottom: 10 }}
                        />
                    )}
                    </>
                )}
            </div>

            <h2 className="productName-Details">{product.NOMBRE_PRODUCTO}</h2>
            <h3 className="productDescription-Details">{product.DESCRIPCION}</h3>

            <p className="productCat-Details"> SKU: {product.SKU_PRODUCTO}</p>
            <p className="productCat-Details"> Categoría: {product.CATEGORIA}</p>
            <p className="productCat-Details"> Subcategoría: {product.SUBCATEGORIA}</p>

            <p className="productWeight-Details">{product.PESO_PRODUCTO} {product.UNIDAD_MEDICION}</p>
            <p className="productPresentation-Details">{product.PRESENTACION}</p>


            <div>
                <img className="secondaryPages-GISLogo" src="./src/assets/images/Icon_Plant.png" alt="Home Icon" width="30" height="30"/>
                <p className='productBenefits-Details'>{product.DESCRIPCION_CIENTIFICA}</p>
            </div>

            {/* AUG12: CURRENTLY IN STANDBY! */}
            {/* <div>
                <img className="secondaryPages-GISLogo" src="./src/assets/images/Icon_Molecule.png" alt="Home Icon" width="30" height="30"/>
                <p className='productBenefits-Details'>{product.DESCRIPCION_HUMANA}</p>
            </div> */}
            {/* AUG12: CURRENTLY IN STANDBY! */}

            
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
};
