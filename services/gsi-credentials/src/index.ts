import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4201;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-credentials", ts: Date.now() });
});

app.post("/credentials/issue", async (req, res) => {
  try {
    // TODO: Issue new credential
    res.json({ ok: true, stub: "gsi-credentials/credentials/issue" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/credentials/revoke", async (req, res) => {
  try {
    // TODO: Revoke credential
    res.json({ ok: true, stub: "gsi-credentials/credentials/revoke" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/credentials/:id", async (req, res) => {
  try {
    // TODO: Get credential by ID
    res.json({ ok: true, stub: "gsi-credentials/credentials/:id" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/credentials/subject/:addr", async (req, res) => {
  try {
    // TODO: Get credentials for subject
    res.json({ ok: true, stub: "gsi-credentials/credentials/subject/:addr" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/credentials/:id/valid", async (req, res) => {
  try {
    // TODO: Check credential validity
    res.json({ ok: true, stub: "gsi-credentials/credentials/:id/valid" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsi-credentials listening :${PORT}`));
export default app;
