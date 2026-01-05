import express from "express";

const PORT = Number(process.env.PORT || 7637);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "global-search-service" }));

// Simple stub that accepts q and returns empty matches.
app.get("/search", (req, res) => {
  const q = req.query.q || "";
  res.json({ ok: true, query: q, matches: [] });
});

app.listen(PORT, () => {
  console.log(`[global-search-service] listening on :${PORT}`);
});
