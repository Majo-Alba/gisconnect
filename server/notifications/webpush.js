const webpush = require("web-push");

webpush.setVapidDetails(
  "mailto:notifications@gisconnect.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendWebPush(subscription, payloadObj, options = {}) {
  if (!subscription?.endpoint) {
    throw new Error("Web Push subscription has no endpoint");
  }

  const payload = JSON.stringify(payloadObj);

  const pushOptions = {
    // Keep the notification available if the phone temporarily loses signal.
    TTL: options.TTL ?? 60 * 60 * 24,

    // Important for notifications that must wake sleeping mobile devices.
    urgency: options.urgency || "high",

    // Prevent an old notification from replacing a different order event.
    topic: options.topic || undefined,
  };

  return webpush.sendNotification(
    subscription,
    payload,
    pushOptions
  );
}

module.exports = { sendWebPush };
// const webpush = require("web-push");

// webpush.setVapidDetails(
//   "mailto:notifications@gisconnect.com",
//   process.env.VAPID_PUBLIC_KEY,
//   process.env.VAPID_PRIVATE_KEY
// );

// async function sendWebPush(subscription, payloadObj) {
//   // payload must be string or Uint8Array
//   const payload = JSON.stringify(payloadObj);
//   return webpush.sendNotification(subscription, payload);
// }

// module.exports = { sendWebPush };