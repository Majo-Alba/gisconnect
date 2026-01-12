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

/* 🔹 NEW: currency exchange snapshot (DOF at order time) */
const currencyExchangeSchema = new Schema(
  {
    pair: { type: String, default: "USD/MXN" }, // e.g., "USD/MXN"
    source: { type: String, default: "DOF" },   // provider name
    rate: { type: Number, default: null },      // e.g., 18.27
    asOf: { type: String, default: null },      // DOF date string you captured
  },
  { _id: false }
);

/* 🔹 NEW (packing lock) */
const packingSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["waiting", "in_progress", "ready"],
      default: "waiting",
    },
    claimedBy: { type: String, default: "" },   // "Oswaldo" | "Santiago" | "Mauro"
    claimedAt: { type: Date },                  // when the claim started
    leaseMs: { type: Number, default: 30 * 60 * 1000 }, // 30 minutes
  },
  { _id: false }
);

/* 🔹 NEW (delivery lock) */
const deliveryWorkSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["waiting", "in_progress", "ready"],
      default: "waiting",
    },
    claimedBy: { type: String, default: "" },   // who is delivering
    claimedAt: { type: Date },
    leaseMs: { type: Number, default: 30 * 60 * 1000 }, // optional, similar to packing
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
        presentation: String,
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

    /* 🔹 NEW: snapshot of payment details at order time */
    paymentCurrency: { type: String, enum: ["USD", "MXN"], default: "USD" },
    // If single-currency payment: Number
    // If mixed: { usd: Number, mxn: Number }
    amountPayed: { type: Schema.Types.Mixed, default: null },
    currencyExchange: { type: currencyExchangeSchema, default: () => ({}) },

    totalCost: Number,
    discountTotal: Number,
    finalTotal: Number,
    requestBill: Boolean,

    // Store as Mixed (explicit and flexible)
    shippingInfo: { type: Schema.Types.Mixed },
    // ⬇️ NEW: structured pickup details when user picks "Recoger en Matriz"
    pickupDetails: {
      date: { type: String, default: null }, // "YYYY-MM-DD"
      time: { type: String, default: null }, // "HH:mm"
    },
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

    // Quote PDF (legacy, buffer)
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
    insuredAmount: { type: Number, default: 0 },
    deliveryDate: { type: Date, default: null },
    trackingNumber: { type: String, default: "" },
    evidenceURL: { type: String },       // legacy URL approach

    /* 🔹 NEW (delivery lock) */
    deliveryWork: { type: deliveryWorkSchema, default: () => ({}) },

    /* 🔹 NEW (packing lock): server-enforced claim */
    packing: { type: packingSchema, default: () => ({}) },
  },
  { timestamps: true }
);

/* ---------- Indexes to speed up admin filters ---------- */
orderSchema.index({ orderDate: -1 });
orderSchema.index({ userEmail: 1, orderDate: -1 });
orderSchema.index({ orderStatus: 1, orderDate: -1 });

/* 🔹 NEW (packing lock): helpful compound index for pending list */
orderSchema.index({ "packing.status": 1, "packing.claimedAt": -1 });

/* ---------- Virtuals ---------- */
// Short UI-friendly ID (last 5 chars of ObjectId)
orderSchema.virtual("shortId").get(function () {
  return this._id?.toString().slice(-5);
});

/* 🔹 NEW virtual: is packing claim expired? */
orderSchema.virtual("packingExpired").get(function () {
  const claimedAt = this?.packing?.claimedAt ? new Date(this.packing.claimedAt).getTime() : 0;
  const lease = this?.packing?.leaseMs ?? 30 * 60 * 1000;
  if (!claimedAt) return true;
  return Date.now() - claimedAt > lease;
});

