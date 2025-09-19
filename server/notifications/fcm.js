// fcm.js
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// ----------------------
// Load service account
// ----------------------
function loadServiceAccount() {
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (p) {
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    const raw = fs.readFileSync(abs, "utf8");
    const json = JSON.parse(raw);
    if (json.private_key && typeof json.private_key === "string") {
      json.private_key = json.private_key.replace(/\\n/g, "\n");
    }
    return json;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (json.private_key && typeof json.private_key === "string") {
      json.private_key = json.private_key.replace(/\\n/g, "\n");
    }
    return json;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
    const json = JSON.parse(decoded);
    if (json.private_key && typeof json.private_key === "string") {
      json.private_key = json.private_key.replace(/\\n/g, "\n");
    }
    return json;
  }

  throw new Error(
    "No Firebase service account found. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64."
  );
}

const serviceAccount = loadServiceAccount();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ----------------------
// Helper to send notifications
// ----------------------
async function sendOrderStageNotifications(stage, order) {
  try {
    // Example notification payload
    const payload = {
      notification: {
        title: `Orden ${stage}`,
        body: `El pedido #${String(order._id).slice(-5)} cambió a estado: ${stage}`,
      },
      data: {
        orderId: String(order._id),
        stage,
      },
    };

    // TODO: Replace with real targeting logic (topics or tokens per role)
    // Example: send to a "full_access" topic
    const topic = "full_access"; // placeholder
    await admin.messaging().sendToTopic(topic, payload);

    console.log(`✅ Notificación enviada (${stage}) a ${topic}`);
  } catch (err) {
    console.error("❌ Error enviando notificación:", err);
  }
}

// Export both
module.exports = {
  admin,
  sendOrderStageNotifications,
};

// // This is my current fcm.js, can you make direct edits
// const admin = require("firebase-admin");
// const fs = require("fs");
// const path = require("path");

// function loadServiceAccount() {
//   // 1) Preferred: path to a local JSON file (e.g., ./firebase-service-account.json)
//   const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
//   if (p) {
//     const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
//     const raw = fs.readFileSync(abs, "utf8");
//     const json = JSON.parse(raw);
//     // Normalize private_key newlines if needed
//     if (json.private_key && typeof json.private_key === "string") {
//       json.private_key = json.private_key.replace(/\\n/g, "\n");
//     }
//     return json;
//   }

//   // 2) Fallback: whole JSON in env
//   if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
//     const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
//     if (json.private_key && typeof json.private_key === "string") {
//       json.private_key = json.private_key.replace(/\\n/g, "\n");
//     }
//     return json;
//   }

//   // 3) Fallback: base64-encoded JSON in env
//   if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
//     const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
//     const json = JSON.parse(decoded);
//     if (json.private_key && typeof json.private_key === "string") {
//       json.private_key = json.private_key.replace(/\\n/g, "\n");
//     }
//     return json;
//   }

//   throw new Error(
//     "No Firebase service account found. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64."
//   );
// }

// const serviceAccount = loadServiceAccount();

// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//   });
// }

// module.exports = admin;
