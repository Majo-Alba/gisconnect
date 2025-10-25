const webpush = require("web-push");

webpush.setVapidDetails(
  "mailto:notifications@gisconnect.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendWebPush(subscription, payloadObj) {
  // payload must be string or Uint8Array
  const payload = JSON.stringify(payloadObj);
  return webpush.sendNotification(subscription, payload);
}

module.exports = { sendWebPush };