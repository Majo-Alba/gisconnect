const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
require("dotenv/config");


const router = require("./routes/router"); // main routes
let evidenceRouter; try { evidenceRouter = require("./routes/evidence"); } catch {}

const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const app = express();

// Trust Render proxy (for correct IPs)
app.set("trust proxy", 1);

/* ----------------------------- CORS (FIRST) ----------------------------- */
// Default allowlist (used if CORS_ORIGINS is not provided)
const defaultAllowed = [
  "https://gisconnect-web.onrender.com",
  "http://localhost:5173",
  "http://localhost:5174",
];

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const allowedOrigins = corsOrigins.length ? corsOrigins : defaultAllowed;

function isAllowedOrigin(origin) {
  // Standalone PWAs / some Android WebViews send no Origin (or "null")
  if (!origin || origin === "null") return true;         // allow no-origin
  return allowedOrigins.includes(origin);
}

// Use ONLY the cors() middleware to set headers (avoid double-setting)
const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, origin || true); // reflect origin or allow all when none
    return cb(new Error(`CORS not allowed for origin: ${origin}`), false);
  },
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Accept","Authorization","X-Requested-With","Content-Length"],
  credentials: true,              // ok because we never send "*" as ACAO
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
/* ----------------------------------------------------------------------- */

/* ----------------------- Security, gzip, rate limit --------------------- */
app.use(helmet({
  // We load images/files from S3 or other origins – let them be cross-origin embeddable
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
}));
/* ----------------------------------------------------------------------- */

/* --------------------------- Parsers & cookies -------------------------- */
// NOTE: multer handles multipart/form-data on specific routes;
// these body parsers won’t interfere with it.
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(cookieParser());
/* ----------------------------------------------------------------------- */

/* ------------------------------ Healthcheck ----------------------------- */
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

app.get("/", (_req, res) => {
  res.type("text/plain").send("GISConnect API is running ✅  See /healthz");
});
/* ----------------------------------------------------------------------- */

/* ------------------------------ Diagnostics ---------------------------- */
setTimeout(() => {
  const flatten = (s) =>
    s.filter(l => l.route || l.name === "router").flatMap(l =>
      l.route
        ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
        : (l.handle.stack || [])
            .filter(x => x.route)
            .map(x => ({
              method: Object.keys(x.route.methods)[0].toUpperCase(),
              path: x.route.path,
            }))
    );
  const stack = app._router?.stack ? flatten(app._router.stack) : [];
  console.log("Registered routes:", stack);
}, 500);

app.get("/__routes", (_req, res) => {
  const flatten = (s) =>
    s.filter(l => l.route || l.name === "router").flatMap(l =>
      l.route
        ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
        : (l.handle.stack || []).filter(x => x.route).map(x => ({
            method: Object.keys(x.route.methods)[0].toUpperCase(), path: x.route.path
          }))
    );
  res.json(app._router?.stack ? flatten(app._router.stack) : []);
});
/* ----------------------------------------------------------------------- */

/* ------------------------------ Static files --------------------------- */
app.use("/files", express.static("files"));
/* ----------------------------------------------------------------------- */

/* --------- No-cache for API reads that the PWA tends to stale-cache ----- */
// Don’t target "/myOrders" (that’s a client route). Target the API path.
// OFF SEP02 - 1:19
// app.use((req, res, next) => {
//   if (req.method === "GET" && (req.path.startsWith("/userOrders") || req.path.startsWith("/orders/user"))) {
//     res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
//     res.setHeader("Pragma", "no-cache");
//     res.setHeader("Expires", "0");
//     res.setHeader("Surrogate-Control", "no-store");
//   }
//   next();
// });
// OFF SEP02 - 1:19
/* ----------------------------------------------------------------------- */
// SEP02 - 1:19
app.use((req, res, next) => {
  if (req.method === "GET" && (req.path.startsWith("/userOrders") || req.path.startsWith("/orders/user"))) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});
// SEP02 - 1:19

/* -------------------------------- Routers ------------------------------ */
// Evidence routes live under /orders  (PUT/POST for evidence, GETs, etc.)
if (evidenceRouter) app.use("/orders", evidenceRouter);

// Main app router last (contains /orderDets, /userOrders, etc.)
app.use("/", router);
/* ----------------------------------------------------------------------- */

// SEP08
const { router: notifyRouter } = require("./routes/notify");
app.use("/", notifyRouter);
// SEP08

/* ------------------------------- MongoDB ------------------------------- */
const mongoUri = process.env.DB_URI || process.env.MONGO_URI;
mongoose.connect(mongoUri)
  .then(() => console.log("MongoDB connected"))
  .catch(err => { console.error("Mongo error:", err); process.exit(1); });
