import express from "express";

const PORT = Number(process.env.PORT || 7623);

const app = express();
app.use(express.json());

const upgrades = [];

app.get("/health", (_req, res) => res.json({ ok: true, service: "upgrade-orchestrator-service" }));

app.get("/upgrades", (_req, res) => {
  res.json({ ok: true, upgrades });
});

app.listen(PORT, () => {
  console.log(`[upgrade-orchestrator-service] listening on :${PORT}`);
});
