import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4307;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory audit log ───────────────────────────────────────────────────────
interface AuditEntry {
  id: string;
  agentId: string;
  action: string;
  resource?: string;
  outcome: "success" | "failure" | "warning";
  details?: unknown;
  ts: number;
}

const entries: AuditEntry[] = [];

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-audit", ts: Date.now() });
});

app.get("/entries", (req, res) => {
  const limit  = Math.min(Number(req.query.limit  ?? 50), 500);
  const offset = Number(req.query.offset ?? 0);
  const page   = entries.slice().reverse().slice(offset, offset + limit);
  res.json({ entries: page, total: entries.length, limit, offset });
});

app.get("/entries/:id", (req, res) => {
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) { res.status(404).json({ error: "audit entry not found" }); return; }
  res.json({ entry });
});

app.get("/agents/:id/entries", (req, res) => {
  const limit  = Math.min(Number(req.query.limit ?? 50), 500);
  const offset = Number(req.query.offset ?? 0);
  const all    = entries.filter(e => e.agentId === req.params.id).reverse();
  res.json({ entries: all.slice(offset, offset + limit), total: all.length });
});

app.post("/entries", (req, res) => {
  const { agentId, action, resource, outcome, details } = req.body as Partial<AuditEntry>;
  if (!agentId || !action || !outcome) {
    res.status(400).json({ error: "agentId, action and outcome are required" });
    return;
  }
  const entry: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agentId, action, resource, outcome, details, ts: Date.now(),
  };
  entries.push(entry);
  log.info("audit", { id: entry.id, agentId, action, outcome });
  res.status(201).json({ entry });
});


app.listen(PORT, () => log.info(`gsa-audit listening :${PORT}`));
export default app;
