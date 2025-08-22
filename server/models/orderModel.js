const mongoose = require("mongoose");
const { Schema } = mongoose;

// below other imports/schemas:
const fileExternalSchema = new Schema({
  key: String,        // S3 object key
  bucket: String,     // S3 bucket
  filename: String,
  mimetype: String,
  size: Number,
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const fileDocSchema = new Schema({
  filename: String,
  mimetype: String,
  data: Buffer,
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const orderSchema = new Schema({
  userEmail: String,

  items: [
    {
      product: String,
      amount: Number,
      price: Number
    }
  ],

  // aug18
  totals: [
    {
      totalUSDNative: Number,
      totalMXNNative: Number,
      totalAllUSD: Number,
      totalAllMXN: Number,
      finalAllUSD: Number,
      finalAllMXN: Number,
      dofRate: String,
      dofDate: String,
    }
  ],

  totalCost: Number,
  discountTotal: Number,
  finalTotal: Number,
  requestBill: Boolean,

  // Now you store them as objects (already handled in your app)
  shippingInfo: Object,
  billingInfo: Object,

  orderDate: Date,
  orderStatus: {
    type: String,
    default: "Pedido Realizado"
  },

  // AUG15
  paymentOption: String,
  creditTermDays: String,
  creditDueDate: String,

  // AUG15
  paymentMethod: String,
  paymentAccount: String,

  // Payment evidence (single)
  evidenceFile: fileDocSchema,

  // Quote PDF
  quotePdf: {
    filename: String,
    contentType: String,
    data: Buffer,
  },

  // Packing evidence (multiple)
  packingEvidence: [fileDocSchema],

  // Delivery evidence (single)  ← NEW
  deliveryEvidence: fileDocSchema,

  // Legacy (optional): keep if you still use them elsewhere, otherwise remove later
  packerName: String,
  packEvidenceImage: { type: String }, // legacy path-based approach
  insuredAmount: Number,
  deliveryDate: Date,
  trackingNumber: String,
  evidenceURL: { type: String },       // legacy URL approach

}, { timestamps: true });

orderSchema.add({
  evidenceFileExt: fileExternalSchema,       // payment evidence (single)
  deliveryEvidenceExt: fileExternalSchema,   // delivery evidence (single)
  packingEvidenceExt: [fileExternalSchema],  // packing evidence (array)
});

const newOrderModel = mongoose.model("new_order", orderSchema);
module.exports = newOrderModel;

// const mongoose = require("mongoose");
// const { Schema } = mongoose;

// const fileDocSchema = new Schema({
//   filename: String,
//   mimetype: String,
//   data: Buffer,
//   uploadedAt: { type: Date, default: Date.now }
// }, { _id: false });

// const orderSchema = new Schema({
//   userEmail: String,

//   items: [
//     {
//       product: String,
//       amount: Number,
//       price: Number
//     }
//   ],

//   // aug18
//   totals: [
//     {
//       totalUSDNative: Number,
//       totalMXNNative: Number,
//       totalAllUSD: Number,
//       totalAllMXN: Number,
//       finalAllUSD: Number,
//       finalAllMXN: Number,
//       dofRate: String,
//       dofDate: String,
//     }
//   ],

//   totalCost: Number,
//   discountTotal: Number,
//   finalTotal: Number,
//   requestBill: Boolean,

//   // Now you store them as objects (already handled in your app)
//   shippingInfo: Object,
//   billingInfo: Object,

//   orderDate: Date,
//   orderStatus: {
//     type: String,
//     default: "Pedido Realizado"
//   },

//   // AUG15
//   paymentOption: String,
//   creditTermDays: String,
//   creditDueDate: String,

//   // AUG15
//   paymentMethod: String,
//   paymentAccount: String,

//   // Payment evidence (single)
//   evidenceFile: fileDocSchema,

//   // Quote PDF
//   quotePdf: {
//     filename: String,
//     contentType: String,
//     data: Buffer,
//   },

//   // Packing evidence (multiple)
//   packingEvidence: [fileDocSchema],

//   // Delivery evidence (single)  ← NEW
//   deliveryEvidence: fileDocSchema,

//   // Legacy (optional): keep if you still use them elsewhere, otherwise remove later
//   packerName: String,
//   packEvidenceImage: { type: String }, // legacy path-based approach
//   insuredAmount: Number,
//   deliveryDate: Date,
//   trackingNumber: String,
//   evidenceURL: { type: String },       // legacy URL approach

// }, { timestamps: true });

// const newOrderModel = mongoose.model("new_order", orderSchema);
// module.exports = newOrderModel;




// // OG NEW ORDER SCHEMA SETUP
// const mongoose = require('mongoose')

// const orderSchema = mongoose.Schema({
//   userEmail:String,
//     items: [
//       {
//         product: String,
//         amount: Number,
//         price: Number
//       }
//     ],
//     // aug18
//     totals: [
//       {
//         totalUSDNative: Number,
//         totalMXNNative: Number,
//         totalAllUSD: Number,
//         totalAllMXN: Number,
//         finalAllUSD: Number,
//         finalAllMXN: Number,
//         dofRate: String,
//         dofDate: String,
//       }
//     ],
//     // aug18
//     totalCost: Number,
//     discountTotal: Number,
//     finalTotal: Number,
//     requestBill: Boolean,
//     shippingInfo: Object,
//     billingInfo: Object,
//     orderDate: Date,
//     orderStatus: {
//       type: String,
//       default: "Pedido Realizado"
//     },
//     // AUG15
//     paymentOption: String,
//     creditTermDays: String,
//     creditDueDate: String,
//     // AUG15
//     paymentMethod: String,
//     paymentAccount: String,
//     // AUG16
//     evidenceFile: {
//       filename: String,
//       mimetype: String,
//       data: Buffer,
//       uploadedAt: {
//         type: Date,
//         default: Date.now   // will auto-fill when saved
//       }
//     },
//     quotePdf: {
//       filename: String,
//       contentType: String,
//       data: Buffer,
//     },
//     packingEvidence: [
//       { 
//         filename: String, 
//         mimetype: String,
//         data: Buffer, 
//         uploadedAt: {
//           type: Date,
//           default: Date.now
//         } 
//     }],
//     // AUG14
//     packerName: String,
//     packEvidenceImage: { type: String },
//     insuredAmount: Number,
//     deliveryDate: Date,
//     trackingNumber: String,
//     evidenceURL: { type: String },
//   }, { timestamps: true });
  
// const newOrderModel = mongoose.model("new_order", orderSchema)

// module.exports = newOrderModel