/* ----------------------------------------------------------------------- */

/* --------------------------------- Listen ------------------------------ */
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log("Allowed CORS origins:", allowedOrigins);
});

//  ------- 

// // This solution is not working. Still facing the same initial problem (orders and images dont load) and now, furthermore, no orders are stored at all. You previously mentioned that this problem could be happening due to CORS and we made a lot of modifications to CORS in index.js. Hence, here is my index. js to take a look if there might me something messing us up

// const express = require("express");
// const cors = require("cors");
// const cookieParser = require("cookie-parser");
// const mongoose = require("mongoose");
// require("dotenv/config");

// const router = require("./routes/router"); // main routes
// let evidenceRouter; try { evidenceRouter = require("./routes/evidence"); } catch {}

// const helmet = require("helmet");
// const compression = require("compression");
// const rateLimit = require("express-rate-limit");

// const app = express();

// // Trust Render proxy (for correct IPs)
// app.set("trust proxy", 1);

// /* ----------------------------- CORS (FIRST) ----------------------------- */
// // Default allowlist (used if CORS_ORIGINS is not provided)
// const defaultAllowed = [
//   "https://gisconnect-web.onrender.com",
//   "http://localhost:5173",
//   "http://localhost:5174",
// ];

// const corsOrigins = (process.env.CORS_ORIGINS || "")
//   .split(",")
//   .map(s => s.trim())
//   .filter(Boolean);

// const allowedOrigins = corsOrigins.length ? corsOrigins : defaultAllowed;

// // Helper: is this origin allowed?
// function isAllowedOrigin(origin) {
//   // Standalone PWAs / some Android WebViews send no Origin (or "null")
//   if (!origin || origin === "null") return true;
//   return allowedOrigins.includes(origin);
// }

// // Lightweight header setter so browsers see exact ACAO
// app.use((req, res, next) => {
//   const origin = req.headers.origin;
//   if (isAllowedOrigin(origin)) {
//     res.setHeader("Access-Control-Allow-Origin", origin || "*");
//     res.setHeader("Vary", "Origin");
//     res.setHeader("Access-Control-Allow-Credentials", "true");
//     res.setHeader(
//       "Access-Control-Allow-Methods",
//       "GET,POST,PUT,PATCH,DELETE,OPTIONS"
//     );
//     res.setHeader(
//       "Access-Control-Allow-Headers",
//       "Content-Type, Accept, Authorization, X-Requested-With, Content-Length"
//     );
//     res.setHeader("Access-Control-Max-Age", "86400"); // 24h
//   }
//   // Fast preflight (before rate limit / helmet / etc.)
//   if (req.method === "OPTIONS") return res.sendStatus(204);
//   next();
// });

// // Your existing cors() (kept for compatibility with any libs that expect it)
// const corsOptions = {
//   origin: (origin, cb) => {
//     if (isAllowedOrigin(origin)) return cb(null, true);
//     return cb(new Error(`CORS not allowed for origin: ${origin}`), false);
//   },
//   methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
//   allowedHeaders: ["Content-Type","Accept","Authorization","X-Requested-With","Content-Length"],
//   credentials: true,
//   maxAge: 86400,
// };
// app.use(cors(corsOptions));
// app.options("*", cors(corsOptions));
// /* ----------------------------------------------------------------------- */

// /* ----------------------- Security, gzip, rate limit --------------------- */
// app.use(helmet({
//   // We load images/files from S3 – let them be cross-origin embeddable
//   crossOriginResourcePolicy: { policy: "cross-origin" },
// }));
// app.use(compression());
// app.use(rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 1000,
// }));
// /* ----------------------------------------------------------------------- */

// /* --------------------------- Parsers & cookies -------------------------- */
// // NOTE: multer handles multipart/form-data on specific routes;
// // these body parsers won’t interfere with it.
// app.use(express.json({ limit: "5mb" }));
// app.use(express.urlencoded({ extended: true, limit: "5mb" }));
// app.use(cookieParser());
// /* ----------------------------------------------------------------------- */

// /* ------------------------------ Healthcheck ----------------------------- */
// app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

// app.get("/", (_req, res) => {
//   res.type("text/plain").send("GISConnect API is running ✅  See /healthz");
// });
// /* ----------------------------------------------------------------------- */

// /* ------------------------------ Diagnostics ---------------------------- */
// setTimeout(() => {
//   const flatten = (s) =>
//     s.filter(l => l.route || l.name === "router").flatMap(l =>
//       l.route
//         ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
//         : (l.handle.stack || [])
//             .filter(x => x.route)
//             .map(x => ({
//               method: Object.keys(x.route.methods)[0].toUpperCase(),
//               path: x.route.path,
//             }))
//     );
//   const stack = app._router?.stack ? flatten(app._router.stack) : [];
//   console.log("Registered routes:", stack);
// }, 500);

