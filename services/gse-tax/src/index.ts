import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4111;

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
  res.json({ status: "ok", service: "gse-tax", ts: Date.now() });
});

app.get("/tax/policy/:nation", async (req, res) => {
  try {
    // TODO: implement — Get tax policy
    res.json({ ok: true, stub: "gse-tax/tax/policy/:nation" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/tax/collect", async (req, res) => {
  try {
    // TODO: implement — Submit tax payment
    res.json({ ok: true, stub: "gse-tax/tax/collect" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/tax/treasury/:nation", async (req, res) => {
  try {
    // TODO: implement — Treasury balance
    res.json({ ok: true, stub: "gse-tax/tax/treasury/:nation" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gse-tax listening :${PORT}`));
export default app;
