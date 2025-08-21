import React from "react";
import { faXmark, faPhone, faEnvelope } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"


function Modal({onClose}) {
    return(
        // <div className="modalBGBlur-Div">
            <div className="modalDiv">
                <button className="closeModal-Btn" onClick={onClose}><FontAwesomeIcon icon={faXmark}/></button>
                <div>
                    <div className="modalHeader-Div">
                        <label className="questions-Title">¿Más preguntas?</label>
                        <label className="weGotYou-Title">Descuida, estamos aquí para ayudarte </label>
                    </div>
                    <div>
                        <div className="modalIconLabel-Div">
                            <FontAwesomeIcon icon={faPhone} className="modal-Icon"/>
                            <label className="modal-Label">332 016 8274</label>
                        </div>
                        <div className="modalIconLabel-Div">
                            <FontAwesomeIcon icon={faEnvelope} className="modal-Icon"/>
                            <label className="modal-Label">ventas@greenimportsol.com</label>
                        </div>
                        <div className="modalIconLabel-Div">
                            <FontAwesomeIcon icon={faEnvelope} className="modal-Icon"/>
                            <label className="modal-Label">info@greenimportsol.com</label>
                        </div>
                    </div>
                </div>
            </div>  
        // </div>          
    )
}

export default Modal