/* ---------- Safe JSON output ---------- */
// Avoid sending raw Buffers in API responses
orderSchema.set("toJSON", {
  virtuals: true, // include shortId & packingExpired
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

// const mongoose = require("mongoose");
// const { Schema } = mongoose;

// /**
//  * External file stored in S3 (preferred going forward)
//  */
// const fileExternalSchema = new Schema(
//   {
//     key: String,        // S3 object key (e.g. orders/<orderId>/payment/...)
//     bucket: String,     // S3 bucket name
//     filename: String,
//     mimetype: String,   // keep naming consistent
//     size: Number,
//     uploadedAt: { type: Date, default: Date.now },
//   },
//   { _id: false }
// );

// /**
//  * Legacy embedded file (Buffer in Mongo)
//  * Kept for backward-compat reads; new uploads should use S3 external metadata.
//  */
// const fileDocSchema = new Schema(
//   {
//     filename: String,
//     mimetype: String,   // keep consistent with external files
//     data: Buffer,
//     uploadedAt: { type: Date, default: Date.now },
//   },
//   { _id: false }
// );

// /* 🔹 NEW (packing lock) */
// const packingSchema = new Schema(
//   {
//     status: {
//       type: String,
//       enum: ["waiting", "in_progress", "ready"],
//       default: "waiting",
//     },
//     claimedBy: { type: String, default: "" },   // "Oswaldo" | "Santiago" | "Mauro"
//     claimedAt: { type: Date },                  // when the claim started
//     leaseMs: { type: Number, default: 30 * 60 * 1000 }, // 30 minutes
//   },
//   { _id: false }
// );

// /* 🔹 NEW (delivery lock) */
// const deliveryWorkSchema = new Schema(
//   {
//     status: {
//       type: String,
//       enum: ["waiting", "in_progress", "ready"],
//       default: "waiting",
//     },
//     claimedBy: { type: String, default: "" },   // who is delivering
//     claimedAt: { type: Date },
//     leaseMs: { type: Number, default: 30 * 60 * 1000 }, // optional, similar to packing
//   },
//   { _id: false }
// );

// const orderSchema = new Schema(
//   {
//     userEmail: String,

//     items: [
//       {
//         product: String,
//         amount: Number,
//         price: Number,
//         presentation: String,
//         // currency: { type: String, enum: ["USD", "MXN"], default: "USD" }
//       },
//     ],

//     // aug18 — totals snapshot (keep as-is if already used in app)
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
//       },
//     ],

//     totalCost: Number,
//     discountTotal: Number,
//     finalTotal: Number,
//     requestBill: Boolean,

//     // Store as Mixed (explicit and flexible)
//     shippingInfo: { type: Schema.Types.Mixed },
//     // ⬇️ NEW: structured pickup details when user picks "Recoger en Matriz"
//     pickupDetails: {
//       date: { type: String, default: null }, // "YYYY-MM-DD"
//       time: { type: String, default: null }, // "HH:mm"
//     },
//     billingInfo: { type: Schema.Types.Mixed },

//     orderDate: Date,
//     orderStatus: {
//       type: String,
//       default: "Pedido Realizado",
//     },

//     // AUG15
//     paymentOption: String,
//     creditTermDays: String,
//     creditDueDate: String,

//     // AUG15
//     paymentMethod: String,
//     paymentAccount: String,

//     // Payment evidence (legacy, buffer)
//     evidenceFile: fileDocSchema,

//     // Quote PDF (legacy, buffer)
//     quotePdf: {
//       filename: String,
//       mimetype: String, // was contentType; unified to mimetype
//       data: Buffer,
//     },

//     // Packing evidence (legacy, buffer array)
//     packingEvidence: [fileDocSchema],

//     // Delivery evidence (legacy, buffer)
//     deliveryEvidence: fileDocSchema,

//     // NEW: S3-backed metadata (preferred)
//     evidenceFileExt: fileExternalSchema,        // payment evidence (single)
//     deliveryEvidenceExt: fileExternalSchema,    // delivery evidence (single)
//     packingEvidenceExt: [fileExternalSchema],   // packing evidence (array)

//     // Legacy extras (optional; keep if used)
//     packerName: String,
//     packEvidenceImage: { type: String }, // legacy path-based approach
//     insuredAmount: { type: Number, default: 0 },
//     deliveryDate: { type: Date, default: null },
//     trackingNumber: { type: String, default: "" },
//     evidenceURL: { type: String },       // legacy URL approach

//     /* 🔹 NEW (delivery lock) */
//     deliveryWork: { type: deliveryWorkSchema, default: () => ({}) },

//     /* 🔹 NEW (packing lock): server-enforced claim */
//     packing: { type: packingSchema, default: () => ({}) },
//   },
//   { timestamps: true }
// );

// /* ---------- Indexes to speed up admin filters ---------- */
// orderSchema.index({ orderDate: -1 });
// orderSchema.index({ userEmail: 1, orderDate: -1 });
// orderSchema.index({ orderStatus: 1, orderDate: -1 });

// /* 🔹 NEW (packing lock): helpful compound index for pending list */
// orderSchema.index({ "packing.status": 1, "packing.claimedAt": -1 });

// /* ---------- Virtuals ---------- */
// // Short UI-friendly ID (last 5 chars of ObjectId)
// orderSchema.virtual("shortId").get(function () {
//   return this._id?.toString().slice(-5);
// });

// /* 🔹 NEW virtual: is packing claim expired? */
// orderSchema.virtual("packingExpired").get(function () {
//   const claimedAt = this?.packing?.claimedAt ? new Date(this.packing.claimedAt).getTime() : 0;
//   const lease = this?.packing?.leaseMs ?? 30 * 60 * 1000;
//   if (!claimedAt) return true;
//   return Date.now() - claimedAt > lease;
// });

// /* ---------- Safe JSON output ---------- */
// // Avoid sending raw Buffers in API responses
// orderSchema.set("toJSON", {
//   virtuals: true, // include shortId & packingExpired
//   transform: (_doc, ret) => {
//     // Drop big buffer payloads if present
//     if (ret.evidenceFile && ret.evidenceFile.data) delete ret.evidenceFile.data;
//     if (ret.quotePdf && ret.quotePdf.data) delete ret.quotePdf.data;

//     if (Array.isArray(ret.packingEvidence)) {
//       ret.packingEvidence = ret.packingEvidence.map((f) => {
//         if (!f) return f;
//         const { data, ...rest } = f;
//         return rest;
//       });
//     }
//     return ret;
//   },
// });

// /* ---------- Model export ---------- */
// const NewOrderModel = mongoose.model("new_order", orderSchema);
// module.exports = NewOrderModel;

