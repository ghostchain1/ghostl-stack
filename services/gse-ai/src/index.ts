import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4116;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory alert store ──────────────────────────────────────────────────────────
interface EconAlert { id: string; type: string; message: string; severity: "info" | "warning" | "critical"; ts: number; }

const alerts: EconAlert[] = [];

// ─── Health ───────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gse-ai", ts: Date.now() });
});

app.post("/forecast/gdp", (req, res) => {
  const { nation, periods = 4, baseValueGST = 1_000_000, historicalGrowthRate = 0.12 } = req.body as {
    nation?: string; periods?: number; baseValueGST?: number; historicalGrowthRate?: number;
  };
  if (!nation) { res.status(400).json({ error: "nation is required" }); return; }
  const boundedPeriods = Math.min(Math.max(1, periods), 20);
  const projection: Array<{ period: number; valueGST: number; growthRate: number }> = [];
  let current = baseValueGST;
  // Simple compound-growth projection with minor noise
  for (let i = 1; i <= boundedPeriods; i++) {
    const noise = (Math.random() * 0.02) - 0.01; // ±1% stochastic noise
    const rate  = historicalGrowthRate / 4 + noise; // quarterly rate
    current    *= (1 + rate);
    projection.push({ period: i, valueGST: Math.round(current), growthRate: Math.round(rate * 10000) / 100 });
  }
  const finalValue   = projection[projection.length - 1]!.valueGST;
  const overallGrowth = ((finalValue - baseValueGST) / baseValueGST) * 100;
  log.info("gse-ai.forecast.gdp", { nation, periods: boundedPeriods });
  res.json({ nation, model: "compound-quarterly-v1", projection, overallGrowthPercent: Math.round(overallGrowth * 100) / 100 });
});

app.post("/forecast/inflation", (req, res) => {
  const { nation, baseRate = 2.1, periods = 4 } = req.body as {
    nation?: string; baseRate?: number; periods?: number;
  };
  if (!nation) { res.status(400).json({ error: "nation is required" }); return; }
  const boundedPeriods = Math.min(Math.max(1, periods), 20);
  const projection: Array<{ period: number; ratePercent: number }> = [];
  let current = baseRate;
  for (let i = 1; i <= boundedPeriods; i++) {
    const drift = (Math.random() * 0.4) - 0.2; // ±0.2% quarterly drift
    current = Math.max(0, current + drift);
    projection.push({ period: i, ratePercent: Math.round(current * 100) / 100 });
  }
  log.info("gse-ai.forecast.inflation", { nation, periods: boundedPeriods });
  res.json({ nation, model: "random-walk-inflation-v1", projection });
});

app.get("/alerts", (_req, res) => {
  res.json({ alerts: alerts.slice().sort((a, b) => b.ts - a.ts), total: alerts.length });
});


app.listen(PORT, () => log.info(`gse-ai listening :${PORT}`));
export default app;
