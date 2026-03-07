import express from "express";
import crypto from "node:crypto";

const PORT          = Number(process.env.PORT || 7621);
const AUDIT_LOG_URL = process.env.AUDIT_LOG_URL || "http://localhost:7641";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


// Named export jobs: id → { id, name, status, format, filters, createdAt, completedAt, rowCount }
const exportJobs = new Map();

async function fetchAuditLogs(since, until, limit = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const params = new URLSearchParams({ limit });
  if (since) params.set("since", since);
  if (until) params.set("until", until);
  try {
    const r = await fetch(`${AUDIT_LOG_URL}/logs?${params}`, { signal: controller.signal });
    const body = await r.json();
    // audit-log-service returns { ok, entries: [...] }  (not body.logs)
    return Array.isArray(body.entries) ? body.entries : [];
  } catch { return []; } finally { clearTimeout(timer); }
}

function entryToCsvRow(entry) {
  // audit-log entries use field "ts" for timestamp
  const timestamp = entry.ts || entry.timestamp || "";
  const action    = entry.action   || "";
  const actor     = entry.actor    || "";
  const resource  = entry.resource || "";
  const result    = entry.result   || "";
  const detail    = JSON.stringify(entry.detail || entry.meta || {}).replace(/"/g, '""');
  return `"${timestamp}","${action}","${actor}","${resource}","${result}","${detail}"`;
}

const CSV_HEADER = '"timestamp","action","actor","resource","result","detail"';

function buildCsv(entries) {
  return [CSV_HEADER, ...entries.map(entryToCsvRow)].join("\n");
}

function buildNdJson(entries) {
  return entries.map((e) => JSON.stringify(e)).join("\n");
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "compliance-export-service", auditLogUrl: AUDIT_LOG_URL })
);

/** GET /exports — ad-hoc export (CSV or NDJSON) */
app.get("/exports", async (req, res) => {
  const { since, until, format = "csv", limit } = req.query;
  const entries = await fetchAuditLogs(since, until, limit ? Number(limit) : 2000);

  if (format === "ndjson") {
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Content-Disposition", `attachment; filename="audit-export-${Date.now()}.ndjson"`);
    return res.send(buildNdJson(entries));
  }
  // default: CSV
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="audit-export-${Date.now()}.csv"`);
  res.send(buildCsv(entries));
});

/** GET /exports/jobs — list named export jobs */
app.get("/exports/jobs", (_req, res) => {
  res.json({ ok: true, count: exportJobs.size, jobs: [...exportJobs.values()] });
});

/** GET /exports/jobs/:id — fetch a specific job */
app.get("/exports/jobs/:id", (req, res) => {
  const job = exportJobs.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, job });
});

/** POST /exports/jobs — create and immediately execute a named export job */
app.post("/exports/jobs", async (req, res) => {
  const { name, format = "csv", since, until, limit = 2000 } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "name required" });
  const id  = crypto.randomUUID();
  const job = { id, name, format, filters: { since, until, limit }, status: "pending", createdAt: new Date().toISOString(), completedAt: null, rowCount: null };
  exportJobs.set(id, job);

  // Run async, respond immediately
  res.status(202).json({ ok: true, job });

  // Execute in background
  (async () => {
    try {
      const entries = await fetchAuditLogs(since, until, limit);
      job.status      = "completed";
      job.completedAt = new Date().toISOString();
      job.rowCount    = entries.length;
    } catch (err) {
      job.status = "failed";
      job.error  = err?.message || "unknown";
    }
    exportJobs.set(id, job);
  })();
});

/** DELETE /exports/jobs/:id */
app.delete("/exports/jobs/:id", (req, res) => {
  if (!exportJobs.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found" });
  exportJobs.delete(req.params.id);
  res.json({ ok: true });
});

/** GET /exports/stats — export job summary by status */
app.get("/exports/stats", (_req, res) => {
  const all = [...exportJobs.values()];
  const byStatus = {};
  for (const j of all) byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  res.json({ ok: true, stats: { total: all.length, byStatus, fetchedAt: new Date().toISOString() } });
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[compliance-export-service] listening on :${PORT}, auditLog=${AUDIT_LOG_URL}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
