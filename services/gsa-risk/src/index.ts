import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4305;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-risk", ts: Date.now() });
});

app.get("/scores", async (req, res) => {
  try {
    // TODO: Current risk scores per subsystem
    res.json({ ok: true, stub: "gsa-risk/scores" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/scores/:subsystem", async (req, res) => {
  try {
    // TODO: Risk score for subsystem
    res.json({ ok: true, stub: "gsa-risk/scores/:subsystem" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/assess", async (req, res) => {
  try {
    // TODO: Run ad-hoc risk assessment
    res.json({ ok: true, stub: "gsa-risk/assess" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/alerts", async (req, res) => {
  try {
    // TODO: Active risk alerts
    res.json({ ok: true, stub: "gsa-risk/alerts" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsa-risk listening :${PORT}`));
export default app;
