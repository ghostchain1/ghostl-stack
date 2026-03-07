import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT       = Number(process.env.PORT || 7627);
const DATA_DIR   = process.env.DATA_DIR || path.join(process.cwd(), "data");
const TAGS_FILE  = path.join(DATA_DIR, "tags.json");

const app = express();
app.use(express.json());

// tags: Map<address, Set<label>>
const tags = new Map();

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {};
    for (const [addr, labels] of tags) obj[addr] = [...labels];
    fs.writeFileSync(TAGS_FILE, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  } catch { /* best-effort */ }
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(TAGS_FILE, "utf-8"));
    for (const [addr, labels] of Object.entries(raw)) {
      tags.set(addr, new Set(Array.isArray(labels) ? labels : []));
    }
  } catch { /* file absent is fine */ }
}

load();

app.get("/health", (_req, res) => res.json({ ok: true, service: "entity-tagging-service", addresses: tags.size }));

/** GET /tags?address=0x… — list all tags (optionally filtered by address) */
app.get("/tags", (req, res) => {
  if (req.query.address) {
    const addr = String(req.query.address).toLowerCase();
    const labels = [...(tags.get(addr) || [])];
    return res.json({ ok: true, address: addr, labels });
  }
  const result = [];
  for (const [addr, labels] of tags) result.push({ address: addr, labels: [...labels] });
  res.json({ ok: true, total: result.length, tags: result });
});

/** POST /tags — add a tag { address, label } */
app.post("/tags", (req, res) => {
  const { address, label } = req.body || {};
  if (!address || !label) return res.status(400).json({ ok: false, error: "address and label required" });
  const addr = String(address).toLowerCase();
  if (!tags.has(addr)) tags.set(addr, new Set());
  tags.get(addr).add(String(label));
  persist();
  res.status(201).json({ ok: true, address: addr, labels: [...tags.get(addr)] });
});

/** DELETE /tags/:address/:label — remove a specific label from an address */
app.delete("/tags/:address/:label", (req, res) => {
  const addr  = req.params.address.toLowerCase();
  const label = req.params.label;
  const set   = tags.get(addr);
  if (!set || !set.has(label)) return res.status(404).json({ ok: false, error: "not_found" });
  set.delete(label);
  if (set.size === 0) tags.delete(addr);
  persist();
  res.json({ ok: true });
});

/** DELETE /tags/:address — remove all tags for an address */
app.delete("/tags/:address", (req, res) => {
  const addr = req.params.address.toLowerCase();
  if (!tags.has(addr)) return res.status(404).json({ ok: false, error: "not_found" });
  tags.delete(addr);
  persist();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[entity-tagging-service] listening on :${PORT}, data=${DATA_DIR}`);
});

