import express from "express";

const PORT = Number(process.env.PORT || 7645);

const app = express();
app.use(express.json());

const proposals = [];
const delegations = [];

app.get("/health", (_req, res) => res.json({ ok: true, service: "governance-service" }));

app.get("/proposals", (_req, res) => {
  res.json({ ok: true, proposals });
});

app.get("/delegations", (_req, res) => {
  res.json({ ok: true, delegations });
});

app.listen(PORT, () => {
  console.log(`[governance-service] listening on :${PORT}`);
});
