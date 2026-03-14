import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4205;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-biometric", ts: Date.now() });
});

app.post("/biometric/enroll", async (req, res) => {
  try {
    // TODO: Enroll biometric (returns commitment hash)
    res.json({ ok: true, stub: "gsi-biometric/biometric/enroll" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/biometric/verify", async (req, res) => {
  try {
    // TODO: Verify biometric against commitment
    res.json({ ok: true, stub: "gsi-biometric/biometric/verify" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/biometric/status/:addr", async (req, res) => {
  try {
    // TODO: Enrollment status
    res.json({ ok: true, stub: "gsi-biometric/biometric/status/:addr" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsi-biometric listening :${PORT}`));
export default app;
