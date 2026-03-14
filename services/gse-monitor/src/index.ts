import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4115;

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
  res.json({ status: "ok", service: "gse-monitor", ts: Date.now() });
});

app.get("/indicators", async (req, res) => {
  try {
    // TODO: implement — All economic indicators
    res.json({ ok: true, stub: "gse-monitor/indicators" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/indicators/gdp", async (req, res) => {
  try {
    // TODO: implement — Global GDP summary
    res.json({ ok: true, stub: "gse-monitor/indicators/gdp" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/indicators/trade", async (req, res) => {
  try {
    // TODO: implement — Global trade flows
    res.json({ ok: true, stub: "gse-monitor/indicators/trade" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gse-monitor listening :${PORT}`));
export default app;
