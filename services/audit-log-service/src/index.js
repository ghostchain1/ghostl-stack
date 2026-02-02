import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 7641);
const LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(process.cwd(), "data", "audit.log");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "audit-log-service" }));

app.get("/logs", (_req, res) => {
  try {
    const raw = fs.readFileSync(LOG_PATH, "utf-8");
    const lines = raw.trim().split("\n").slice(-500);
    res.json({ ok: true, entries: lines });
  } catch {
    res.json({ ok: true, entries: [] });
  }
});

app.post("/logs", (req, res) => {
  const entry = req.body || {};
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, `${line}\n`, "utf-8");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`[audit-log-service] listening on :${PORT}, log=${LOG_PATH}`);
});
