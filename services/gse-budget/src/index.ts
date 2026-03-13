import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4113;

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
  res.json({ status: "ok", service: "gse-budget", ts: Date.now() });
});

app.get("/budget", async (req, res) => {
  try {
    // TODO: implement — List budgets
    res.json({ ok: true, stub: "gse-budget/budget" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/budget/create", async (req, res) => {
  try {
    // TODO: implement — Create budget allocation
    res.json({ ok: true, stub: "gse-budget/budget/create" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/budget/spend", async (req, res) => {
  try {
    // TODO: implement — Disburse budget funds
    res.json({ ok: true, stub: "gse-budget/budget/spend" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gse-budget listening :${PORT}`));
export default app;
