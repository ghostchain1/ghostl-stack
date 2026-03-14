import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4200;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-registry", ts: Date.now() });
});

app.post("/identity/register", async (req, res) => {
  try {
    // TODO: Register new identity
    res.json({ ok: true, stub: "gsi-registry/identity/register" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/identity/:address", async (req, res) => {
  try {
    // TODO: Get identity by wallet
    res.json({ ok: true, stub: "gsi-registry/identity/:address" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/identity/resolve/:name", async (req, res) => {
  try {
    // TODO: Resolve GNS name to address
    res.json({ ok: true, stub: "gsi-registry/identity/resolve/:name" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/identity/list", async (req, res) => {
  try {
    // TODO: List all identities (paginated)
    res.json({ ok: true, stub: "gsi-registry/identity/list" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsi-registry listening :${PORT}`));
export default app;
