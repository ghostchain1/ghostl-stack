import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4203;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-passport", ts: Date.now() });
});

app.post("/passport/issue", async (req, res) => {
  try {
    // TODO: Issue digital passport
    res.json({ ok: true, stub: "gsi-passport/passport/issue" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/passport/revoke", async (req, res) => {
  try {
    // TODO: Revoke passport
    res.json({ ok: true, stub: "gsi-passport/passport/revoke" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/passport/:tokenId", async (req, res) => {
  try {
    // TODO: Get passport by token ID
    res.json({ ok: true, stub: "gsi-passport/passport/:tokenId" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/passport/holder/:addr", async (req, res) => {
  try {
    // TODO: Passport status for holder
    res.json({ ok: true, stub: "gsi-passport/passport/holder/:addr" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


app.listen(PORT, () => log.info(`gsi-passport listening :${PORT}`));
export default app;
