import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7639);

const app = express();
app.use(express.json());

const sessions = new Map();

const randomHex = (bytes = 16) => crypto.randomBytes(bytes).toString("hex");

app.get("/health", (_req, res) => res.json({ ok: true, service: "auth-service" }));

// SIWE-style nonce issuance (stub)
app.get("/auth/nonce", (_req, res) => {
  res.json({ ok: true, nonce: randomHex(12) });
});

// Wallet signature verification stub; accepts address/signature and issues a session
app.post("/auth/login", (req, res) => {
  const { address } = req.body || {};
  if (!address) return res.status(400).json({ ok: false, error: "address required" });
  const token = randomHex(24);
  sessions.set(token, { user: { id: address.toLowerCase(), wallets: [address], roles: ["Viewer"] }, createdAt: Date.now() });
  res.json({ ok: true, token, user: sessions.get(token).user });
});

app.get("/auth/me", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !sessions.has(token)) return res.status(401).json({ ok: false, error: "unauthorized" });
  res.json({ ok: true, session: sessions.get(token) });
});

app.listen(PORT, () => {
  console.log(`[auth-service] listening on :${PORT}`);
});
