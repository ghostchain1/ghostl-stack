import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7643);

const app = express();
app.use(express.json());

const sessions = [];

const randomHex = (bytes = 12) => crypto.randomBytes(bytes).toString("hex");

app.get("/health", (_req, res) => res.json({ ok: true, service: "session-service" }));

app.post("/sessions", (req, res) => {
  const userId = req.body?.userId || "anon";
  const id = randomHex(16);
  const ip = req.ip;
  const createdAt = new Date().toISOString();
  const session = { id, userId, ip, createdAt };
  sessions.push(session);
  res.json({ ok: true, session });
});

app.get("/sessions", (_req, res) => {
  res.json({ ok: true, sessions });
});

app.listen(PORT, () => {
  console.log(`[session-service] listening on :${PORT}`);
});
