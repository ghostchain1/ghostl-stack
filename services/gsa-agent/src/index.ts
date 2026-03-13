import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4306;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-agent", ts: Date.now() });
});

app.get("/agents", async (req, res) => {
  try {
    // TODO: List all registered agents
    res.json({ ok: true, stub: "gsa-agent/agents" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/agents/:id", async (req, res) => {
  try {
    // TODO: Get agent details
    res.json({ ok: true, stub: "gsa-agent/agents/:id" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/agents", async (req, res) => {
  try {
    // TODO: Register new AI agent
    res.json({ ok: true, stub: "gsa-agent/agents" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/agents/:id/activate", async (req, res) => {
  try {
    // TODO: Activate pending agent
    res.json({ ok: true, stub: "gsa-agent/agents/:id/activate" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/agents/:id/suspend", async (req, res) => {
  try {
    // TODO: Suspend active agent
    res.json({ ok: true, stub: "gsa-agent/agents/:id/suspend" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsa-agent listening :${PORT}`));
export default app;
