import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT      = Number(process.env.PORT || 7627);
const DATA_DIR  = process.env.DATA_DIR || path.join(process.cwd(), "data");
const TAGS_FILE = path.join(DATA_DIR, "tags.json");

const app = express();
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.removeHeader("X-Powered-By");
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


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

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "entity-tagging-service", addresses: tags.size })
);

/** GET /tags — list all tags; filter by ?address= */
app.get("/tags", (req, res) => {
  if (req.query.address) {
    const addr   = String(req.query.address).toLowerCase();
    const labels = [...(tags.get(addr) || [])];
    return res.json({ ok: true, address: addr, labels });
  }
  const result = [];
  for (const [addr, labels] of tags) result.push({ address: addr, labels: [...labels] });
  res.json({ ok: true, total: result.length, tags: result });
});

/** GET /tags/stats — aggregate statistics */
app.get("/tags/stats", (_req, res) => {
  const labelCount = {};
  let totalLabels = 0;
  for (const labels of tags.values()) {
    for (const l of labels) {
      labelCount[l] = (labelCount[l] || 0) + 1;
      totalLabels++;
    }
  }
  const sorted = Object.entries(labelCount).sort((a, b) => b[1] - a[1]);
  res.json({
    ok: true,
    addresses: tags.size,
    totalLabels,
    uniqueLabels: sorted.length,
    topLabels: sorted.slice(0, 10).map(([label, count]) => ({ label, count })),
  });
});

/** GET /tags/search?label=X — find all addresses carrying a specific label */
app.get("/tags/search", (req, res) => {
  const { label } = req.query;
  if (!label) return res.status(400).json({ ok: false, error: "label query param required" });
  const matches = [];
  for (const [addr, labels] of tags) {
    if (labels.has(String(label))) matches.push(addr);
  }
  res.json({ ok: true, label, count: matches.length, addresses: matches });
});

/** POST /tags/batch — bulk add { entries: [{ address, labels: [] }] } */
app.post("/tags/batch", (req, res) => {
  const { entries } = req.body || {};
  if (!Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ ok: false, error: "entries array required" });
  let added = 0;
  for (const { address, labels: lbls } of entries) {
    if (!address || !Array.isArray(lbls)) continue;
    const addr = String(address).toLowerCase();
    if (!tags.has(addr)) tags.set(addr, new Set());
    for (const l of lbls) { tags.get(addr).add(String(l)); added++; }
  }
  persist();
  res.status(201).json({ ok: true, added, totalAddresses: tags.size });
});

/** GET /tags/:address — canonical single-address tag lookup */
app.get("/tags/:address", (req, res) => {
  const addr   = req.params.address.toLowerCase();
  const labels = [...(tags.get(addr) || [])];
  res.json({ ok: true, address: addr, labels });
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

/** PUT /tags/:address — replace all labels for an address */
app.put("/tags/:address", (req, res) => {
  const addr   = req.params.address.toLowerCase();
  const { labels } = req.body || {};
  if (!Array.isArray(labels)) return res.status(400).json({ ok: false, error: "labels array required" });
  tags.set(addr, new Set(labels.map(String)));
  persist();
  res.json({ ok: true, address: addr, labels: [...tags.get(addr)] });
});

/** DELETE /tags/:address/:label — remove a specific label */
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

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[entity-tagging-service] listening on :${PORT}, data=${DATA_DIR}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
