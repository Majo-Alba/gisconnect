const mongoose = require("mongoose");

// hey chatgpt, for the dropdown menus in the Order Now screen, I would like to populate the "options" with information from my mongo database. The first dropdown corresponds to selecting an alternate shipping address, while the second one corresponds to selecting an alternate billing address. From mongodb and using usercreds (email), I'd like only to show addresses that belong to the logged-in user. Here is my schema for inputting additional Shipping Addresses, in case it comes in handy.
const ShippingAddressSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  // email: { type: String, required: true },
  apodo: String,
  calleEnvio: String,
  exteriorEnvio: String,
  interiorEnvio: String,
  coloniaEnvio: String,
  ciudadEnvio: String,
  estadoEnvio: String,
  cpEnvio: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ShippingAddress", ShippingAddressSchema);