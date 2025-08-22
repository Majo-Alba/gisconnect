const express = require("express");
// const fetch = require("node-fetch");
const NodeCache = require("node-cache");
const { parseCSV } = require("../src/lib/csv");

const router = express.Router();
const cache = new NodeCache({ stdTTL: 60 * 15 }); // 15 minutes default

const URLS = {
  products: process.env.PRODUCTS_CSV_URL,
  clients: process.env.CLIENT_DB_URL,
  special: process.env.SPECIAL_PRICES_URL,
  inventory: process.env.INVENTORY_LATEST_CSV_URL,
};

async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return res.text();
}

async function getCachedJson(key, url) {
  const hit = cache.get(key);
  if (hit) return hit;

  const csvText = await fetchCSV(url);
  const json = parseCSV(csvText);
  cache.set(key, json);
  return json;
}

// ping
router.get("/", (_req, res) => res.json({ ok: true, keys: Object.keys(URLS) }));

router.get("/products", async (_req, res) => {
  try {
    if (!URLS.products) return res.status(500).json({ error: "PRODUCTS_CSV_URL not set" });
    res.json(await getCachedJson("products", URLS.products));
  } catch (e) {
    console.error("cache/products error:", e);
    res.status(500).json({ error: "cache error" });
  }
});

router.get("/clients", async (_req, res) => {
  try {
    if (!URLS.clients) return res.status(500).json({ error: "CLIENT_DB_URL not set" });
    res.json(await getCachedJson("clients", URLS.clients));
  } catch (e) {
    console.error("cache/clients error:", e);
    res.status(500).json({ error: "cache error" });
  }
});

router.get("/special-prices", async (_req, res) => {
  try {
    if (!URLS.special) return res.status(500).json({ error: "SPECIAL_PRICES_URL not set" });
    res.json(await getCachedJson("special", URLS.special));
  } catch (e) {
    console.error("cache/special error:", e);
    res.status(500).json({ error: "cache error" });
  }
});

router.get("/inventory-latest", async (_req, res) => {
  try {
    if (!URLS.inventory) return res.status(500).json({ error: "INVENTORY_LATEST_CSV_URL not set" });
    res.json(await getCachedJson("inventory", URLS.inventory));
  } catch (e) {
    console.error("cache/inventory error:", e);
    res.status(500).json({ error: "cache error" });
  }
});

// Manual cache bust, e.g. POST /cache/bust/products
router.post("/bust/:key", (req, res) => {
  const k = req.params.key;
  cache.del(k);
  res.json({ ok: true, cleared: k });
});

module.exports = router;
