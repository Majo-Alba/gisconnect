const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB
const mongoose = require("mongoose");
const Order = mongoose.model("new_order");
const { putFile, signedGetUrl, BUCKET } = require("../src/lib/s3");

// replace with your auth middleware later if needed
const requireAuth = (req, res, next) => next();

function s3Key(orderId, kind, filename, idx) {
  const safe = (filename || "file").replace(/[^\w.\-]+/g, "_");
  return `orders/${orderId}/${kind}/${idx != null ? `${idx}-` : ""}${Date.now()}-${safe}`;
}

/* ===== Uploads ===== */
router.post("/:orderId/evidence/payment", requireAuth, upload.single("file"), async (req, res) => {
  const f = req.file; if (!f) return res.status(400).json({ error: "No file" });
  const { orderId } = req.params;
  const key = s3Key(orderId, "payment", f.originalname);
  await putFile({ key, body: f.buffer, contentType: f.mimetype });

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  order.evidenceFileExt = { key, bucket: BUCKET, filename: f.originalname, mimetype: f.mimetype, size: f.size };
  await order.save();
  res.json({ ok: true, key });
});

// router.post("/:orderId/evidence/delivery", requireAuth, upload.single("file"), async (req, res) => {
//   const f = req.file; if (!f) return res.status(400).json({ error: "No file" });
//   const { orderId } = req.params;
//   const key = s3Key(orderId, "delivery", f.originalname);
//   await putFile({ key, body: f.buffer, contentType: f.mimetype });

//   const order = await Order.findById(orderId);
//   if (!order) return res.status(404).json({ error: "Order not found" });
//   order.deliveryEvidenceExt = { key, bucket: BUCKET, filename: f.originalname, mimetype: f.mimetype, size: f.size };
//   await order.save();
//   res.json({ ok: true, key });
// });
router.post(
    "/:orderId/evidence/delivery",
    requireAuth,
    upload.fields([
      { name: "deliveryImage", maxCount: 1 },
      { name: "file", maxCount: 1 }, // accept 'file' too for compatibility
    ]),
    async (req, res) => {
      try {
        const { orderId } = req.params;
        if (!mongoose.isValidObjectId(orderId)) {
          return res.status(400).json({ error: "Invalid orderId" });
        }
  
        // Multer with .fields: files live under each field name
        const a = (req.files && req.files.deliveryImage) || [];
        const b = (req.files && req.files.file) || [];
        const file = [...a, ...b][0]; // single file
        if (!file) return res.status(400).json({ error: "No file provided" });
  
        // Basic validation
        const MAX_BYTES = 25 * 1024 * 1024; // 25MB
        if (!file.mimetype.startsWith("image/")) {
          return res.status(400).json({ error: `Unsupported type: ${file.mimetype}` });
        }
        if (file.size > MAX_BYTES) {
          return res.status(400).json({ error: `File too large: ${file.originalname}` });
        }
  
        const order = await Order.findById(orderId).exec();
        if (!order) return res.status(404).json({ error: "Order not found" });
  
        // Build S3 key, e.g. orders/<orderId>/delivery/<filename>
        const key = s3Key(orderId, "delivery", file.originalname);
  
        // Upload to S3
        await putFile({ key, body: file.buffer, contentType: file.mimetype });
  
        // Persist metadata
        order.deliveryEvidenceExt = {
          key,
          bucket: BUCKET,
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
        };
  
        await order.save();
  
        return res.json({
          ok: true,
          evidence: order.deliveryEvidenceExt,
        });
      } catch (err) {
        console.error("delivery evidence upload error:", err);
        if (err && err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({ error: "Unexpected field" });
        }
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );

// router.post("/:orderId/evidence/packing", requireAuth, upload.array("files", 3), async (req, res) => {
//   const files = req.files || []; if (!files.length) return res.status(400).json({ error: "No files" });
//   const { orderId } = req.params;

//   const order = await Order.findById(orderId);
//   if (!order) return res.status(404).json({ error: "Order not found" });

//   order.packingEvidenceExt = order.packingEvidenceExt || [];
//   const start = order.packingEvidenceExt.length;

//   for (let i = 0; i < files.length; i++) {
//     const f = files[i];
//     const key = s3Key(orderId, "packing", f.originalname, start + i);
//     await putFile({ key, body: f.buffer, contentType: f.mimetype });
//     order.packingEvidenceExt.push({ key, bucket: BUCKET, filename: f.originalname, mimetype: f.mimetype, size: f.size });
//   }
//   await order.save();
//   res.json({ ok: true, count: files.length });
// });
router.post(
    "/:orderId/evidence/packing",
    requireAuth,
    upload.fields([
      { name: "packingImages", maxCount: 3 },
      { name: "files", maxCount: 3 },
    ]),
    async (req, res) => {
      try {
        const { orderId } = req.params;
  
        if (!mongoose.isValidObjectId(orderId)) {
          return res.status(400).json({ error: "Invalid orderId" });
        }
  
        // Multer with .fields puts files into an object keyed by field name
        const pickedA = (req.files && req.files.packingImages) || [];
        const pickedB = (req.files && req.files.files) || [];
  
        // merge & cap to 3
        const files = [...pickedA, ...pickedB].slice(0, 3);
        if (files.length === 0) {
          return res.status(400).json({ error: "No files" });
        }
  
        const order = await Order.findById(orderId).exec();
        if (!order) return res.status(404).json({ error: "Order not found" });
  
        // Optional: save packer name if provided
        if (req.body && typeof req.body.packerName === "string" && req.body.packerName.trim()) {
          order.packerName = req.body.packerName.trim();
        }
  
        // Ensure array exists
        order.packingEvidenceExt = order.packingEvidenceExt || [];
        const start = order.packingEvidenceExt.length;
  
        // Simple validation — allow images (and optionally PDFs). Adjust as you like.
        const MAX_BYTES = 25 * 1024 * 1024; // 25MB
        const allowed = (m) => m.startsWith("image/"); // or: (m)=> m.startsWith("image/") || m === "application/pdf"
  
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
  
          if (!allowed(f.mimetype)) {
            return res.status(400).json({ error: `Unsupported file type: ${f.mimetype}` });
          }
          if (f.size > MAX_BYTES) {
            return res.status(400).json({ error: `File too large: ${f.originalname}` });
          }
  
          // Build S3 key — keep your existing convention
          const key = s3Key(orderId, "packing", f.originalname, start + i);
  
          // Upload to S3 (you already have putFile)
          await putFile({ key, body: f.buffer, contentType: f.mimetype });
  
          // Persist metadata on the order
          order.packingEvidenceExt.push({
            key,
            bucket: BUCKET,
            filename: f.originalname,
            mimetype: f.mimetype,
            size: f.size,
            uploadedAt: new Date(),
          });
        }
  
        await order.save();
  
        return res.json({
          ok: true,
          count: files.length,
          evidence: order.packingEvidenceExt.slice(-files.length), // last uploaded
        });
      } catch (err) {
        console.error("packing evidence upload error:", err);
        if (err && err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({ error: "Unexpected field" });
        }
        return res.status(500).json({ error: "Internal server error" });
      }
    }
  );

/* ===== Downloads (prefer S3; fallback to legacy buffers) ===== */
router.get("/:orderId/evidence/payment", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.orderId).lean();
  if (!order) return res.status(404).send("Not found");
  if (order.evidenceFileExt?.key) return res.redirect(await signedGetUrl(order.evidenceFileExt.key));
  if (order.evidenceFile?.data && order.evidenceFile?.mimetype) {
    res.setHeader("Content-Type", order.evidenceFile.mimetype);
    res.setHeader("Content-Disposition", `inline; filename="${order.evidenceFile.filename || "evidence"}"`);
    return res.send(Buffer.from(order.evidenceFile.data));
  }
  res.status(404).send("No evidence");
});

