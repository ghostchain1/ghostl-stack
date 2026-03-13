import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4112;

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
  res.json({ status: "ok", service: "gse-trade", ts: Date.now() });
});

app.post("/trade/record", async (req, res) => {
  try {
    // TODO: implement — Record trade transaction
    res.json({ ok: true, stub: "gse-trade/trade/record" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/trade/settle", async (req, res) => {
  try {
    // TODO: implement — Settle pending trade
    res.json({ ok: true, stub: "gse-trade/trade/settle" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/trade/history", async (req, res) => {
  try {
    // TODO: implement — Trade history
    res.json({ ok: true, stub: "gse-trade/trade/history" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gse-trade listening :${PORT}`));
export default app;
