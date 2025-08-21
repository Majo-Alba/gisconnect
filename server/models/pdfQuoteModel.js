// models/PdfQuote.js
const mongoose = require('mongoose');

const PdfQuoteSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    pdfBuffer: { type: Buffer, required: true },
    uploadedAt: { type: Date, default: Date.now },
    metadata: { type: Object, default: {}},
  },
  { timestamps: true }
);

const pdfQuoteModel = mongoose.model('PdfQuote', PdfQuoteSchema);

module.exports = pdfQuoteModel
