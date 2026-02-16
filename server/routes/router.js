const express = require('express');
const cors = require('cors');

const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const verifyToken = require("../verifyToken");

const multer = require("multer");
const path = require('path');
const fs = require("fs");

const crypto = require("crypto");
const nodemailer = require("nodemailer");

const axios = require("axios");

const newUserModel = require("../models/newUserModel");
const newOrderModel = require("../models/orderModel");
const Order = require("../models/orderEvidenceModel"); // if used elsewhere
const ShippingAddress = require("../models/ShippingAddress");
const BillingAddress = require("../models/BillingAddress");
const PdfQuote = require("../models/pdfQuoteModel");
// sep16
const AdminPushToken = require("../models/AdminPushToken");
const { notifyStage } = require("./notify");
const { STAGES } = require("../notifications/roles"); 
const { admin } = require("../notifications/fcm");

const WebPushSubscription = require("../models/WebPushSubscription");

const archiver = require("archiver");

// sep16

// --- Optional notifications wiring (safe fallback if helper doesn't exist) ---
let sendToTopic;
try {
  ({ sendToTopic } = require("../utils/fcm"));
} catch (_) {
  sendToTopic = async () => {};
}

// Role → topic map (kept from your draft)
const roleTopics = {
  FULL_ACCESS: "role-full-access",
  ADMIN_FACTURAS_Y_LOGISTICA: "role-admin-facturas-logistica",
  LOGISTICA_Y_ALMACEN: "role-logistica-almacen",
  ALMACEN_LIMITADO: "role-almacen-limitado",
};
const rolesForStage = (stage) => {
  switch (stage) {
    case "EVIDENCIA_PAGO":            return ["FULL_ACCESS"];
    case "PAGO_VERIFICADO":           return ["ADMIN_FACTURAS_Y_LOGISTICA", "LOGISTICA_Y_ALMACEN", "ALMACEN_LIMITADO"];
    case "PREPARANDO_PEDIDO":         return ["ADMIN_FACTURAS_Y_LOGISTICA"];
    case "ETIQUETA_GENERADA":         return ["LOGISTICA_Y_ALMACEN"];
    case "PEDIDO_ENTREGADO":          return ["FULL_ACCESS"];
    default:                          return [];
  }
};

// --- Multer: memory storage (consistent across file routes) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// dec21
// --- Display name resolver (Mongo first, optional Google Sheets fallback) ---
const CLIENT_DB_URL = process.env.CLIENT_DB_URL || ""; // optional published CSV

async function resolveDisplayNameByEmail(email) {
  try {
    const e = String(email || "").trim().toLowerCase();
    if (!e) return "cliente";
    // 1) MongoDB (preferred)
    const u = await newUserModel.findOne({ correo: e }).lean();
    if (u) {
      const nombre = (u.nombre || "").toString().trim();
      const apellido = (u.apellido || "").toString().trim();
      const full = [nombre, apellido].filter(Boolean).join(" ").trim();
      if (full) return full;
      if (nombre) return nombre;
    }
    // 2) Google Sheets (optional, if env configured)
    if (CLIENT_DB_URL) {
      try {
        const { data: csv } = await axios.get(CLIENT_DB_URL);
        // minimal CSV parse
        const rows = String(csv).split(/\r?\n/).filter(Boolean);
        if (rows.length > 1) {
          const headers = rows[0].split(",");
          const idxCorreo = headers.findIndex(h => /correo/i.test(h));
          const idxNombre = headers.findIndex(h => /nombre.*apellido/i.test(h));
          for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(",");
            const correo = (cols[idxCorreo] || "").trim().toLowerCase();
            if (correo === e) {
              const name = (idxNombre >= 0 ? cols[idxNombre] : "").trim();
              if (name) return name;
            }
          }
        }
      } catch (_csvErr) {
        // ignore CSV failures; fallback to email below
      }
    }
    // 3) Fallback
    return email || "cliente";
  } catch {
    return email || "cliente";
  }
}
// dec21

// =========================== USER AUTH ===========================

// Register
router.post('/register', (req, res) => {
  let user = req.body;

  bcrypt.genSalt(10, (err, salt) => {
    if (err) return res.status(500).send({ message: "Error generating salt" });

    bcrypt.hash(user.contrasena, salt, (err, hpass) => {
      if (err) return res.status(500).send({ message: "Error hashing password" });

      user.contrasena = hpass;
      newUserModel.create(user)
        .then(() => res.status(201).send({ message: "¡Usuario registrado exitosamente!" }))
        .catch((e) => {
          console.log(e);
          res.status(500).send({ message: "Encountered a problem while registering user" });
        });
    });
  });
});

// POST /users/upsert
router.post('/users/upsert', async (req, res) => {
  try {
    const { nombre = "", apellido = "", empresa = "", correo = "" } = req.body || {};
    const email = String(correo).trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "correo requerido" });

    // Upsert by email; don't require contrasena
    const update = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      empresa: empresa.trim(),
      correo: email,
      origen: 'captura_admin',
      updatedAt: new Date()
    };

    const doc = await newUserModel.findOneAndUpdate(
      { correo: email },
      {
        $setOnInsert: { contrasena: null, createdAt: new Date() },
        $set: update
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ ok: true, id: doc._id });
  } catch (e) {
    // If there's a rare race-condition duplicate
    if (e.code === 11000) return res.status(200).json({ ok: true, duplicate: true });
    console.error(e);
    return res.status(500).json({ error: "error upserting user" });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { correo, contrasena } = req.body || {};
    if (!correo || !contrasena) {
      return res.status(400).json({ message: "Faltan credenciales (correo y contraseña)." });
    }

    const user = await newUserModel.findOne({ correo });
    if (!user) return res.status(404).json({ message: "El usuario no se encontró" });

    const stored = user.contrasena || "";
    const looksHashed = /^\$2[aby]\$\d{2}\$.{53}$/.test(stored);

    let authOK = false;
    if (looksHashed) {
      try { authOK = await bcrypt.compare(contrasena, stored); }
      catch { authOK = false; }
    } else {
      authOK = (contrasena === stored);
    }

    if (!authOK) return res.status(403).json({ message: "Contraseña incorrecta!" });

    const jwtSecret = process.env.JWT_SECRET || "kangarookey";
    const token = jwt.sign({ correo: user.correo, id: user._id }, jwtSecret, { expiresIn: "30d" });

    return res.json({
      token,
      correo: user.correo,
      nombre: user.nombre,
      empresa: user.empresa,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Encountered some problem!" });
  }
});

// Forgot password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await newUserModel.findOne({ correo: email });
    if (!user) return res.status(404).json({ message: "Correo no registrado." });

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetLink = `https://gisconnect-web.onrender.com/reset-password/${token}`;

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: { user: "kangaroo.cacti@gmail.com", pass: "bebt svht sgmq ezlz" } // move to env in prod
    });

    await transporter.sendMail({
      to: email,
      from: "no-reply@gisconnect.com",
      subject: "Restablecimiento de contraseña",
      text: `Recibimos una solicitud para restablecer tu contraseña. Haz click en el siguiente enlace: ${resetLink}`
    });

    res.status(200).json({ message: "Correo enviado. Revisa tu bandeja de entrada." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Error al procesar la solicitud." });
  }
});

// Reset password
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  try {
    const user = await newUserModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: "Token inválido o expirado." });

    const hashedPassword = await bcrypt.hash(password, 10);
    user.contrasena = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Contraseña actualizada con éxito." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Error al actualizar la contraseña." });
  }
});

// Example protected route
router.get('/getdata', verifyToken, (_req, res) => {
  res.send({ message: "Bad dev with good heart" });
});

// All users (legacy)
router.get('/register', (_req, res) => {
  newUserModel.find()
    .then((docs) => res.send(docs))
    .catch((err) => {
      console.log(err);
      res.send({ message: "Couldn't fetch projects" });
    });
});

// =========================== USER + PREFS ===========================

