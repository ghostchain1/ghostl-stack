import express from "express";

const PORT = Number(process.env.PORT || 7624);

const app = express();
app.use(express.json());

const snapshots = [];

app.get("/health", (_req, res) => res.json({ ok: true, service: "snapshot-service" }));

app.get("/snapshots", (_req, res) => {
  res.json({ ok: true, snapshots });
});

app.listen(PORT, () => {
  console.log(`[snapshot-service] listening on :${PORT}`);
});
