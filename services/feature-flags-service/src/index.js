import express from "express";

const PORT = Number(process.env.PORT || 7611);
const FLAGS = (process.env.FEATURE_FLAGS || "").split(",").map((f) => f.trim()).filter(Boolean);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "feature-flags-service" }));

app.get("/flags", (_req, res) => {
  res.json({ ok: true, flags: FLAGS });
});

app.listen(PORT, () => {
  console.log(`[feature-flags-service] listening on :${PORT}`);
});
