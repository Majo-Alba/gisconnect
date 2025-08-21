// models/Hold.js
const mongoose = require("mongoose");

const holdLineSchema = new mongoose.Schema({
  product: { type: String, required: true },   // matches NOMBRE_PRODUCTO
  peso: { type: String, required: true },      // matches PESO_PRODUCTO (string ok)
  unidad: { type: String, required: true },    // matches UNIDAD_MEDICION
  quantity: { type: Number, required: true },
});

const holdSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "new_order", required: true },
    lines: { type: [holdLineSchema], required: true },
    // mark confirmed when payment verified; while false it counts as a "temporary hold"
    confirmed: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true }, // TTL target
  },
  { timestamps: true }
);

// TTL: document will be auto-deleted after expiresAt is passed
holdSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("hold", holdSchema);
