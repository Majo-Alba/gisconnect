
const norm = v => String(v ?? "").trim().toUpperCase();
const key = v => norm(v).replace(/\s+/g, "");
const valid = v => ["USD", "MXN"].includes(norm(v)) ? norm(v) : null;
const positive = v => Number(String(v ?? "").replace(/[, $]/g, "")) > 0;
export function resolveCurrency(item, rows = []) {
  const explicit = valid(item.currency);
  if (explicit) return explicit;
  if (positive(item.priceUSD) !== positive(item.priceMXN)) return positive(item.priceUSD) ? "USD" : "MXN";
  const matches = rows.filter(r => key(r.NOMBRE_PRODUCTO) === key(item.product) && key(item.product));
  const exact = !key(item.presentation) ? [] : matches.filter(r => key(String(r.PESO_PRODUCTO ?? "") + String(r.UNIDAD_MEDICION ?? "")) === key(item.presentation));
  const candidates = exact.length ? exact : matches;
  const currencies = candidates.map(r => {
    const usd = positive(r.PRECIO_UNITARIO_DOLARES) || positive(r.PRECIO_PIEZA_DOLARES);
    const mxn = positive(r.PRECIO_UNITARIO_MXN) || positive(r.PRECIO_PIEZA_MXN);
    return valid(r.UNIDAD_MONETARIA || r.MONEDA || r.CURRENCY) || (usd !== mxn ? (usd ? "USD" : "MXN") : null);
  });
  return currencies.length && currencies.every(c => c && c === currencies[0]) ? currencies[0] : null;
}
export function historicalPrice(item, currency) {
  const value = currency === "USD" ? item.priceUSD ?? item.price : currency === "MXN" ? item.priceMXN ?? item.price : item.price;
  return value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
}