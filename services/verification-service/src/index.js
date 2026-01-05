import express from "express";

const PORT = Number(process.env.PORT || 7630);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "verification-service" }));

app.get("/verifications", (_req, res) => {
  res.json({ ok: true, items: [] });
});

app.listen(PORT, () => {
  console.log(`[verification-service] listening on :${PORT}`);
});
