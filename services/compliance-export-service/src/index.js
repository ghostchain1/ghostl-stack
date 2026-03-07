import express from "express";

const PORT       = Number(process.env.PORT || 7621);
const AUDIT_URL  = process.env.AUDIT_LOG_URL || "http://localhost:7641";
const MAX_ROWS   = 10_000;

const app = express();
app.use(express.json());

async function fetchAuditLogs(limit = MAX_ROWS) {
  try {
    const res = await fetch(`${AUDIT_URL}/logs?limit=${limit}`);
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body.logs) ? body.logs : [];
  } catch { return []; }
}

function toCSV(rows) {
  if (!rows.length) return "timestamp,action,actor,resource,detail\n";
  const headers = ["timestamp", "action", "actor", "resource", "detail"];
  const escape  = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines   = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h] ?? r[h.toLowerCase()] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "compliance-export-service", auditUrl: AUDIT_URL })
);

/**
 * GET /exports
 * Query params:
 *   format = json (default) | csv
 *   limit  = max rows (default 1000, max 10000)
 *   since  = ISO timestamp filter (inclusive)
 */
app.get("/exports", async (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "json";
  const limit  = Math.min(Number(req.query.limit) || 1000, MAX_ROWS);
  const since  = req.query.since ? new Date(String(req.query.since)).getTime() : 0;

  let logs = await fetchAuditLogs(limit);
  if (since) logs = logs.filter((l) => new Date(l.timestamp || 0).getTime() >= since);
  logs = logs.slice(0, limit);

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="compliance-export-${Date.now()}.csv"`
    );
    return res.send(toCSV(logs));
  }

  res.json({ ok: true, total: logs.length, exportedAt: new Date().toISOString(), logs });
});

app.listen(PORT, () => {
  console.log(`[compliance-export-service] listening on :${PORT}, audit=${AUDIT_URL}`);
});
