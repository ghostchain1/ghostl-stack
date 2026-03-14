import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4114;

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
  res.json({ status: "ok", service: "gse-infra", ts: Date.now() });
});

app.get("/projects", async (req, res) => {
  try {
    // TODO: implement — List infrastructure projects
    res.json({ ok: true, stub: "gse-infra/projects" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/projects/create", async (req, res) => {
  try {
    // TODO: implement — Create project
    res.json({ ok: true, stub: "gse-infra/projects/create" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/bonds/issue", async (req, res) => {
  try {
    // TODO: implement — Issue infrastructure bond
    res.json({ ok: true, stub: "gse-infra/bonds/issue" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/bonds/:holder", async (req, res) => {
  try {
    // TODO: implement — Bonds for holder
    res.json({ ok: true, stub: "gse-infra/bonds/:holder" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gse-infra listening :${PORT}`));
export default app;
