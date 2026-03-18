import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4303;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory policy change store ──────────────────────────────────────────
type ChangeStatus = "pending" | "approved" | "rejected" | "applied";
interface PolicyChange {
  id: string;
  proposer: string;
  target: string;
  parameter: string;
  currentValue: unknown;
  proposedValue: unknown;
  rationale: string;
  status: ChangeStatus;
  approvedBy?: string;
  rejectedBy?: string;
  createdAt: number;
  resolvedAt?: number;
}

const changes = new Map<string, PolicyChange>();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-policy", ts: Date.now() });
});

app.get("/changes", (req, res) => {
  const status = req.query.status as ChangeStatus | undefined;
  let list = [...changes.values()];
  if (status) list = list.filter(c => c.status === status);
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ changes: list, total: list.length });
});

app.get("/changes/:id", (req, res) => {
  const ch = changes.get(req.params.id);
  if (!ch) { res.status(404).json({ error: "policy change not found" }); return; }
  res.json({ change: ch });
});

app.post("/changes", (req, res) => {
  const { proposer, target, parameter, currentValue, proposedValue, rationale } =
    req.body as Partial<PolicyChange>;
  if (!proposer || !target || !parameter || proposedValue === undefined || !rationale) {
    res.status(400).json({ error: "proposer, target, parameter, proposedValue and rationale are required" });
    return;
  }
  const id = `pc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const change: PolicyChange = {
    id, proposer, target, parameter,
    currentValue: currentValue ?? null,
    proposedValue, rationale,
    status: "pending", createdAt: Date.now(),
  };
  changes.set(id, change);
  log.info("policy.change.proposed", { id, proposer, target, parameter });
  res.status(201).json({ change });
});

app.post("/changes/:id/approve", (req, res) => {
  const ch = changes.get(req.params.id);
  if (!ch) { res.status(404).json({ error: "policy change not found" }); return; }
  if (ch.status !== "pending") {
    res.status(409).json({ error: `Cannot approve a change in status '${ch.status}'` });
    return;
  }
  const { approvedBy } = req.body as { approvedBy?: string };
  const updated: PolicyChange = { ...ch, status: "approved", approvedBy: approvedBy ?? "governance", resolvedAt: Date.now() };
  changes.set(ch.id, updated);
  log.info("policy.change.approved", { id: ch.id, approvedBy: updated.approvedBy });
  res.json({ change: updated });
});

app.post("/changes/:id/reject", (req, res) => {
  const ch = changes.get(req.params.id);
  if (!ch) { res.status(404).json({ error: "policy change not found" }); return; }
  if (ch.status !== "pending") {
    res.status(409).json({ error: `Cannot reject a change in status '${ch.status}'` });
    return;
  }
  const { rejectedBy } = req.body as { rejectedBy?: string };
  const updated: PolicyChange = { ...ch, status: "rejected", rejectedBy: rejectedBy ?? "governance", resolvedAt: Date.now() };
  changes.set(ch.id, updated);
  log.info("policy.change.rejected", { id: ch.id });
  res.json({ change: updated });
});


app.listen(PORT, () => log.info(`gsa-policy listening :${PORT}`));
export default app;
