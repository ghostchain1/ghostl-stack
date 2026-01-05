import express from "express";

const PORT = Number(process.env.PORT || 7629);

const app = express();
app.use(express.json());

const payouts = [];

app.get("/health", (_req, res) => res.json({ ok: true, service: "payout-service" }));

app.get("/payouts", (_req, res) => {
  res.json({ ok: true, payouts });
});

app.listen(PORT, () => {
  console.log(`[payout-service] listening on :${PORT}`);
});
