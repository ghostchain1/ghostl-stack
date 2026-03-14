import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4300;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-core", ts: Date.now() });
});

app.get("/status", async (req, res) => {
  try {
    // TODO: System-wide AI status
    res.json({ ok: true, stub: "gsa-core/status" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/agents", async (req, res) => {
  try {
    // TODO: List all active agents
    res.json({ ok: true, stub: "gsa-core/agents" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/agents/dispatch", async (req, res) => {
  try {
    // TODO: Dispatch task to specific agent
    res.json({ ok: true, stub: "gsa-core/agents/dispatch" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/heartbeat", async (req, res) => {
  try {
    // TODO: Agent heartbeat aggregation
    res.json({ ok: true, stub: "gsa-core/heartbeat" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsa-core listening :${PORT}`));
export default app;
