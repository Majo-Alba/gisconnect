const express = require('express')
const cors = require('cors')

const router = express.Router()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const verifyToken = require("../verifyToken")

const multer = require("multer")
const path = require('path')

// jul29
const crypto = require("crypto");
const nodemailer = require("nodemailer");
// jul29
// BASE ROUTES END

// GISCONNECT
const axios = require("axios");

const newUserModel = require("../models/newUserModel")
const newOrderModel = require("../models/orderModel")
const Order = require("../models/orderEvidenceModel"); // Adjust path if needed
const ShippingAddress = require("../models/ShippingAddress"); // <- you'll create this model
const BillingAddress = require("../models/BillingAddress"); // <- you'll create this model
const PdfQuote = require("../models/pdfQuoteModel"); // <- you'll create this model
// const Hold = require("../models/Hold");
// const { pushHoldsToSheets, applyPermanentDecrement } = require("../services/sheetsBridge");

// GISCONNECT END

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
    // destination: function (req, res, cb) {
        cb(null, './files')
    },
    filename: (req, file, cb) => {
        // cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname))
        cb(null, file.originalname)


    // filename: function (req, file, cb) {
        // const uniqueSuffix = Date.now()
        // cb(null, uniqueSuffix+file.originalname)
    }
})
// MODIF AUG13
// const upload = multer({ storage: storage })

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB, tweak as needed
});
// END MODIF AUG13

// router.post("/upload-files", upload.single("folioPDF"), async (req,res) => {
//     console.log(req.file)
// })
//END APR04

//USER RELATED API's

// GISCONNECT START!
//API || ENDPOINT FOR REGISTERING USER & PASSWORD HASHING
router.post('/register', (req,res) => {
    let user = req.body
    console.log(user)

    bcrypt.genSalt(10,(err,salt) => {
        if(!err)
        {
            bcrypt.hash(user.contrasena, salt, (err,hpass) => {
                if(!err)
                {
                    user.contrasena = hpass

                    newUserModel.create(user)
                    .then((doc) => {
                        res.status(201).send({message:"¡Usuario registrado exitosamente!"})
                    })
                    .catch((err) => {
                        console.log(err)
                        res.status(500).send({message:"Encountered a problem while registering user"})
                    })
                }
            })
        }
    })
})

//API || ENDPOINT FOR LOGIN
router.post('/login', (req, res) => {
    let userCred = req.body
    console.log(userCred)

    newUserModel.findOne({correo:userCred.correo})
    .then((user) => {
        if(user !==null) {
            bcrypt.compare(userCred.contrasena, user.contrasena, (err, result) => {
                if(result===true) {
                    //TOKEN GENERATION
                    jwt.sign({correo:userCred.correo}, "kangarookey", (err, token) => {
                        if(!err) {
                            res.send({token:token})
                        }
                        else {
                            res.status(500).send({message: " Some problem while creating token. Please try again"})
                        }
                    })
                }
                else {
                    res.status(403).send({message: "Contraseña incorrecta!"})
                }
            })
        }
        else {
            res.status(404).send({message: "El usuario no se encontró"})
        }
    })
    .catch((err) => {
        console.log(err)
        res.send({message: "Encountered some problem!"})
    })
})

// ENDPOINT FOR RESTORING FORGOTTEN PASSWORD
router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
  
    try {
      const user = await newUserModel.findOne({ correo: email });
      if (!user) return res.status(404).json({ message: "Correo no registrado." });
  
      // Create token
      const token = crypto.randomBytes(32).toString("hex");
      user.resetPasswordToken = token;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
      await user.save();
  
      const resetLink = `http://localhost:5173/reset-password/${token}`; // adjust if hosted
  
      // Send email
      const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
          user: "kangaroo.cacti@gmail.com",
          pass: "bebt svht sgmq ezlz" // use environment variable in prod!
        }
      });
  
      const mailOptions = {
        to: email,
        from: "no-reply@gisconnect.com",
        subject: "Restablecimiento de contraseña",
        text: `Recibimos una solicitud para restablecer tu contraseña. Haz click en el siguiente enlace: ${resetLink}`
      };
  
      await transporter.sendMail(mailOptions);
  
      res.status(200).json({ message: "Correo enviado. Revisa tu bandeja de entrada." });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Error al procesar la solicitud." });
    }
});

