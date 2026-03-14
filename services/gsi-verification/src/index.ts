import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4202;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-verification", ts: Date.now() });
});

app.post("/verify", async (req, res) => {
  try {
    // TODO: Trigger identity verification
    res.json({ ok: true, stub: "gsi-verification/verify" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/verify/institution", async (req, res) => {
  try {
    // TODO: Verify institutional identity
    res.json({ ok: true, stub: "gsi-verification/verify/institution" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/verify/status/:addr", async (req, res) => {
  try {
    // TODO: Verification status
    res.json({ ok: true, stub: "gsi-verification/verify/status/:addr" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/revoke", async (req, res) => {
  try {
    // TODO: Revoke verification
    res.json({ ok: true, stub: "gsi-verification/revoke" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsi-verification listening :${PORT}`));
export default app;
