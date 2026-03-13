import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4110;

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
  res.json({ status: "ok", service: "gse-gdp", ts: Date.now() });
});

app.get("/gdp", async (req, res) => {
  try {
    // TODO: implement — List all GDP records
    res.json({ ok: true, stub: "gse-gdp/gdp" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/gdp/record", async (req, res) => {
  try {
    // TODO: implement — Submit new GDP record
    res.json({ ok: true, stub: "gse-gdp/gdp/record" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/gdp/:nation", async (req, res) => {
  try {
    // TODO: implement — GDP history for nation
    res.json({ ok: true, stub: "gse-gdp/gdp/:nation" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/gdp/:nation/latest", async (req, res) => {
  try {
    // TODO: implement — Latest GDP for nation
    res.json({ ok: true, stub: "gse-gdp/gdp/:nation/latest" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gse-gdp listening :${PORT}`));
export default app;
