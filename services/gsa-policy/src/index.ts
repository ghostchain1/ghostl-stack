import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4303;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-policy", ts: Date.now() });
});

app.get("/changes", async (req, res) => {
  try {
    // TODO: List policy changes
    res.json({ ok: true, stub: "gsa-policy/changes" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/changes/:id", async (req, res) => {
  try {
    // TODO: Get change detail
    res.json({ ok: true, stub: "gsa-policy/changes/:id" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/changes", async (req, res) => {
  try {
    // TODO: Propose autonomous policy change
    res.json({ ok: true, stub: "gsa-policy/changes" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/changes/:id/approve", async (req, res) => {
  try {
    // TODO: Approve change
    res.json({ ok: true, stub: "gsa-policy/changes/:id/approve" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/changes/:id/reject", async (req, res) => {
  try {
    // TODO: Reject change
    res.json({ ok: true, stub: "gsa-policy/changes/:id/reject" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsa-policy listening :${PORT}`));
export default app;