router.get("/:orderId/evidence/delivery", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.orderId).lean();
  if (!order) return res.status(404).send("Not found");
  if (order.deliveryEvidenceExt?.key) return res.redirect(await signedGetUrl(order.deliveryEvidenceExt.key));
  if (order.deliveryEvidence?.data && order.deliveryEvidence?.mimetype) {
    res.setHeader("Content-Type", order.deliveryEvidence.mimetype);
    res.setHeader("Content-Disposition", `inline; filename="${order.deliveryEvidence.filename || "delivery"}"`);
    return res.send(Buffer.from(order.deliveryEvidence.data));
  }
  res.status(404).send("No delivery evidence");
});

router.get("/:orderId/evidence/packing/:index", requireAuth, async (req, res) => {
  const i = Number(req.params.index);
  if (!Number.isInteger(i) || i < 0) return res.status(400).send("Bad index");
  const order = await Order.findById(req.params.orderId).lean();
  if (!order) return res.status(404).send("Not found");
  if (Array.isArray(order.packingEvidenceExt) && order.packingEvidenceExt[i]?.key) {
    return res.redirect(await signedGetUrl(order.packingEvidenceExt[i].key));
  }
  if (Array.isArray(order.packingEvidence) && order.packingEvidence[i]?.data) {
    const f = order.packingEvidence[i];
    res.setHeader("Content-Type", f.mimetype || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${f.filename || `packing-${i+1}`}"`);
    return res.send(Buffer.from(f.data));
  }
  res.status(404).send("No packing evidence for that index");
});

module.exports = router;
