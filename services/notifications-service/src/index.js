import express from "express";

const PORT = Number(process.env.PORT || 7638);

const app = express();
app.use(express.json());

const notifications = [];

app.get("/health", (_req, res) => res.json({ ok: true, service: "notifications-service" }));

app.get("/notifications", (_req, res) => {
  res.json({ ok: true, notifications });
});

app.listen(PORT, () => {
  console.log(`[notifications-service] listening on :${PORT}`);
});
