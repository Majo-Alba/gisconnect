const mongoose = require("mongoose");

const BillingAddressSchema = new mongoose.Schema({
  // apodo: { type: String, required: true }, // Nickname
  razonSocial: { type: String, required: true },
  rfcEmpresa: { type: String, required: true },
//   correoFiscal: { type: String, required: true },
  correoFiscal: { type: String },
  calleFiscal: { type: String, required: true },
  exteriorFiscal: { type: String, required: true },
  interiorFiscal: { type: String },
  coloniaFiscal: { type: String, required: true },
  ciudadFiscal: { type: String, required: true },
  estadoFiscal: { type: String, required: true },
  cpFiscal: { type: String, required: true },
  usoCFDI: { type: String, required: true },
  regimenFiscal: { type: String, required: true },

  // To associate address with a user
  userEmail: { type: String, required: true },
  // email: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model("BillingAddress", BillingAddressSchema);