// app.get("/__routes", (_req, res) => {
//   const flatten = (s) =>
//     s.filter(l => l.route || l.name === "router").flatMap(l =>
//       l.route
//         ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
//         : (l.handle.stack || []).filter(x => x.route).map(x => ({
//             method: Object.keys(x.route.methods)[0].toUpperCase(), path: x.route.path
//           }))
//     );
//   res.json(app._router?.stack ? flatten(app._router.stack) : []);
// });
// /* ----------------------------------------------------------------------- */

// /* ------------------------------ Static files --------------------------- */
// app.use("/files", express.static("files"));
// /* ----------------------------------------------------------------------- */

// // SEP01 6:04
// app.use((req, res, next) => {
//   // Only touch reads; uploads (POST) don’t matter for caching
//   if (req.method === "GET" && req.path.startsWith("/myOrders")) {
//     res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
//     res.setHeader("Pragma", "no-cache");
//     res.setHeader("Expires", "0");
//     res.setHeader("Surrogate-Control", "no-store");
//   }
//   next();
// });
// // SEP01 6:04

// /* -------------------------------- Routers ------------------------------ */
// // Evidence routes live under /orders
// if (evidenceRouter) app.use("/myOrders", evidenceRouter);

// // Main app router last
// app.use("/", router);
// /* ----------------------------------------------------------------------- */

// /* ------------------------------- MongoDB ------------------------------- */
// const mongoUri = process.env.DB_URI || process.env.MONGO_URI;
// mongoose.connect(mongoUri)
//   .then(() => console.log("MongoDB connected"))
//   .catch(err => { console.error("Mongo error:", err); process.exit(1); });
// /* ----------------------------------------------------------------------- */

// /* --------------------------------- Listen ------------------------------ */
// const port = process.env.PORT || 4000;
// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
//   console.log("Allowed CORS origins:", allowedOrigins);
// });


// OFF SEP01 - 5:17

// // index.js
// // Lets go by parts. This is my current index.js. Take into consideration that we had previously modified CORS for this same error that was popping up in our expressQuote.jsx. Can you do a direct edit to respect all pre-existing code 
// const express = require("express");
// const cors = require("cors");
// const cookieParser = require("cookie-parser");
// const mongoose = require("mongoose");
// require("dotenv/config");

// const router = require("./routes/router"); // main routes
// let evidenceRouter; try { evidenceRouter = require("./routes/evidence"); } catch {}

// const helmet = require("helmet");
// const compression = require("compression");
// const rateLimit = require("express-rate-limit");

// const app = express();

// // Trust Render proxy (for correct IPs)
// app.set("trust proxy", 1);

// /* ----------------------------- CORS (FIRST) ----------------------------- */
// const defaultAllowed = [
//   "https://gisconnect-web.onrender.com",
//   "http://localhost:5173",
//   "http://localhost:5174",
// ];
// const corsOrigins = (process.env.CORS_ORIGINS || "")
//   .split(",")
//   .map(s => s.trim())
//   .filter(Boolean);

// const allowedOrigins = corsOrigins.length ? corsOrigins : defaultAllowed;

// const corsOptions = {
//   origin: (origin, cb) => {
//     // Allow same-origin / server-to-server (no Origin header)
//     if (!origin) return cb(null, true);
//     if (allowedOrigins.includes(origin)) return cb(null, true);
//     return cb(new Error(`CORS not allowed for origin: ${origin}`), false);
//   },
//   methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
//   allowedHeaders: ["Content-Type","Accept","Authorization"],
//   credentials: true,
//   maxAge: 86400, // cache preflight 24h
// };

// // Global CORS + preflight
// app.use(cors(corsOptions));
// app.options("*", cors(corsOptions));
// /* ----------------------------------------------------------------------- */

// /* ----------------------- Security, gzip, rate limit --------------------- */
// app.use(helmet({
//   // We load images/files from S3 – let them be cross-origin embeddable
//   crossOriginResourcePolicy: { policy: "cross-origin" },
// }));
// app.use(compression());
// app.use(rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 1000,
// }));
// /* ----------------------------------------------------------------------- */

// /* --------------------------- Parsers & cookies -------------------------- */
// // NOTE: multer handles multipart/form-data on specific routes;
// // these body parsers won’t interfere with it.
// app.use(express.json({ limit: "5mb" }));
// app.use(express.urlencoded({ extended: true, limit: "5mb" }));
// app.use(cookieParser());
// /* ----------------------------------------------------------------------- */

