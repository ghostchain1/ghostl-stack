import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";
import { randomBytes } from "crypto";

const app  = express();
const PORT = process.env.PORT ?? 4202;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory verification store ─────────────────────────────────────────────────
interface Verification {
  id: string;
  address: string;
  type: "individual" | "institutional";
  status: "pending" | "verified" | "failed" | "revoked";
  method: string;
  verifiedAt?: number;
  revokedAt?: number;
  revokedReason?: string;
  createdAt: number;
}

const verifications = new Map<string, Verification>();
const addrIndex     = new Map<string, string[]>(); // address -> [verificationId]

function addVerification(v: Verification) {
  verifications.set(v.id, v);
  const existing = addrIndex.get(v.address) ?? [];
  addrIndex.set(v.address, [...existing, v.id]);
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-verification", ts: Date.now() });
});

app.post("/verify", (req, res) => {
  const { address, method = "kyc-basic" } = req.body as { address?: string; method?: string };
  if (!address) { res.status(400).json({ error: "address is required" }); return; }
  const id = `ver-${randomBytes(6).toString("hex")}`;
  const v: Verification = {
    id, address: address.toLowerCase(), type: "individual",
    status: "verified", method, verifiedAt: Date.now(), createdAt: Date.now(),
  };
  addVerification(v);
  log.info("identity.verified", { id, address, method });
  res.status(201).json({ verification: v });
});

app.post("/verify/institution", (req, res) => {
  const { address, method = "kyb-standard" } = req.body as { address?: string; method?: string };
  if (!address) { res.status(400).json({ error: "address is required" }); return; }
  const id = `ver-inst-${randomBytes(6).toString("hex")}`;
  const v: Verification = {
    id, address: address.toLowerCase(), type: "institutional",
    status: "verified", method, verifiedAt: Date.now(), createdAt: Date.now(),
  };
  addVerification(v);
  log.info("institution.verified", { id, address, method });
  res.status(201).json({ verification: v });
});

app.get("/verify/status/:addr", (req, res) => {
  const addr = req.params.addr.toLowerCase();
  const ids  = addrIndex.get(addr) ?? [];
  const list = ids.map(id => verifications.get(id)).filter(Boolean) as Verification[];
  const latest = list.sort((a, b) => b.createdAt - a.createdAt)[0];
  res.json({ address: addr, verified: latest?.status === "verified", latest: latest ?? null, total: list.length });
});

app.post("/revoke", (req, res) => {
  const { id, reason } = req.body as { id?: string; reason?: string };
  if (!id) { res.status(400).json({ error: "id is required" }); return; }
  const v = verifications.get(id);
  if (!v) { res.status(404).json({ error: "verification not found" }); return; }
  if (v.status === "revoked") { res.status(409).json({ error: "already revoked" }); return; }
  v.status = "revoked";
  v.revokedAt = Date.now();
  v.revokedReason = reason;
  log.info("verification.revoked", { id, reason });
  res.json({ verification: v });
});


app.listen(PORT, () => log.info(`gsi-verification listening :${PORT}`));
export default app;