// GET user by email
router.get('/users/by-email', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const user = await newUserModel.findOne({ correo: email }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (err) {
    console.error('GET /users/by-email error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT user shipping prefs (by email)
router.put('/users/shipping-prefs', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const nested = req.body?.shippingPreferences || {};
    const preferredCarrier = String(nested.preferredCarrier ?? req.body?.preferredCarrier ?? '').trim();
    const insureShipment = !!(nested.insureShipment ?? req.body?.insureShipment);

    const updated = await newUserModel.findOneAndUpdate(
      { correo: email },
      {
        $set: {
          'shippingPreferences.preferredCarrier': preferredCarrier,
          'shippingPreferences.insureShipment': insureShipment,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: 'User not found' });
    return res.json(updated);
  } catch (err) {
    console.error('PUT /users/shipping-prefs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// SEP11
// READ shipping preferences by email (normalized)
router.get('/users/shipping-prefs', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await newUserModel.findOne({ correo: email }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const prefs = user.shippingPreferences || {};
    // legacy fallback fields support
    const preferredCarrier =
      (prefs.preferredCarrier ?? user.preferredCarrier ?? '').toString();
    const insureShipment = !!(prefs.insureShipment ?? user.insureShipment);

    return res.json({
      email,
      shippingPreferences: { preferredCarrier, insureShipment },
    });
  } catch (err) {
    console.error('GET /users/shipping-prefs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// OPTIONAL: read by user id
router.get('/users/:id/shipping-prefs', async (req, res) => {
  try {
    const user = await newUserModel.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const prefs = user.shippingPreferences || {};
    const preferredCarrier =
      (prefs.preferredCarrier ?? user.preferredCarrier ?? '').toString();
    const insureShipment = !!(prefs.insureShipment ?? user.insureShipment);

    return res.json({
      userId: String(user._id),
      shippingPreferences: { preferredCarrier, insureShipment },
    });
  } catch (err) {
    console.error('GET /users/:id/shipping-prefs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// SEP11

// PATCH user by id (shipping prefs)
router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const nested = req.body?.shippingPreferences || {};
    const preferredCarrier = String(nested.preferredCarrier ?? '').trim();
    const insureShipment = !!nested.insureShipment;

    const updated = await newUserModel.findByIdAndUpdate(
      id,
      {
        $set: {
          'shippingPreferences.preferredCarrier': preferredCarrier,
          'shippingPreferences.insureShipment': insureShipment,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json(updated);
  } catch (err) {
    console.error('PATCH /users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH user by email (shipping prefs)
router.patch('/users/by-email', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });

    const nested = req.body?.shippingPreferences || {};
    const preferredCarrier = String(nested.preferredCarrier ?? '').trim();
    const insureShipment = !!nested.insureShipment;

    const updated = await newUserModel.findOneAndUpdate(
      { correo: email },
      {
        $set: {
          'shippingPreferences.preferredCarrier': preferredCarrier,
          'shippingPreferences.insureShipment': insureShipment,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json(updated);
  } catch (err) {
    console.error('PATCH /users/by-email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================== ORDERS ===========================

// Create order (PDF optional)
// Create order (PDF optional) + notify PEDIDO_REALIZADO
router.post('/orderDets', upload.single('pdf'), async (req, res) => {
  try {
    const raw = req.body.order;
    if (!raw) return res.status(400).json({ error: 'Missing order JSON in "order" field' });

    const order = JSON.parse(raw);
    if (order && order.userEmail) {
      order.userEmail = String(order.userEmail).trim().toLowerCase();
    }

    if (req.file) {
      const { originalname, mimetype, buffer } = req.file;
      order.quotePdf = { filename: originalname, contentType: mimetype, data: buffer };
    }

    const created = await newOrderModel.create(order);

    // ---------- 🚀 Notify PEDIDO_REALIZADO ----------
    try {
      const shortId = String(created._id || "").slice(-5);
      const userEmail = created.userEmail || created.email || "cliente";
      const displayName = await resolveDisplayNameByEmail(userEmail);

      await notifyStage(
        STAGES.PEDIDO_REALIZADO,
        "Nuevo pedido realizado - Pendiente de pago",
        // `Pedido #${shortId} — Cliente: ${userEmail}`,
        `Pedido #${shortId} — Cliente: ${displayName}`,
        {
          orderId: String(created._id),
          stage: STAGES.PEDIDO_REALIZADO,
          email: userEmail,
          clientName: displayName,            // NEW: include name in data payload
          orderStatus: created.orderStatus || "",
          trackingNumber: created.trackingNumber || "",
          deepLink: "https://gisconnect-web.onrender.com/adminHome",
        }
      );
    } catch (notifyErr) {
      // Don't fail the request if push sending has issues
      console.error("notify PEDIDO_REALIZADO error:", notifyErr);
    }
    // ---------- End notify ----------

    res.status(201).json({ data: created, message: "Nueva orden registrada exitosamente" });
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// router.post('/orderDets', upload.single('pdf'), async (req, res) => {
//   try {
//     const raw = req.body.order;
//     if (!raw) return res.status(400).json({ error: 'Missing order JSON in "order" field' });

//     const order = JSON.parse(raw);
//     if (order && order.userEmail) {
//       order.userEmail = String(order.userEmail).trim().toLowerCase();
//     }

//     if (req.file) {
//       const { originalname, mimetype, buffer } = req.file;
//       order.quotePdf = { filename: originalname, contentType: mimetype, data: buffer };
//     }

//     const created = await newOrderModel.create(order);
//     res.status(201).json({ data: created, message: "Nueva orden registrada exitosamente" });
//   } catch (err) {
//     console.error("Error creating order:", err);
//     res.status(500).json({ error: "Failed to create order" });
//   }
// });

// Update order status (simple)
// Update order status (simple) + 🔔 notifications
router.patch("/order/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;
    if (!orderStatus) return res.status(400).json({ message: "orderStatus requerido" });

    const prev = await newOrderModel.findById(id);
    if (!prev) return res.status(404).json({ message: "Orden no encontrada" });

    const updated = await newOrderModel.findByIdAndUpdate(id, { orderStatus }, { new: true });
    if (!updated) return res.status(404).json({ message: "Orden no encontrada" });

    // 🔔 stage mapping
    try {
      const s = (orderStatus || "").trim().toLowerCase();
      const shortId = String(updated._id || "").slice(-5);
      const userEmail = updated.userEmail || updated.email || "cliente";
      const displayName = await resolveDisplayNameByEmail(userEmail);

      let stageToSend = null;
      if (s === "pago verificado")   stageToSend = STAGES.PAGO_VERIFICADO;
      if (s === "preparando pedido") stageToSend = STAGES.PREPARANDO_PEDIDO;
      if (s === "pedido entregado")  stageToSend = STAGES.PEDIDO_ENTREGADO;

      if (stageToSend) {
        const titles = {
          [STAGES.PAGO_VERIFICADO]:   "Pago verificado",
          // [STAGES.PREPARANDO_PEDIDO]: "Atención Admin: Pedido listo para ser etiquetado",
          [STAGES.PREPARANDO_PEDIDO]: "Orden en: Gestionar Entrega",
          // [STAGES.PEDIDO_ENTREGADO]:  "Pedido entregado",
          [STAGES.PEDIDO_ENTREGADO]:  "Orden en: Pedidos Entregados",
        };
        const bodies = {
          // [STAGES.PAGO_VERIFICADO]:   `Pedido #${shortId} listo para logística/almacén`,
          // [STAGES.PREPARANDO_PEDIDO]: `Pedido #${shortId} en empaque`,
          // [STAGES.PEDIDO_ENTREGADO]:  `Pedido #${shortId} marcado como entregado`,
          
          [STAGES.PAGO_VERIFICADO]:   `Pedido #${shortId} listo para almacén`,
          // [STAGES.PREPARANDO_PEDIDO]: `Pedido #${shortId} empacado`,
          [STAGES.PREPARANDO_PEDIDO]: `Pedido #${shortId} - Cliente: ${displayName}`,
          // [STAGES.PEDIDO_ENTREGADO]:  `Pedido #${shortId} marcado como entregado`,
          [STAGES.PEDIDO_ENTREGADO]:  `Pedido #${shortId} - Cliente: ${displayName}`,
        };
        await notifyStage(stageToSend, titles[stageToSend], bodies[stageToSend], {
          orderId: String(updated._id),
          stage: stageToSend,
          email: userEmail,
          clientName: displayName,             // NEW
          orderStatus: updated.orderStatus || "",
          deepLink: "https://gisconnect-web.onrender.com/adminHome",
        });
      }
    } catch (notifyErr) {
      console.error("PATCH /order/:id/status notify error:", notifyErr);
    }

    res.json({ message: "Estatus actualizado", order: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error interno" });
  }
});

// router.patch("/order/:id/status", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { orderStatus } = req.body;
//     if (!orderStatus) return res.status(400).json({ message: "orderStatus requerido" });

//     const updated = await newOrderModel.findByIdAndUpdate(id, { orderStatus }, { new: true });
//     if (!updated) return res.status(404).json({ message: "Orden no encontrada" });

//     res.json({ message: "Estatus actualizado", order: updated });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ message: "Error interno" });
//   }
// });

// User orders list
router.get('/userOrders', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });

    const orders = await newOrderModel.find({ userEmail: email }).sort({ orderDate: -1 }).lean();
    res.json(Array.isArray(orders) ? orders : []);
  } catch (err) {
    console.error('Error fetching user orders:', err);
    res.status(500).json({ error: 'Failed to fetch user orders' });
  }
});

// nov25
// --- Helper: build a query that returns only packable orders (status=Pago Verificado
//     and not currently claimed, OR previous claim lease expired)
function buildPackableFilter() {
  const leaseMs = 30 * 60 * 1000; // keep in sync with schema default if you change it
  const cutoff = new Date(Date.now() - leaseMs);
  return {
    orderStatus: "Pago Verificado",
    $or: [
      { "packing.status": { $ne: "in_progress" } },
      { "packing.claimedAt": { $exists: false } },
      { "packing.claimedAt": { $lt: cutoff } }
    ]
  };
}

// Admin list orders (enhanced with packing filters)
router.get('/orders', async (req, res) => {
  try {
    const email = (req.query.email || "").trim();
    const packable = String(req.query.packable || "").toLowerCase() === "true";
    const packingStatus = (req.query.packingStatus || "").trim(); // e.g. "in_progress"
    const claimedBy = (req.query.claimedBy || "").trim();         // e.g. "Oswaldo"
    const status = (req.query.status || "").trim();               // e.g. "Pago Verificado"

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    // Base find
    const findQuery = {};
    if (email) findQuery.userEmail = email;
    if (status) findQuery.orderStatus = status;

    // packable takes precedence (used by PendingPack list)
    if (packable) {
      Object.assign(findQuery, buildPackableFilter());
    } else {
      // explicit packing status / claimedBy filters if provided
      if (packingStatus) findQuery["packing.status"] = packingStatus;
      if (claimedBy)     findQuery["packing.claimedBy"] = claimedBy;
    }

    const orders = await newOrderModel
      .find(findQuery)
      .sort({ orderDate: -1, _id: -1 });

    return res.json(orders);
  } catch (err) {
    console.error("Error fetching orders:", err);
    return res.status(500).json({ error: "Error fetching orders" });
  }
});

// Convenience: explicit endpoint for "orders available to pack"
router.get("/orders/packable", async (_req, res) => {
  try {
    const orders = await newOrderModel
      .find(buildPackableFilter())
      .sort({ orderDate: -1, _id: -1 });
    res.json(orders);
  } catch (e) {
    console.error("GET /orders/packable error:", e);
    res.status(500).json({ error: "Error fetching packable orders" });
  }
});

// nov25

// OFF NOV25: Admin list orders
// router.get('/orders', async (req, res) => {
//   try {
//     const email = (req.query.email || "").trim();

//     res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
//     res.setHeader("Pragma", "no-cache");
//     res.setHeader("Expires", "0");
//     res.setHeader("Surrogate-Control", "no-store");

//     const findQuery = email ? { userEmail: email } : {};
//     const orders = await newOrderModel.find(findQuery).sort({ orderDate: -1, _id: -1 });

//     return res.json(orders);
//   } catch (err) {
//     console.error("Error fetching orders:", err);
//     return res.status(500).json({ error: "Error fetching orders" });
//   }
// });
// OFF NOV25

// Get order by id (single, canonical)
router.get('/orders/:orderId', async (req, res) => {
  try {
    const order = await newOrderModel.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err) {
    console.error("Error fetching order by ID:", err);
    res.status(500).json({ message: "Error retrieving order data" });
  }
});

// // PUT /orders/:orderId (multipart updates + files)
router.put(
  "/orders/:orderId",
  upload.fields([
    { name: "evidenceImage",   maxCount: 1 },
    { name: "paymentEvidence", maxCount: 1 }, // alias
    { name: "evidenceFile",    maxCount: 1 }, // alias
    { name: "packingImages",   maxCount: 3 },
    { name: "deliveryImage",   maxCount: 1 },
  ]),
  async (req, res) => {
    const { orderId } = req.params;
    const {
      paymentMethod,
      paymentAccount,
      orderStatus,
      packerName,
      insuredAmount,
      deliveryDate,
      trackingNumber,
    } = req.body || {};

    // --- Helpers (declare BEFORE use) ---
    const fileToDoc = (file) => {
      if (!file) return null;
      const buffer = file.buffer || null;
      if (!buffer) return null;
      return {
        filename: file.originalname || file.filename || "evidence",
        mimetype: file.mimetype || "application/octet-stream",
        data: buffer,
        uploadedAt: new Date(),
      };
    };

    const files = req.files || {};
    const firstOf = (k) => (files?.[k]?.[0]) || null;

    // pick an evidence file regardless of which alias the client used
    const pickEvidenceFile = () =>
      firstOf("evidenceImage") || firstOf("paymentEvidence") || firstOf("evidenceFile");

    const pickDeliveryFile = () => firstOf("deliveryImage");
    const pickPackingDocs = () => (files?.packingImages || []).map(fileToDoc).filter(Boolean);

    try {
      const prevOrder = await newOrderModel.findById(orderId);
      if (!prevOrder) return res.status(404).json({ message: "Order not found" });

      // Build docs from uploaded files
      const paymentEvidenceDoc = fileToDoc(pickEvidenceFile());
      const packingDocs        = pickPackingDocs();
      const deliveryDoc        = fileToDoc(pickDeliveryFile());

      // Coerce/parse scalar fields
      const numericInsured      = insuredAmount ? Number(insuredAmount) : undefined;
      const parsedDeliveryDate  = deliveryDate ? new Date(deliveryDate) : undefined;

      // Build $set update
      const $set = {
        ...(paymentMethod && { paymentMethod }),
        ...(paymentAccount && { paymentAccount }),
        ...(orderStatus && { orderStatus }),
        ...(packerName && { packerName }),
        ...(numericInsured !== undefined && { insuredAmount: numericInsured }),
        ...(parsedDeliveryDate && { deliveryDate: parsedDeliveryDate }),
        ...(trackingNumber && { trackingNumber }),
      };

      if (paymentEvidenceDoc) $set.evidenceFile   = paymentEvidenceDoc;
      if (deliveryDoc)        $set.deliveryEvidence = deliveryDoc;

      const update = { $set };
      if (packingDocs.length > 0) {
        update.$push = { packingEvidence: { $each: packingDocs } };
      }

      const updatedOrder = await newOrderModel.findByIdAndUpdate(orderId, update, { new: true });
      if (!updatedOrder) return res.status(404).json({ message: "Order not found after update" });

      // ---------- Notifications ----------
      const triggeredStages = [];

      // A) First-time payment evidence?
      if (paymentEvidenceDoc && !prevOrder?.evidenceFile) {
        triggeredStages.push(STAGES.EVIDENCIA_DE_PAGO);
      }

      // B) Status changed?
      const prevStatus = (prevOrder?.orderStatus || "").trim().toLowerCase();
      const nextStatus = (updatedOrder?.orderStatus || prevStatus || "").trim().toLowerCase();
      if (orderStatus && nextStatus !== prevStatus) {
        if (nextStatus === "pago verificado")   triggeredStages.push(STAGES.PAGO_VERIFICADO);
        if (nextStatus === "preparando pedido") triggeredStages.push(STAGES.PREPARANDO_PEDIDO);
        if (nextStatus === "pedido entregado")  triggeredStages.push(STAGES.PEDIDO_ENTREGADO);
      }

      // C) Tracking label added/changed?
      const prevTracking = (prevOrder?.trackingNumber || "").trim();
      const nextTracking = (updatedOrder?.trackingNumber || "").trim();
      if (nextTracking && nextTracking !== prevTracking) {
        triggeredStages.push(STAGES.ETIQUETA_GENERADA);
      }

      // D) Send notifications
      if (triggeredStages.length > 0) {
        const shortId   = String(updatedOrder._id || "").slice(-5);
        const userEmail = updatedOrder.userEmail || updatedOrder.email || "cliente";
        const displayName = await resolveDisplayNameByEmail(userEmail);

        const messageForStage = (stage) => {
          switch (stage) {
            case STAGES.EVIDENCIA_DE_PAGO:
              // return { title: "Evidencia de pago recibida", body: `Pedido #${shortId} — Cliente: ${displayName}` };
              return { title: "Orden en: Pedidos Nuevos", body: `Pedido #${shortId} — Cliente: ${displayName}` };
            case STAGES.PAGO_VERIFICADO:
              // return { title: "Atención Almacen: Pedido listo para empaquetarse", body: `Pedido #${shortId} — Cliente: ${displayName}` };
              return { title: "Orden en: Por Empacar", body: `Pedido #${shortId} — Cliente: ${displayName}` };
            case STAGES.PREPARANDO_PEDIDO:
              // return { title: "Atención Admin: Pedido listo para ser etiquetado", body: `Pedido #${shortId} — Cliente: ${displayName}` };
              return { title: "Orden en: Gestionar Entrega", body: `Pedido #${shortId} — Cliente: ${displayName}` };
              case STAGES.ETIQUETA_GENERADA:
                // return { title: "Atención Entregas: Pedido listo para ser entregado", body: `Pedido #${shortId} — Cliente: ${displayName}` };
                return { title: "Orden en: Por Entregar", body: `Pedido #${shortId} — Cliente: ${displayName}` };
            case STAGES.PEDIDO_ENTREGADO:
              // return { title: "Pedido entregado", body: `Pedido #${shortId} — Cliente: ${displayName}` };
              return { title: "Orden en: Pedidos Entregados", body: `Pedido #${shortId} — Cliente: ${displayName}` };
            case STAGES.PEDIDO_REALIZADO:
              return { title: "Nuevo pedido realizado - Pendiente de pago", body: `Pedido #${shortId} — Cliente: ${displayName}` };
            default:
              return { title: "Actualización de pedido", body: `Pedido #${shortId}` };
          }
        };

        for (const stage of triggeredStages) {
          const { title, body } = messageForStage(stage);
          await notifyStage(stage, title, body, {
            orderId: String(updatedOrder._id),
            stage,
            email: userEmail,
            clientName: displayName,           // NEW
            orderStatus: updatedOrder.orderStatus || "",
            trackingNumber: nextTracking || "",
            deepLink: "https://gisconnect-web.onrender.com/adminHome",
          });
        }
      }
      // ---------- End notifications ----------

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  }
);

// router.put(
//   "/orders/:orderId",
//   // upload.fields([
//   //   { name: "evidenceImage", maxCount: 1 },
//   //   { name: "packingImages", maxCount: 3 },
//   //   { name: "deliveryImage", maxCount: 1 },
//   // ]),
//   upload.fields([
//     { name: "evidenceImage",  maxCount: 1 },
//     { name: "paymentEvidence",maxCount: 1 }, // NEW alias
//     { name: "evidenceFile",   maxCount: 1 }, // NEW alias
//     { name: "packingImages",  maxCount: 3 },
//     { name: "deliveryImage",  maxCount: 1 },
//   ]),
//   async (req, res) => {
//     const { orderId } = req.params;
//     const {
//       paymentMethod,
//       paymentAccount,
//       orderStatus,
//       packerName,
//       insuredAmount,
//       deliveryDate,
//       trackingNumber,
//     } = req.body;

//     const fileToDoc = (file) => {
//       if (!file) return null;
//       const buffer = file.buffer || null;
//       if (!buffer) return null;
//       return {
//         filename: file.originalname || file.filename || "evidence",
//         mimetype: file.mimetype || "application/octet-stream",
//         data: buffer,
//         uploadedAt: new Date(),
//       };
//     };

//     try {
//       const prevOrder = await newOrderModel.findById(orderId);
//       if (!prevOrder) return res.status(404).json({ message: "Order not found" });

//       const paymentEvidenceDoc = fileToDoc((req.files?.evidenceImage || [])[0]);
//       const packingDocs = (req.files?.packingImages || []).map(fileToDoc).filter(Boolean);
//       const deliveryDoc = fileToDoc((req.files?.deliveryImage || [])[0]);

//       const numericInsured = insuredAmount ? Number(insuredAmount) : undefined;
//       const parsedDeliveryDate = deliveryDate ? new Date(deliveryDate) : undefined;

//       const $set = {
//         ...(paymentMethod && { paymentMethod }),
//         ...(paymentAccount && { paymentAccount }),
//         ...(orderStatus && { orderStatus }),
//         ...(packerName && { packerName }),
//         ...(numericInsured !== undefined && { insuredAmount: numericInsured }),
//         ...(parsedDeliveryDate && { deliveryDate: parsedDeliveryDate }),
//         ...(trackingNumber && { trackingNumber }),
//       };

//       if (paymentEvidenceDoc) $set.evidenceFile = paymentEvidenceDoc;
//       if (deliveryDoc) $set.deliveryEvidence = deliveryDoc;

//       const update = { $set };
//       if (packingDocs.length > 0) update.$push = { packingEvidence: { $each: packingDocs } };

//       const updatedOrder = await newOrderModel.findByIdAndUpdate(orderId, update, { new: true });
//       if (!updatedOrder) return res.status(404).json({ message: "Order not found after update" });
//       // ---------- Notifications ----------
//       const triggeredStages = [];

//       // A) Evidence newly uploaded?
//       // Place this right after you've computed `paymentEvidenceDoc` and have `prevOrder` available.
//       if (paymentEvidenceDoc && !prevOrder?.evidenceFile) {
//         triggeredStages.push(STAGES.EVIDENCIA_DE_PAGO); // <-- THIS IS THE LINE
//       }

//       // B) Status changed?
//       const prevStatus = (prevOrder?.orderStatus || "").trim().toLowerCase();
//       const nextStatus = (updatedOrder?.orderStatus || prevStatus || "").trim().toLowerCase();
//       if (orderStatus && nextStatus !== prevStatus) {
//         if (nextStatus === "pago verificado")   triggeredStages.push(STAGES.PAGO_VERIFICADO);
//         if (nextStatus === "preparando pedido") triggeredStages.push(STAGES.PREPARANDO_PEDIDO);
//         if (nextStatus === "pedido entregado")  triggeredStages.push(STAGES.PEDIDO_ENTREGADO);
//       }

//       // C) Tracking label added/changed?
//       const prevTracking = (prevOrder?.trackingNumber || "").trim();
//       const nextTracking = (updatedOrder?.trackingNumber || "").trim();
//       if (nextTracking && nextTracking !== prevTracking) {
//         triggeredStages.push(STAGES.ETIQUETA_GENERADA);
//       }

//       // D) Send notifications
//       if (triggeredStages.length > 0) {
//         const shortId = String(updatedOrder._id || "").slice(-5);
//         const userEmail = updatedOrder.userEmail || updatedOrder.email || "cliente";

//         const messageForStage = (stage) => {
//           switch (stage) {
//             case STAGES.EVIDENCIA_DE_PAGO:
//               return { title: "Evidencia de pago recibida", body: `Pedido #${shortId} — Cliente: ${userEmail}` };
//             case STAGES.PAGO_VERIFICADO:
//               return { title: "Pago verificado", body: `Pedido #${shortId} listo para logística/almacén` };
//             case STAGES.PREPARANDO_PEDIDO:
//               return { title: "Preparando pedido", body: `Pedido #${shortId} en empaque` };
//             case STAGES.ETIQUETA_GENERADA:
//               return { title: "Etiqueta generada", body: `Pedido #${shortId} — Tracking: ${nextTracking}` };
//             case STAGES.PEDIDO_ENTREGADO:
//               return { title: "Pedido entregado", body: `Pedido #${shortId} marcado como entregado` };
//             case STAGES.PEDIDO_REALIZADO:
//               return { title: "Nuevo pedido recibido", body: `Pedido #${shortId} — Cliente: ${userEmail}` };
//             default:
//               return { title: "Actualización de pedido", body: `Pedido #${shortId}` };
//           }
//         };

//         for (const stage of triggeredStages) {
//           const { title, body } = messageForStage(stage);
//           await notifyStage(stage, title, body, {
//             orderId: String(updatedOrder._id),
//             stage,
//             email: userEmail,
//             orderStatus: updatedOrder.orderStatus || "",
//             trackingNumber: nextTracking || "",
//             deepLink: "https://gisconnect-web.onrender.com/adminHome",
//           });
//         }
//       }
//       // ---------- End notifications ----------

//       res.json(updatedOrder);
//     } catch (error) {
//       console.error("Error updating order:", error);
//       res.status(500).json({ message: "Failed to update order" });
//     }
//   }
// );

// JSON-only partial updates
router.patch("/orders/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      paymentMethod,
      paymentAccount,
      orderStatus,
      packerName,
      insuredAmount,
      deliveryDate,
      trackingNumber,
    } = req.body || {};

    const prev = await newOrderModel.findById(orderId);
    if (!prev) return res.status(404).json({ error: "Order not found" });

    const numericInsured =
      insuredAmount !== undefined && insuredAmount !== null ? Number(insuredAmount) : undefined;
    const parsedDeliveryDate = deliveryDate ? new Date(deliveryDate) : undefined;

    const $set = {
      ...(typeof paymentMethod === "string" && paymentMethod.trim() && { paymentMethod: paymentMethod.trim() }),
      ...(typeof paymentAccount === "string" && paymentAccount.trim() && { paymentAccount: paymentAccount.trim() }),
      ...(typeof orderStatus === "string" && orderStatus.trim() && { orderStatus: orderStatus.trim() }),
      ...(typeof packerName === "string" && packerName.trim() && { packerName: packerName.trim() }),
      ...(numericInsured !== undefined && Number.isFinite(numericInsured) && { insuredAmount: numericInsured }),
      ...(parsedDeliveryDate instanceof Date && !isNaN(parsedDeliveryDate) && { deliveryDate: parsedDeliveryDate }),
      ...(typeof trackingNumber === "string" && trackingNumber.trim() && { trackingNumber: trackingNumber.trim() }),
    };

    if (Object.keys($set).length === 0) return res.status(400).json({ error: "No fields to update" });

    const updated = await newOrderModel.findByIdAndUpdate(orderId, { $set }, { new: true });
    if (!updated) return res.status(404).json({ error: "Order not found after update" });

    // ---------- Notifications (JSON patch) ----------
    try {
      const triggeredStages = [];
      const shortId = String(updated._id || "").slice(-5);
      const userEmail = updated.userEmail || updated.email || "cliente";
      const displayName = await resolveDisplayNameByEmail(userEmail);

      // Status change?
      const prevStatus = (prev.orderStatus || "").trim().toLowerCase();
      const nextStatus = (updated.orderStatus || prevStatus).trim().toLowerCase();
      if ($set.orderStatus && nextStatus !== prevStatus) {
        if (nextStatus === "pago verificado")   triggeredStages.push(STAGES.PAGO_VERIFICADO);
        if (nextStatus === "preparando pedido") triggeredStages.push(STAGES.PREPARANDO_PEDIDO);
        if (nextStatus === "pedido entregado")  triggeredStages.push(STAGES.PEDIDO_ENTREGADO);
      }

      // Tracking added/changed?
      const prevTracking = (prev.trackingNumber || "").trim();
      const nextTracking = (updated.trackingNumber || "").trim();
      if ($set.trackingNumber && nextTracking && nextTracking !== prevTracking) {
        triggeredStages.push(STAGES.ETIQUETA_GENERADA);
      }

      if (triggeredStages.length) {
        const titles = {
          [STAGES.PAGO_VERIFICADO]:   "Pago verificado",
          // [STAGES.PREPARANDO_PEDIDO]: "Atención Admin: Pedido listo para ser etiquetado",
          [STAGES.PREPARANDO_PEDIDO]: "Orden en: Gestionar Entrega",
          // [STAGES.PEDIDO_ENTREGADO]:  "Pedido entregado",
          [STAGES.PEDIDO_ENTREGADO]:  "Orden en: Pedidos Entregados",
          // [STAGES.ETIQUETA_GENERADA]: "Atención Entregas: Pedido listo para ser entregado",
          [STAGES.ETIQUETA_GENERADA]: "Orden en: Por Entregar",
        };
        const bodies = {
          // [STAGES.PAGO_VERIFICADO]:   `Pedido #${shortId} listo para logística/almacén`,
          // [STAGES.PREPARANDO_PEDIDO]: `Pedido #${shortId} en empaque`,
          // [STAGES.PEDIDO_ENTREGADO]:  `Pedido #${shortId} marcado como entregado`,
          // [STAGES.ETIQUETA_GENERADA]: `Pedido #${shortId} — Tracking: ${nextTracking}`,
          
          [STAGES.PAGO_VERIFICADO]:   `Pedido #${shortId} listo para almacén`,
          // [STAGES.PREPARANDO_PEDIDO]: `Pedido #${shortId} empacado`,
          [STAGES.PREPARANDO_PEDIDO]: `Pedido #${shortId} - Cliente ${displayName}`,
          // [STAGES.PEDIDO_ENTREGADO]:  `Pedido #${shortId} marcado como entregado`,
          [STAGES.PEDIDO_ENTREGADO]:  `Pedido #${shortId} - Cliente ${displayName}`,
          // [STAGES.ETIQUETA_GENERADA]: `Pedido #${shortId} etiquetado`,
          [STAGES.ETIQUETA_GENERADA]: `Pedido #${shortId} - Cliente ${displayName}`,

        };

        for (const stage of triggeredStages) {
          await notifyStage(stage, titles[stage], bodies[stage], {
            orderId: String(updated._id),
            stage,
            email: userEmail,
            clientName: displayName,           // NEW
            orderStatus: updated.orderStatus || "",
            trackingNumber: updated.trackingNumber || "",
            deepLink: "https://gisconnect-web.onrender.com/adminHome",
          });
        }
      }
    } catch (notifyErr) {
      console.error("PATCH /orders/:orderId notify error:", notifyErr);
    }
    // ---------- End notifications ----------

    res.json({ data: updated, message: "Order updated" });
  } catch (err) {
    console.error("PATCH /orders/:orderId error:", err);
    res.status(500).json({ error: "Failed to update order" });
  }
});

// router.patch("/orders/:orderId", async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const {
//       paymentMethod,
//       paymentAccount,
//       orderStatus,
//       packerName,
//       insuredAmount,
//       deliveryDate,
//       trackingNumber,
//     } = req.body || {};

//     const numericInsured =
//       insuredAmount !== undefined && insuredAmount !== null ? Number(insuredAmount) : undefined;
//     const parsedDeliveryDate = deliveryDate ? new Date(deliveryDate) : undefined;

//     const $set = {
//       ...(typeof paymentMethod === "string" && paymentMethod.trim() && { paymentMethod: paymentMethod.trim() }),
//       ...(typeof paymentAccount === "string" && paymentAccount.trim() && { paymentAccount: paymentAccount.trim() }),
//       ...(typeof orderStatus === "string" && orderStatus.trim() && { orderStatus: orderStatus.trim() }),
//       ...(typeof packerName === "string" && packerName.trim() && { packerName: packerName.trim() }),
//       ...(numericInsured !== undefined && Number.isFinite(numericInsured) && { insuredAmount: numericInsured }),
//       ...(parsedDeliveryDate instanceof Date && !isNaN(parsedDeliveryDate) && { deliveryDate: parsedDeliveryDate }),
//       ...(typeof trackingNumber === "string" && trackingNumber.trim() && { trackingNumber: trackingNumber.trim() }),
//     };

//     if (Object.keys($set).length === 0) return res.status(400).json({ error: "No fields to update" });

//     const updated = await newOrderModel.findByIdAndUpdate(orderId, { $set }, { new: true });
//     if (!updated) return res.status(404).json({ error: "Order not found" });

//     res.json({ data: updated, message: "Order updated" });
//   } catch (err) {
//     console.error("PATCH /orders/:orderId error:", err);
//     res.status(500).json({ error: "Failed to update order" });
//   }
// });

// =========================== EVIDENCE (FILES) ===========================

function sendFileFromDoc(res, fileDoc, fallbackName) {
  if (!fileDoc || !fileDoc.data) return res.status(404).send("File not found");
  res.setHeader("Content-Type", fileDoc.mimetype || "application/octet-stream");
  const filename = fileDoc.filename || fallbackName || "evidence.bin";
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  return res.send(fileDoc.data);
}

// Upload payment evidence (memory)
// Upload payment evidence (memory)
// router.post("/upload-evidence", upload.single("evidenceImage"), async (req, res) => {
  router.post("/upload-evidence", upload.any(), async (req, res) => {
    const pickFile = () =>
      (req.files || []).find(f =>
        ["evidenceImage","paymentEvidence","evidenceFile"].includes(f.fieldname)
      );
  
    const file = pickFile();
  
    console.log("[ENTER] /upload-evidence", {
      orderId: req.body?.orderId,
      fields: Object.keys(req.body || {}),
      file: file?.originalname,
      fieldname: file?.fieldname,
      mimetype: file?.mimetype,
    });
  
    try {
      const { orderId } = req.body;
      if (!orderId) return res.status(400).json({ message: "Order ID not provided" });
      if (!file) return res.status(400).json({ message: "No file uploaded" });
  
      const order = await newOrderModel.findById(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
  
      const hadEvidence = !!(order.evidenceFile && order.evidenceFile.data);
  
      order.evidenceFile = {
        filename: file.originalname,
        mimetype: file.mimetype,
        data: file.buffer,
        uploadedAt: new Date()
      };
  
      await order.save();
  
      if (!hadEvidence) {
        try {
          const shortId = String(order._id || "").slice(-5);
          const userEmail = order.userEmail || order.email || "cliente";
          const displayName = await resolveDisplayNameByEmail(userEmail);

          await notifyStage(
            STAGES.EVIDENCIA_DE_PAGO,
            // "Evidencia de pago recibida",
            "Orden en: Pedidos Nuevos",
            `Pedido #${shortId} — Cliente: ${displayName}`,
            {
              orderId: String(order._id),
              stage: STAGES.EVIDENCIA_DE_PAGO,
              email: userEmail,
              clientName: displayName,         // NEW
              orderStatus: order.orderStatus || "",
              deepLink: "https://gisconnect-web.onrender.com/adminHome",
            }
          );
        } catch (notifyErr) {
          console.error("notify EVIDENCIA_DE_PAGO error:", notifyErr);
        }
      }
  
      return res.status(200).json({ message: "Evidencia guardada en MongoDB correctamente" });
    } catch (error) {
      console.error("Upload Evidence Error:", error);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });
  

// router.post("/upload-evidence", upload.single("evidenceImage"), async (req, res) => {
//   try {
//     const { orderId } = req.body;
//     const file = req.file;
//     if (!orderId) return res.status(400).json({ message: "Order ID not provided" });
//     if (!file) return res.status(400).json({ message: "No file uploaded" });

//     const order = await newOrderModel.findById(orderId);
//     if (!order) return res.status(404).json({ message: "Order not found" });

//     order.evidenceFile = {
//       filename: file.originalname,
//       mimetype: file.mimetype,
//       data: file.buffer,
//       uploadedAt: new Date()
//     };

//     await order.save();
//     return res.status(200).json({ message: "Evidencia guardada en MongoDB correctamente" });
//   } catch (error) {
//     console.error("Upload Evidence Error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// Stream payment evidence
router.get("/orders/:orderId/evidence/payment", async (req, res) => {
  console.log("[ENTER] PUT /orders/:orderId", {
    orderId: req.params.orderId,
    fields: Object.keys(req.body || {}),
    hasEvidence: !!(req.files?.evidenceImage?.length)
      || !!(req.files?.paymentEvidence?.length)
      || !!(req.files?.evidenceFile?.length),
  });
  try {
    const order = await newOrderModel.findById(req.params.orderId).lean();
    if (!order) return res.status(404).send("Order not found");
    return sendFileFromDoc(res, order.evidenceFile, "payment-evidence");
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

// Stream delivery evidence
router.get("/orders/:orderId/evidence/delivery", async (req, res) => {
  try {
    const order = await newOrderModel.findById(req.params.orderId).lean();
    if (!order) return res.status(404).send("Order not found");
    return sendFileFromDoc(res, order.deliveryEvidence, "delivery-evidence");
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

// Stream packing evidence by index
router.get("/orders/:orderId/evidence/packing/:index", async (req, res) => {
  try {
    const order = await newOrderModel.findById(req.params.orderId).lean();
    if (!order) return res.status(404).send("Order not found");
    const idx = Number(req.params.index);
    if (!Array.isArray(order.packingEvidence) || !Number.isInteger(idx) || idx < 0 || idx >= order.packingEvidence.length) {
      return res.status(404).send("Packing evidence not found");
    }
    return sendFileFromDoc(res, order.packingEvidence[idx], `packing-${idx + 1}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

// POST /orders/:orderId/evidence/mark-payment
// Purpose: trigger EVIDENCIA_DE_PAGO push (optionally store a pointer / timestamp)
// Body: { s3Url?: string, filename?: string }
router.post("/orders/:orderId/evidence/mark-payment", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { s3Url, filename } = req.body || {};
    const order = await newOrderModel.findById(orderId);
    if (!order) return res.status(404).json({ ok:false, error: "Order not found" });

    // Optional: store lightweight evidence metadata (won’t affect your existing evidenceFile buffer usage)
    const meta = {
      url: s3Url || "",
      filename: filename || "",
      markedAt: new Date()
    };
    // keep a simple field to check first-time notify without needing the buffer route
    if (!order.paymentEvidenceMeta?.markedAt) {
      order.paymentEvidenceMeta = meta;
      await order.save();

      const shortId = String(order._id || "").slice(-5);
      const userEmail = order.userEmail || order.email || "cliente";
      const displayName = await resolveDisplayNameByEmail(userEmail);

      await notifyStage(
        STAGES.EVIDENCIA_DE_PAGO,
        // "Evidencia de pago recibida",
        "Orden en: Pedidos Nuevos",
        `Pedido #${shortId} — Cliente: ${displayName}`,
        {
          orderId: String(order._id),
          stage: STAGES.EVIDENCIA_DE_PAGO,
          email: userEmail,
          clientName: displayName,             // NEW
          orderStatus: order.orderStatus || "",
          deepLink: "https://gisconnect-web.onrender.com/adminHome",
        }
      );
      return res.json({ ok: true, notified: true, firstTime: true });
    }

    // Already marked once; no extra ping (idempotent behavior)
    return res.json({ ok: true, notified: false, firstTime: false });
  } catch (e) {
    console.error("mark-payment error:", e);
    res.status(500).json({ ok:false, error: e.message });
  }
});


// =========================== SHIPPING & BILLING ADDRESSES ===========================

// Create shipping address
router.post("/shipping-address", async (req, res) => {
  const { userEmail, ...addressData } = req.body;
  if (!userEmail) return res.status(400).json({ message: "Email is required" });
  try {
    const newAddress = new ShippingAddress({ userEmail, ...addressData });
    await newAddress.save();
    res.status(201).json({ message: "Address saved" });
  } catch (err) {
    console.error("Save address error:", err);
    res.status(500).json({ message: "Error saving address" });
  }
});

// List shipping addresses for email
router.get('/shipping-address/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const addresses = await ShippingAddress.find({ userEmail: email });
    res.json(addresses);
  } catch (error) {
    console.error("Error fetching shipping addresses:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// // PATCH shipping address (edit; auto-unset other defaults)
router.patch('/shipping-address/:id', async (req,res) => {
  const { id } = req.params;
  try {
    const updated = await ShippingAddress.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});
// router.patch('/shipping-address/:id', async (req, res) => {
//   try {
//     const { id } = req.params;

//     const raw = req.body || {};
//     const payload = {};
//     const pick = (k) => {
//       if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') payload[k] = raw[k];
//     };

//     pick('street'); pick('exteriorNumber'); pick('interiorNumber');
//     pick('colony'); pick('city'); pick('state'); pick('postalCode');
//     if (typeof raw.isDefault === 'boolean') payload.isDefault = !!raw.isDefault;

//     const doc = await ShippingAddress.findById(id);
//     if (!doc) return res.status(404).json({ error: 'Address not found' });

//     Object.assign(doc, payload);
//     await doc.save();

//     if (payload.isDefault === true) {
//       await ShippingAddress.updateMany(
//         { userEmail: doc.userEmail, _id: { $ne: doc._id } },
//         { $set: { isDefault: false } }
//       );
//     }

//     res.json(doc);
//   } catch (err) {
//     console.error('PATCH /shipping-address/:id error:', err);
//     res.status(500).json({ error: 'Failed to update address' });
//   }
// });

// DELETE shipping address
router.delete('/shipping-address/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const del = await ShippingAddress.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ error: 'Address not found' });
    res.json({ message: 'Address deleted' });
  } catch (err) {
    console.error('DELETE /shipping-address/:id error:', err);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

// Create billing address
router.post("/billing-address", async (req, res) => {
  const { userEmail, ...addressData } = req.body;
  if (!userEmail) return res.status(400).json({ message: "Email is required" });
  try {
    const newAddress = new BillingAddress({ userEmail, ...addressData });
    await newAddress.save();
    res.status(201).json({ message: "Address saved" });
  } catch (err) {
    console.error("Save address error:", err);
    res.status(500).json({ message: "Error saving address" });
  }
});

// List billing addresses for email
router.get('/billing-address/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const addresses = await BillingAddress.find({ userEmail: email });
    res.json(addresses);
  } catch (error) {
    console.error("Error fetching billing addresses:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH billing address (edit; auto-unset other defaults)
router.patch('/billing-address/:id', async (req,res) => {
  const { id } = req.params;
  try {
    const updated = await BillingAddress.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});
// router.patch('/billing-address/:id', async (req, res) => {
//   try {
//     const { id } = req.params;

//     const raw = req.body || {};
//     const payload = {};
//     const pick = (k) => {
//       if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') payload[k] = raw[k];
//     };

//     // identity
//     pick('businessName'); pick('rfc'); pick('email'); pick('taxRegime'); pick('cfdiUse');
//     // address
//     pick('street'); pick('exteriorNumber'); pick('interiorNumber');
//     pick('colony'); pick('city'); pick('state'); pick('postalCode');
//     if (typeof raw.isDefault === 'boolean') payload.isDefault = !!raw.isDefault;

//     const doc = await BillingAddress.findById(id);
//     if (!doc) return res.status(404).json({ error: 'Address not found' });

//     Object.assign(doc, payload);
//     await doc.save();

//     if (payload.isDefault === true) {
//       await BillingAddress.updateMany(
//         { userEmail: doc.userEmail, _id: { $ne: doc._id } },
//         { $set: { isDefault: false } }
//       );
//     }

//     res.json(doc);
//   } catch (err) {
//     console.error('PATCH /billing-address/:id error:', err);
//     res.status(500).json({ error: 'Failed to update address' });
//   }
// });

// DELETE billing address
router.delete('/billing-address/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const del = await BillingAddress.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ error: 'Address not found' });
    res.json({ message: 'Address deleted' });
  } catch (err) {
    console.error('DELETE /billing-address/:id error:', err);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

// =========================== PDF QUOTES ===========================

// Preflight
router.options("/save-pdf", cors());

// Save PDF (memory)
router.post("/save-pdf", cors(), upload.single("pdf"), async (req, res) => {
  try {
    res.set({
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": "Content-Type, Content-Length",
    });

    if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded under field "pdf".' });

    const { originalname = "document.pdf", mimetype = "", buffer } = req.file;

    let metadata = {};
    if (typeof req.body?.metadata === "string" && req.body.metadata.trim()) {
      try { metadata = JSON.parse(req.body.metadata); }
      catch { return res.status(400).json({ ok: false, error: "Invalid JSON in metadata." }); }
    }

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ ok: false, error: "Empty or invalid file buffer." });
    }

    const doc = new PdfQuote({
      filename: originalname,
      contentType: mimetype || "application/pdf",
      pdfBuffer: buffer,
      metadata: metadata || {},
      createdAt: new Date(),
    });

    await doc.save();

    return res.status(200).json({
      ok: true,
      message: "PDF saved to MongoDB successfully",
      id: doc._id,
      filename: originalname,
      bytes: buffer.length,
    });
  } catch (err) {
    console.error("Error saving PDF:", err);
    return res.status(500).json({ ok: false, error: "Failed to save PDF" });
  }
});

// List quotes (no buffer)
router.get('/pdfquotes', async (req, res) => {
  try {
    const { since } = req.query;
    const find = {};
    if (since) {
      const d = new Date(since);
      if (!isNaN(+d)) find.createdAt = { $gte: d };
    }
    const docs = await PdfQuote.find(find)
      .select('_id filename contentType createdAt metadata')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (e) {
    console.error('GET /pdfquotes error:', e);
    res.status(500).json({ error: 'Failed to list quotes' });
  }
});

// Quote details (no buffer)
router.get('/pdfquotes/:id', async (req, res) => {
  try {
    const doc = await PdfQuote.findById(req.params.id)
      .select('_id filename contentType createdAt metadata');
    if (!doc) return res.status(404).json({ error: 'Quote not found' });
    res.json(doc);
  } catch (e) {
    console.error('GET /pdfquotes/:id error:', e);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// Stream quote PDF
router.get('/pdfquotes/:id/file', async (req, res) => {
  try {
    const doc = await PdfQuote.findById(req.params.id).select('filename contentType pdfBuffer');
    if (!doc) return res.status(404).json({ error: 'Quote not found' });
    if (!doc.pdfBuffer) return res.status(404).json({ error: 'PDF data not found' });

    res.setHeader('Content-Disposition', `inline; filename="${doc.filename || 'quote.pdf'}"`);
    res.setHeader('Content-Type', doc.contentType || 'application/pdf');
    res.send(doc.pdfBuffer);
  } catch (e) {
    console.error('GET /pdfquotes/:id/file error:', e);
    res.status(500).json({ error: 'Failed to stream PDF' });
  }
});

// =========================== FX (DOF) ===========================

router.get("/fx/usd-dof", async (req, res) => {
  try {
    const token = process.env.BANXICO_TOKEN;
    if (!token) return res.status(500).json({ error: "Missing BANXICO_TOKEN" });

    const fmt = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 10);

    const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/${fmt(start)}/${fmt(today)}?token=${token}`;

    const { data } = await axios.get(url, { headers: { Accept: "application/json" } });

    const datos = data?.bmx?.series?.[0]?.datos || [];
    if (!datos.length) return res.status(502).json({ error: "No data returned by Banxico." });

    const parsed = datos
      .map((r) => {
        const [dd, mm, yyyy] = r.fecha.split("/");
        return { date: new Date(`${yyyy}-${mm}-${dd}T00:00:00-06:00`), value: r.dato };
      })
      .filter((r) => r.value && !isNaN(Number(r.value)) && r.date < today)
      .sort((a, b) => a.date - b.date);

    if (!parsed.length) return res.status(404).json({ error: "No prior business-day FIX found." });

    const dof = parsed[parsed.length - 1];
    return res.json({
      rate: Number(dof.value),
      date: dof.date.toISOString().slice(0, 10),
      source: "DOF (FIX publicado en DOF el día hábil siguiente)",
      series: "SF43718",
    });
  } catch (err) {
    console.error("Banxico DOF error:", err?.response?.data || err.message);
    return res.status(500).json({ error: "Failed to fetch DOF rate." });
  }
});

// SEP16
router.post("/admin/push/register", async (req, res) => {
  try {
    const { email, token, platform } = req.body || {};
    if (!email || !token) return res.status(400).json({ error: "email and token are required" });

    await AdminPushToken.updateOne(
      { token },
      { $set: { email, token, platform, lastSeenAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("register token error:", err);
    res.status(500).json({ error: "Failed to register token" });
  }
});

// List registered admin push tokens (DIAGNOSTIC)
router.get("/admin/push/tokens", async (_req, res) => {
  try {
    const rows = await AdminPushToken.find().select("email token lastSeenAt createdAt -_id").lean();
    res.json({ count: rows.length, rows });
  } catch (e) {
    console.error("GET /admin/push/tokens error", e);
    res.status(500).json({ error: "Failed to list tokens" });
  }
});

// Send a test push to the recipients of a given stage (DIAGNOSTIC)
// Usage: POST /debug/push?stage=PAGO_VERIFICADO
router.post("/debug/push", async (req, res) => {
  try {
    const stage = String(req.query.stage || STAGES.PAGO_VERIFICADO);
    await notifyStage(stage, "🔔 Test push", `Test for stage ${stage}`, {
      stage,
      deepLink: "https://gisconnect-web.onrender.com/adminHome",
      orderId: "debug"
    });
    res.json({ ok: true, stage });
  } catch (e) {
    console.error("POST /debug/push error", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Send a test push directly to tokens of a specific email (DIAGNOSTIC)
// Usage: POST /debug/push-to-email?email=majo_test@gmail.com
router.post("/debug/push-to-email", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email query param required" });

    const tokens = await AdminPushToken.find({ email }).select("token -_id");
    const tokenList = tokens.map(t => t.token).filter(Boolean);

    if (tokenList.length === 0) {
      return res.status(404).json({ error: `No tokens found for ${email}` });
    }

    const { admin } = require("../notifications/fcm");
    const messaging = admin.messaging();
    const resp = await messaging.sendEachForMulticast({
      tokens: tokenList,
      notification: { title: "🔔 Test (direct)", body: `Hello ${email}` },
      webpush: {
        notification: { title: "🔔 Test (direct)", body: `Hello ${email}` },
        fcmOptions: { link: "https://gisconnect-web.onrender.com/adminHome" },
      },
      data: { email },
    });

    res.json({ ok: true, success: resp.successCount, fail: resp.failureCount });
  } catch (e) {
    console.error("POST /debug/push-to-email error", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ---- DIAGNOSTICS: accept GET & POST so you can hit from a browser ----

// Role-based test push: /debug/push?stage=PAGO_VERIFICADO
async function triggerStagePush(req, res) {
  try {
    const stage = String(req.query.stage || req.body?.stage || STAGES.PAGO_VERIFICADO);
    await notifyStage(stage, "🔔 Test push", `Test for stage ${stage}`, {
      stage,
      deepLink: "https://gisconnect-web.onrender.com/adminHome",
      orderId: "debug",
    });
    res.json({ ok: true, stage });
  } catch (e) {
    console.error("debug push error", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
router.route("/debug/push").get(triggerStagePush).post(triggerStagePush);

// Direct-to-email test: /debug/push-to-email?email=majo_test@gmail.com
async function pushToEmail(req, res) {
  try {
    const email = String(req.query.email || req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email query param required" });

    const rows = await AdminPushToken.find({ email }).select("token -_id");
    // de-dupe tokens to avoid double pings
    const tokenList = [...new Set(rows.map(r => r.token).filter(Boolean))];

    if (tokenList.length === 0) {
      return res.status(404).json({ error: `No tokens found for ${email}` });
    }

    const messaging = admin.messaging();
    const resp = await messaging.sendEachForMulticast({
      tokens: tokenList,
      notification: { title: "🔔 Test (direct)", body: `Hello ${email}` },
      webpush: {
        notification: { title: "🔔 Test (direct)", body: `Hello ${email}` },
        fcmOptions: { link: "https://gisconnect-web.onrender.com/adminHome" },
      },
      data: { email },
    });

    res.json({ ok: true, email, tokens: tokenList.length, success: resp.successCount, fail: resp.failureCount });
  } catch (e) {
    console.error("push-to-email error", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
router.route("/debug/push-to-email").get(pushToEmail).post(pushToEmail);

// ---- end diagnostics ----

// Send a test push directly to a single token (bypasses roles/emails)
router.post("/debug/push-to-token", async (req, res) => {
  try {
    const token = String(req.query.token || req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token query/body param required" });

    const { admin } = require("../notifications/fcm");
    const messaging = admin.messaging();

    const resp = await messaging.sendEachForMulticast({
      tokens: [token],
      notification: { title: "🔔 Test (token)", body: "Direct to this token" },
      webpush: {
        notification: { title: "🔔 Test (token)", body: "Direct to this token" },
        fcmOptions: { link: "https://gisconnect-web.onrender.com/adminHome" },
      },
      data: { kind: "direct-token" },
    });

    res.json({ ok: true, success: resp.successCount, fail: resp.failureCount });
  } catch (e) {
    console.error("push-to-token error", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ---- DEBUG: send directly to a single FCM token (GET or POST) ----
async function pushToToken(req, res) {
  try {
    const token = String(req.query.token || req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token query/body param required" });

    const messaging = admin.messaging();
    const resp = await messaging.sendEachForMulticast({
      tokens: [token],
      notification: { title: "🔔 Test (token)", body: "Direct to this token" },
      webpush: {
        notification: { title: "🔔 Test (token)", body: "Direct to this token" },
        fcmOptions: { link: "https://gisconnect-web.onrender.com/adminHome" },
      },
      data: { kind: "direct-token" },
    });

    res.json({ ok: true, success: resp.successCount, fail: resp.failureCount });
  } catch (e) {
    console.error("push-to-token error", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
router
  .route("/debug/push-to-token")
  .get(pushToToken)
  .post(pushToToken);
// ---- end DEBUG ----

// send a DATA-ONLY test to a token (GET or POST)
router.route("/debug/push-data-to-token").get(pushDataToToken).post(pushDataToToken);

async function pushDataToToken(req, res) {
  try {
    const { admin } = require("../notifications/fcm");
    const token = String(req.query.token || req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token query/body param required" });

    const messaging = admin.messaging();
    const resp = await messaging.sendEachForMulticast({
      tokens: [token],
      // 🚫 no "notification" here — data-only:
      data: {
        title: "🔔 Data-only test",
        body: "Should be shown by onMessage (foreground) or SW (background)",
        deepLink: "https://gisconnect-web.onrender.com/adminHome",
      },
      webpush: {
        fcmOptions: { link: "https://gisconnect-web.onrender.com/adminHome" },
      },
    });

    res.json({ ok: true, success: resp.successCount, fail: resp.failureCount });
  } catch (e) {
    console.error("push-data-to-token error", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

router.get("/debug/firebase-info", (_req, res) => {
  const { PROJECT_ID } = require("../notifications/fcm");
  res.json({ serverProjectId: PROJECT_ID });
});
// SEP16

// oct24
router.post("/admin/webpush/register", async (req, res) => {
  try {
    const { email, subscription } = req.body;
    const userAgent = req.get("user-agent");
    if (!email || !subscription) return res.status(400).json({ ok: false, error: "missing fields" });

    const doc = await WebPushSubscription.upsertForEmail({ email, subscription, userAgent });
    res.json({ ok: true, id: doc._id });
  } catch (e) {
    console.error("webpush/register error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /debug/push-stage?stage=PEDIDO_REALIZADO
router.post("/debug/push-stage", async (req, res) => {
  try {
    const stage = (req.query.stage || "PEDIDO_REALIZADO").toString();
    const title = req.body.title || `Test: ${stage}`;
    const body  = req.body.body  || "Esto es una prueba del flujo de etapa.";
    const data  = req.body.data  || { test: "true" };

    await notifyStage(stage, title, body, data);
    res.json({ ok: true, stage });
  } catch (e) {
    console.error("debug/push-stage error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// server/routes/webpush.js (add below your register handler)
router.get("/admin/webpush/public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
});

router.post("/admin/webpush/unsubscribe", async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ ok:false, error:"missing endpoint" });
    const r = await WebPushSubscription.removeByEndpoint(endpoint);
    res.json({ ok:true, deleted: r.deletedCount || 0 });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

router.post("/admin/webpush/clear-all", async (req, res) => {
  if (process.env.NODE_ENV !== "production") {
    const r = await WebPushSubscription.deleteMany({});
    return res.json({ ok: true, deleted: r.deletedCount || 0 });
  }
  // In production, guard this route behind auth or comment it out after use
  const r = await WebPushSubscription.deleteMany({});
  res.json({ ok: true, deleted: r.deletedCount || 0 });
});

// GET /admin/webpush/list  (diagnostic)
router.get("/admin/webpush/list", async (req, res) => {
  const WebPushSubscription = require("../models/WebPushSubscription");
  const docs = await WebPushSubscription
    .find()
    .select("email subscription.endpoint lastSeenAt -_id")
    .lean();
  res.json({ count: docs.length, rows: docs });
});


// POST /debug/webpush-to-email?email=...
router.post("/debug/webpush-to-email", async (req, res) => {
  try {
    const email = String(req.query.email || req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ ok:false, error:"email required" });

    const WebPushSubscription = require("../models/WebPushSubscription");
    const { sendWebPush } = require("../notifications/webpush");

    const subs = await WebPushSubscription.find({ email }).lean();
    if (!subs.length) return res.status(404).json({ ok:false, error:"no subscriptions for email" });

    const payload = {
      title: "GISConnect (Web Push)",
      body:  "Prueba directa por Web Push",
      icon:  "https://gisconnect-web.onrender.com/icons/icon-192.png",
      data:  { click_action: "https://gisconnect-web.onrender.com/adminHome", debug: "webpush-to-email" }
    };

    const results = [];
    for (const s of subs) {
      try {
        const resp = await sendWebPush(s.subscription, payload);
        results.push({ endpoint: s.subscription.endpoint, ok: true, statusCode: resp?.statusCode });
      } catch (e) {
        results.push({ endpoint: s.subscription.endpoint, ok: false, statusCode: e?.statusCode, reason: e?.body || e?.message });
      }
    }
    res.json({ ok:true, sent: results.length, results });
  } catch (e) {
    console.error("debug/webpush-to-email error:", e);
    res.status(500).json({ ok:false, error: e.message });
  }
});
// Nov24
// helper to decide if a claim is expired
function isExpired(doc) {
  if (!doc?.packing?.claimedAt || !doc?.packing?.leaseMs) return true;
  return (Date.now() - new Date(doc.packing.claimedAt).getTime()) > doc.packing.leaseMs;
}

// POST /orders/:id/claim-pack  { packer: "Oswaldo" }
router.post("/orders/:id/claim-pack", async (req, res) => {
  try {
    const { id } = req.params;
    const packer = String(req.body?.packer || "").trim();
    if (!packer) return res.status(400).json({ ok:false, error: "packer is required" });

    // Load the current order first
    // const order = await NewOrder.findById(id).lean();
    const order = await newOrderModel.findById(id).lean();

    if (!order) return res.status(404).json({ ok:false, error: "Order not found" });
    if ((order.orderStatus || "").toLowerCase() !== "pago verificado") {
      return res.status(409).json({ ok:false, error: "Order is not in 'Pago Verificado' state" });
    }

    // If already in progress & not expired → deny
    if (order.packing?.status === "in_progress" && !isExpired(order)) {
      return res.status(409).json({ 
        ok:false, 
        error: `Order siendo preparada por ${order.packing?.claimedBy || "another packer"}` 
      });
    }

    // Build conditional filter that only succeeds if:
    //  - packing.status != 'in_progress' OR the previous claim is expired (or absent)
    const expiryCutoff = new Date(Date.now() - (order.packing?.leaseMs || 30*60*1000));
    const filter = {
      _id: id,
      $or: [
        { "packing.status": { $ne: "in_progress" } },
        { "packing.claimedAt": { $exists: false } },
        { "packing.claimedAt": { $lt: expiryCutoff } }
      ]
    };

    const update = {
      $set: { 
        "packing.status": "in_progress",
        "packing.claimedBy": packer,
        "packing.claimedAt": new Date(),
        // keep leaseMs as default or allow override per request
      }
    };

    // const claimed = await NewOrder.findOneAndUpdate(filter, update, { new: true });
    const claimed = await newOrderModel.findOneAndUpdate(filter, update, { new: true });
    if (!claimed) {
      return res.status(409).json({ ok:false, error: "Another packer just took this order. Refresh." });
    }

    res.json({ ok:true, order: claimed });
  } catch (e) {
    console.error("claim-pack error:", e);
    res.status(500).json({ ok:false, error: "Failed to claim order" });
  }
});

// POST /orders/:id/release-pack  { packer: "Oswaldo", reason?: "cancel" }
router.post("/orders/:id/release-pack", async (req, res) => {
  try {
    const { id } = req.params;
    const packer = String(req.body?.packer || "").trim();
    if (!packer) return res.status(400).json({ ok:false, error: "packer is required" });

    const filter = { 
      _id: id, 
      "packing.status": "in_progress", 
      "packing.claimedBy": packer 
    };
    const update = {
      $set: { "packing.status": "waiting" },
      $unset: { "packing.claimedBy": "", "packing.claimedAt": "" }
    };
    // const released = await NewOrder.findOneAndUpdate(filter, update, { new: true });
    const released = await newOrderModel.findOneAndUpdate(filter, update, { new: true });
    if (!released) {
      return res.status(409).json({ ok:false, error: "Not holder or order not in progress" });
    }
    res.json({ ok:true, order: released });
  } catch (e) {
    console.error("release-pack error:", e);
    res.status(500).json({ ok:false, error: "Failed to release order" });
  }
});

// POST /orders/:id/mark-ready  { packer: "Oswaldo" }
// when they finish (your existing handleMarkAsReady can call this at the end)
router.post("/orders/:id/mark-ready", async (req, res) => {
  try {
    const { id } = req.params;
    const packer = String(req.body?.packer || "").trim();

    const filter = { _id: id };
    const update = { 
      $set: { 
        "packing.status": "ready",
        ...(packer ? { "packing.claimedBy": packer } : {})
      }
    };
    // const doc = await NewOrder.findOneAndUpdate(filter, update, { new: true });
    const doc = await newOrderModel.findOneAndUpdate(filter, update, { new: true });
    res.json({ ok:true, order: doc });
  } catch (e) {
    console.error("mark-ready error:", e);
    res.status(500).json({ ok:false, error: "Failed to mark ready" });
  }
});
// Nov24

// Claim delivery (atomic, no state checks beyond "is it already claimed by someone else?")
router.post("/orders/:id/claim-delivery", async (req, res) => {
  try {
    const { id } = req.params;
    const { deliverer } = req.body || {};
    if (!deliverer) return res.status(400).json({ error: "Missing deliverer" });

    // Try to claim if:
    //  - currently NOT in_progress, OR
    //  - it's already claimed by THIS deliverer (idempotent)
    const now = new Date();
    const updated = await newOrderModel.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { "deliveryWork.status": { $ne: "in_progress" } },
          { "deliveryWork.claimedBy": deliverer }
        ],
      },
      {
        $set: {
          "deliveryWork.status": "in_progress",
          "deliveryWork.claimedBy": deliverer,
          "deliveryWork.claimedAt": now,
        },
      },
      { new: true }
    );

    if (updated) {
      return res.json({ ok: true, order: updated });
    }

    // If not updated, find who holds it to show nice 409
    const current = await newOrderModel.findById(id).select("deliveryWork").lean();
    const holder = current?.deliveryWork?.claimedBy || "otro encargado";
    return res.status(409).json({ error: `Este pedido está siendo entregado por ${holder}.` });
  } catch (e) {
    console.error("claim-delivery error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Release delivery (only the current holder can release)
router.post("/orders/:id/release-delivery", async (req, res) => {
  try {
    const { id } = req.params;
    const { deliverer } = req.body || {};

    const updated = await newOrderModel.findOneAndUpdate(
      {
        _id: id,
        "deliveryWork.status": "in_progress",
        "deliveryWork.claimedBy": deliverer, // only holder can release
      },
      {
        $set: {
          "deliveryWork.status": "waiting",
          "deliveryWork.claimedBy": "",
          "deliveryWork.claimedAt": null,
        },
      },
      { new: true }
    );

    if (!updated) {
      // Either not found or not held by this user
      const current = await newOrderModel.findById(id).select("deliveryWork").lean();
      if (!current) return res.status(404).json({ error: "Order not found" });
      return res.status(403).json({ error: "Solo quien tomó el pedido puede liberarlo." });
    }

    return res.json({ ok: true, order: updated });
  } catch (e) {
    console.error("release-delivery error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// FEB16
// -----------------------------
// Drive helpers
// -----------------------------
function extractDriveFileId(rawUrl = "") {
  const url = String(rawUrl || "").trim();
  if (!url) return "";

  // /file/d/<id>/
  const m1 = url.match(/\/file\/d\/([^/]+)/);
  if (m1?.[1]) return m1[1];

  // ?id=<id>
  const m2 = url.match(/[?&]id=([^&]+)/);
  if (m2?.[1]) return m2[1];

  // uc?id=<id>
  const m3 = url.match(/drive\.google\.com\/uc\?id=([^&]+)/);
  if (m3?.[1]) return m3[1];

  return "";
}

function toDriveDirectDownloadUrl(rawUrl = "") {
  const url = String(rawUrl || "").trim();
  if (!url) return "";

  // Already direct-ish
  if (url.includes("drive.google.com/uc?")) {
    // ensure export=download
    if (!url.includes("export=download")) {
      const id = extractDriveFileId(url);
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    }
    return url;
  }

  const id = extractDriveFileId(url);
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;

  // Not Drive
  return url;
}

function safeName(s) {
  return String(s || "")
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 140) || "documento.pdf";
}

// -----------------------------
// ✅ Single PDF proxy
// GET /drive/pdf?url=<driveUrl>&filename=<optional>
// -----------------------------
router.get("/drive/pdf", async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: "Missing url" });

    const filename = safeName(req.query.filename || "documento.pdf");
    const direct = toDriveDirectDownloadUrl(rawUrl);

    const r = await fetch(direct, { redirect: "follow" });
    if (!r.ok) {
      return res.status(502).json({ error: `Drive fetch failed ${r.status}` });
    }

    const contentType = r.headers.get("content-type") || "application/pdf";
    const buf = Buffer.from(await r.arrayBuffer());

    // If Drive returns HTML, it’s usually a permissions/viewer page
    if (String(contentType).includes("text/html")) {
      return res.status(403).json({
        error:
          "Drive devolvió HTML en lugar de PDF. Revisa que el archivo esté público (Cualquiera con el link) y sea PDF.",
      });
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (e) {
    console.error("drive/pdf error:", e);
    res.status(500).json({ error: "Proxy error" });
  }
});

// -----------------------------
// ✅ ZIP proxy
// POST /drive/zip  body: { files: [{ url, filename }] }
// -----------------------------
router.post("/drive/zip", async (req, res) => {
  try {
    const files = req.body?.files;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "Missing files[]" });
    }

    const zipName = safeName(req.body?.zipName || "documentos.zip");

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("archiver error:", err);
      try { res.status(500).end(); } catch {}
    });

    archive.pipe(res);

    let added = 0;

    for (const f of files) {
      const rawUrl = f?.url;
      const fname = safeName(f?.filename || "documento.pdf");
      if (!rawUrl) continue;

      const direct = toDriveDirectDownloadUrl(rawUrl);

      try {
        const r = await fetch(direct, { redirect: "follow" });
        if (!r.ok) continue;

        const ct = r.headers.get("content-type") || "";
        const buf = Buffer.from(await r.arrayBuffer());

        // Skip HTML responses (Drive viewer pages)
        if (String(ct).includes("text/html")) continue;

        archive.append(buf, { name: fname.endsWith(".pdf") ? fname : `${fname}.pdf` });
        added++;
      } catch (e) {
        console.warn("zip file fetch failed:", fname, e?.message);
      }
    }

    if (added === 0) {
      // create a small readme instead of empty zip
      archive.append(
        "No se pudo descargar ningún PDF. Revisa permisos en Drive (Cualquiera con el link).\n",
        { name: "README.txt" }
      );
    }

    await archive.finalize();
  } catch (e) {
    console.error("drive/zip error:", e);
    res.status(500).json({ error: "ZIP proxy error" });
  }
});
// FEB16

// // Claim delivery
// router.post("/orders/:id/claim-delivery", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { deliverer } = req.body || {};
//     if (!deliverer) return res.status(400).json({ error: "Missing deliverer" });

//     const order = await newOrderModel.findById(id).lean();
//     if (!order) return res.status(404).json({ error: "Order not found" });

//     // Ensure subdoc exists
//     order.deliveryWork = order.deliveryWork || { status: "idle", claimedBy: "" };

//     // If someone else already has it, block
//     if (order.deliveryWork.status === "in_progress" &&
//         order.deliveryWork.claimedBy &&
//         order.deliveryWork.claimedBy !== deliverer) {
//       return res.status(409).json({ error: `Este pedido está siendo entregado por ${order.deliveryWork.claimedBy}.` });
//     }

//     // Claim it
//     order.deliveryWork.status = "in_progress";
//     order.deliveryWork.claimedBy = deliverer;
//     await newOrderModel.save();

//     return res.json({ ok: true, order });
//   } catch (e) {
//     console.error("claim-delivery error:", e);
//     return res.status(500).json({ error: "Server error" });
//   }
// });

// // Release delivery
// router.post("/orders/:id/release-delivery", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { deliverer } = req.body || {};
//     const order = await Order.findById(id);
//     if (!order) return res.status(404).json({ error: "Order not found" });

//     order.deliveryWork = newOrderModel.deliveryWork || { status: "idle", claimedBy: "" };

//     // Only the current holder can release
//     if (order.deliveryWork.claimedBy && order.deliveryWork.claimedBy !== deliverer) {
//       return res.status(403).json({ error: "Solo quien tomó el pedido puede liberarlo." });
//     }

//     order.deliveryWork.status = "idle";
//     order.deliveryWork.claimedBy = "";
//     await newOrderModel.save();

//     return res.json({ ok: true, order });
//   } catch (e) {
//     console.error("release-delivery error:", e);
//     return res.status(500).json({ error: "Server error" });
//   }
// });

module.exports = router;




// OFF SEP11 
// const express = require('express')
// const cors = require('cors')

// const router = express.Router()
// const mongoose = require('mongoose')
// const bcrypt = require('bcryptjs')
// const jwt = require('jsonwebtoken')
// const verifyToken = require("../verifyToken")

// const multer = require("multer")
// const path = require('path')
// // sep10
// const fs = require("fs");
// // sep10

// // jul29
// const crypto = require("crypto");
// const nodemailer = require("nodemailer");
// // jul29
// // BASE ROUTES END

// // GISCONNECT
// const axios = require("axios");

// const newUserModel = require("../models/newUserModel")
// const newOrderModel = require("../models/orderModel")
// const Order = require("../models/orderEvidenceModel"); // Adjust path if needed
// const ShippingAddress = require("../models/ShippingAddress"); // <- you'll create this model
// const BillingAddress = require("../models/BillingAddress"); // <- you'll create this model
// const PdfQuote = require("../models/pdfQuoteModel"); // <- you'll create this model
// // const Hold = require("../models/Hold");
// // const { pushHoldsToSheets, applyPermanentDecrement } = require("../services/sheetsBridge");

// // GISCONNECT END
// // SEP10
// // If you already created these helpers, use the imports below:
// // const { sendToTopic } = require("../utils/fcm");          // <-- make sure path is correct
// // const { roleTopics, rolesForStage } = require("../utils/roles");

// // If you DON'T have the helpers/files above, you can TEMPORARILY inline these maps:

// const roleTopics = {
//   FULL_ACCESS: "role-full-access",
//   ADMIN_FACTURAS_Y_LOGISTICA: "role-admin-facturas-logistica",
//   LOGISTICA_Y_ALMACEN: "role-logistica-almacen",
//   ALMACEN_LIMITADO: "role-almacen-limitado",
// };
// const rolesForStage = (stage) => {
//   switch (stage) {
//     case "EVIDENCIA_PAGO":            return ["FULL_ACCESS"];
//     case "PAGO_VERIFICADO":           return ["ADMIN_FACTURAS_Y_LOGISTICA", "LOGISTICA_Y_ALMACEN", "ALMACEN_LIMITADO"];
//     case "PREPARANDO_PEDIDO":         return ["ADMIN_FACTURAS_Y_LOGISTICA"];
//     case "ETIQUETA_GENERADA":         return ["LOGISTICA_Y_ALMACEN"];
//     case "PEDIDO_ENTREGADO":          return ["FULL_ACCESS"];
//     default:                          return [];
//   }
// };
// const { sendOrderStageNotifications } = require('../notifications/fcm');
// // const { sendToTopic } = require("../utils/fcm"); // still needed for actual send
// // SEP10

// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//     // destination: function (req, res, cb) {
//         cb(null, './files')
//     },
//     filename: (req, file, cb) => {
//         // cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname))
//         cb(null, file.originalname)


//     // filename: function (req, file, cb) {
//         // const uniqueSuffix = Date.now()
//         // cb(null, uniqueSuffix+file.originalname)
//     }
// })
// // MODIF AUG13
// // const upload = multer({ storage: storage })

// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 15 * 1024 * 1024 }, // 15MB, tweak as needed
// });
// // END MODIF AUG13

// // router.post("/upload-files", upload.single("folioPDF"), async (req,res) => {
// //     console.log(req.file)
// // })
// //END APR04

// //USER RELATED API's

// // GISCONNECT START!
// //API || ENDPOINT FOR REGISTERING USER & PASSWORD HASHING
// router.post('/register', (req,res) => {
//     let user = req.body
//     console.log(user)

//     bcrypt.genSalt(10,(err,salt) => {
//         if(!err)
//         {
//             bcrypt.hash(user.contrasena, salt, (err,hpass) => {
//                 if(!err)
//                 {
//                     user.contrasena = hpass

//                     newUserModel.create(user)
//                     .then((doc) => {
//                         res.status(201).send({message:"¡Usuario registrado exitosamente!"})
//                     })
//                     .catch((err) => {
//                         console.log(err)
//                         res.status(500).send({message:"Encountered a problem while registering user"})
//                     })
//                 }
//             })
//         }
//     })
// })

// //API || ENDPOINT FOR LOGIN
// // POST /login  (direct replacement)
// router.post('/login', async (req, res) => {
//   try {
//     const { correo, contrasena } = req.body || {};
//     if (!correo || !contrasena) {
//       return res.status(400).json({ message: "Faltan credenciales (correo y contraseña)." });
//     }

//     const user = await newUserModel.findOne({ correo });
//     if (!user) {
//       return res.status(404).json({ message: "El usuario no se encontró" });
//     }

//     const stored = user.contrasena || "";
//     const looksHashed = /^\$2[aby]\$\d{2}\$.{53}$/.test(stored); // bcrypt format

//     let authOK = false;
//     if (looksHashed) {
//       // bcrypt flow
//       try {
//         authOK = await bcrypt.compare(contrasena, stored);
//       } catch (e) {
//         // if something odd with hash, fail closed
//         authOK = false;
//       }
//     } else {
//       // plain-text fallback (temporary until you migrate)
//       authOK = (contrasena === stored);
//     }

//     if (!authOK) {
//       return res.status(403).json({ message: "Contraseña incorrecta!" });
//     }

//     // Build token
//     const jwtSecret = process.env.JWT_SECRET || "kangarookey";
//     const token = jwt.sign(
//       { correo: user.correo, id: user._id },
//       jwtSecret,
//       { expiresIn: "30d" }
//     );

//     // Return a bit more data so client can use it if needed
//     return res.json({
//       token,
//       correo: user.correo,
//       nombre: user.nombre,
//       empresa: user.empresa,
//       // Add role/isAdmin if you later store it on user:
//       // role: user.role || "user",
//       // isAdmin: user.role === "admin",
//     });
//   } catch (err) {
//     console.error("Login error:", err);
//     return res.status(500).json({ message: "Encountered some problem!" });
//   }
// });

// // router.post('/login', (req, res) => {
// //     let userCred = req.body
// //     console.log(userCred)

// //     newUserModel.findOne({correo:userCred.correo})
// //     .then((user) => {
// //         if(user !==null) {
// //             bcrypt.compare(userCred.contrasena, user.contrasena, (err, result) => {
// //                 if(result===true) {
// //                     //TOKEN GENERATION
// //                     jwt.sign({correo:userCred.correo}, "kangarookey", (err, token) => {
// //                         if(!err) {
// //                             res.send({token:token})
// //                         }
// //                         else {
// //                             res.status(500).send({message: " Some problem while creating token. Please try again"})
// //                         }
// //                     })
// //                 }
// //                 else {
// //                     res.status(403).send({message: "Contraseña incorrecta!"})
// //                 }
// //             })
// //         }
// //         else {
// //             res.status(404).send({message: "El usuario no se encontró"})
// //         }
// //     })
// //     .catch((err) => {
// //         console.log(err)
// //         res.send({message: "Encountered some problem!"})
// //     })
// // })

// // ENDPOINT FOR RESTORING FORGOTTEN PASSWORD
// router.post("/forgot-password", async (req, res) => {
//     const { email } = req.body;
  
//     try {
//       const user = await newUserModel.findOne({ correo: email });
//       if (!user) return res.status(404).json({ message: "Correo no registrado." });
  
//       // Create token
//       const token = crypto.randomBytes(32).toString("hex");
//       user.resetPasswordToken = token;
//       user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
//       await user.save();
  
//       const resetLink = `https://gisconnect-web.onrender.com/reset-password/${token}`;
//       // const resetLink = `http://localhost:5173/reset-password/${token}`; // adjust if hosted
  
//       // Send email
//       const transporter = nodemailer.createTransport({
//         service: "Gmail",
//         auth: {
//           user: "kangaroo.cacti@gmail.com",
//           pass: "bebt svht sgmq ezlz" // use environment variable in prod!
//         }
//       });
  
//       const mailOptions = {
//         to: email,
//         from: "no-reply@gisconnect.com",
//         subject: "Restablecimiento de contraseña",
//         text: `Recibimos una solicitud para restablecer tu contraseña. Haz click en el siguiente enlace: ${resetLink}`
//       };
  
//       await transporter.sendMail(mailOptions);
  
//       res.status(200).json({ message: "Correo enviado. Revisa tu bandeja de entrada." });
//     } catch (err) {
//       console.error("Forgot password error:", err);
//       res.status(500).json({ message: "Error al procesar la solicitud." });
//     }
// });

// // ENDPOINT FOR RESETING USER PASSWORD
// router.post("/reset-password", async (req, res) => {
//     const { token, password } = req.body;
  
//     try {
//       const user = await newUserModel.findOne({
//         resetPasswordToken: token,
//         resetPasswordExpires: { $gt: Date.now() }
//       });
  
//       if (!user) return res.status(400).json({ message: "Token inválido o expirado." });
  
//       const hashedPassword = await bcrypt.hash(password, 10);
//       user.contrasena = hashedPassword;
//       user.resetPasswordToken = undefined;
//       user.resetPasswordExpires = undefined;
//       await user.save();
  
//       res.json({ success: true, message: "Contraseña actualizada con éxito." });
//     } catch (err) {
//       console.error("Reset password error:", err);
//       res.status(500).json({ message: "Error al actualizar la contraseña." });
//     }
//   });

// //TOKEN VERIFIED ENDPOINT EXAMPLE --> MAKE SURE TO DELETE!!
// router.get('/getdata', verifyToken, (req,res) => {
//     res.send({message:"Bad dev with good heart"})
// })

// //ENDPOINT FOR FETCHING FULL COLLECTION DATA
// router.get('/register', (req,res) => {
//     newUserModel.find()
//     .then((projects) => {
//         res.send(projects)
//         console.log(projects);
//     })
//     .catch((err) => {
//         console.log(err);
//         res.send({message:"Couldn't fetch projects"})
//     })
// })

// // SEP06
// router.get('/users/by-email', async (req, res) => {
//   try {
//     const email = String(req.query.email || '').trim().toLowerCase();
//     if (!email) return res.status(400).json({ error: 'Missing email' });

//     const user = await newUserModel.findOne({ correo: email }).lean();
//     if (!user) return res.status(404).json({ error: 'User not found' });

//     return res.json(user);
//   } catch (err) {
//     console.error('GET /users/by-email error:', err);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// });

// // PUT /users/shipping-prefs
// router.put('/users/shipping-prefs', async (req, res) => {
//   try {
//     // Accept both shapes:
//     // { email, shippingPreferences: { preferredCarrier, insureShipment } }
//     // or flat: { email, preferredCarrier, insureShipment }
//     const email = String(req.body?.email || '').trim().toLowerCase();
//     if (!email) return res.status(400).json({ error: 'Email is required' });

//     const nested = req.body?.shippingPreferences || {};
//     const preferredCarrier = String(nested.preferredCarrier ?? req.body?.preferredCarrier ?? '').trim();
//     const insureShipment = !!(nested.insureShipment ?? req.body?.insureShipment);

//     // Validate carrier (optional)
//     // if (!preferredCarrier) return res.status(400).json({ error: 'preferredCarrier is required' });

//     const updated = await newUserModel.findOneAndUpdate(
//       { correo: email },
//       {
//         $set: {
//           'shippingPreferences.preferredCarrier': preferredCarrier,
//           'shippingPreferences.insureShipment': insureShipment,
//         },
//       },
//       { new: true, runValidators: true }
//     );

//     if (!updated) return res.status(404).json({ error: 'User not found' });
//     return res.json(updated);
//   } catch (err) {
//     console.error('PUT /users/shipping-prefs error:', err);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// });
// // ================== USERS: fetch by email ==================
// // GET /users/by-email?email=user@domain.com
// // router.get('/users/by-email', async (req, res) => {
// //   try {
// //     const raw = (req.query.email || '').trim();
// //     if (!raw) return res.status(400).json({ error: 'Missing email query param' });

// //     const email = raw.toLowerCase();

// //     // Try common field names your app might be using
// //     // Adjust field names if your newUserModel schema differs.
// //     const user = await newUserModel.findOne({
// //       $or: [
// //         { correo: email },            // typical field used across your app
// //         { email },                    // alternative
// //         { 'contact.email': email },   // if you stored it nested
// //       ],
// //     }).lean();

// //     if (!user) return res.status(404).json({ error: 'User not found' });

// //     res.json(user);
// //   } catch (err) {
// //     console.error('GET /users/by-email error:', err);
// //     res.status(500).json({ error: 'Failed to fetch user' });
// //   }
// // });


// // // ================== USERS: update shipping preferences ==================
// // // PUT /users/shipping-prefs
// // // Body: { email, preferredCarrier, insureShipment }
// // router.put("/users/shipping-prefs", async (req, res) => {
// //   try {
// //     const { email, preferredCarrier, insureShipment } = req.body;

// //     if (!email) {
// //       return res.status(400).json({ error: "Email is required" });
// //     }

// //     const updated = await newUserModel.findOneAndUpdate(
// //       { correo: email },
// //       {
// //         $set: {
// //           shippingPreferences: {
// //             preferredCarrier: preferredCarrier?.trim() || "",
// //             insureShipment: !!insureShipment,
// //           },
// //         },
// //       },
// //       { new: true }
// //     );

// //     if (!updated) {
// //       return res.status(404).json({ error: "User not found" });
// //     }

// //     res.json(updated);
// //   } catch (err) {
// //     console.error("Update shipping prefs error:", err);
// //     res.status(500).json({ error: "Internal server error" });
// //   }
// // });

// // -------

// // router.put('/users/shipping-prefs', async (req, res) => {
// //   try {
// //     const { email: rawEmail, preferredCarrier, insureShipment } = req.body || {};
// //     if (!rawEmail) return res.status(400).json({ error: 'Missing "email" in body' });

// //     const email = String(rawEmail).toLowerCase().trim();

// //     // Build update doc (keep both nested + flat for backward compatibility)
// //     const update = {
// //       $set: {
// //         shippingPreferences: {
// //           preferredCarrier: preferredCarrier || '',
// //           insureShipment: !!insureShipment,
// //         },
// //         preferredCarrier: preferredCarrier || '',
// //         insureShipment: !!insureShipment,
// //       },
// //     };

// //     // If you want to require existing users, use upsert:false (current)
// //     // If you want to auto-create a user when not found, set upsert:true
// //     const options = { new: true, upsert: false };

// //     const updated = await newUserModel.findOneAndUpdate(
// //       {
// //         $or: [
// //           { correo: email },
// //           { email },
// //           { 'contact.email': email },
// //         ],
// //       },
// //       update,
// //       options
// //     ).lean();

// //     if (!updated) {
// //       return res.status(404).json({ error: 'User not found for update' });
// //     }

// //     res.json({ message: 'Shipping preferences updated', data: updated });
// //   } catch (err) {
// //     console.error('PUT /users/shipping-prefs error:', err);
// //     res.status(500).json({ error: 'Failed to update shipping preferences' });
// //   }
// // });

// // SEP06

// // ENDPOINT FOR UPLOADING A NEW ORDER INTO MONGO
// router.post('/orderDets', upload.single('pdf'), async (req, res) => {
//   try {
//     const raw = req.body.order;
//     if (!raw) return res.status(400).json({ error: 'Missing order JSON in "order" field' });

//     const order = JSON.parse(raw);
//    // Normalize/stabilize email so reads match writes
//    if (order && order.userEmail) {
//      order.userEmail = String(order.userEmail).trim().toLowerCase();
//    }

//     if (req.file) {
//       const { originalname, mimetype, buffer } = req.file;
//       order.quotePdf = { filename: originalname, contentType: mimetype, data: buffer };
//     }

//     const created = await newOrderModel.create(order);
//     res.status(201).json({ data: created, message: "Nueva orden registrada exitosamente" });
//   } catch (err) {
//     console.error("Error creating order:", err);
//     res.status(500).json({ error: "Failed to create order" });
//   }
// });

// // OFF SEP02 - 1:13
// // Create order + (optional) PDF upload
// // router.post('/orderDets', upload.single('pdf'), async (req, res) => {
// //   try {
// //     // --- 1) Parse the "order" field (multipart text). Be tolerant. ---
// //     let orderRaw = req.body?.order;
// //     if (!orderRaw) {
// //       return res.status(400).json({ error: 'Missing order JSON in "order" field.' });
// //     }

// //     let order;
// //     try {
// //       // Some engines may already send it as object; most send it as string.
// //       order = typeof orderRaw === 'string' ? JSON.parse(orderRaw) : orderRaw;
// //     } catch (e) {
// //       return res.status(400).json({ error: 'Invalid JSON in "order" field.' });
// //     }

// //     // --- 2) Optional PDF (multer memoryStorage provides buffer) ---
// //     if (req.file && req.file.buffer) {
// //       const { originalname, mimetype, buffer } = req.file;
// //       order.quotePdf = {
// //         filename: originalname || "order_summary.pdf",
// //         contentType: mimetype || "application/pdf",
// //         data: buffer,
// //       };
// //     }

// //     // --- 3) Minimal normalization / defaults (don’t overwrite user intent) ---
// //     if (!order.orderDate) order.orderDate = new Date().toISOString();
// //     if (!order.orderStatus) order.orderStatus = "Pedido Realizado";

// //     // --- 4) Persist ---
// //     const created = await newOrderModel.create(order);

// //     // --- 5) Reply (stable shape + id surfaced) ---
// //     return res.status(201).json({
// //       message: "Nueva orden registrada exitosamente",
// //       data: created,
// //       id: created?._id,
// //     });
// //   } catch (err) {
// //     console.error("Error creating order:", err);
// //     // Try to surface a bit more detail for client logs (but keep it safe)
// //     return res.status(500).json({ error: "Failed to create order" });
// //   }
// // });
// // OFF SEP02 - 1:13

// // OFF SEP01 - 5:22
// // router.post('/orderDets', upload.single('pdf'), async (req, res) => {
// //   try {
// //     // 1) Parse order JSON from the "order" field
// //     const raw = req.body.order
// //     if (!raw) {
// //       return res.status(400).json({ error: 'Missing order JSON in "order" field' })
// //     }
// //     const order = JSON.parse(raw)

// //     // 2) If a PDF was sent, embed it
// //     if (req.file) {
// //       const { originalname, mimetype, buffer } = req.file
// //       order.quotePdf = {
// //         filename: originalname,
// //         contentType: mimetype,
// //         data: buffer,
// //       }
// //     }

// //     // 3) Create order
// //     const created = await newOrderModel.create(order)
// //     res.status(201).json({ data: created, message: "Nueva orden registrada exitosamente" })
// //   } catch (err) {
// //     console.error("Error creating order:", err)
// //     res.status(500).json({ error: "Failed to create order" })
// //   }
// // })
// // OFF SEP01 - 5:22

// // router.post('/orderDets', (req,res) => {
// //     let newOrder = req.body
// //     console.log(newOrder)
    
// //     newOrderModel.create({...req.body})
// //     .then((data) => {
// //         res.send({data:data,message:"Nueva orden registrada exitosamente"})
// //         console.log(data);
// //         console.log("New order created!");
// //     })
// //     .catch((err) => {
// //         console.log(err);
// //     })
// // })

// // ENDPOINT FOR UPLOADING ORDER STATUS
// // PATCH /order/:id/status
// router.patch("/order/:id/status", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { orderStatus } = req.body;
//     if (!orderStatus) return res.status(400).json({ message: "orderStatus requerido" });

//     const updated = await newOrderModel.findByIdAndUpdate(
//       id,
//       { orderStatus },
//       { new: true }
//     );

//     if (!updated) return res.status(404).json({ message: "Orden no encontrada" });

//     res.json({ message: "Estatus actualizado", order: updated });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ message: "Error interno" });
//   }
// });

// // SEP02 - 1:15
// // GET /userOrders?email=<email>
// router.get('/userOrders', async (req, res) => {
//   try {
//     const email = String(req.query.email || '').trim().toLowerCase();
//     if (!email) return res.status(400).json({ error: 'email is required' });

//     const orders = await newOrderModel
//       .find({ userEmail: email })
//       .sort({ orderDate: -1 })
//       .lean();

//     res.json(Array.isArray(orders) ? orders : []);
//   } catch (err) {
//     console.error('Error fetching user orders:', err);
//     res.status(500).json({ error: 'Failed to fetch user orders' });
//   }
// });

// // router.get("/userOrders", async (req, res) => {
// //     const { email } = req.query;
// //     try {
// //         const orders = await newOrderModel.find({ userEmail : email }); // 👈 Adjust field as needed
// //         res.json(orders);
// //     } catch (error) {
// //         console.error("Error fetching orders:", error);
// //         res.status(500).json({ message: "Error fetching orders" });
// //     }
// // });
// // SEP02 - 1:15

// // POST endpoint to receive invoice PDF
// router.post("/upload-invoice", upload.single("invoicePDF"), async (req, res) => {
//     try {
//       const orderId = req.body.orderId;
//       const filePath = req.file.path;
  
//       const updatedOrder = await newOrderModel.findByIdAndUpdate(
//         orderId,
//         { invoiceFilePath: filePath },
//         { new: true }
//       );
  
//       if (!updatedOrder) {
//         return res.status(404).json({ message: "Order not found" });
//       }
  
//       res.status(200).json({ message: "Invoice uploaded successfully", path: filePath });
//     } catch (err) {
//       console.error("Error uploading invoice:", err);
//       res.status(500).json({ message: "Failed to upload invoice" });
//     }
//   });

// // Upload Evidence Endpoint
// router.post("/upload-evidence", upload.single("evidenceImage"), async (req, res) => {
//   try {
//     const { orderId } = req.body;
//     const file = req.file;

//     console.log("Received orderId:", orderId);
//     console.log("Received file:", file && {
//       originalname: file.originalname,
//       mimetype: file.mimetype,
//       size: file.size
//     });

//     if (!orderId) {
//       return res.status(400).json({ message: "Order ID not provided" });
//     }

//     if (!file) {
//       return res.status(400).json({ message: "No file uploaded" });
//     }

//     // Find order (no update yet)
//     const order = await newOrderModel.findById(orderId);
//     if (!order) {
//       return res.status(404).json({ message: "Order not found" });
//     }

//     // If using memoryStorage, the bytes are in file.buffer
//     order.evidenceFile = {
//       filename: file.originalname,
//       mimetype: file.mimetype,
//       data: file.buffer, // <— no fs.readFileSync, no file.path needed
//       uploadedAt: new Date()
//     };

//     await order.save();

//     return res.status(200).json({ message: "Evidencia guardada en MongoDB correctamente" });
//   } catch (error) {
//     console.error("Upload Evidence Error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// // ENDPOINT FOR UPLOADING A NEW SHIPPING ADDRESS
// router.post("/shipping-address", async (req, res) => {
//     const { userEmail, ...addressData } = req.body;
  
//     if (!userEmail) return res.status(400).json({ message: "Email is required" });
  
//     try {
//       const newAddress = new ShippingAddress({ userEmail, ...addressData });
//       await newAddress.save();
//       res.status(201).json({ message: "Address saved" });
//     } catch (err) {
//       console.error("Save address error:", err);
//       res.status(500).json({ message: "Error saving address" });
//     }
//   });

// // ENDPOINT FOR RETRIEVING ALTERNATE SHIPPING ADDRESS
// router.get('/shipping-address/:email', async (req, res) => {
//     try {
//       const email = req.params.email;
//       const addresses = await ShippingAddress.find({ userEmail: email });
//       res.json(addresses);
//     } catch (error) {
//       console.error("Error fetching billing addresses:", error);
//       res.status(500).json({ error: "Server error" });
//     }
//   });

// // ENDPOINT FOR UPLOADING A NEW BILLING ADDRESS
// router.post("/billing-address", async (req, res) => {
//     const { userEmail, ...addressData } = req.body;

//     if (!userEmail) return res.status(400).json({ message: "Email is required" });
  
//     try {
//       const newAddress = new BillingAddress({ userEmail, ...addressData });
//       await newAddress.save();
//       res.status(201).json({ message: "Address saved" });
//     } catch (err) {
//       console.error("Save address error:", err);
//       res.status(500).json({ message: "Error saving address" });
//     }
//   });

// // ENDPOINT FOR RETRIEVING ALTERNATE BILLING ADDRESS
// router.get('/billing-address/:email', async (req, res) => {
//     try {
//       const email = req.params.email;
//       const addresses = await BillingAddress.find({ userEmail: email });
//       res.json(addresses);
//     } catch (error) {
//       console.error("Error fetching billing addresses:", error);
//       res.status(500).json({ error: "Server error" });
//     }
//   });

// // ENDPOINT FOR RETRIEVING ALL NEW ORDERS - ADMIN SIDE
// // SEP02 - 2:17
// router.get('/orders', async (req, res) => {
//   try {
//     const email = (req.query.email || "").trim();

//     // prevent SW/proxies from caching user-specific lists
//     res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
//     res.setHeader("Pragma", "no-cache");
//     res.setHeader("Expires", "0");
//     res.setHeader("Surrogate-Control", "no-store");

//     const findQuery = email ? { userEmail: email } : {};
//     const orders = await newOrderModel
//       .find(findQuery)
//       .sort({ orderDate: -1, _id: -1 });

//     return res.json(orders);
//   } catch (err) {
//     console.error("Error fetching orders:", err);
//     return res.status(500).json({ error: "Error fetching orders" });
//   }
// });
// // router.get('/orders', async (req, res) => {
// //     try {
// //       const orders = await newOrderModel.find().sort({ orderDate: -1 });
// //       res.json(orders);
// //     } catch (err) {
// //       res.status(500).json({ error: 'Error fetching orders' });
// //     }
// //   });
// // SEP02 - 2:17

// // ENDPOINT FOR RETRIEVING ALL DETAILS OF EACH ORDER - ADMIN SIDE
// router.get('/orders/:id', async (req, res) => {
//     const orderId = req.params.id;
//     try {
//       const order = await newOrderModel.findById(orderId);
//       if (!order) {
//         return res.status(404).json({ message: "Order not found" });
//       }
  
//       // If you want to include related data (customer info, etc.), ensure your model returns it
//       // or manually attach it here if needed.
  
//       res.json(order);
//     } catch (error) {
//       console.error("Error fetching order by ID:", error);
//       res.status(500).json({ message: "Error retrieving order data" });
//     }
//   });

// // ENDPOINT FOR UPDATING ORDER AT PAYMENT VALIDATION STAGE - ADMIN SIDE
// // ----> SEP10 MODIFS AREA!
// // For step 5: "Fire notifications from your existing order update logic" you mention that I need to hook up extra code to my existing "PUT /orders/:orderId". This is my current piece of code, can you help me direct edit 
// router.put(
//   "/orders/:orderId",
//   upload.fields([
//     { name: "evidenceImage", maxCount: 1 },  // user's payment evidence
//     { name: "packingImages", maxCount: 3 },  // up to 3 packing images
//     { name: "deliveryImage", maxCount: 1 },  // carrier/shipping evidence
//   ]),
//   async (req, res) => {
//     const { orderId } = req.params;
//     const {
//       paymentMethod,
//       paymentAccount,
//       orderStatus,
//       packerName,
//       insuredAmount,
//       deliveryDate,
//       trackingNumber,
//     } = req.body;

//     // helper: convert a multer file to { filename, mimetype, data, uploadedAt }
//     const fileToDoc = (file) => {
//       if (!file) return null;
//       let buffer = file.buffer || null;
//       if (!buffer && file.path) {
//         const abs = path.isAbsolute(file.path) ? file.path : path.join(__dirname, "..", file.path);
//         buffer = fs.readFileSync(abs);
//         try { fs.unlinkSync(abs); } catch (_) {}
//       }
//       if (!buffer) return null;
//       return {
//         filename: file.originalname || file.filename || "evidence",
//         mimetype: file.mimetype || "application/octet-stream",
//         data: buffer,
//         uploadedAt: new Date(),
//       };
//     };

//     try {
//       // === Load PREVIOUS order (to detect transitions) ===
//       const prevOrder = await newOrderModel.findById(orderId);
//       if (!prevOrder) {
//         return res.status(404).json({ message: "Order not found" });
//       }

//       // Pull files (may be absent)
//       const paymentEvidenceFile = (req.files?.evidenceImage || [])[0];
//       const packingFiles = req.files?.packingImages || [];
//       const deliveryFile = (req.files?.deliveryImage || [])[0];

//       const paymentEvidenceDoc = fileToDoc(paymentEvidenceFile);
//       const packingDocs = packingFiles.map(fileToDoc).filter(Boolean);
//       const deliveryDoc = fileToDoc(deliveryFile);

//       // Normalize some fields
//       const numericInsured = insuredAmount ? Number(insuredAmount) : undefined;
//       const parsedDeliveryDate = deliveryDate ? new Date(deliveryDate) : undefined;

//       // Build $set payload
//       const $set = {
//         ...(paymentMethod && { paymentMethod }),
//         ...(paymentAccount && { paymentAccount }),
//         ...(orderStatus && { orderStatus }),
//         ...(packerName && { packerName }),
//         ...(numericInsured !== undefined && { insuredAmount: numericInsured }),
//         ...(parsedDeliveryDate && { deliveryDate: parsedDeliveryDate }),
//         ...(trackingNumber && { trackingNumber }),
//       };

//       if (paymentEvidenceDoc) {
//         $set.evidenceFile = paymentEvidenceDoc;
//       }
//       if (deliveryDoc) {
//         $set.deliveryEvidence = deliveryDoc;
//       }

//       // Build update
//       const update = { $set };
//       if (packingDocs.length > 0) {
//         update.$push = { packingEvidence: { $each: packingDocs } };
//       }

//       // === Apply update ===
//       const updatedOrder = await newOrderModel.findByIdAndUpdate(orderId, update, { new: true });
//       if (!updatedOrder) {
//         return res.status(404).json({ message: "Order not found after update" });
//       }

//       // === Compute triggered stages ===
//       const triggeredStages = [];

//       // 1) Evidence added for the first time
//       if (paymentEvidenceDoc && !prevOrder?.evidenceFile) {
//         triggeredStages.push("EVIDENCIA_PAGO");
//       }

//       // 2) Status transitions we care about
//       const prevStatus = prevOrder?.orderStatus || "";
//       const nextStatus = updatedOrder?.orderStatus || prevStatus;

//       if (orderStatus && orderStatus !== prevStatus) {
//         const s = orderStatus.toLowerCase();
//         if (s === "pago verificado")          triggeredStages.push("PAGO_VERIFICADO");
//         if (s === "preparando pedido")        triggeredStages.push("PREPARANDO_PEDIDO");
//         if (s === "pedido entregado")         triggeredStages.push("PEDIDO_ENTREGADO");
//       }

//       // 3) Label/tracking created
//       const prevTracking = (prevOrder?.trackingNumber || "").trim();
//       const nextTracking = (updatedOrder?.trackingNumber || "").trim();
//       if (nextTracking && nextTracking !== prevTracking) {
//         triggeredStages.push("ETIQUETA_GENERADA");
//       }

//       // === Fire notifications (non-blocking) ===
//       if (triggeredStages.length > 0) {
//         const shortId = String(updatedOrder._id || "").slice(-5);
//         const userEmail = updatedOrder.userEmail || updatedOrder.email || "cliente";

//         // build a generic message per stage
//         const messageForStage = (stage) => {
//           switch (stage) {
//             case "EVIDENCIA_PAGO":
//               return {
//                 title: `Evidencia de pago recibida`,
//                 body: `Pedido #${shortId} — Cliente: ${userEmail}`,
//               };
//             case "PAGO_VERIFICADO":
//               return {
//                 title: `Pago verificado`,
//                 body: `Pedido #${shortId} listo para logística/almacén`,
//               };
//             case "PREPARANDO_PEDIDO":
//               return {
//                 title: `Preparando pedido`,
//                 body: `Pedido #${shortId} en empaque`,
//               };
//             case "ETIQUETA_GENERADA":
//               return {
//                 title: `Etiqueta generada`,
//                 body: `Pedido #${shortId} — Tracking: ${nextTracking}`,
//               };
//             case "PEDIDO_ENTREGADO":
//               return {
//                 title: `Pedido entregado`,
//                 body: `Pedido #${shortId} marcado como entregado`,
//               };
//             default:
//               return { title: "Actualización de pedido", body: `Pedido #${shortId}` };
//           }
//         };

//         // send to each role topic interested in this stage
//         (async () => {
//           try {
//             for (const stage of triggeredStages) {
//               const roles = rolesForStage(stage); // e.g. ["FULL_ACCESS", ...]
//               const msg = messageForStage(stage);

//               for (const role of roles) {
//                 const topic = roleTopics[role];
//                 if (!topic) continue;

//                 await sendToTopic(topic, {
//                   notification: { title: msg.title, body: msg.body },
//                   data: {
//                     orderId: String(updatedOrder._id),
//                     stage,
//                     email: userEmail,
//                     orderStatus: nextStatus || "",
//                     trackingNumber: nextTracking || "",
//                   },
//                 });
//               }
//             }
//           } catch (notifyErr) {
//             // Don’t fail the request if FCM fails
//             console.error("FCM notify error:", notifyErr);
//           }
//         })();
//       }

//       // === Respond ===
//       res.json(updatedOrder);
//     } catch (error) {
//       console.error("Error updating order:", error);
//       res.status(500).json({ message: "Failed to update order" });
//     }
//   }
// );
// // router.put(
// //   "/orders/:orderId",
// //   upload.fields([
// //     { name: "evidenceImage", maxCount: 1 },  // user's payment evidence
// //     { name: "packingImages", maxCount: 3 },  // up to 3 packing images
// //     { name: "deliveryImage", maxCount: 1 },  // carrier/shipping evidence
// //   ]),
// //   async (req, res) => {
// //     const { orderId } = req.params;
// //     const {
// //       paymentMethod,
// //       paymentAccount,
// //       orderStatus,
// //       packerName,
// //       insuredAmount,
// //       deliveryDate,
// //       trackingNumber,
// //     } = req.body;

// //     // helper: convert a multer file to { filename, mimetype, data, uploadedAt }
// //     const fileToDoc = (file) => {
// //       if (!file) return null;

// //       // Prefer memory storage buffer
// //       let buffer = file.buffer || null;

// //       // Fallback for disk storage (not recommended if you configured memoryStorage)
// //       if (!buffer && file.path) {
// //         const abs = path.isAbsolute(file.path)
// //           ? file.path
// //           : path.join(__dirname, "..", file.path);
// //         buffer = fs.readFileSync(abs);
// //         try { fs.unlinkSync(abs); } catch (_) {}
// //       }

// //       if (!buffer) return null;

// //       return {
// //         filename: file.originalname || file.filename || "evidence",
// //         mimetype: file.mimetype || "application/octet-stream",
// //         data: buffer,
// //         uploadedAt: new Date(),
// //       };
// //     };

// //     try {
// //       // Pull files (may be absent)
// //       const paymentEvidenceFile = (req.files?.evidenceImage || [])[0];
// //       const packingFiles = req.files?.packingImages || [];
// //       const deliveryFile = (req.files?.deliveryImage || [])[0];

// //       const paymentEvidenceDoc = fileToDoc(paymentEvidenceFile);
// //       const packingDocs = packingFiles.map(fileToDoc).filter(Boolean);
// //       const deliveryDoc = fileToDoc(deliveryFile);

// //       // Normalize some fields (optional but robust)
// //       const numericInsured = insuredAmount ? Number(insuredAmount) : undefined;
// //       const parsedDeliveryDate =
// //         deliveryDate ? new Date(deliveryDate) : undefined;

// //       // Build $set payload
// //       const $set = {
// //         ...(paymentMethod && { paymentMethod }),
// //         ...(paymentAccount && { paymentAccount }),
// //         ...(orderStatus && { orderStatus }),
// //         ...(packerName && { packerName }),
// //         ...(numericInsured !== undefined && { insuredAmount: numericInsured }),
// //         ...(parsedDeliveryDate && { deliveryDate: parsedDeliveryDate }),
// //         ...(trackingNumber && { trackingNumber }),
// //       };

// //       if (paymentEvidenceDoc) {
// //         // single object field
// //         $set.evidenceFile = paymentEvidenceDoc;
// //       }

// //       if (deliveryDoc) {
// //         // single object field for delivery evidence
// //         $set.deliveryEvidence = deliveryDoc;
// //       }

// //       // Build update
// //       const update = { $set };

// //       if (packingDocs.length > 0) {
// //         // append (don’t overwrite) packing images
// //         update.$push = { packingEvidence: { $each: packingDocs } };
// //       }

// //       const updatedOrder = await newOrderModel.findByIdAndUpdate(orderId, update, {
// //         new: true,
// //       });

// //       if (!updatedOrder) {
// //         return res.status(404).json({ message: "Order not found" });
// //       }

// //       res.json(updatedOrder);
// //     } catch (error) {
// //       console.error("Error updating order:", error);
// //       res.status(500).json({ message: "Failed to update order" });
// //     }
// //   }
// // );

// // ----> SEP10 MODIFS AREA

// // sep07
// // JSON-only partial updates (no files) — used by mobile/admin forms
// router.patch("/orders/:orderId", async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     const {
//       paymentMethod,
//       paymentAccount,
//       orderStatus,
//       packerName,
//       insuredAmount,
//       deliveryDate,
//       trackingNumber,
//     } = req.body || {};

//     // Normalize/parse scalars
//     const numericInsured =
//       insuredAmount !== undefined && insuredAmount !== null
//         ? Number(insuredAmount)
//         : undefined;

//     const parsedDeliveryDate =
//       deliveryDate ? new Date(deliveryDate) : undefined;

//     // Build $set only with provided (defined) values
//     const $set = {
//       ...(typeof paymentMethod === "string" && paymentMethod.trim() && { paymentMethod: paymentMethod.trim() }),
//       ...(typeof paymentAccount === "string" && paymentAccount.trim() && { paymentAccount: paymentAccount.trim() }),
//       ...(typeof orderStatus === "string" && orderStatus.trim() && { orderStatus: orderStatus.trim() }),
//       ...(typeof packerName === "string" && packerName.trim() && { packerName: packerName.trim() }),
//       ...(numericInsured !== undefined && Number.isFinite(numericInsured) && { insuredAmount: numericInsured }),
//       ...(parsedDeliveryDate instanceof Date && !isNaN(parsedDeliveryDate) && { deliveryDate: parsedDeliveryDate }),
//       ...(typeof trackingNumber === "string" && trackingNumber.trim() && { trackingNumber: trackingNumber.trim() }),
//     };

//     if (Object.keys($set).length === 0) {
//       return res.status(400).json({ error: "No fields to update" });
//     }

//     const updated = await newOrderModel.findByIdAndUpdate(
//       orderId,
//       { $set },
//       { new: true }
//     );

//     if (!updated) {
//       return res.status(404).json({ error: "Order not found" });
//     }

//     res.json({ data: updated, message: "Order updated" });
//   } catch (err) {
//     console.error("PATCH /orders/:orderId error:", err);
//     res.status(500).json({ error: "Failed to update order" });
//   }
// });

// // sep07

// // ENDPOINT TO GET SPECIFIC ORDER FOR TO PACK - ADMIN SIDE
// router.get("/orders/:orderId", async (req, res) => {
//     try {
//       const order = await newOrderModel.findById(req.params.orderId);
//       if (!order) return res.status(404).json({ message: "Order not found" });
//       res.json(order);
//     } catch (err) {
//       res.status(500).json({ message: "Server error" });
//     }
//   });

// // ENDPOINT FOR FETCHING GOOGLE SHEETS DATABASE
// router.get("/shipping-preferences", async (req, res) => {
//     const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv';
  
//     try {
//       const response = await axios.get(csvUrl);
//       res.send(response.data); // returns raw CSV to frontend
//     } catch (error) {
//       console.error("Error fetching shipping preferences:", error);
//       res.status(500).send("Failed to fetch CSV");
//     }
//   });

// // ENDPOINT FOR UPLOADING NEW QUOTES TO MONGO
// // Preflight for mobile/Safari/etc.
// router.options("/save-pdf", cors());

// // Accept a PDF blob (field name: "pdf") with optional JSON "metadata"
// router.post("/save-pdf", cors(), upload.single("pdf"), async (req, res) => {
//   try {
//     // Basic CORS/cache hygiene on the response
//     res.set({
//       "Cache-Control": "no-store",
//       "Access-Control-Expose-Headers": "Content-Type, Content-Length",
//     });

//     if (!req.file) {
//       return res.status(400).json({ ok: false, error: 'No file uploaded under field "pdf".' });
//     }

//     const { originalname = "document.pdf", mimetype = "", buffer } = req.file;

//     // Allow common PDF types; relax if you also accept images here
//     const allowed = new Set(["application/pdf", "application/octet-stream"]);
//     if (!allowed.has(mimetype)) {
//       // Some mobiles send octet-stream for blobs; we still allow that
//       console.warn("Unexpected mimetype for /save-pdf:", mimetype);
//     }

//     // Optional metadata string → object
//     let metadata = {};
//     if (typeof req.body?.metadata === "string" && req.body.metadata.trim()) {
//       try {
//         metadata = JSON.parse(req.body.metadata);
//       } catch (e) {
//         return res.status(400).json({ ok: false, error: "Invalid JSON in metadata." });
//       }
//     }

//     if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
//       return res.status(400).json({ ok: false, error: "Empty or invalid file buffer." });
//     }

//     const doc = new PdfQuote({
//       filename: originalname,
//       contentType: mimetype || "application/pdf",
//       pdfBuffer: buffer,              // multer memoryStorage provides this
//       metadata: metadata || {},
//       createdAt: new Date(),
//     });

//     await doc.save();

//     return res.status(200).json({
//       ok: true,
//       message: "PDF saved to MongoDB successfully",
//       id: doc._id,
//       filename: originalname,
//       bytes: buffer.length,
//     });
//   } catch (err) {
//     console.error("Error saving PDF:", err);
//     return res.status(500).json({ ok: false, error: "Failed to save PDF" });
//   }
// });
// // OFF SEP01
// // router.post('/save-pdf', upload.single('pdf'), async (req, res) => {
// //   try {
// //     if (!req.file) {
// //       return res.status(400).json({ error: 'No file uploaded under field "pdf".' });
// //     }

// //     const { originalname, mimetype, buffer } = req.file;

// //     // optional metadata sent as JSON string
// //     let metadata = {};
// //     if (req.body?.metadata) {
// //       try { metadata = JSON.parse(req.body.metadata); } catch { /* ignore */ }
// //     }

// //     const doc = new PdfQuote({
// //       filename: originalname,
// //       contentType: mimetype,
// //       pdfBuffer: buffer, // <-- this must exist; memoryStorage ensures it
// //       metadata,
// //     });

// //     await doc.save();
// //     res.status(200).json({ message: 'PDF saved to MongoDB successfully', id: doc._id });
// //   } catch (err) {
// //     console.error('Error saving PDF:', err);
// //     res.status(500).json({ error: 'Failed to save PDF' });
// //   }
// // });
// // OFF SEP01

//   // ENDPOINT FOR FETCHING DOF EXCHANGE
//   //try3
//   router.get("/fx/usd-dof", async (req, res) => {
//     try {
//       const token = process.env.BANXICO_TOKEN; // put your token in .env
//       if (!token) {
//         return res.status(500).json({ error: "Missing BANXICO_TOKEN" });
//       }
  
//       // Helper to format YYYY-MM-DD
//       const fmt = (d) =>
//         `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
//           d.getDate()
//         ).padStart(2, "0")}`;
  
//       // We’ll fetch ~10 recent days to be safe across weekends/holidays
//       const today = new Date();
//       const start = new Date(today);
//       start.setDate(start.getDate() - 10);
  
//       const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/${fmt(
//         start
//       )}/${fmt(today)}?token=${token}`;
  
//       const { data } = await axios.get(url, {
//         headers: { Accept: "application/json" },
//       });
  
//       // SIE structure: series[0].datos = [{ fecha: "dd/MM/yyyy", dato: "value" }, ...]
//       const datos = data?.bmx?.series?.[0]?.datos || [];
  
//       if (!datos.length) {
//         return res.status(502).json({ error: "No data returned by Banxico." });
//       }
  
//       // Parse to Date objects, keep only entries strictly before 'today'
//       const parsed = datos
//         .map((r) => {
//           const [dd, mm, yyyy] = r.fecha.split("/");
//           return { date: new Date(`${yyyy}-${mm}-${dd}T00:00:00-06:00`), value: r.dato };
//         })
//         .filter((r) => r.value && !isNaN(Number(r.value)) && r.date < today)
//         .sort((a, b) => a.date - b.date);
  
//       if (!parsed.length) {
//         return res.status(404).json({ error: "No prior business-day FIX found." });
//       }
  
//       const dof = parsed[parsed.length - 1]; // latest prior business day
//       return res.json({
//         rate: Number(dof.value),
//         date: dof.date.toISOString().slice(0, 10),
//         source: "DOF (FIX publicado en DOF el día hábil siguiente)",
//         series: "SF43718",
//       });
//     } catch (err) {
//       console.error("Banxico DOF error:", err?.response?.data || err.message);
//       return res.status(500).json({ error: "Failed to fetch DOF rate." });
//     }
//   });
  
// // POST /upload-evidence - upload payment evidence from user
// router.post("/upload-evidence", upload.single("evidenceImage"), async (req, res) => {
//     try {
//       const order = await newOrderModel.findByIdAndUpdate(
//         req.body.orderId,
//         { $set: { paymentEvidenceUrl: `/uploads/${req.file.filename}` } },
//         { new: true }
//       );
//       res.json({ message: "Evidencia subida", order });
//     } catch (err) {
//       res.status(500).json({ message: "Error uploading evidence" });
//     }
//   });
  
//   // POST /upload-pack-evidence - upload packing evidence from packer
//   router.post("/upload-pack-evidence", upload.single("evidenceImage"), async (req, res) => {
//     try {
//       const order = await newOrderModel.findByIdAndUpdate(
//         req.body.orderId,
//         { $set: { packingEvidenceUrl: `/uploads/${req.file.filename}` } },
//         { new: true }
//       );
//       res.json({ message: "Evidencia de empaquetado subida", order });
//     } catch (err) {
//       res.status(500).json({ message: "Error uploading packing evidence" });
//     }
//   });

// // PLACE INVENTORY ON HOLD 
// // // POST /inventory/hold
// // router.post("/hold", async (req, res) => {
// //   try {
// //     const { orderId, lines, holdMinutes = 120 } = req.body;
// //     if (!orderId || !Array.isArray(lines) || lines.length === 0) {
// //       return res.status(400).json({ message: "orderId y lines son requeridos" });
// //     }

// //     const order = await newOrderModel.findById(orderId);
// //     if (!order) return res.status(404).json({ message: "Orden no encontrada" });

// //     const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);

// //     const hold = await Hold.create({ orderId, lines, expiresAt, confirmed: false });

// //     // Optional but recommended: push holds to a “RESERVAS” sheet so your LIVE sheet can subtract
// //     await pushHoldsToSheets(); // writes all active holds snapshot to sheets

// //     res.json({ ok: true, holdId: hold._id });
// //   } catch (e) {
// //     console.error(e);
// //     res.status(500).json({ message: "Error creando la reserva" });
// //   }
// // });

// // // POST /inventory/confirm/:orderId  (called when payment is verified)
// // router.post("/confirm/:orderId", async (req, res) => {
// //   try {
// //     const { orderId } = req.params;

// //     // Find active hold(s) for that order
// //     const holds = await Hold.find({ orderId, confirmed: false, expiresAt: { $gt: new Date() } });
// //     if (!holds.length) return res.status(404).json({ message: "No hay reservas activas" });

// //     // 1) Permanently decrement inventory in Google Sheets
// //     await applyPermanentDecrement(holds);

// //     // 2) Mark holds confirmed (so they no longer subtract as holds)
// //     await Hold.updateMany({ orderId, confirmed: false }, { $set: { confirmed: true } });

// //     // 3) Refresh the holds snapshot in Sheets (so “available” matches)
// //     await pushHoldsToSheets();

// //     res.json({ ok: true });
// //   } catch (e) {
// //     console.error(e);
// //     res.status(500).json({ message: "Error confirmando reserva" });
// //   }
// // });

// // // Optional: manual release (if you ever need to cancel early)
// // router.post("/release/:orderId", async (req, res) => {
// //   try {
// //     const { orderId } = req.params;
// //     await Hold.deleteMany({ orderId, confirmed: false });
// //     await pushHoldsToSheets(); // refresh snapshot so available updates
// //     res.json({ ok: true });
// //   } catch (e) {
// //     console.error(e);
// //     res.status(500).json({ message: "Error liberando reserva" });
// //   }
// // });

// // LIST: lightweight — no pdfBuffer
// router.get('/pdfquotes', async (req, res) => {
//   try {
//     const { since } = req.query; // optional ?since=2025-08-01
//     const find = {};
//     if (since) {
//       const d = new Date(since);
//       if (!isNaN(+d)) find.createdAt = { $gte: d };
//     }

//     const docs = await PdfQuote
//       .find(find)
//       .select('_id filename contentType createdAt metadata') // omit pdfBuffer
//       .sort({ createdAt: -1 });

//     res.json(docs);
//   } catch (e) {
//     console.error('GET /pdfquotes error:', e);
//     res.status(500).json({ error: 'Failed to list quotes' });
//   }
// });

// // DETAIL: single doc (still omit the buffer)
// router.get('/pdfquotes/:id', async (req, res) => {
//   try {
//     const doc = await PdfQuote
//       .findById(req.params.id)
//       .select('_id filename contentType createdAt metadata');
//     if (!doc) return res.status(404).json({ error: 'Quote not found' });
//     res.json(doc);
//   } catch (e) {
//     console.error('GET /pdfquotes/:id error:', e);
//     res.status(500).json({ error: 'Failed to fetch quote' });
//   }
// });

// // FILE: stream the PDF binary
// router.get('/pdfquotes/:id/file', async (req, res) => {
//   try {
//     const doc = await PdfQuote.findById(req.params.id).select('filename contentType pdfBuffer');
//     if (!doc) return res.status(404).json({ error: 'Quote not found' });
//     if (!doc.pdfBuffer) return res.status(404).json({ error: 'PDF data not found' });

//     res.setHeader('Content-Disposition', `inline; filename="${doc.filename || 'quote.pdf'}"`);
//     res.setHeader('Content-Type', doc.contentType || 'application/pdf');
//     res.send(doc.pdfBuffer);
//   } catch (e) {
//     console.error('GET /pdfquotes/:id/file error:', e);
//     res.status(500).json({ error: 'Failed to stream PDF' });
//   }
// });

// // ENDPOINT TO RETRIEVE PHOTOGRAPHIC EVIDENCES
// function sendFileFromDoc(res, fileDoc, fallbackName) {
//   if (!fileDoc || !fileDoc.data) return res.status(404).send("File not found");
//   res.setHeader("Content-Type", fileDoc.mimetype || "application/octet-stream");
//   const filename = fileDoc.filename || fallbackName || "evidence.bin";
//   res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
//   return res.send(fileDoc.data);
// }

// // GET /orders/:orderId/evidence/payment
// router.get("/:orderId/evidence/payment", async (req, res) => {
//   try {
//     const order = await newOrderModel.findById(req.params.orderId).lean();
//     if (!order) return res.status(404).send("Order not found");
//     return sendFileFromDoc(res, order.evidenceFile, "payment-evidence");
//   } catch (e) {
//     console.error(e);
//     res.status(500).send("Server error");
//   }
// });

// // GET /orders/:orderId/evidence/delivery
// router.get("/:orderId/evidence/delivery", async (req, res) => {
//   try {
//     const order = await newOrderModel.findById(req.params.orderId).lean();
//     if (!order) return res.status(404).send("Order not found");
//     return sendFileFromDoc(res, order.deliveryEvidence, "delivery-evidence");
//   } catch (e) {
//     console.error(e);
//     res.status(500).send("Server error");
//   }
// });

// // GET /orders/:orderId/evidence/packing/:index
// router.get("/:orderId/evidence/packing/:index", async (req, res) => {
//   try {
//     const order = await newOrderModel.findById(req.params.orderId).lean();
//     if (!order) return res.status(404).send("Order not found");
//     const idx = Number(req.params.index);
//     if (!Array.isArray(order.packingEvidence) || !Number.isInteger(idx) || idx < 0 || idx >= order.packingEvidence.length) {
//       return res.status(404).send("Packing evidence not found");
//     }
//     return sendFileFromDoc(res, order.packingEvidence[idx], `packing-${idx + 1}`);
//   } catch (e) {
//     console.error(e);
//     res.status(500).send("Server error");
//   }
// });

// router.get("/:orderId", async (req, res) => {
//   const o = await newOrderModel.findById(req.params.orderId).lean();
//   if (!o) return res.status(404).json({ error: "Not found" });
//   return res.json(o);
// });

// // 🔎 Route inspector (visit /__routes to list routes)
// router.get("/__routes", (_req, res) => {
//   const flatten = (s) =>
//     s
//       .filter((l) => l.route || l.name === "router")
//       .flatMap((l) =>
//         l.route
//           ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
//           : (l.handle.stack || [])
//               .filter((x) => x.route)
//               .map((x) => ({
//                 method: Object.keys(x.route.methods)[0].toUpperCase(),
//                 path: x.route.path,
//               }))
//       );
//   const stack = app._router?.stack ? flatten(app._router.stack) : [];
//   res.json(stack);
// });

// // GISCONNECT END

// module.exports = router

// OFF SEP11























// // OG BASE ROUTES
// const express = require('express')
// const cors = require('cors')

// const router = express.Router()
// const mongoose = require('mongoose')
// const bcrypt = require('bcryptjs')
// const jwt = require('jsonwebtoken')
// const verifyToken = require("../verifyToken")

// const multer = require("multer")
// const path = require('path')

// // jul29
// const crypto = require("crypto");
// const nodemailer = require("nodemailer");
// // jul29
// // BASE ROUTES END

// // GISCONNECT
// const axios = require("axios");

// const newUserModel = require("../models/newUserModel")
// const newOrderModel = require("../models/orderModel")
// const Order = require("../models/orderEvidenceModel"); // Adjust path if needed
// const ShippingAddress = require("../models/ShippingAddress"); // <- you'll create this model
// const BillingAddress = require("../models/BillingAddress"); // <- you'll create this model
// const PdfQuote = require("../models/pdfQuoteModel"); // <- you'll create this model
// // const Hold = require("../models/Hold");
// // const { pushHoldsToSheets, applyPermanentDecrement } = require("../services/sheetsBridge");

// // GISCONNECT END

// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//     // destination: function (req, res, cb) {
//         cb(null, './files')
//     },
//     filename: (req, file, cb) => {
//         // cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname))
//         cb(null, file.originalname)


//     // filename: function (req, file, cb) {
//         // const uniqueSuffix = Date.now()
//         // cb(null, uniqueSuffix+file.originalname)
//     }
// })
// // MODIF AUG13
// // const upload = multer({ storage: storage })

// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 15 * 1024 * 1024 }, // 15MB, tweak as needed
// });
// // END MODIF AUG13

// // router.post("/upload-files", upload.single("folioPDF"), async (req,res) => {
// //     console.log(req.file)
// // })
// //END APR04

// //USER RELATED API's

// // GISCONNECT START!

// //API || ENDPOINT FOR REGISTERING USER & PASSWORD HASHING
// router.post('/register', (req,res) => {
//     let user = req.body
//     console.log(user)

//     bcrypt.genSalt(10,(err,salt) => {
//         if(!err)
//         {
//             bcrypt.hash(user.contrasena, salt, (err,hpass) => {
//                 if(!err)
//                 {
//                     user.contrasena = hpass

//                     newUserModel.create(user)
//                     .then((doc) => {
//                         res.status(201).send({message:"¡Usuario registrado exitosamente!"})
//                     })
//                     .catch((err) => {
//                         console.log(err)
//                         res.status(500).send({message:"Encountered a problem while registering user"})
//                     })
//                 }
//             })
//         }
//     })
// })

// //API || ENDPOINT FOR LOGIN
// router.post('/login', (req, res) => {
//     let userCred = req.body
//     console.log(userCred)

//     newUserModel.findOne({correo:userCred.correo})
//     .then((user) => {
//         if(user !==null) {
//             bcrypt.compare(userCred.contrasena, user.contrasena, (err, result) => {
//                 if(result===true) {
//                     //TOKEN GENERATION
//                     jwt.sign({correo:userCred.correo}, "kangarookey", (err, token) => {
//                         if(!err) {
//                             res.send({token:token})
//                         }
//                         else {
//                             res.status(500).send({message: " Some problem while creating token. Please try again"})
//                         }
//                     })
//                 }
//                 else {
//                     res.status(403).send({message: "Contraseña incorrecta!"})
//                 }
//             })
//         }
//         else {
//             res.status(404).send({message: "El usuario no se encontró"})
//         }
//     })
//     .catch((err) => {
//         console.log(err)
//         res.send({message: "Encountered some problem!"})
//     })
// })

// // ENDPOINT FOR RESTORING FORGOTTEN PASSWORD
// router.post("/forgot-password", async (req, res) => {
//     const { email } = req.body;
  
//     try {
//       const user = await newUserModel.findOne({ correo: email });
//       if (!user) return res.status(404).json({ message: "Correo no registrado." });
  
//       // Create token
//       const token = crypto.randomBytes(32).toString("hex");
//       user.resetPasswordToken = token;
//       user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
//       await user.save();
  
//       const resetLink = `http://localhost:5173/reset-password/${token}`; // adjust if hosted
  
//       // Send email
//       const transporter = nodemailer.createTransport({
//         service: "Gmail",
//         auth: {
//           user: "kangaroo.cacti@gmail.com",
//           pass: "bebt svht sgmq ezlz" // use environment variable in prod!
//         }
//       });
  
//       const mailOptions = {
//         to: email,
//         from: "no-reply@gisconnect.com",
//         subject: "Restablecimiento de contraseña",
//         text: `Recibimos una solicitud para restablecer tu contraseña. Haz click en el siguiente enlace: ${resetLink}`
//       };
  
//       await transporter.sendMail(mailOptions);
  
//       res.status(200).json({ message: "Correo enviado. Revisa tu bandeja de entrada." });
//     } catch (err) {
//       console.error("Forgot password error:", err);
//       res.status(500).json({ message: "Error al procesar la solicitud." });
//     }
// });

// // ENDPOINT FOR RESETING USER PASSWORD
// router.post("/reset-password", async (req, res) => {
//     const { token, password } = req.body;
  
//     try {
//       const user = await newUserModel.findOne({
//         resetPasswordToken: token,
//         resetPasswordExpires: { $gt: Date.now() }
//       });
  
//       if (!user) return res.status(400).json({ message: "Token inválido o expirado." });
  
//       const hashedPassword = await bcrypt.hash(password, 10);
//       user.contrasena = hashedPassword;
//       user.resetPasswordToken = undefined;
//       user.resetPasswordExpires = undefined;
//       await user.save();
  
//       res.json({ success: true, message: "Contraseña actualizada con éxito." });
//     } catch (err) {
//       console.error("Reset password error:", err);
//       res.status(500).json({ message: "Error al actualizar la contraseña." });
//     }
//   });

// //TOKEN VERIFIED ENDPOINT EXAMPLE --> MAKE SURE TO DELETE!!
// router.get('/getdata', verifyToken, (req,res) => {
//     res.send({message:"Bad dev with good heart"})
// })

// //ENDPOINT FOR FETCHING FULL COLLECTION DATA
// router.get('/register', (req,res) => {
//     newUserModel.find()
//     .then((projects) => {
//         res.send(projects)
//         console.log(projects);
//     })
//     .catch((err) => {
//         console.log(err);
//         res.send({message:"Couldn't fetch projects"})
//     })
// })

// // ENDPOINT FOR UPLOADING A NEW ORDER INTO MONGO
// router.post('/orderDets', upload.single('pdf'), async (req, res) => {
//   try {
//     // 1) Parse order JSON from the "order" field
//     const raw = req.body.order
//     if (!raw) {
//       return res.status(400).json({ error: 'Missing order JSON in "order" field' })
//     }
//     const order = JSON.parse(raw)

//     // 2) If a PDF was sent, embed it
//     if (req.file) {
//       const { originalname, mimetype, buffer } = req.file
//       order.quotePdf = {
//         filename: originalname,
//         contentType: mimetype,
//         data: buffer,
//       }
//     }

//     // 3) Create order
//     const created = await newOrderModel.create(order)
//     res.status(201).json({ data: created, message: "Nueva orden registrada exitosamente" })
//   } catch (err) {
//     console.error("Error creating order:", err)
//     res.status(500).json({ error: "Failed to create order" })
//   }
// })
// // router.post('/orderDets', (req,res) => {
// //     let newOrder = req.body
// //     console.log(newOrder)
    
// //     newOrderModel.create({...req.body})
// //     .then((data) => {
// //         res.send({data:data,message:"Nueva orden registrada exitosamente"})
// //         console.log(data);
// //         console.log("New order created!");
// //     })
// //     .catch((err) => {
// //         console.log(err);
// //     })
// // })

// // ENDPOINT FOR UPLOADING ORDER STATUS
// // PATCH /order/:id/status
// router.patch("/order/:id/status", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { orderStatus } = req.body;
//     if (!orderStatus) return res.status(400).json({ message: "orderStatus requerido" });

//     const updated = await newOrderModel.findByIdAndUpdate(
//       id,
//       { orderStatus },
//       { new: true }
//     );

//     if (!updated) return res.status(404).json({ message: "Orden no encontrada" });

//     res.json({ message: "Estatus actualizado", order: updated });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ message: "Error interno" });
//   }
// });

// router.get("/userOrders", async (req, res) => {
//     const { email } = req.query;
//     try {
//         const orders = await newOrderModel.find({ userEmail : email }); // 👈 Adjust field as needed
//         res.json(orders);
//     } catch (error) {
//         console.error("Error fetching orders:", error);
//         res.status(500).json({ message: "Error fetching orders" });
//     }
// });

// // POST endpoint to receive invoice PDF
// router.post("/upload-invoice", upload.single("invoicePDF"), async (req, res) => {
//     try {
//       const orderId = req.body.orderId;
//       const filePath = req.file.path;
  
//       const updatedOrder = await newOrderModel.findByIdAndUpdate(
//         orderId,
//         { invoiceFilePath: filePath },
//         { new: true }
//       );
  
//       if (!updatedOrder) {
//         return res.status(404).json({ message: "Order not found" });
//       }
  
//       res.status(200).json({ message: "Invoice uploaded successfully", path: filePath });
//     } catch (err) {
//       console.error("Error uploading invoice:", err);
//       res.status(500).json({ message: "Failed to upload invoice" });
//     }
//   });

// // Upload Evidence Endpoint
// router.post("/upload-evidence", upload.single("evidenceImage"), async (req, res) => {
//   try {
//     const { orderId } = req.body;
//     const file = req.file;

//     console.log("Received orderId:", orderId);
//     console.log("Received file:", file && {
//       originalname: file.originalname,
//       mimetype: file.mimetype,
//       size: file.size
//     });

//     if (!orderId) {
//       return res.status(400).json({ message: "Order ID not provided" });
//     }

//     if (!file) {
//       return res.status(400).json({ message: "No file uploaded" });
//     }

//     // Find order (no update yet)
//     const order = await newOrderModel.findById(orderId);
//     if (!order) {
//       return res.status(404).json({ message: "Order not found" });
//     }

//     // If using memoryStorage, the bytes are in file.buffer
//     order.evidenceFile = {
//       filename: file.originalname,
//       mimetype: file.mimetype,
//       data: file.buffer, // <— no fs.readFileSync, no file.path needed
//       uploadedAt: new Date()
//     };

//     await order.save();

//     return res.status(200).json({ message: "Evidencia guardada en MongoDB correctamente" });
//   } catch (error) {
//     console.error("Upload Evidence Error:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// });

// // ENDPOINT FOR UPLOADING A NEW SHIPPING ADDRESS
// router.post("/shipping-address", async (req, res) => {
//     const { userEmail, ...addressData } = req.body;
  
//     if (!userEmail) return res.status(400).json({ message: "Email is required" });
  
//     try {
//       const newAddress = new ShippingAddress({ userEmail, ...addressData });
//       await newAddress.save();
//       res.status(201).json({ message: "Address saved" });
//     } catch (err) {
//       console.error("Save address error:", err);
//       res.status(500).json({ message: "Error saving address" });
//     }
//   });

// // ENDPOINT FOR RETRIEVING ALTERNATE SHIPPING ADDRESS
// router.get('/shipping-address/:email', async (req, res) => {
//     try {
//       const email = req.params.email;
//       const addresses = await ShippingAddress.find({ userEmail: email });
//       res.json(addresses);
//     } catch (error) {
//       console.error("Error fetching billing addresses:", error);
//       res.status(500).json({ error: "Server error" });
//     }
//   });


// // ENDPOINT FOR UPLOADING A NEW BILLING ADDRESS
// router.post("/billing-address", async (req, res) => {
//     const { userEmail, ...addressData } = req.body;

//     if (!userEmail) return res.status(400).json({ message: "Email is required" });
  
//     try {
//       const newAddress = new BillingAddress({ userEmail, ...addressData });
//       await newAddress.save();
//       res.status(201).json({ message: "Address saved" });
//     } catch (err) {
//       console.error("Save address error:", err);
//       res.status(500).json({ message: "Error saving address" });
//     }
//   });

// // ENDPOINT FOR RETRIEVING ALTERNATE BILLING ADDRESS
// router.get('/billing-address/:email', async (req, res) => {
//     try {
//       const email = req.params.email;
//       const addresses = await BillingAddress.find({ userEmail: email });
//       res.json(addresses);
//     } catch (error) {
//       console.error("Error fetching billing addresses:", error);
//       res.status(500).json({ error: "Server error" });
//     }
//   });

// // ENDPOINT FOR RETRIEVING ALL NEW ORDERS - ADMIN SIDE
// router.get('/orders', async (req, res) => {
//     try {
//       const orders = await newOrderModel.find().sort({ orderDate: -1 });
//       res.json(orders);
//     } catch (err) {
//       res.status(500).json({ error: 'Error fetching orders' });
//     }
//   });

// // ENDPOINT FOR RETRIEVING ALL DETAILS OF EACH ORDER - ADMIN SIDE
// router.get('/orders/:id', async (req, res) => {
//     const orderId = req.params.id;
//     try {

//     //   const order = await Order.findById(orderId)
//     //   //   .populate('items.product')  // if you want to populate product details
//     //   //   .populate('customer')       // if you want to populate customer details
//     //   //   .exec();
//     //   // Or using a placeholder data source:
//     //   // const order = ordersArray.find(o => o._id === orderId);
  
//       const order = await newOrderModel.findById(orderId);
//       if (!order) {
//         return res.status(404).json({ message: "Order not found" });
//       }
  
//       // If you want to include related data (customer info, etc.), ensure your model returns it
//       // or manually attach it here if needed.
  
//       res.json(order);
//     } catch (error) {
//       console.error("Error fetching order by ID:", error);
//       res.status(500).json({ message: "Error retrieving order data" });
//     }
//   });

// // ENDPOINT FOR UPDATING ORDER AT PAYMENT VALIDATION STAGE - ADMIN SIDE
// router.put(
//   "/orders/:orderId",
//   upload.fields([
//     { name: "evidenceImage", maxCount: 1 },  // user's payment evidence
//     { name: "packingImages", maxCount: 3 },  // up to 3 packing images
//     { name: "deliveryImage", maxCount: 1 },  // carrier/shipping evidence
//   ]),
//   async (req, res) => {
//     const { orderId } = req.params;
//     const {
//       paymentMethod,
//       paymentAccount,
//       orderStatus,
//       packerName,
//       insuredAmount,
//       deliveryDate,
//       trackingNumber,
//     } = req.body;

//     // helper: convert a multer file to { filename, mimetype, data, uploadedAt }
//     const fileToDoc = (file) => {
//       if (!file) return null;

//       // Prefer memory storage buffer
//       let buffer = file.buffer || null;

//       // Fallback for disk storage (not recommended if you configured memoryStorage)
//       if (!buffer && file.path) {
//         const abs = path.isAbsolute(file.path)
//           ? file.path
//           : path.join(__dirname, "..", file.path);
//         buffer = fs.readFileSync(abs);
//         try { fs.unlinkSync(abs); } catch (_) {}
//       }

//       if (!buffer) return null;

//       return {
//         filename: file.originalname || file.filename || "evidence",
//         mimetype: file.mimetype || "application/octet-stream",
//         data: buffer,
//         uploadedAt: new Date(),
//       };
//     };

//     try {
//       // Pull files (may be absent)
//       const paymentEvidenceFile = (req.files?.evidenceImage || [])[0];
//       const packingFiles = req.files?.packingImages || [];
//       const deliveryFile = (req.files?.deliveryImage || [])[0];

//       const paymentEvidenceDoc = fileToDoc(paymentEvidenceFile);
//       const packingDocs = packingFiles.map(fileToDoc).filter(Boolean);
//       const deliveryDoc = fileToDoc(deliveryFile);

//       // Normalize some fields (optional but robust)
//       const numericInsured = insuredAmount ? Number(insuredAmount) : undefined;
//       const parsedDeliveryDate =
//         deliveryDate ? new Date(deliveryDate) : undefined;

//       // Build $set payload
//       const $set = {
//         ...(paymentMethod && { paymentMethod }),
//         ...(paymentAccount && { paymentAccount }),
//         ...(orderStatus && { orderStatus }),
//         ...(packerName && { packerName }),
//         ...(numericInsured !== undefined && { insuredAmount: numericInsured }),
//         ...(parsedDeliveryDate && { deliveryDate: parsedDeliveryDate }),
//         ...(trackingNumber && { trackingNumber }),
//       };

//       if (paymentEvidenceDoc) {
//         // single object field
//         $set.evidenceFile = paymentEvidenceDoc;
//       }

//       if (deliveryDoc) {
//         // single object field for delivery evidence
//         $set.deliveryEvidence = deliveryDoc;
//       }

//       // Build update
//       const update = { $set };

//       if (packingDocs.length > 0) {
//         // append (don’t overwrite) packing images
//         update.$push = { packingEvidence: { $each: packingDocs } };
//       }

//       const updatedOrder = await newOrderModel.findByIdAndUpdate(orderId, update, {
//         new: true,
//       });

//       if (!updatedOrder) {
//         return res.status(404).json({ message: "Order not found" });
//       }

//       res.json(updatedOrder);
//     } catch (error) {
//       console.error("Error updating order:", error);
//       res.status(500).json({ message: "Failed to update order" });
//     }
//   }
// );

// // --- offaug18
// // router.put(
// //   "/orders/:orderId",
// //   upload.fields([
// //     { name: "evidenceImage", maxCount: 1 },
// //     { name: "packingImages", maxCount: 3 },
// //   ]),
// //   async (req, res) => {
// //     const { orderId } = req.params;
// //     const {
// //       paymentMethod,
// //       paymentAccount,
// //       orderStatus,
// //       packerName,
// //       insuredAmount,
// //       deliveryDate,
// //       trackingNumber,
// //     } = req.body;

// //     // helper: convert a multer file to { filename, mimetype, data, uploadedAt }
// //     const fileToDoc = (file) => {
// //       if (!file) return null;

// //       let buffer = null;

// //       // Prefer memory storage
// //       if (file.buffer) {
// //         buffer = file.buffer;
// //       } else if (file.path) {
// //         // Disk storage fallback
// //         const abs = path.isAbsolute(file.path)
// //           ? file.path
// //           : path.join(__dirname, "..", file.path);
// //         buffer = fs.readFileSync(abs);
// //         // optional cleanup: unlink temp file
// //         try { fs.unlinkSync(abs); } catch (_) {}
// //       }

// //       if (!buffer) return null;

// //       return {
// //         filename: file.originalname || file.filename || "evidence",
// //         mimetype: file.mimetype || "application/octet-stream",
// //         data: buffer,
// //         uploadedAt: new Date(),
// //       };
// //     };

// //     try {
// //       // Pull files (may be absent)
// //       const evidenceFile = (req.files?.evidenceImage || [])[0];
// //       const packingFiles = req.files?.packingImages || [];

// //       const evidenceDoc = fileToDoc(evidenceFile);
// //       const packingDocs = packingFiles
// //         .map(fileToDoc)
// //         .filter(Boolean); // only valid conversions

// //       // Build update
// //       const $set = {
// //         ...(paymentMethod && { paymentMethod }),
// //         ...(paymentAccount && { paymentAccount }),
// //         ...(orderStatus && { orderStatus }),
// //         ...(packerName && { packerName }),
// //         ...(insuredAmount && { insuredAmount }),
// //         ...(deliveryDate && { deliveryDate }),
// //         ...(trackingNumber && { trackingNumber }),
// //       };

// //       if (evidenceDoc) {
// //         $set.evidenceFile = evidenceDoc; // single object field
// //       }

// //       const update = { $set };
// //       if (packingDocs.length > 0) {
// //         // append (don’t overwrite) packing evidence images
// //         update.$push = { packingEvidence: { $each: packingDocs } };
// //       }

// //       const updatedOrder = await newOrderModel.findByIdAndUpdate(orderId, update, {
// //         new: true,
// //       });

// //       if (!updatedOrder) {
// //         return res.status(404).json({ message: "Order not found" });
// //       }

// //       res.json(updatedOrder);
// //     } catch (error) {
// //       console.error("Error updating order:", error);
// //       res.status(500).json({ message: "Failed to update order" });
// //     }
// //   }
// // );
 

// // ENDPOINT TO GET SPECIFIC ORDER FOR TO PACK - ADMIN SIDE
// router.get("/orders/:orderId", async (req, res) => {
//     try {
//       const order = await newOrderModel.findById(req.params.orderId);
//       if (!order) return res.status(404).json({ message: "Order not found" });
//       res.json(order);
//     } catch (err) {
//       res.status(500).json({ message: "Server error" });
//     }
//   });

// // ENDPOINT FOR FETCHING GOOGLE SHEETS DATABASE
// router.get("/shipping-preferences", async (req, res) => {
//     const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv';
  
//     try {
//       const response = await axios.get(csvUrl);
//       res.send(response.data); // returns raw CSV to frontend
//     } catch (error) {
//       console.error("Error fetching shipping preferences:", error);
//       res.status(500).send("Failed to fetch CSV");
//     }
//   });

// // ENDPOINT FOR UPLOADING NEW QUOTES TO MONGO
// router.post('/save-pdf', upload.single('pdf'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No file uploaded under field "pdf".' });
//     }

//     const { originalname, mimetype, buffer } = req.file;

//     // optional metadata sent as JSON string
//     let metadata = {};
//     if (req.body?.metadata) {
//       try { metadata = JSON.parse(req.body.metadata); } catch { /* ignore */ }
//     }

//     const doc = new PdfQuote({
//       filename: originalname,
//       contentType: mimetype,
//       pdfBuffer: buffer, // <-- this must exist; memoryStorage ensures it
//       metadata,
//     });

//     await doc.save();
//     res.status(200).json({ message: 'PDF saved to MongoDB successfully', id: doc._id });
//   } catch (err) {
//     console.error('Error saving PDF:', err);
//     res.status(500).json({ error: 'Failed to save PDF' });
//   }
// });

//   // ENDPOINT FOR FETCHING DOF EXCHANGE
//   //try3
//   router.get("/fx/usd-dof", async (req, res) => {
//     try {
//       const token = process.env.BANXICO_TOKEN; // put your token in .env
//       if (!token) {
//         return res.status(500).json({ error: "Missing BANXICO_TOKEN" });
//       }
  
//       // Helper to format YYYY-MM-DD
//       const fmt = (d) =>
//         `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
//           d.getDate()
//         ).padStart(2, "0")}`;
  
//       // We’ll fetch ~10 recent days to be safe across weekends/holidays
//       const today = new Date();
//       const start = new Date(today);
//       start.setDate(start.getDate() - 10);
  
//       const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/${fmt(
//         start
//       )}/${fmt(today)}?token=${token}`;
  
//       const { data } = await axios.get(url, {
//         headers: { Accept: "application/json" },
//       });
  
//       // SIE structure: series[0].datos = [{ fecha: "dd/MM/yyyy", dato: "value" }, ...]
//       const datos = data?.bmx?.series?.[0]?.datos || [];
  
//       if (!datos.length) {
//         return res.status(502).json({ error: "No data returned by Banxico." });
//       }
  
//       // Parse to Date objects, keep only entries strictly before 'today'
//       const parsed = datos
//         .map((r) => {
//           const [dd, mm, yyyy] = r.fecha.split("/");
//           return { date: new Date(`${yyyy}-${mm}-${dd}T00:00:00-06:00`), value: r.dato };
//         })
//         .filter((r) => r.value && !isNaN(Number(r.value)) && r.date < today)
//         .sort((a, b) => a.date - b.date);
  
//       if (!parsed.length) {
//         return res.status(404).json({ error: "No prior business-day FIX found." });
//       }
  
//       const dof = parsed[parsed.length - 1]; // latest prior business day
//       return res.json({
//         rate: Number(dof.value),
//         date: dof.date.toISOString().slice(0, 10),
//         source: "DOF (FIX publicado en DOF el día hábil siguiente)",
//         series: "SF43718",
//       });
//     } catch (err) {
//       console.error("Banxico DOF error:", err?.response?.data || err.message);
//       return res.status(500).json({ error: "Failed to fetch DOF rate." });
//     }
//   });
// // try2
// //   // ---------- BANXICO: USD→MXN FIX (Diario Oficial) ----------
// // const SERIES_ID = "SF43718"; // FIX USD/MXN
// // const BANXICO_BASE = "https://www.banxico.org.mx/SieAPIRest/service/v1";

// // // Simple cache (FIX updates once per business day)
// // let banxicoCache = {
// //   rate: null,
// //   date: null,
// //   fetchedAt: 0
// // };
// // // cache for 12 hours
// // const BANXICO_TTL_MS = 12 * 60 * 60 * 1000;

// // router.get("/banxico/exchange-rate", async (req, res) => {
// //   try {
// //     // serve from cache if fresh
// //     const now = Date.now();
// //     if (banxicoCache.rate && now - banxicoCache.fetchedAt < BANXICO_TTL_MS) {
// //       return res.json({
// //         source: "Banxico SIE (cached)",
// //         seriesId: SERIES_ID,
// //         date: banxicoCache.date,
// //         rate: banxicoCache.rate
// //       });
// //     }

// //     const token = process.env.BANXICO_TOKEN;
// //     if (!token) {
// //       return res.status(500).json({ error: "BANXICO_TOKEN not configured" });
// //     }

// //     const url = `${BANXICO_BASE}/series/${SERIES_ID}/datos/oportuno?token=${token}`;
// //     const { data } = await axios.get(url, {
// //       headers: { Accept: "application/json" },
// //       timeout: 10000
// //     });

// //     const series = data?.bmx?.series?.[0];
// //     const last = series?.datos?.[0];

// //     if (!last || !last.dato) {
// //       return res.status(502).json({ error: "Unexpected Banxico response shape" });
// //     }

// //     const parsed = parseFloat(String(last.dato).replace(",", "."));
// //     if (Number.isNaN(parsed)) {
// //       return res.status(502).json({ error: "Invalid rate value from Banxico" });
// //     }

// //     // update cache
// //     banxicoCache = {
// //       rate: parsed,
// //       date: last.fecha, // e.g. "2025-08-12"
// //       fetchedAt: now
// //     };

// //     res.json({
// //       source: "Banxico SIE",
// //       seriesId: SERIES_ID,
// //       date: last.fecha,
// //       rate: parsed
// //     });
// //   } catch (err) {
// //     console.error("Banxico API error:", err?.response?.data || err.message);
// //     res.status(500).json({ error: "Failed to fetch exchange rate" });
// //   }
// // });
// // try 1
//   // router.get("/exchange-rate/dof", async (req, res) => {
//   //   try {
//   //     const token = process.env.BANXICO_TOKEN;
//   //     if (!token) {
//   //       return res.status(500).json({ error: "Missing BANXICO_TOKEN env var" });
//   //     }
  
//   //     // DOF exchange-rate series (Banxico SIE). We ask for the most recent value: datos/oportuno
//   //     const url = "https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF60632/datos/oportuno";
  
//   //     const { data } = await axios.get(url, {
//   //       headers: { "Bmx-Token": token },
//   //     });
  
//   //     const serie = data?.bmx?.series?.[0];
//   //     const dato = serie?.datos?.[0];
//   //     const rate = parseFloat(dato?.dato);
  
//   //     if (!rate || Number.isNaN(rate)) {
//   //       return res.status(502).json({ error: "Could not parse DOF rate from Banxico response." });
//   //     }
  
//   //     res.json({
//   //       rate,
//   //       date: dato?.fecha,
//   //       source: "Banxico SIE (Tipo de Cambio DOF: SF60632)",
//   //     });
//   //   } catch (err) {
//   //     console.error("Error fetching DOF rate:", err?.response?.data || err.message);
//   //     res.status(500).json({ error: "Failed to fetch exchange rate." });
//   //   }
//   // });

// // ENDPOINT FOR UPDATING ORDER AT PACKED STAGE - ADMIN SIDE
// // router.put("/orders/:orderId", async (req, res) => {
// //     try {
// //       const order = await newOrderModel.findById(req.params.id);
// //       if (!order) return res.status(404).send("Order not found.");
  
// //       // Update fields
// //       if (req.body.packerName) order.packerName = req.body.packerName;
// //       if (req.body.orderStatus) order.orderStatus = req.body.orderStatus;
// //       if (req.body.packingEvidence) order.packingEvidence = req.body.packingEvidence;
  
// //       await order.save();
// //       res.json(order);
// //     } catch (err) {
// //       console.error("Error updating order:", err);
// //       res.status(500).send("Server error.");
// //     }
// //   });
    
// // PUT /orders/:orderId - Update order status, payment, or packer info
// // router.put("/orders/:orderId", async (req, res) => {
// //     try {
// //       const updateFields = {};
// //       if (req.body.orderStatus) updateFields.status = req.body.orderStatus;
// //       if (req.body.paymentMethod) updateFields.paymentMethod = req.body.paymentMethod;
// //       if (req.body.receivingAccount) updateFields.receivingAccount = req.body.receivingAccount;
// //       if (req.body.packerName) updateFields.packerName = req.body.packerName;
  
// //       const order = await newOrderModel.findByIdAndUpdate(
// //         req.params.orderId,
// //         { $set: updateFields },
// //         { new: true }
// //       );
// //       res.json(order);
// //     } catch (err) {
// //       res.status(500).json({ message: "Server error updating order" });
// //     }
// //     console.log(updateFields)

// // });
  
// // POST /upload-evidence - upload payment evidence from user
// router.post("/upload-evidence", upload.single("evidenceImage"), async (req, res) => {
//     try {
//       const order = await newOrderModel.findByIdAndUpdate(
//         req.body.orderId,
//         { $set: { paymentEvidenceUrl: `/uploads/${req.file.filename}` } },
//         { new: true }
//       );
//       res.json({ message: "Evidencia subida", order });
//     } catch (err) {
//       res.status(500).json({ message: "Error uploading evidence" });
//     }
//   });
  
//   // POST /upload-pack-evidence - upload packing evidence from packer
//   router.post("/upload-pack-evidence", upload.single("evidenceImage"), async (req, res) => {
//     try {
//       const order = await newOrderModel.findByIdAndUpdate(
//         req.body.orderId,
//         { $set: { packingEvidenceUrl: `/uploads/${req.file.filename}` } },
//         { new: true }
//       );
//       res.json({ message: "Evidencia de empaquetado subida", order });
//     } catch (err) {
//       res.status(500).json({ message: "Error uploading packing evidence" });
//     }
//   });

// // PLACE INVENTORY ON HOLD 
// // // POST /inventory/hold
// // router.post("/hold", async (req, res) => {
// //   try {
// //     const { orderId, lines, holdMinutes = 120 } = req.body;
// //     if (!orderId || !Array.isArray(lines) || lines.length === 0) {
// //       return res.status(400).json({ message: "orderId y lines son requeridos" });
// //     }

// //     const order = await newOrderModel.findById(orderId);
// //     if (!order) return res.status(404).json({ message: "Orden no encontrada" });

// //     const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);

// //     const hold = await Hold.create({ orderId, lines, expiresAt, confirmed: false });

// //     // Optional but recommended: push holds to a “RESERVAS” sheet so your LIVE sheet can subtract
// //     await pushHoldsToSheets(); // writes all active holds snapshot to sheets

// //     res.json({ ok: true, holdId: hold._id });
// //   } catch (e) {
// //     console.error(e);
// //     res.status(500).json({ message: "Error creando la reserva" });
// //   }
// // });

// // // POST /inventory/confirm/:orderId  (called when payment is verified)
// // router.post("/confirm/:orderId", async (req, res) => {
// //   try {
// //     const { orderId } = req.params;

// //     // Find active hold(s) for that order
// //     const holds = await Hold.find({ orderId, confirmed: false, expiresAt: { $gt: new Date() } });
// //     if (!holds.length) return res.status(404).json({ message: "No hay reservas activas" });

// //     // 1) Permanently decrement inventory in Google Sheets
// //     await applyPermanentDecrement(holds);

// //     // 2) Mark holds confirmed (so they no longer subtract as holds)
// //     await Hold.updateMany({ orderId, confirmed: false }, { $set: { confirmed: true } });

// //     // 3) Refresh the holds snapshot in Sheets (so “available” matches)
// //     await pushHoldsToSheets();

// //     res.json({ ok: true });
// //   } catch (e) {
// //     console.error(e);
// //     res.status(500).json({ message: "Error confirmando reserva" });
// //   }
// // });

// // // Optional: manual release (if you ever need to cancel early)
// // router.post("/release/:orderId", async (req, res) => {
// //   try {
// //     const { orderId } = req.params;
// //     await Hold.deleteMany({ orderId, confirmed: false });
// //     await pushHoldsToSheets(); // refresh snapshot so available updates
// //     res.json({ ok: true });
// //   } catch (e) {
// //     console.error(e);
// //     res.status(500).json({ message: "Error liberando reserva" });
// //   }
// // });

// // LIST: lightweight — no pdfBuffer
// router.get('/pdfquotes', async (req, res) => {
//   try {
//     const { since } = req.query; // optional ?since=2025-08-01
//     const find = {};
//     if (since) {
//       const d = new Date(since);
//       if (!isNaN(+d)) find.createdAt = { $gte: d };
//     }

//     const docs = await PdfQuote
//       .find(find)
//       .select('_id filename contentType createdAt metadata') // omit pdfBuffer
//       .sort({ createdAt: -1 });

//     res.json(docs);
//   } catch (e) {
//     console.error('GET /pdfquotes error:', e);
//     res.status(500).json({ error: 'Failed to list quotes' });
//   }
// });

// // DETAIL: single doc (still omit the buffer)
// router.get('/pdfquotes/:id', async (req, res) => {
//   try {
//     const doc = await PdfQuote
//       .findById(req.params.id)
//       .select('_id filename contentType createdAt metadata');
//     if (!doc) return res.status(404).json({ error: 'Quote not found' });
//     res.json(doc);
//   } catch (e) {
//     console.error('GET /pdfquotes/:id error:', e);
//     res.status(500).json({ error: 'Failed to fetch quote' });
//   }
// });

// // FILE: stream the PDF binary
// router.get('/pdfquotes/:id/file', async (req, res) => {
//   try {
//     const doc = await PdfQuote.findById(req.params.id).select('filename contentType pdfBuffer');
//     if (!doc) return res.status(404).json({ error: 'Quote not found' });
//     if (!doc.pdfBuffer) return res.status(404).json({ error: 'PDF data not found' });

//     res.setHeader('Content-Disposition', `inline; filename="${doc.filename || 'quote.pdf'}"`);
//     res.setHeader('Content-Type', doc.contentType || 'application/pdf');
//     res.send(doc.pdfBuffer);
//   } catch (e) {
//     console.error('GET /pdfquotes/:id/file error:', e);
//     res.status(500).json({ error: 'Failed to stream PDF' });
//   }
// });

// // ENDPOINT TO RETRIEVE PHOTOGRAPHIC EVIDENCES
// function sendFileFromDoc(res, fileDoc, fallbackName) {
//   if (!fileDoc || !fileDoc.data) return res.status(404).send("File not found");
//   res.setHeader("Content-Type", fileDoc.mimetype || "application/octet-stream");
//   const filename = fileDoc.filename || fallbackName || "evidence.bin";
//   res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
//   return res.send(fileDoc.data);
// }

// // GET /orders/:orderId/evidence/payment
// router.get("/:orderId/evidence/payment", async (req, res) => {
//   try {
//     const order = await newOrderModel.findById(req.params.orderId).lean();
//     if (!order) return res.status(404).send("Order not found");
//     return sendFileFromDoc(res, order.evidenceFile, "payment-evidence");
//   } catch (e) {
//     console.error(e);
//     res.status(500).send("Server error");
//   }
// });

// // GET /orders/:orderId/evidence/delivery
// router.get("/:orderId/evidence/delivery", async (req, res) => {
//   try {
//     const order = await newOrderModel.findById(req.params.orderId).lean();
//     if (!order) return res.status(404).send("Order not found");
//     return sendFileFromDoc(res, order.deliveryEvidence, "delivery-evidence");
//   } catch (e) {
//     console.error(e);
//     res.status(500).send("Server error");
//   }
// });

// // GET /orders/:orderId/evidence/packing/:index
// router.get("/:orderId/evidence/packing/:index", async (req, res) => {
//   try {
//     const order = await newOrderModel.findById(req.params.orderId).lean();
//     if (!order) return res.status(404).send("Order not found");
//     const idx = Number(req.params.index);
//     if (!Array.isArray(order.packingEvidence) || !Number.isInteger(idx) || idx < 0 || idx >= order.packingEvidence.length) {
//       return res.status(404).send("Packing evidence not found");
//     }
//     return sendFileFromDoc(res, order.packingEvidence[idx], `packing-${idx + 1}`);
//   } catch (e) {
//     console.error(e);
//     res.status(500).send("Server error");
//   }
// });

// // GISCONNECT END

// module.exports = router
