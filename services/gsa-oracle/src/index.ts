import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4302;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-oracle", ts: Date.now() });
});

app.get("/feeds", async (req, res) => {
  try {
    // TODO: List all oracle feeds
    res.json({ ok: true, stub: "gsa-oracle/feeds" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/feeds/:id", async (req, res) => {
  try {
    // TODO: Get latest value for feed
    res.json({ ok: true, stub: "gsa-oracle/feeds/:id" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/feeds", async (req, res) => {
  try {
    // TODO: Create new feed
    res.json({ ok: true, stub: "gsa-oracle/feeds" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/feeds/:id/update", async (req, res) => {
  try {
    // TODO: AI agent updates feed value
    res.json({ ok: true, stub: "gsa-oracle/feeds/:id/update" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsa-oracle listening :${PORT}`));
export default app;
