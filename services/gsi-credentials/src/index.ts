import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";
import { randomBytes } from "crypto";

const app  = express();
const PORT = process.env.PORT ?? 4201;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory credential store ────────────────────────────────────────────────────
interface GhostCredential {
  id: string;
  subjectAddress: string;
  type: string;
  attributes: Record<string, unknown>;
  issuedBy: string;
  issuedAt: number;
  expiresAt?: number;
  status: "active" | "revoked";
  revokedAt?: number;
  revokedReason?: string;
}

const credentials = new Map<string, GhostCredential>();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-credentials", ts: Date.now() });
});

app.post("/credentials/issue", (req, res) => {
  const { subjectAddress, type, attributes = {}, issuedBy = "gsi-issuer", expiresAt } = req.body as Partial<GhostCredential>;
  if (!subjectAddress || !type) {
    res.status(400).json({ error: "subjectAddress and type are required" }); return;
  }
  const id = `cred-${randomBytes(8).toString("hex")}`;
  const credential: GhostCredential = {
    id, subjectAddress: subjectAddress.toLowerCase(), type, attributes, issuedBy,
    issuedAt: Date.now(), expiresAt, status: "active",
  };
  credentials.set(id, credential);
  log.info("credential.issued", { id, subjectAddress, type });
  res.status(201).json({ credential });
});

app.post("/credentials/revoke", (req, res) => {
  const { id, reason } = req.body as { id?: string; reason?: string };
  if (!id) { res.status(400).json({ error: "id is required" }); return; }
  const credential = credentials.get(id);
  if (!credential) { res.status(404).json({ error: "credential not found" }); return; }
  if (credential.status === "revoked") { res.status(409).json({ error: "credential already revoked" }); return; }
  credential.status = "revoked";
  credential.revokedAt = Date.now();
  credential.revokedReason = reason;
  log.info("credential.revoked", { id, reason });
  res.json({ credential });
});

app.get("/credentials/subject/:addr", (req, res) => {
  const addr = req.params.addr.toLowerCase();
  const found = [...credentials.values()].filter(c => c.subjectAddress === addr);
  res.json({ subjectAddress: addr, credentials: found, total: found.length });
});

// /credentials/:id/valid MUST be before /credentials/:id
app.get("/credentials/:id/valid", (req, res) => {
  const credential = credentials.get(req.params.id);
  if (!credential) { res.status(404).json({ error: "credential not found" }); return; }
  const now = Date.now();
  const expired = credential.expiresAt !== undefined && credential.expiresAt < now;
  const valid = credential.status === "active" && !expired;
  res.json({ id: req.params.id, valid, expired, status: credential.status });
});

app.get("/credentials/:id", (req, res) => {
  const credential = credentials.get(req.params.id);
  if (!credential) { res.status(404).json({ error: "credential not found" }); return; }
  res.json({ credential });
});


app.listen(PORT, () => log.info(`gsi-credentials listening :${PORT}`));
export default app;