// /* ------------------------------ Healthcheck ----------------------------- */
// app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

// app.get("/", (_req, res) => {
//   res.type("text/plain").send("GISConnect API is running ✅  See /healthz");
// });
// /* ----------------------------------------------------------------------- */

// /* ------------------------------ Diagnostics ---------------------------- */
// setTimeout(() => {
//   const flatten = (s) =>
//     s.filter(l => l.route || l.name === "router").flatMap(l =>
//       l.route
//         ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
//         : (l.handle.stack || [])
//             .filter(x => x.route)
//             .map(x => ({
//               method: Object.keys(x.route.methods)[0].toUpperCase(),
//               path: x.route.path,
//             }))
//     );
//   const stack = app._router?.stack ? flatten(app._router.stack) : [];
//   console.log("Registered routes:", stack);
// }, 500);

// app.get("/__routes", (_req, res) => {
//   const flatten = (s) =>
//     s.filter(l => l.route || l.name === "router").flatMap(l =>
//       l.route
//         ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
//         : (l.handle.stack || []).filter(x => x.route).map(x => ({
//             method: Object.keys(x.route.methods)[0].toUpperCase(),
//             path: x.route.path
//           }))
//     );
//   res.json(app._router?.stack ? flatten(app._router.stack) : []);
// });
// /* ----------------------------------------------------------------------- */

// /* ------------------------------ Static files --------------------------- */
// app.use("/files", express.static("files"));
// /* ----------------------------------------------------------------------- */

// /* -------------------------------- Routers ------------------------------ */
// // Evidence routes live under /orders
// if (evidenceRouter) app.use("/orders", evidenceRouter);

// // Main app router last
// app.use("/", router);
// /* ----------------------------------------------------------------------- */

// /* ------------------------------- MongoDB ------------------------------- */
// const mongoUri = process.env.DB_URI || process.env.MONGO_URI;
// mongoose.connect(mongoUri)
//   .then(() => console.log("MongoDB connected"))
//   .catch(err => { console.error("Mongo error:", err); process.exit(1); });
// /* ----------------------------------------------------------------------- */

// /* --------------------------------- Listen ------------------------------ */
// const port = process.env.PORT || 4000;
// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
//   console.log("Allowed CORS origins:", allowedOrigins);
// });
/* ----------------------------------------------------------------------- */
// OFF SEP01 - 5:17

// -----------

// OFF SEP01
// // this is my index.js, can you direct edit changes 
// const express = require("express");
// const cors = require("cors");
// const cookieParser = require("cookie-parser");
// const mongoose = require("mongoose");
// require("dotenv/config");

// const router = require("./routes/router");         // your main routes
// let evidenceRouter; try { evidenceRouter = require("./routes/evidence"); } catch {}


// const app = express();
// // console.log("Booting server from:", __filename);

// const helmet = require("helmet");
// const compression = require("compression");
// const rateLimit = require("express-rate-limit");

// // Trust Render proxy (for correct IPs)
// app.set("trust proxy", 1);

// // Security headers
// app.use(helmet({
//   crossOriginResourcePolicy: { policy: "cross-origin" }, // allow S3 images
// }));

// // Gzip responses
// app.use(compression());

// // Basic rate limit (tune as needed)
// app.use(rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 min
//   max: 1000,                // requests per IP per window
// }));

// // CORS allowlist
// const corsOrigins = (process.env.CORS_ORIGINS || "")
//   .split(",").map(s => s.trim()).filter(Boolean);
// const allowed = corsOrigins.length ? corsOrigins : ["http://localhost:5173"];
// app.use(cors({
//   origin: (origin, cb) => { if (!origin) return cb(null, true); if (allowed.includes(origin)) return cb(null, true); return cb(new Error("CORS not allowed"), false); },
//   credentials: true,
// }));

// const cacheRouter = require("./routes/cache");
// app.use("/cache", cacheRouter);

// app.use(express.json({ limit: "5mb" }));
// app.use(express.urlencoded({ extended: false }));
// app.use(cookieParser());


// // ✅ Health FIRST
// app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

// app.get("/", (_req, res) => {
//   res.type("text/plain").send("GISConnect API is running ✅  See /healthz");
// });

// // Route inspector (prints to console on boot)
// setTimeout(() => {
//     const flatten = (s) =>
//       s.filter(l => l.route || l.name === "router").flatMap(l =>
//         l.route
//           ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
//           : (l.handle.stack || [])
//               .filter(x => x.route)
//               .map(x => ({
//                 method: Object.keys(x.route.methods)[0].toUpperCase(),
//                 path: x.route.path,
//               }))
//       );
//     const stack = app._router?.stack ? flatten(app._router.stack) : [];
//     console.log("Registered routes:", stack);
//   }, 500);  