// ENDPOINT FOR RESETING USER PASSWORD
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

//TOKEN VERIFIED ENDPOINT EXAMPLE --> MAKE SURE TO DELETE!!
router.get('/getdata', verifyToken, (req,res) => {
    res.send({message:"Bad dev with good heart"})
})

//ENDPOINT FOR FETCHING FULL COLLECTION DATA
router.get('/register', (req,res) => {
    newUserModel.find()
    .then((projects) => {
        res.send(projects)
        console.log(projects);
    })
    .catch((err) => {
        console.log(err);
        res.send({message:"Couldn't fetch projects"})
    })
})

// SEP06
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

// PUT /users/shipping-prefs
router.put('/users/shipping-prefs', async (req, res) => {
  try {
    // Accept both shapes:
    // { email, shippingPreferences: { preferredCarrier, insureShipment } }
    // or flat: { email, preferredCarrier, insureShipment }
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const nested = req.body?.shippingPreferences || {};
    const preferredCarrier = String(nested.preferredCarrier ?? req.body?.preferredCarrier ?? '').trim();
    const insureShipment = !!(nested.insureShipment ?? req.body?.insureShipment);

    // Validate carrier (optional)
    // if (!preferredCarrier) return res.status(400).json({ error: 'preferredCarrier is required' });

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
// ================== USERS: fetch by email ==================
// GET /users/by-email?email=user@domain.com
// router.get('/users/by-email', async (req, res) => {
//   try {
//     const raw = (req.query.email || '').trim();
//     if (!raw) return res.status(400).json({ error: 'Missing email query param' });

//     const email = raw.toLowerCase();

//     // Try common field names your app might be using
//     // Adjust field names if your newUserModel schema differs.
//     const user = await newUserModel.findOne({
//       $or: [
//         { correo: email },            // typical field used across your app
//         { email },                    // alternative
//         { 'contact.email': email },   // if you stored it nested
//       ],
//     }).lean();

//     if (!user) return res.status(404).json({ error: 'User not found' });

//     res.json(user);
//   } catch (err) {
//     console.error('GET /users/by-email error:', err);
//     res.status(500).json({ error: 'Failed to fetch user' });
//   }
// });


// // ================== USERS: update shipping preferences ==================
// // PUT /users/shipping-prefs
// // Body: { email, preferredCarrier, insureShipment }
// router.put("/users/shipping-prefs", async (req, res) => {
//   try {
//     const { email, preferredCarrier, insureShipment } = req.body;

//     if (!email) {
//       return res.status(400).json({ error: "Email is required" });
//     }

//     const updated = await newUserModel.findOneAndUpdate(
//       { correo: email },
//       {
//         $set: {
//           shippingPreferences: {
//             preferredCarrier: preferredCarrier?.trim() || "",
//             insureShipment: !!insureShipment,
//           },
//         },
//       },
//       { new: true }
//     );

//     if (!updated) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     res.json(updated);
//   } catch (err) {
//     console.error("Update shipping prefs error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// -------

// router.put('/users/shipping-prefs', async (req, res) => {
//   try {
//     const { email: rawEmail, preferredCarrier, insureShipment } = req.body || {};
//     if (!rawEmail) return res.status(400).json({ error: 'Missing "email" in body' });

//     const email = String(rawEmail).toLowerCase().trim();

//     // Build update doc (keep both nested + flat for backward compatibility)
//     const update = {
//       $set: {
//         shippingPreferences: {
//           preferredCarrier: preferredCarrier || '',
//           insureShipment: !!insureShipment,
//         },
//         preferredCarrier: preferredCarrier || '',
//         insureShipment: !!insureShipment,
//       },
//     };

//     // If you want to require existing users, use upsert:false (current)
//     // If you want to auto-create a user when not found, set upsert:true
//     const options = { new: true, upsert: false };

//     const updated = await newUserModel.findOneAndUpdate(
//       {
//         $or: [
//           { correo: email },
//           { email },
//           { 'contact.email': email },
//         ],
//       },
//       update,
//       options
//     ).lean();

//     if (!updated) {
//       return res.status(404).json({ error: 'User not found for update' });
//     }

//     res.json({ message: 'Shipping preferences updated', data: updated });
//   } catch (err) {
//     console.error('PUT /users/shipping-prefs error:', err);
//     res.status(500).json({ error: 'Failed to update shipping preferences' });
//   }
// });

// SEP06

// ENDPOINT FOR UPLOADING A NEW ORDER INTO MONGO
router.post('/orderDets', upload.single('pdf'), async (req, res) => {
  try {
    const raw = req.body.order;
    if (!raw) return res.status(400).json({ error: 'Missing order JSON in "order" field' });

    const order = JSON.parse(raw);
   // Normalize/stabilize email so reads match writes
   if (order && order.userEmail) {
     order.userEmail = String(order.userEmail).trim().toLowerCase();
   }

    if (req.file) {
      const { originalname, mimetype, buffer } = req.file;
      order.quotePdf = { filename: originalname, contentType: mimetype, data: buffer };
    }

    const created = await newOrderModel.create(order);
    res.status(201).json({ data: created, message: "Nueva orden registrada exitosamente" });
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// OFF SEP02 - 1:13
// Create order + (optional) PDF upload
// router.post('/orderDets', upload.single('pdf'), async (req, res) => {
//   try {
//     // --- 1) Parse the "order" field (multipart text). Be tolerant. ---
//     let orderRaw = req.body?.order;
//     if (!orderRaw) {
//       return res.status(400).json({ error: 'Missing order JSON in "order" field.' });
//     }

//     let order;
//     try {
//       // Some engines may already send it as object; most send it as string.
//       order = typeof orderRaw === 'string' ? JSON.parse(orderRaw) : orderRaw;
//     } catch (e) {
//       return res.status(400).json({ error: 'Invalid JSON in "order" field.' });
//     }

//     // --- 2) Optional PDF (multer memoryStorage provides buffer) ---
//     if (req.file && req.file.buffer) {
//       const { originalname, mimetype, buffer } = req.file;
//       order.quotePdf = {
//         filename: originalname || "order_summary.pdf",
//         contentType: mimetype || "application/pdf",
//         data: buffer,
//       };
//     }

//     // --- 3) Minimal normalization / defaults (don’t overwrite user intent) ---
//     if (!order.orderDate) order.orderDate = new Date().toISOString();
//     if (!order.orderStatus) order.orderStatus = "Pedido Realizado";

//     // --- 4) Persist ---
//     const created = await newOrderModel.create(order);

//     // --- 5) Reply (stable shape + id surfaced) ---
//     return res.status(201).json({
//       message: "Nueva orden registrada exitosamente",
//       data: created,
//       id: created?._id,
//     });
//   } catch (err) {
//     console.error("Error creating order:", err);
//     // Try to surface a bit more detail for client logs (but keep it safe)
//     return res.status(500).json({ error: "Failed to create order" });
//   }
// });
// OFF SEP02 - 1:13

// OFF SEP01 - 5:22
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
// OFF SEP01 - 5:22

// router.post('/orderDets', (req,res) => {
//     let newOrder = req.body
//     console.log(newOrder)
    
//     newOrderModel.create({...req.body})
//     .then((data) => {
//         res.send({data:data,message:"Nueva orden registrada exitosamente"})
//         console.log(data);
//         console.log("New order created!");
//     })
//     .catch((err) => {
//         console.log(err);
//     })
// })

// ENDPOINT FOR UPLOADING ORDER STATUS
// PATCH /order/:id/status
router.patch("/order/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;
    if (!orderStatus) return res.status(400).json({ message: "orderStatus requerido" });

    const updated = await newOrderModel.findByIdAndUpdate(
      id,
      { orderStatus },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Orden no encontrada" });

    res.json({ message: "Estatus actualizado", order: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error interno" });
  }
});

// SEP02 - 1:15
// GET /userOrders?email=<email>
router.get('/userOrders', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });

    const orders = await newOrderModel
      .find({ userEmail: email })
      .sort({ orderDate: -1 })
      .lean();

    res.json(Array.isArray(orders) ? orders : []);
  } catch (err) {
    console.error('Error fetching user orders:', err);
    res.status(500).json({ error: 'Failed to fetch user orders' });
  }
});

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
// SEP02 - 1:15

// POST endpoint to receive invoice PDF
router.post("/upload-invoice", upload.single("invoicePDF"), async (req, res) => {
    try {
      const orderId = req.body.orderId;
      const filePath = req.file.path;
  
      const updatedOrder = await newOrderModel.findByIdAndUpdate(
        orderId,
        { invoiceFilePath: filePath },
        { new: true }
      );
  
      if (!updatedOrder) {
        return res.status(404).json({ message: "Order not found" });
      }
  
      res.status(200).json({ message: "Invoice uploaded successfully", path: filePath });
    } catch (err) {
      console.error("Error uploading invoice:", err);
      res.status(500).json({ message: "Failed to upload invoice" });
    }
  });

// Upload Evidence Endpoint
router.post("/upload-evidence", upload.single("evidenceImage"), async (req, res) => {
  try {
    const { orderId } = req.body;
    const file = req.file;

    console.log("Received orderId:", orderId);
    console.log("Received file:", file && {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    if (!orderId) {
      return res.status(400).json({ message: "Order ID not provided" });
    }

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Find order (no update yet)
    const order = await newOrderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // If using memoryStorage, the bytes are in file.buffer
    order.evidenceFile = {
      filename: file.originalname,
      mimetype: file.mimetype,
      data: file.buffer, // <— no fs.readFileSync, no file.path needed
      uploadedAt: new Date()
    };

    await order.save();

    return res.status(200).json({ message: "Evidencia guardada en MongoDB correctamente" });
  } catch (error) {
    console.error("Upload Evidence Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// ENDPOINT FOR UPLOADING A NEW SHIPPING ADDRESS
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

// ENDPOINT FOR RETRIEVING ALTERNATE SHIPPING ADDRESS
router.get('/shipping-address/:email', async (req, res) => {
    try {
      const email = req.params.email;
      const addresses = await ShippingAddress.find({ userEmail: email });
      res.json(addresses);
    } catch (error) {
      console.error("Error fetching billing addresses:", error);
      res.status(500).json({ error: "Server error" });
    }
  });


// ENDPOINT FOR UPLOADING A NEW BILLING ADDRESS
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

// ENDPOINT FOR RETRIEVING ALTERNATE BILLING ADDRESS
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

// ENDPOINT FOR RETRIEVING ALL NEW ORDERS - ADMIN SIDE
// SEP02 - 2:17
router.get('/orders', async (req, res) => {
  try {
    const email = (req.query.email || "").trim();

    // prevent SW/proxies from caching user-specific lists
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    const findQuery = email ? { userEmail: email } : {};
    const orders = await newOrderModel
      .find(findQuery)
      .sort({ orderDate: -1, _id: -1 });

    return res.json(orders);
  } catch (err) {
    console.error("Error fetching orders:", err);
    return res.status(500).json({ error: "Error fetching orders" });
  }
});
// router.get('/orders', async (req, res) => {
//     try {
//       const orders = await newOrderModel.find().sort({ orderDate: -1 });
//       res.json(orders);
//     } catch (err) {
//       res.status(500).json({ error: 'Error fetching orders' });
//     }
//   });
// SEP02 - 2:17

// ENDPOINT FOR RETRIEVING ALL DETAILS OF EACH ORDER - ADMIN SIDE
router.get('/orders/:id', async (req, res) => {
    const orderId = req.params.id;
    try {
      const order = await newOrderModel.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
  
      // If you want to include related data (customer info, etc.), ensure your model returns it
      // or manually attach it here if needed.
  
      res.json(order);
    } catch (error) {
      console.error("Error fetching order by ID:", error);
      res.status(500).json({ message: "Error retrieving order data" });
    }
  });

// ENDPOINT FOR UPDATING ORDER AT PAYMENT VALIDATION STAGE - ADMIN SIDE
router.put(
  "/orders/:orderId",
  upload.fields([
    { name: "evidenceImage", maxCount: 1 },  // user's payment evidence
    { name: "packingImages", maxCount: 3 },  // up to 3 packing images
    { name: "deliveryImage", maxCount: 1 },  // carrier/shipping evidence
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
    } = req.body;

    // helper: convert a multer file to { filename, mimetype, data, uploadedAt }
    const fileToDoc = (file) => {
      if (!file) return null;

      // Prefer memory storage buffer
      let buffer = file.buffer || null;

      // Fallback for disk storage (not recommended if you configured memoryStorage)
      if (!buffer && file.path) {
        const abs = path.isAbsolute(file.path)
          ? file.path
          : path.join(__dirname, "..", file.path);
        buffer = fs.readFileSync(abs);
        try { fs.unlinkSync(abs); } catch (_) {}
      }

      if (!buffer) return null;

      return {
        filename: file.originalname || file.filename || "evidence",
        mimetype: file.mimetype || "application/octet-stream",
        data: buffer,
        uploadedAt: new Date(),
      };
    };

    try {
      // Pull files (may be absent)
      const paymentEvidenceFile = (req.files?.evidenceImage || [])[0];
      const packingFiles = req.files?.packingImages || [];
      const deliveryFile = (req.files?.deliveryImage || [])[0];

      const paymentEvidenceDoc = fileToDoc(paymentEvidenceFile);
      const packingDocs = packingFiles.map(fileToDoc).filter(Boolean);
      const deliveryDoc = fileToDoc(deliveryFile);

      // Normalize some fields (optional but robust)
      const numericInsured = insuredAmount ? Number(insuredAmount) : undefined;
      const parsedDeliveryDate =
        deliveryDate ? new Date(deliveryDate) : undefined;

      // Build $set payload
      const $set = {
        ...(paymentMethod && { paymentMethod }),
        ...(paymentAccount && { paymentAccount }),
        ...(orderStatus && { orderStatus }),
        ...(packerName && { packerName }),
        ...(numericInsured !== undefined && { insuredAmount: numericInsured }),
        ...(parsedDeliveryDate && { deliveryDate: parsedDeliveryDate }),
        ...(trackingNumber && { trackingNumber }),
      };

      if (paymentEvidenceDoc) {
        // single object field
        $set.evidenceFile = paymentEvidenceDoc;
      }

      if (deliveryDoc) {
        // single object field for delivery evidence
        $set.deliveryEvidence = deliveryDoc;
      }

      // Build update
      const update = { $set };

      if (packingDocs.length > 0) {
        // append (don’t overwrite) packing images
        update.$push = { packingEvidence: { $each: packingDocs } };
      }

      const updatedOrder = await newOrderModel.findByIdAndUpdate(orderId, update, {
        new: true,
      });

      if (!updatedOrder) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  }
);


// ENDPOINT TO GET SPECIFIC ORDER FOR TO PACK - ADMIN SIDE
router.get("/orders/:orderId", async (req, res) => {
    try {
      const order = await newOrderModel.findById(req.params.orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      res.status(500).json({ message: "Server error" });
    }
  });

// ENDPOINT FOR FETCHING GOOGLE SHEETS DATABASE
router.get("/shipping-preferences", async (req, res) => {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTyCM71h4JvqTsLcQ5dwYj0rapCn_j4qKbz6uh43zTMJsah9CULKqmz1nxC05Yn6a98oZ1jjqpQxNAZ/pub?gid=2117653598&single=true&output=csv';
  
    try {
      const response = await axios.get(csvUrl);
      res.send(response.data); // returns raw CSV to frontend
    } catch (error) {
      console.error("Error fetching shipping preferences:", error);
      res.status(500).send("Failed to fetch CSV");
    }
  });

// ENDPOINT FOR UPLOADING NEW QUOTES TO MONGO
// Preflight for mobile/Safari/etc.
router.options("/save-pdf", cors());

// Accept a PDF blob (field name: "pdf") with optional JSON "metadata"
router.post("/save-pdf", cors(), upload.single("pdf"), async (req, res) => {
  try {
    // Basic CORS/cache hygiene on the response
    res.set({
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": "Content-Type, Content-Length",
    });

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded under field "pdf".' });
    }

    const { originalname = "document.pdf", mimetype = "", buffer } = req.file;

    // Allow common PDF types; relax if you also accept images here
    const allowed = new Set(["application/pdf", "application/octet-stream"]);
    if (!allowed.has(mimetype)) {
      // Some mobiles send octet-stream for blobs; we still allow that
      console.warn("Unexpected mimetype for /save-pdf:", mimetype);
    }

    // Optional metadata string → object
    let metadata = {};
    if (typeof req.body?.metadata === "string" && req.body.metadata.trim()) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch (e) {
        return res.status(400).json({ ok: false, error: "Invalid JSON in metadata." });
      }
    }

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ ok: false, error: "Empty or invalid file buffer." });
    }

    const doc = new PdfQuote({
      filename: originalname,
      contentType: mimetype || "application/pdf",
      pdfBuffer: buffer,              // multer memoryStorage provides this
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
// OFF SEP01
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
// OFF SEP01

  // ENDPOINT FOR FETCHING DOF EXCHANGE
  //try3
  router.get("/fx/usd-dof", async (req, res) => {
    try {
      const token = process.env.BANXICO_TOKEN; // put your token in .env
      if (!token) {
        return res.status(500).json({ error: "Missing BANXICO_TOKEN" });
      }
  
      // Helper to format YYYY-MM-DD
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
  
      // We’ll fetch ~10 recent days to be safe across weekends/holidays
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 10);
  
      const url = `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/${fmt(
        start
      )}/${fmt(today)}?token=${token}`;
  
      const { data } = await axios.get(url, {
        headers: { Accept: "application/json" },
      });
  
      // SIE structure: series[0].datos = [{ fecha: "dd/MM/yyyy", dato: "value" }, ...]
      const datos = data?.bmx?.series?.[0]?.datos || [];
  
      if (!datos.length) {
        return res.status(502).json({ error: "No data returned by Banxico." });
      }
  
      // Parse to Date objects, keep only entries strictly before 'today'
      const parsed = datos
        .map((r) => {
          const [dd, mm, yyyy] = r.fecha.split("/");
          return { date: new Date(`${yyyy}-${mm}-${dd}T00:00:00-06:00`), value: r.dato };
        })
        .filter((r) => r.value && !isNaN(Number(r.value)) && r.date < today)
        .sort((a, b) => a.date - b.date);
  
      if (!parsed.length) {
        return res.status(404).json({ error: "No prior business-day FIX found." });
      }
  
      const dof = parsed[parsed.length - 1]; // latest prior business day
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
  
// POST /upload-evidence - upload payment evidence from user
router.post("/upload-evidence", upload.single("evidenceImage"), async (req, res) => {
    try {
      const order = await newOrderModel.findByIdAndUpdate(
        req.body.orderId,
        { $set: { paymentEvidenceUrl: `/uploads/${req.file.filename}` } },
        { new: true }
      );
      res.json({ message: "Evidencia subida", order });
    } catch (err) {
      res.status(500).json({ message: "Error uploading evidence" });
    }
  });
  
  // POST /upload-pack-evidence - upload packing evidence from packer
  router.post("/upload-pack-evidence", upload.single("evidenceImage"), async (req, res) => {
    try {
      const order = await newOrderModel.findByIdAndUpdate(
        req.body.orderId,
        { $set: { packingEvidenceUrl: `/uploads/${req.file.filename}` } },
        { new: true }
      );
      res.json({ message: "Evidencia de empaquetado subida", order });
    } catch (err) {
      res.status(500).json({ message: "Error uploading packing evidence" });
    }
  });

// PLACE INVENTORY ON HOLD 
// // POST /inventory/hold
// router.post("/hold", async (req, res) => {
//   try {
//     const { orderId, lines, holdMinutes = 120 } = req.body;
//     if (!orderId || !Array.isArray(lines) || lines.length === 0) {
//       return res.status(400).json({ message: "orderId y lines son requeridos" });
//     }

//     const order = await newOrderModel.findById(orderId);
//     if (!order) return res.status(404).json({ message: "Orden no encontrada" });

//     const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);

//     const hold = await Hold.create({ orderId, lines, expiresAt, confirmed: false });

//     // Optional but recommended: push holds to a “RESERVAS” sheet so your LIVE sheet can subtract
//     await pushHoldsToSheets(); // writes all active holds snapshot to sheets

//     res.json({ ok: true, holdId: hold._id });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ message: "Error creando la reserva" });
//   }
// });

// // POST /inventory/confirm/:orderId  (called when payment is verified)
// router.post("/confirm/:orderId", async (req, res) => {
//   try {
//     const { orderId } = req.params;

//     // Find active hold(s) for that order
//     const holds = await Hold.find({ orderId, confirmed: false, expiresAt: { $gt: new Date() } });
//     if (!holds.length) return res.status(404).json({ message: "No hay reservas activas" });

//     // 1) Permanently decrement inventory in Google Sheets
//     await applyPermanentDecrement(holds);

//     // 2) Mark holds confirmed (so they no longer subtract as holds)
//     await Hold.updateMany({ orderId, confirmed: false }, { $set: { confirmed: true } });

//     // 3) Refresh the holds snapshot in Sheets (so “available” matches)
//     await pushHoldsToSheets();

//     res.json({ ok: true });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ message: "Error confirmando reserva" });
//   }
// });

// // Optional: manual release (if you ever need to cancel early)
// router.post("/release/:orderId", async (req, res) => {
//   try {
//     const { orderId } = req.params;
//     await Hold.deleteMany({ orderId, confirmed: false });
//     await pushHoldsToSheets(); // refresh snapshot so available updates
//     res.json({ ok: true });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ message: "Error liberando reserva" });
//   }
// });

// LIST: lightweight — no pdfBuffer
router.get('/pdfquotes', async (req, res) => {
  try {
    const { since } = req.query; // optional ?since=2025-08-01
    const find = {};
    if (since) {
      const d = new Date(since);
      if (!isNaN(+d)) find.createdAt = { $gte: d };
    }

    const docs = await PdfQuote
      .find(find)
      .select('_id filename contentType createdAt metadata') // omit pdfBuffer
      .sort({ createdAt: -1 });

    res.json(docs);
  } catch (e) {
    console.error('GET /pdfquotes error:', e);
    res.status(500).json({ error: 'Failed to list quotes' });
  }
});

// DETAIL: single doc (still omit the buffer)
router.get('/pdfquotes/:id', async (req, res) => {
  try {
    const doc = await PdfQuote
      .findById(req.params.id)
      .select('_id filename contentType createdAt metadata');
    if (!doc) return res.status(404).json({ error: 'Quote not found' });
    res.json(doc);
  } catch (e) {
    console.error('GET /pdfquotes/:id error:', e);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// FILE: stream the PDF binary
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

// ENDPOINT TO RETRIEVE PHOTOGRAPHIC EVIDENCES
function sendFileFromDoc(res, fileDoc, fallbackName) {
  if (!fileDoc || !fileDoc.data) return res.status(404).send("File not found");
  res.setHeader("Content-Type", fileDoc.mimetype || "application/octet-stream");
  const filename = fileDoc.filename || fallbackName || "evidence.bin";
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  return res.send(fileDoc.data);
}

// GET /orders/:orderId/evidence/payment
router.get("/:orderId/evidence/payment", async (req, res) => {
  try {
    const order = await newOrderModel.findById(req.params.orderId).lean();
    if (!order) return res.status(404).send("Order not found");
    return sendFileFromDoc(res, order.evidenceFile, "payment-evidence");
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

// GET /orders/:orderId/evidence/delivery
router.get("/:orderId/evidence/delivery", async (req, res) => {
  try {
    const order = await newOrderModel.findById(req.params.orderId).lean();
    if (!order) return res.status(404).send("Order not found");
    return sendFileFromDoc(res, order.deliveryEvidence, "delivery-evidence");
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

// GET /orders/:orderId/evidence/packing/:index
router.get("/:orderId/evidence/packing/:index", async (req, res) => {
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

router.get("/:orderId", async (req, res) => {
  const o = await newOrderModel.findById(req.params.orderId).lean();
  if (!o) return res.status(404).json({ error: "Not found" });
  return res.json(o);
});

// 🔎 Route inspector (visit /__routes to list routes)
router.get("/__routes", (_req, res) => {
  const flatten = (s) =>
    s
      .filter((l) => l.route || l.name === "router")
      .flatMap((l) =>
        l.route
          ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
          : (l.handle.stack || [])
              .filter((x) => x.route)
              .map((x) => ({
                method: Object.keys(x.route.methods)[0].toUpperCase(),
                path: x.route.path,
              }))
      );
  const stack = app._router?.stack ? flatten(app._router.stack) : [];
  res.json(stack);
});


// GISCONNECT END

module.exports = router


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
