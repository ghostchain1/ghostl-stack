import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4204;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-institutional", ts: Date.now() });
});

app.post("/institution/register", async (req, res) => {
  try {
    // TODO: Register new institution
    res.json({ ok: true, stub: "gsi-institutional/institution/register" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/institution/approve", async (req, res) => {
  try {
    // TODO: Approve institution
    res.json({ ok: true, stub: "gsi-institutional/institution/approve" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/institution/suspend", async (req, res) => {
  try {
    // TODO: Suspend institution
    res.json({ ok: true, stub: "gsi-institutional/institution/suspend" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/institution/:addr", async (req, res) => {
  try {
    // TODO: Get institution details
    res.json({ ok: true, stub: "gsi-institutional/institution/:addr" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/institution/list", async (req, res) => {
  try {
    // TODO: List all institutions
    res.json({ ok: true, stub: "gsi-institutional/institution/list" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsi-institutional listening :${PORT}`));
export default app;