// // Route inspector
// app.get("/__routes", (_req, res) => {
//   const flatten = (s) =>
//     s.filter(l => l.route || l.name === "router").flatMap(l =>
//       l.route
//         ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
//         : (l.handle.stack || []).filter(x => x.route).map(x => ({ method: Object.keys(x.route.methods)[0].toUpperCase(), path: x.route.path }))
//     );
//   res.json(app._router?.stack ? flatten(app._router.stack) : []);
// });

// app.use("/files", express.static("files"));

// // Mount routers
// if (evidenceRouter) app.use("/orders", evidenceRouter);

// app.use("/", router);

// // Mongo
// const mongoUri = process.env.DB_URI || process.env.MONGO_URI;
// mongoose.connect(mongoUri)
//   .then(() => console.log("MongoDB connected"))
//   .catch(err => { console.error("Mongo error:", err); process.exit(1); });

// const port = process.env.PORT || 4000;
// app.listen(port, () => console.log(`Server running on port ${port}`));


//----------


// OG CODE 
// const express = require("express");
// const cors = require("cors");
// const cookieParser = require("cookie-parser");
// const mongoose = require("mongoose");
// require("dotenv/config");

// const router = require("./routes/router");         // your main routes
// let evidenceRouter; try { evidenceRouter = require("./routes/evidence"); } catch {}
// let cacheRouter;    try { cacheRouter    = require("./routes/cache"); } catch {}

// const app = express();
// console.log("Booting server from:", __filename);

// app.use(express.json({ limit: "5mb" }));
// app.use(express.urlencoded({ extended: false }));
// app.use(cookieParser());

// // CORS allowlist
// const corsOrigins = (process.env.CORS_ORIGINS || "")
//   .split(",").map(s => s.trim()).filter(Boolean);
// const allowed = corsOrigins.length ? corsOrigins : ["http://localhost:5173"];
// app.use(cors({
//   origin: (origin, cb) => { if (!origin) return cb(null, true); if (allowed.includes(origin)) return cb(null, true); return cb(new Error("CORS not allowed"), false); },
//   credentials: true,
// }));

// // ✅ Health FIRST
// app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

// // Route inspector
// app.get("/__routes", (_req, res) => {
//   const flatten = (s) =>
//     s.filter(l => l.route || l.name === "router").flatMap(l =>
//       l.route
//         ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
//         : (l.handle.stack || []).filter(x => x.route).map(x => ({ method: Object.keys(x.route.methods)[0].toUpperCase(), path: x.route.path }))
//     );
//   res.json(app._router?.stack ? flatten(app._router.stack) : []);
// });

// app.use("/files", express.static("files"));

// // Mount routers
// if (evidenceRouter) app.use("/orders", evidenceRouter);
// if (cacheRouter)    app.use("/cache",  cacheRouter);
// app.use("/", router);

// // Mongo
// const mongoUri = process.env.DB_URI || process.env.MONGO_URI;
// mongoose.connect(mongoUri)
//   .then(() => console.log("MongoDB connected"))
//   .catch(err => { console.error("Mongo error:", err); process.exit(1); });

// const port = process.env.PORT || 4000;
// app.listen(port, () => console.log(`Server running on port ${port}`));






// const express = require('express')
// const cors = require('cors')
// const bodyParser = require('body-parser')
// const router = require('./routes/router')
// const mongoose = require('mongoose')
// require('dotenv/config')

// const app = express()

// app.use(bodyParser.json())
// app.use(bodyParser.urlencoded({extended:false}))

// //mj
// app.use(express.json());
// //mj

// app.use('/files', express.static("files"))

// // const ordersEvidence = require("./routes/orders.evidence");
// app.use("/orders", router);
// // new aug17
// // app.use("/inventory", require("./routes/inventory"));
// // end aug17

// const corsOptions = {
//     origin: '*',
//     credentials: true,
//     optionSuccessStatus: 200
// }

// app.use(cors(corsOptions))
// app.use('/', router)

// //const dbOptions = {useNewUrlParser:true, useUnifiedTopology:true}
// //mongoose.connect(process.env.DB_URI, dbOptions)
// mongoose.connect(process.env.DB_URI)
// .then(() => console.log('DB Connected!'))
// .catch(err => console.log(err))

// const port = process.env.PORT || 4000
// const server = app.listen(port, () => {
//     console.log(`Server is running on port ${port}`)
// })


