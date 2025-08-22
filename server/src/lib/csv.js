// server/src/lib/csv.js
const { parse } = require("csv-parse/sync");

/**
 * RFC-compliant CSV parsing:
 * - Handles quoted fields (commas, quotes, slashes, newlines inside cells)
 * - Trims headers & values
 * - Skips empty lines
 * - Accepts BOM from Google Sheets
 */
function parseCSV(csvText) {
  if (!csvText || typeof csvText !== "string") return [];

  // Normalize line endings just in case
  const text = csvText.replace(/\r\n/g, "\n");

  const rows = parse(text, {
    columns: (headers) => headers.map((h) => (h || "").trim()),
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    relax: true,
    trim: true,
  });

  // Final pass: trim all string values
  return rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[(k || "").trim()] = typeof v === "string" ? v.trim() : v;
    }
    return out;
  });
}

module.exports = { parseCSV };
