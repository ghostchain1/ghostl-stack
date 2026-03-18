import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4206;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory identity risk store ───────────────────────────────────────────────────
interface FraudAlert { id: string; address: string; type: string; severity: "low" | "medium" | "high"; message: string; ts: number; resolved: boolean; }
interface RiskScore  { address: string; score: number; level: "low" | "medium" | "high" | "critical"; factors: string[]; analyzedAt: number; }

const fraudAlerts = new Map<string, FraudAlert>();
const riskScores  = new Map<string, RiskScore>();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsi-ai", ts: Date.now() });
});

app.get("/alerts", (req, res) => {
  const resolved = req.query.resolved === "true";
  const list = [...fraudAlerts.values()]
    .filter(a => resolved ? true : !a.resolved)
    .sort((a, b) => b.ts - a.ts);
  res.json({ alerts: list, total: list.length });
});

app.post("/analyze/:addr", (req, res) => {
  const address = req.params.addr.toLowerCase();
  const { context = {} } = req.body as { context?: Record<string, unknown> };

  // Deterministic heuristic risk scoring (no random — reproducible per address)
  const addrSum  = address.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const rawScore = addrSum % 100;
  let level: RiskScore["level"] = "low";
  if (rawScore >= 75) level = "critical";
  else if (rawScore >= 50) level = "high";
  else if (rawScore >= 25) level = "medium";

  const factors: string[] = [];
  if (rawScore > 60) factors.push("unusual_address_entropy");
  if (Object.keys(context).length > 10) factors.push("high_context_complexity");
  if (level === "high" || level === "critical") {
    // Create a fraud alert
    const alertId = `alert-${address.slice(2, 10)}-${Date.now()}`;
    if (!fraudAlerts.has(alertId)) {
      fraudAlerts.set(alertId, {
        id: alertId, address, type: "identity-risk", severity: level === "critical" ? "high" : "medium",
        message: `Risk score ${rawScore} (${level}) detected for ${address}`,
        ts: Date.now(), resolved: false,
      });
    }
  }

  const riskScore: RiskScore = { address, score: rawScore, level, factors, analyzedAt: Date.now() };
  riskScores.set(address, riskScore);
  log.info("gsi-ai.analyze", { address, score: rawScore, level });
  res.json({ address, score: rawScore, level, factors, analyzedAt: riskScore.analyzedAt });
});

app.get("/risk/:addr", (req, res) => {
  const address = req.params.addr.toLowerCase();
  const cached = riskScores.get(address);
  if (cached) { res.json(cached); return; }
  // Return a default (unanalyzed) response rather than 404
  res.json({ address, score: 0, level: "low", factors: [], analyzedAt: null, note: "not yet analyzed" });
});


app.listen(PORT, () => log.info(`gsi-ai listening :${PORT}`));
export default app;
