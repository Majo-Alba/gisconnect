const mongoose = require('mongoose')

//USER SCHEMA SETUP
const newUserSchema = mongoose.Schema({
    nombre: {
        type: String,
        // required:[true, "Campo obligatorio"],
    },
    apellido: {
        type: String,
        // required:[true, "Campo obligatorio"],  
    },
    empresa: {
        type: String,
        // required: true
    },
    correo: {
        type: String,
        // required: true
    },
    contrasena: {
        type: String, 
        // required: true
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
}, {timestamps: true})

const newUserModel = mongoose.model("newUsers", newUserSchema)

module.exports = newUserModel