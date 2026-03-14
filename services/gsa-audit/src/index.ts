import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4307;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-audit", ts: Date.now() });
});

app.get("/entries", async (req, res) => {
  try {
    // TODO: List audit entries (paginated)
    res.json({ ok: true, stub: "gsa-audit/entries" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/entries/:id", async (req, res) => {
  try {
    // TODO: Get audit entry
    res.json({ ok: true, stub: "gsa-audit/entries/:id" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/agents/:id/entries", async (req, res) => {
  try {
    // TODO: Entries by agent
    res.json({ ok: true, stub: "gsa-audit/agents/:id/entries" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/entries", async (req, res) => {
  try {
    // TODO: Record new audit entry
    res.json({ ok: true, stub: "gsa-audit/entries" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsa-audit listening :${PORT}`));
export default app;
