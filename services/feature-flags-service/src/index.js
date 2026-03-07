import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT     = Number(process.env.PORT || 7611);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE  = path.join(DATA_DIR, "flags.json");

const app = express();
app.use(express.json());

// flags: Map<name, { name, enabled, description, updatedAt }>
const flags = new Map();

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {};
    for (const [name, f] of flags) obj[name] = f;
    fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  } catch { /* best-effort */ }
}

function load() {
  // Seed from FEATURE_FLAGS env: comma-separated names → all enabled
  const envFlags = (process.env.FEATURE_FLAGS || "").split(",").map((f) => f.trim()).filter(Boolean);
  for (const name of envFlags) {
    flags.set(name, { name, enabled: true, description: "", updatedAt: new Date().toISOString() });
  }
  // Overlay with persisted state (runtime changes survive restarts)
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    for (const [name, f] of Object.entries(raw)) flags.set(name, f);
  } catch { /* absent is fine */ }
}

load();

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "feature-flags-service", total: flags.size })
);

/** GET /flags — list all feature flags */
app.get("/flags", (req, res) => {
  let items = [...flags.values()];
  if (req.query.enabled !== undefined) {
    const want = req.query.enabled !== "false";
    items = items.filter((f) => f.enabled === want);
  }
  res.json({ ok: true, total: items.length, flags: items });
});

/** GET /flags/stats — counts of enabled vs disabled flags */
app.get("/flags/stats", (_req, res) => {
  const all = [...flags.values()];
  const enabled = all.filter((f) => f.enabled).length;
  res.json({ ok: true, stats: { total: all.length, enabled, disabled: all.length - enabled } });
});


/** GET /flags/:name */
app.get("/flags/:name", (req, res) => {
  const f = flags.get(req.params.name);
  if (!f) return res.status(404).json({ ok: false, error: "flag_not_found" });
  res.json({ ok: true, flag: f });
});

/** PUT /flags/:name — create or update a flag { enabled, description } */
app.put("/flags/:name", (req, res) => {
  const name    = req.params.name;
  const enabled = req.body?.enabled !== false; // default true
  const description = req.body?.description ?? flags.get(name)?.description ?? "";
  const f = { name, enabled, description, updatedAt: new Date().toISOString() };
  flags.set(name, f);
  persist();
  res.json({ ok: true, flag: f });
});

/** PATCH /flags/:name/toggle — flip enabled state */
app.patch("/flags/:name/toggle", (req, res) => {
  const f = flags.get(req.params.name);
  if (!f) return res.status(404).json({ ok: false, error: "flag_not_found" });
  f.enabled = !f.enabled;
  f.updatedAt = new Date().toISOString();
  persist();
  res.json({ ok: true, flag: f });
});

/** DELETE /flags/:name */
app.delete("/flags/:name", (req, res) => {
  if (!flags.has(req.params.name)) return res.status(404).json({ ok: false, error: "flag_not_found" });
  flags.delete(req.params.name);
  persist();
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[feature-flags-service] listening on :${PORT}, flags=${flags.size}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
