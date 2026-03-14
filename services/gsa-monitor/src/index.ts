import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4304;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-monitor", ts: Date.now() });
});

app.get("/health", async (req, res) => {
  try {
    // TODO: System health overview
    res.json({ ok: true, stub: "gsa-monitor/health" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/anomalies", async (req, res) => {
  try {
    // TODO: Active anomalies
    res.json({ ok: true, stub: "gsa-monitor/anomalies" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/metrics", async (req, res) => {
  try {
    // TODO: Aggregate performance metrics
    res.json({ ok: true, stub: "gsa-monitor/metrics" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/subsystems", async (req, res) => {
  try {
    // TODO: Per-subsystem status
    res.json({ ok: true, stub: "gsa-monitor/subsystems" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsa-monitor listening :${PORT}`));
export default app;
