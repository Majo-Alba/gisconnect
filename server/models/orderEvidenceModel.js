const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  // other fields...
  paymentEvidence: {
    filename: String,
    mimetype: String,
    data: Buffer
  }
});

module.exports = mongoose.model("Order", OrderSchema);