import express from "express";

const PORT = Number(process.env.PORT || 7634);
const THEME = process.env.UI_THEME || "light";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "theme-service" }));

app.get("/theme", (_req, res) => {
  res.json({
    ok: true,
    theme: THEME,
    palette: {
      primary: "#0f766e",
      secondary: "#0ea5e9",
      accent: "#f59e0b",
      background: THEME === "dark" ? "#0b1220" : "#f8fafc"
    }
  });
});

app.listen(PORT, () => {
  console.log(`[theme-service] listening on :${PORT}`);
});
