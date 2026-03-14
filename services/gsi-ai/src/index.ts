import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4206;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-ai", ts: Date.now() });
});

app.get("/alerts", async (req, res) => {
  try {
    // TODO: Active fraud alerts
    res.json({ ok: true, stub: "gsi-ai/alerts" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/analyze/:addr", async (req, res) => {
  try {
    // TODO: Analyze identity for anomalies
    res.json({ ok: true, stub: "gsi-ai/analyze/:addr" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/risk/:addr", async (req, res) => {
  try {
    // TODO: Identity risk score
    res.json({ ok: true, stub: "gsi-ai/risk/:addr" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsi-ai listening :${PORT}`));
export default app;
