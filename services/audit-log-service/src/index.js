import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 7641);
const LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(process.cwd(), "data", "audit.log");
const MAX_LINES = 5000;

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


app.get("/health", (_req, res) => res.json({ ok: true, service: "audit-log-service" }));

const readLines = () => {
  if (!fs.existsSync(LOG_PATH)) return [];
  try {
    return fs.readFileSync(LOG_PATH, "utf-8").trim().split("\n").filter(Boolean);
  } catch { return []; }
};

const parseLines = (lines) =>
  lines.map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });

/** GET /logs — paginated + filtered log entries */
app.get("/logs", (req, res) => {
  const lines = readLines();
  let entries = parseLines(lines);

  // Filters
  if (req.query.action) entries = entries.filter((e) => e.action === req.query.action);
  if (req.query.actor) entries = entries.filter((e) => e.actor === req.query.actor || e.userId === req.query.actor);
  if (req.query.level) entries = entries.filter((e) => e.level === req.query.level);
  if (req.query.since) {
    const since = new Date(req.query.since).getTime();
    entries = entries.filter((e) => new Date(e.ts).getTime() >= since);
  }

  // Newest-first after filtering
  entries = entries.reverse();
  const total = entries.length;
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const offset = Number(req.query.offset) || 0;

  res.json({ ok: true, total, entries: entries.slice(offset, offset + limit) });
});

/** POST /logs — append an entry */
app.post("/logs", (req, res) => {
  const entry = req.body || {};
  if (!entry.action) return res.status(400).json({ ok: false, error: "action required" });
  const line = JSON.stringify({ ts: new Date().toISOString(), level: "info", ...entry });
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    // Trim file if over MAX_LINES to prevent unbounded growth
    const existing = readLines();
    if (existing.length >= MAX_LINES) {
      const trimmed = existing.slice(existing.length - (MAX_LINES - 1));
      fs.writeFileSync(LOG_PATH, trimmed.join("\n") + "\n", "utf-8");
    }
    fs.appendFileSync(LOG_PATH, `${line}\n`, "utf-8");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

/** GET /logs/stats — entry count + action breakdown */
app.get("/logs/stats", (req, res) => {
  const entries = parseLines(readLines());
  const byAction = {};
  for (const e of entries) {
    const key = e.action || "unknown";
    byAction[key] = (byAction[key] || 0) + 1;
  }
  res.json({ ok: true, total: entries.length, byAction });
});

/** GET /logs/:id — find a single log entry by its id field */
app.get("/logs/:id", (req, res) => {
  const { id } = req.params;
  const entries = parseLines(readLines());
  const entry = entries.find((e) => e.id === id || e.requestId === id);
  if (!entry) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, entry });
});

/** DELETE /logs — purge all entries (or those matching ?action=) */
app.delete("/logs", (req, res) => {
  try {
    if (req.query.action) {
      const lines = readLines();
      const kept = lines.filter((l) => {
        try { return JSON.parse(l).action !== req.query.action; } catch { return true; }
      });
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
      fs.writeFileSync(LOG_PATH, kept.join("\n") + (kept.length ? "\n" : ""), "utf-8");
      res.json({ ok: true, purged: true, action: req.query.action, remaining: kept.length });
    } else {
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
      fs.writeFileSync(LOG_PATH, "", "utf-8");
      res.json({ ok: true, purged: true });
    }
  } catch (err) { res.status(500).json({ ok: false, error: err?.message }); }
});


app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[audit-log-service] listening on :${PORT}, log=${LOG_PATH}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
