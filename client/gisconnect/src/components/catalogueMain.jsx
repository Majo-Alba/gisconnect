import { useState, useEffect } from "react"
import { useNavigate } from 'react-router-dom';

import { Link } from "react-router-dom"
import axios from "axios"
import Papa from 'papaparse';


import { faHouse, faUser, faCartShopping } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

import Logo from "/src/assets/images/GIS_Logo.png";
import CatalogoIcono from "/src/assets/images/Icono_Catalogo.png"

export default function CatalogueMain() {

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

    // NEW JUL04
    const [productTypeFilter, setProductTypeFilter] = useState('Todos');
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    // END JUL04
    
    //  --> This data is for Product Stock information
    useEffect(() => {
        fetchCSVData();
    },[])

    const [csvData, setCsvData] = useState([]);

    const fetchCSVData = () => {
        const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ3DHshfkMqlCrOlbh8DT_KYbLopkDOt5l4pdBldFqBgzuxGj0LMkaLxPpqevV7s6sUjk1Ock7d-M8/pub?gid=21868348&single=true&output=csv';
      
        axios.get(csvUrl)
          .then((response) => {
            Papa.parse(response.data, {
              header: true,              // Use the first row as headers
              skipEmptyLines: true,     // Skip blank lines
              complete: (results) => {
                const parsedCsvData = results.data;
      
                setCsvData(parsedCsvData);
                setFilteredProducts(parsedCsvData);
      
                const uniqueCategories = ['Todos', ...new Set(parsedCsvData.map(p => p.CATEGORIA))];
                setCategories(uniqueCategories);
              },
            });
          })
          .catch((error) => {
            console.error('Error fetching CSV data:', error);
          });
      };

    console.log(csvData)   

    // JUL04
    const handleFilterChange = (selectedCategory) => {
        setProductTypeFilter(selectedCategory);
        if (selectedCategory === 'Todos') {
          setFilteredProducts(csvData);
        } else {
          const filtered = csvData.filter(p => p.CATEGORIA === selectedCategory);
          setFilteredProducts(filtered);
        }
      };
    
      const handleProductClick = (product) => {
        navigate('/product', { state: { product } });
      };
    // JUL04

    return (
        <body className="app-shell body-BG-Gradient">

            {/* LOGOS DIV */}
            <div className="app-header loginLogo-ParentDiv">
                <img className="secondaryPages-GISLogo" src={Logo} alt="Home Icon" width="180" height="55" onClick={goHomeLogo}/>
            </div>
            {/* LOGOS END*/}

            <div className="app-main">
            <div className="edit-titleIcon-Div">
                <label className="editAddress-headerLabel">Productos</label>
                <img src={CatalogoIcono} alt="Home Icon" width="35" height="35"/>
            </div>

            {/* JUL04 */}
            <select className="productCategory-Dropdown" value={productTypeFilter} onChange={(e) => handleFilterChange(e.target.value)}>
                {categories.map((cat, idx) => (
                    <option key={idx} value={cat}>{cat}</option>
                ))}

            </select>
     
            <div className="productList-Div">
                {filteredProducts.map((product, idx) => (
                <div
                    key={idx}
                    onClick={() => handleProductClick(product)}
                    className="productThumbtack-Catalogue"
                >
                    {product.IMAGE_URL && (
                        <img
                        src={product.IMAGE_URL}
                        alt={product.NOMBRE_PRODUCTO}
                        style={{ width: '100%', height: 150, objectFit: 'contain', borderRadius: 8, marginBottom: 10 }}
                        />
                    )}
                    <h3 className="productName-Catalogue">{product.NOMBRE_PRODUCTO}</h3>
                    <h3 className="productDescription-Catalogue">{product.DESCRIPCION}</h3>

                    <p className="productCat-Catalogue">{product.CATEGORIA}</p>
                    <p className="productPresentation-Catalogue">{product.PESO_PRODUCTO} {product.UNIDAD_MEDICION}</p>

                </div>
                ))}
            </div>
            </div>
      

            {/* FOOTER MENU */}
            <div className="app-footer footerMenuDiv">
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