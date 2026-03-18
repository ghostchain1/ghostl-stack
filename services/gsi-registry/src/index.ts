import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";
import { createHash } from "crypto";

const app  = express();
const PORT = process.env.PORT ?? 4200;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory identity store ───────────────────────────────────────────────────────
interface GhostIdentity {
  id: string;
  address: string;    // 0x wallet address
  gnsName?: string;   // e.g. alice.ghost
  displayName?: string;
  tier: "basic" | "verified" | "institutional";
  status: "active" | "suspended" | "revoked";
  createdAt: number;
}

const identities   = new Map<string, GhostIdentity>(); // keyed by address
const gnsIndex     = new Map<string, string>();         // gnsName -> address

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-registry", ts: Date.now() });
});

app.post("/identity/register", (req, res) => {
  const { address, gnsName, displayName, tier = "basic" } = req.body as Partial<GhostIdentity>;
  if (!address) { res.status(400).json({ error: "address is required" }); return; }
  if (identities.has(address.toLowerCase())) {
    res.status(409).json({ error: "address already registered" }); return;
  }
  if (gnsName && gnsIndex.has(gnsName.toLowerCase())) {
    res.status(409).json({ error: "GNS name already taken" }); return;
  }
  const id = createHash("sha256").update(address.toLowerCase()).digest("hex").slice(0, 16);
  const identity: GhostIdentity = { id, address: address.toLowerCase(), gnsName, displayName, tier, status: "active", createdAt: Date.now() };
  identities.set(address.toLowerCase(), identity);
  if (gnsName) gnsIndex.set(gnsName.toLowerCase(), address.toLowerCase());
  log.info("identity.registered", { id, address, gnsName });
  res.status(201).json({ identity });
});

app.get("/identity/list", (req, res) => {
  const page  = Math.max(1, Number(req.query.page  ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const all   = [...identities.values()];
  const slice = all.slice((page - 1) * limit, page * limit);
  res.json({ identities: slice, total: all.length, page, limit });
});

// /identity/resolve/:name MUST be before /identity/:address to avoid shadowing
app.get("/identity/resolve/:name", (req, res) => {
  const addr = gnsIndex.get(req.params.name.toLowerCase());
  if (!addr) { res.status(404).json({ error: "GNS name not found" }); return; }
  const identity = identities.get(addr);
  res.json({ name: req.params.name, address: addr, identity });
});

app.get("/identity/:address", (req, res) => {
  const identity = identities.get(req.params.address.toLowerCase());
  if (!identity) { res.status(404).json({ error: "identity not found" }); return; }
  res.json({ identity });
});


app.listen(PORT, () => log.info(`gsi-registry listening :${PORT}`));
export default app;
