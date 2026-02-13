// using this schema, when uploaded to mongo, even though I've selected a carrier from the dropdown ans checked shippment insurance, what gets uploaded to mongo are the defaulted values
const mongoose = require('mongoose')

// sep06
const ShippingPreferencesSchema = new mongoose.Schema({
    preferredCarrier: {
      type: String,
      trim: true,
      default: '',            // e.g. "Estafeta", "DHL", "FedEx", etc.
    },
    insureShipment: {
      type: Boolean,
      default: false,         // whether user wants the shipment insured
    },
  }, { _id: false });
// sep06

//USER SCHEMA SETUP
const newUserSchema = mongoose.Schema({
    nombre: {
        type: String,
        trim: true
    },
    apellido: {
        type: String,
        trim: true
    },
    empresa: {
        type: String,
        trim: true
    },
    correo: {
        type: String,
        trim: true,
        lowercase: true,
        index: true
    },
    contrasena: {
        type: String, 
        default: null,
    },
    // sep06
    shippingPreferences: {
        type: ShippingPreferencesSchema,
        default: {}
        // default: () => ({}),
    },
    // preferredCarrier: {
    //     type: Boolean,
    //     trim: true,
    //     default: '',
    // },
    // insureShipment: {
    //     type: Boolean,
    //     default: false,
    // },

    // sep06
    resetPasswordToken: String,
    resetPasswordExpires: Date,
}, {timestamps: true})

newUserSchema.index(
    { correo: 1 },
    {
      unique: true,
      partialFilterExpression: { correo: { $type: 'string' } }, // only enforce when correo is a string
      name: 'uniq_correo_if_string'
    }
  );

const newUserModel = mongoose.model("newUsers", newUserSchema)

module.exports = newUserModel