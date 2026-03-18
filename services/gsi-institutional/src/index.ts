import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";
import { randomBytes } from "crypto";

const app  = express();
const PORT = process.env.PORT ?? 4204;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory institution store ────────────────────────────────────────────────────
interface Institution {
  id: string;
  name: string;
  legalEntity: string;
  address: string;     // wallet address of institution
  jurisdiction: string;
  status: "pending" | "approved" | "suspended" | "revoked";
  approvedAt?: number;
  suspendedAt?: number;
  suspendedReason?: string;
  registeredAt: number;
}

const institutions = new Map<string, Institution>();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-institutional", ts: Date.now() });
});

app.post("/institution/register", (req, res) => {
  const { name, legalEntity, address, jurisdiction } = req.body as Partial<Institution>;
  if (!name || !legalEntity || !address || !jurisdiction) {
    res.status(400).json({ error: "name, legalEntity, address and jurisdiction are required" }); return;
  }
  const id = `inst-${randomBytes(6).toString("hex")}`;
  const institution: Institution = {
    id, name, legalEntity, address: address.toLowerCase(), jurisdiction,
    status: "pending", registeredAt: Date.now(),
  };
  institutions.set(id, institution);
  log.info("institution.registered", { id, name, jurisdiction });
  res.status(201).json({ institution });
});

app.post("/institution/approve", (req, res) => {
  const { id } = req.body as { id?: string };
  if (!id) { res.status(400).json({ error: "id is required" }); return; }
  const inst = institutions.get(id);
  if (!inst) { res.status(404).json({ error: "institution not found" }); return; }
  if (inst.status === "approved") { res.status(409).json({ error: "already approved" }); return; }
  inst.status = "approved";
  inst.approvedAt = Date.now();
  log.info("institution.approved", { id });
  res.json({ institution: inst });
});

app.post("/institution/suspend", (req, res) => {
  const { id, reason } = req.body as { id?: string; reason?: string };
  if (!id) { res.status(400).json({ error: "id is required" }); return; }
  const inst = institutions.get(id);
  if (!inst) { res.status(404).json({ error: "institution not found" }); return; }
  if (inst.status === "suspended") { res.status(409).json({ error: "already suspended" }); return; }
  inst.status = "suspended";
  inst.suspendedAt = Date.now();
  inst.suspendedReason = reason;
  log.info("institution.suspended", { id, reason });
  res.json({ institution: inst });
});

app.get("/institution/list", (req, res) => {
  const status = req.query.status as string | undefined;
  let list = [...institutions.values()];
  if (status) list = list.filter(i => i.status === status);
  res.json({ institutions: list, total: list.length });
});

// /institution/list MUST be before /institution/:addr
app.get("/institution/:addr", (req, res) => {
  // Support lookup by id or by wallet address
  const param = req.params.addr.toLowerCase();
  const inst =
    institutions.get(param) ??
    [...institutions.values()].find(i => i.address === param || i.id === param);
  if (!inst) { res.status(404).json({ error: "institution not found" }); return; }
  res.json({ institution: inst });
});


app.listen(PORT, () => log.info(`gsi-institutional listening :${PORT}`));
export default app;
