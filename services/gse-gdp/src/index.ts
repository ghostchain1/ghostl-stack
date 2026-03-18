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

// ─── In-memory GDP store ────────────────────────────────────────────────────────
interface GDPRecord {
  id: string;
  nation: string;
  period: string;   // e.g. "2026-Q1"
  valueGST: number; // GDP in GST wei-denominated units
  growthRate?: number;
  source: string;
  recordedAt: number;
}

const records: GDPRecord[] = [];

// Seed with ghost-nation baseline
records.push({ id: "gdp-0", nation: "ghostchain", period: "2026-Q1", valueGST: 1_000_000, growthRate: 0.12, source: "genesis", recordedAt: Date.now() });

// ─── Health ───────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gse-gdp", ts: Date.now() });
});

app.get("/gdp", (req, res) => {
  const nation = req.query.nation as string | undefined;
  let list = records.slice();
  if (nation) list = list.filter(r => r.nation === nation);
  list.sort((a, b) => b.recordedAt - a.recordedAt);
  res.json({ records: list, total: list.length });
});

app.post("/gdp/record", (req, res) => {
  const { nation, period, valueGST, growthRate, source } = req.body as Partial<GDPRecord>;
  if (!nation || !period || valueGST === undefined) {
    res.status(400).json({ error: "nation, period and valueGST are required" });
    return;
  }
  const record: GDPRecord = {
    id: `gdp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nation, period, valueGST, growthRate, source: source ?? "api", recordedAt: Date.now(),
  };
  records.push(record);
  log.info("gdp.record", { nation, period, valueGST });
  res.status(201).json({ record });
});

app.get("/gdp/:nation", (req, res) => {
  const history = records
    .filter(r => r.nation === req.params.nation)
    .sort((a, b) => b.recordedAt - a.recordedAt);
  if (!history.length) { res.status(404).json({ error: "no records for nation" }); return; }
  res.json({ nation: req.params.nation, history, total: history.length });
});

app.get("/gdp/:nation/latest", (req, res) => {
  const latest = records
    .filter(r => r.nation === req.params.nation)
    .sort((a, b) => b.recordedAt - a.recordedAt)[0];
  if (!latest) { res.status(404).json({ error: "no records for nation" }); return; }
  res.json({ nation: req.params.nation, latest });
});


app.listen(PORT, () => log.info(`gse-gdp listening :${PORT}`));
export default app;
