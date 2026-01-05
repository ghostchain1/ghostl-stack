import express from "express";

const PORT = Number(process.env.PORT || 7621);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "compliance-export-service" }));

app.get("/exports", (_req, res) => {
  res.json({ ok: true, exports: [] });
});

app.listen(PORT, () => {
  console.log(`[compliance-export-service] listening on :${PORT}`);
});
