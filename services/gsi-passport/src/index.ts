import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";
import { randomBytes } from "crypto";

const app  = express();
const PORT = process.env.PORT ?? 4203;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory passport store ──────────────────────────────────────────────────────
interface GhostPassport {
  tokenId: string;
  holderAddress: string;
  nationality: string;
  tier: "standard" | "premium" | "diplomat";
  status: "active" | "revoked" | "expired";
  issuedAt: number;
  expiresAt: number;
  revokedAt?: number;
  revokedReason?: string;
}

const passports   = new Map<string, GhostPassport>(); // tokenId -> passport
const holderIndex = new Map<string, string[]>();        // address -> tokenId[]

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-passport", ts: Date.now() });
});

app.post("/passport/issue", (req, res) => {
  const { holderAddress, nationality = "ghostchain", tier = "standard", validityDays = 365 } = req.body as {
    holderAddress?: string; nationality?: string; tier?: "standard" | "premium" | "diplomat"; validityDays?: number;
  };
  if (!holderAddress) { res.status(400).json({ error: "holderAddress is required" }); return; }
  const tokenId = `gpass-${randomBytes(8).toString("hex")}`;
  const issuedAt  = Date.now();
  const expiresAt = issuedAt + Math.min(validityDays, 3650) * 86_400_000;
  const passport: GhostPassport = {
    tokenId, holderAddress: holderAddress.toLowerCase(), nationality, tier, status: "active", issuedAt, expiresAt,
  };
  passports.set(tokenId, passport);
  const existing = holderIndex.get(holderAddress.toLowerCase()) ?? [];
  holderIndex.set(holderAddress.toLowerCase(), [...existing, tokenId]);
  log.info("passport.issued", { tokenId, holderAddress, tier });
  res.status(201).json({ passport });
});

app.post("/passport/revoke", (req, res) => {
  const { tokenId, reason } = req.body as { tokenId?: string; reason?: string };
  if (!tokenId) { res.status(400).json({ error: "tokenId is required" }); return; }
  const passport = passports.get(tokenId);
  if (!passport) { res.status(404).json({ error: "passport not found" }); return; }
  if (passport.status === "revoked") { res.status(409).json({ error: "already revoked" }); return; }
  passport.status = "revoked";
  passport.revokedAt = Date.now();
  passport.revokedReason = reason;
  log.info("passport.revoked", { tokenId, reason });
  res.json({ passport });
});

// /passport/holder/:addr MUST be registered before /passport/:tokenId
app.get("/passport/holder/:addr", (req, res) => {
  const addr    = req.params.addr.toLowerCase();
  const ids     = holderIndex.get(addr) ?? [];
  const list    = ids.map(id => passports.get(id)).filter(Boolean) as GhostPassport[];
  const active  = list.filter(p => p.status === "active" && p.expiresAt > Date.now());
  res.json({ holderAddress: addr, passports: list, activeCount: active.length, total: list.length });
});

app.get("/passport/:tokenId", (req, res) => {
  const passport = passports.get(req.params.tokenId);
  if (!passport) { res.status(404).json({ error: "passport not found" }); return; }
  // Auto-expire
  if (passport.status === "active" && passport.expiresAt < Date.now()) {
    passport.status = "expired";
  }
  res.json({ passport });
});


app.listen(PORT, () => log.info(`gsi-passport listening :${PORT}`));
export default app;
