// server/models/order.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * External file stored in S3 (preferred going forward)
 */
const fileExternalSchema = new Schema(
  {
    key: String,        // S3 object key (e.g. orders/<orderId>/payment/...)
    bucket: String,     // S3 bucket name
    filename: String,
    mimetype: String,   // keep naming consistent
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * Legacy embedded file (Buffer in Mongo)
 * Kept for backward-compat reads; new uploads should use S3 external metadata.
 */
const fileDocSchema = new Schema(
  {
    filename: String,
    mimetype: String,   // keep consistent with external files
    data: Buffer,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    userEmail: String,

    items: [
      {
        product: String,
        amount: Number,
        price: Number,
        // (optional) add currency if you store it per item:
        // currency: { type: String, enum: ["USD", "MXN"], default: "USD" }
      },
    ],

    // aug18 — totals snapshot (keep as-is if already used in app)
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
      },
    ],

    totalCost: Number,
    discountTotal: Number,
    finalTotal: Number,
    requestBill: Boolean,

    // Store as Mixed (explicit and flexible)
    shippingInfo: { type: Schema.Types.Mixed },
    billingInfo: { type: Schema.Types.Mixed },

    orderDate: Date,
    orderStatus: {
      type: String,
      default: "Pedido Realizado",
    },

    // AUG15
    paymentOption: String,
    creditTermDays: String,
    creditDueDate: String,

    // AUG15
    paymentMethod: String,
    paymentAccount: String,

    // Payment evidence (legacy, buffer)
    evidenceFile: fileDocSchema,

    // Quote PDF (legacy, buffer) — make field name consistent
    quotePdf: {
      filename: String,
      mimetype: String, // was contentType; unified to mimetype
      data: Buffer,
    },

    // Packing evidence (legacy, buffer array)
    packingEvidence: [fileDocSchema],

    // Delivery evidence (legacy, buffer)
    deliveryEvidence: fileDocSchema,

    // NEW: S3-backed metadata (preferred)
    evidenceFileExt: fileExternalSchema,        // payment evidence (single)
    deliveryEvidenceExt: fileExternalSchema,    // delivery evidence (single)
    packingEvidenceExt: [fileExternalSchema],   // packing evidence (array)

    // Legacy extras (optional; keep if used)
    packerName: String,
    packEvidenceImage: { type: String }, // legacy path-based approach
    insuredAmount: {
      type: Number,
      default: 0
    },
    deliveryDate: {
      type: Date,
      default: null
    },
    trackingNumber: {
      type: String,
      default: ""
    },
    evidenceURL: { type: String },       // legacy URL approach
  },
  { timestamps: true }
);

/* ---------- Indexes to speed up admin filters ---------- */
orderSchema.index({ orderDate: -1 });
orderSchema.index({ userEmail: 1, orderDate: -1 });
orderSchema.index({ orderStatus: 1, orderDate: -1 });

/* ---------- Virtuals ---------- */
// Short UI-friendly ID (last 5 chars of ObjectId)
orderSchema.virtual("shortId").get(function () {
  return this._id?.toString().slice(-5);
});

/* ---------- Safe JSON output ---------- */
// Avoid sending raw Buffers in API responses
orderSchema.set("toJSON", {
  virtuals: true, // include shortId
  transform: (_doc, ret) => {
    // Drop big buffer payloads if present
    if (ret.evidenceFile && ret.evidenceFile.data) delete ret.evidenceFile.data;
    if (ret.quotePdf && ret.quotePdf.data) delete ret.quotePdf.data;

    if (Array.isArray(ret.packingEvidence)) {
      ret.packingEvidence = ret.packingEvidence.map((f) => {
        if (!f) return f;
        const { data, ...rest } = f;
        return rest;
      });
    }
    return ret;
  },
});

/* ---------- Model export ---------- */
const NewOrderModel = mongoose.model("new_order", orderSchema);
module.exports = NewOrderModel;



// // Ok, im working on Step 1 (Wire S3 evidence storage), substep 3 (Extend Order schema (non-breaking))... can you check that my order schema looks fine please

// const mongoose = require("mongoose");
// const { Schema } = mongoose;

// // below other imports/schemas:
// const fileExternalSchema = new Schema({
//   key: String,        // S3 object key
//   bucket: String,     // S3 bucket
//   filename: String,
//   mimetype: String,
//   size: Number,
//   uploadedAt: { type: Date, default: Date.now },
// }, { _id: false });

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

// orderSchema.add({
//   evidenceFileExt: fileExternalSchema,       // payment evidence (single)
//   deliveryEvidenceExt: fileExternalSchema,   // delivery evidence (single)
//   packingEvidenceExt: [fileExternalSchema],  // packing evidence (array)
// });

// const newOrderModel = mongoose.model("new_order", orderSchema);
// module.exports = newOrderModel;






// off aug21
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

