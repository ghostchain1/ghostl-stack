import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4115;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory economic indicators ───────────────────────────────────────────────
interface EconomicIndicator {
  key: string;
  label: string;
  value: number;
  unit: string;
  trend: "up" | "down" | "flat";
  updatedAt: number;
}

const indicators = new Map<string, EconomicIndicator>([
  ["gdp-ghostchain",   { key: "gdp-ghostchain",  label: "GhostChain GDP",       value: 1_000_000, unit: "GST",    trend: "up",   updatedAt: Date.now() }],
  ["inflation",        { key: "inflation",        label: "Inflation Rate",      value: 2.1,       unit: "%",      trend: "flat", updatedAt: Date.now() }],
  ["l1-tx-volume",     { key: "l1-tx-volume",     label: "L1 TX Volume (24h)",  value: 85_000,    unit: "txs",   trend: "up",   updatedAt: Date.now() }],
  ["bridge-volume",    { key: "bridge-volume",    label: "Bridge Volume (24h)", value: 250_000,   unit: "GST",   trend: "up",   updatedAt: Date.now() }],
  ["trade-volume-24h", { key: "trade-volume-24h", label: "Trade Volume (24h)",  value: 500_000,   unit: "GST",   trend: "flat", updatedAt: Date.now() }],
]);

// ─── Health ───────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gse-monitor", ts: Date.now() });
});

app.get("/indicators", (_req, res) => {
  res.json({ indicators: [...indicators.values()], total: indicators.size });
});

app.get("/indicators/gdp", (_req, res) => {
  const gdpIndicators = [...indicators.values()].filter(i => i.key.startsWith("gdp"));
  const totalGDP = gdpIndicators.reduce((sum, i) => sum + i.value, 0);
  res.json({
    summary: "global",
    totalGDP,
    unit: "GST",
    nations: gdpIndicators,
    ts: Date.now(),
  });
});

app.get("/indicators/trade", (_req, res) => {
  const tradeIndicator = indicators.get("trade-volume-24h");
  const bridgeIndicator = indicators.get("bridge-volume");
  res.json({
    flows: {
      tradeVolume24h: tradeIndicator?.value ?? 0,
      bridgeVolume24h: bridgeIndicator?.value ?? 0,
      unit: "GST",
    },
    ts: Date.now(),
  });
});

app.put("/indicators/:key", (req, res) => {
  const existing = indicators.get(req.params.key);
  if (!existing) { res.status(404).json({ error: "indicator not found" }); return; }
  const { value, trend } = req.body as { value?: number; trend?: "up" | "down" | "flat" };
  if (value !== undefined) existing.value = value;
  if (trend !== undefined) existing.trend = trend;
  existing.updatedAt = Date.now();
  log.info("indicator.updated", { key: req.params.key, value, trend });
  res.json({ indicator: existing });
});


app.listen(PORT, () => log.info(`gse-monitor listening :${PORT}`));
export default app;
