import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4116;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gse-ai", ts: Date.now() });
});

app.post("/forecast/gdp", async (req, res) => {
  try {
    // TODO: implement — GDP growth forecast
    res.json({ ok: true, stub: "gse-ai/forecast/gdp" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/forecast/inflation", async (req, res) => {
  try {
    // TODO: implement — Inflation forecast
    res.json({ ok: true, stub: "gse-ai/forecast/inflation" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/alerts", async (req, res) => {
  try {
    // TODO: implement — Active economic alerts
    res.json({ ok: true, stub: "gse-ai/alerts" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gse-ai listening :${PORT}`));
export default app;
