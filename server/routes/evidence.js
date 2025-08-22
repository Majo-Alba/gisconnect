const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB per file
const mongoose = require("mongoose");
const Order = mongoose.model("new_order");
const { putFile, signedGetUrl, BUCKET } = require("../src/lib/s3");

// TODO: replace with your real auth/role middleware
const requireAuth = (req, res, next) => next();

function s3Key(orderId, kind, filename, idx) {
  const safe = (filename || "file").replace(/[^\w.\-]+/g, "_");
  return `orders/${orderId}/${kind}/${idx != null ? `${idx}-` : ""}${Date.now()}-${safe}`;
}

/* =================
   Upload endpoints
   ================= */

// Single: Payment
router.post("/:orderId/evidence/payment", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const { orderId } = req.params;
    const f = req.file;
    if (!f) return res.status(400).json({ error: "No file provided" });

    const key = s3Key(orderId, "payment", f.originalname);
    await putFile({ key, body: f.buffer, contentType: f.mimetype });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.evidenceFileExt = { key, bucket: BUCKET, filename: f.originalname, mimetype: f.mimetype, size: f.size };
    await order.save();

    res.json({ ok: true, key });
  } catch (e) {
    console.error("Upload payment evidence error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Single: Delivery
router.post("/:orderId/evidence/delivery", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const { orderId } = req.params;
    const f = req.file;
    if (!f) return res.status(400).json({ error: "No file provided" });

    const key = s3Key(orderId, "delivery", f.originalname);
    await putFile({ key, body: f.buffer, contentType: f.mimetype });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.deliveryEvidenceExt = { key, bucket: BUCKET, filename: f.originalname, mimetype: f.mimetype, size: f.size };
    await order.save();

    res.json({ ok: true, key });
  } catch (e) {
    console.error("Upload delivery evidence error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// Multiple: Packing (max 3)
router.post("/:orderId/evidence/packing", requireAuth, upload.array("files", 3), async (req, res) => {
  try {
    const { orderId } = req.params;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "No files provided" });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    order.packingEvidenceExt = order.packingEvidenceExt || [];
    const start = order.packingEvidenceExt.length;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const key = s3Key(orderId, "packing", f.originalname, start + i);
      await putFile({ key, body: f.buffer, contentType: f.mimetype });
      order.packingEvidenceExt.push({
        key, bucket: BUCKET, filename: f.originalname, mimetype: f.mimetype, size: f.size,
      });
    }
    await order.save();

    res.json({ ok: true, count: files.length });
  } catch (e) {
    console.error("Upload packing evidence error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

/* =================
   Download endpoints
   - Prefer S3 signed URLs if present
   - Fallback to legacy Buffer fields so old orders still work
   ================= */

// Payment (single)
router.get("/:orderId/evidence/payment", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.orderId).lean();
  if (!order) return res.status(404).send("Not found");

  // Prefer S3
  if (order.evidenceFileExt?.key) {
    const url = await signedGetUrl(order.evidenceFileExt.key);
    return res.redirect(url);
  }

  // Legacy buffer fallback
  if (order.evidenceFile?.data && order.evidenceFile?.mimetype) {
    res.setHeader("Content-Type", order.evidenceFile.mimetype);
    res.setHeader("Content-Disposition", `inline; filename="${order.evidenceFile.filename || "evidence"}"`);
    return res.send(Buffer.from(order.evidenceFile.data));
  }

  res.status(404).send("No evidence");
});

// Delivery (single)
router.get("/:orderId/evidence/delivery", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.orderId).lean();
  if (!order) return res.status(404).send("Not found");

  if (order.deliveryEvidenceExt?.key) {
    const url = await signedGetUrl(order.deliveryEvidenceExt.key);
    return res.redirect(url);
  }
  if (order.deliveryEvidence?.data && order.deliveryEvidence?.mimetype) {
    res.setHeader("Content-Type", order.deliveryEvidence.mimetype);
    res.setHeader("Content-Disposition", `inline; filename="${order.deliveryEvidence.filename || "delivery"}"`);
    return res.send(Buffer.from(order.deliveryEvidence.data));
  }

  res.status(404).send("No delivery evidence");
});

// Packing (by index)
router.get("/:orderId/evidence/packing/:index", requireAuth, async (req, res) => {
  const i = Number(req.params.index);
  if (!Number.isInteger(i) || i < 0) return res.status(400).send("Bad index");

  const order = await Order.findById(req.params.orderId).lean();
  if (!order) return res.status(404).send("Not found");

  // S3 array
  if (Array.isArray(order.packingEvidenceExt) && order.packingEvidenceExt[i]?.key) {
    const url = await signedGetUrl(order.packingEvidenceExt[i].key);
    return res.redirect(url);
  }

  // Legacy array of buffers
  if (Array.isArray(order.packingEvidence) && order.packingEvidence[i]?.data) {
    const f = order.packingEvidence[i];
    res.setHeader("Content-Type", f.mimetype || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${f.filename || `packing-${i+1}`}"`);
    return res.send(Buffer.from(f.data));
  }

  res.status(404).send("No packing evidence for that index");
});

module.exports = router;