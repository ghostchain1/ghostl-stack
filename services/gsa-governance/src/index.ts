import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4301;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-governance", ts: Date.now() });
});

app.get("/proposals", async (req, res) => {
  try {
    // TODO: List governance proposals
    res.json({ ok: true, stub: "gsa-governance/proposals" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/proposals/:id", async (req, res) => {
  try {
    // TODO: Get proposal detail
    res.json({ ok: true, stub: "gsa-governance/proposals/:id" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/proposals", async (req, res) => {
  try {
    // TODO: Submit AI-generated proposal
    res.json({ ok: true, stub: "gsa-governance/proposals" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/proposals/:id/vote", async (req, res) => {
  try {
    // TODO: Cast vote on proposal
    res.json({ ok: true, stub: "gsa-governance/proposals/:id/vote" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/proposals/:id/execute", async (req, res) => {
  try {
    // TODO: Execute passed proposal
    res.json({ ok: true, stub: "gsa-governance/proposals/:id/execute" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsa-governance listening :${PORT}`));
export default app;
