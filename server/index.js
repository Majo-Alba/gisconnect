const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
require("dotenv/config");

const router = require("./routes/router");         // your main routes
let evidenceRouter; try { evidenceRouter = require("./routes/evidence"); } catch {}
let cacheRouter;    try { cacheRouter    = require("./routes/cache"); } catch {}

const app = express();
console.log("Booting server from:", __filename);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// CORS allowlist
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
const allowed = corsOrigins.length ? corsOrigins : ["http://localhost:5173"];
app.use(cors({
  origin: (origin, cb) => { if (!origin) return cb(null, true); if (allowed.includes(origin)) return cb(null, true); return cb(new Error("CORS not allowed"), false); },
  credentials: true,
}));

// ✅ Health FIRST
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

// Route inspector (prints to console on boot)
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

// Route inspector
app.get("/__routes", (_req, res) => {
  const flatten = (s) =>
    s.filter(l => l.route || l.name === "router").flatMap(l =>
      l.route
        ? [{ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path }]
        : (l.handle.stack || []).filter(x => x.route).map(x => ({ method: Object.keys(x.route.methods)[0].toUpperCase(), path: x.route.path }))
    );
  res.json(app._router?.stack ? flatten(app._router.stack) : []);
});

app.use("/files", express.static("files"));

// Mount routers
if (evidenceRouter) app.use("/orders", evidenceRouter);
if (cacheRouter)    app.use("/cache",  cacheRouter);
app.use("/", router);

// Mongo
const mongoUri = process.env.DB_URI || process.env.MONGO_URI;
mongoose.connect(mongoUri)
  .then(() => console.log("MongoDB connected"))
  .catch(err => { console.error("Mongo error:", err); process.exit(1); });

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server running on port ${port}`));

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


