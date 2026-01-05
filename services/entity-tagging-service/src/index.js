import express from "express";

const PORT = Number(process.env.PORT || 7627);

const app = express();
app.use(express.json());

const tags = [];

app.get("/health", (_req, res) => res.json({ ok: true, service: "entity-tagging-service" }));

app.get("/tags", (_req, res) => {
  res.json({ ok: true, tags });
});

app.listen(PORT, () => {
  console.log(`[entity-tagging-service] listening on :${PORT}`);
});
