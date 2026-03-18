import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4305;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Risk model ────────────────────────────────────────────────────────────
type RiskLevel = "low" | "medium" | "high" | "critical";
interface RiskScore { subsystem: string; score: number; level: RiskLevel; factors: string[]; updatedAt: number; }
interface RiskAlert { id: string; subsystem: string; level: RiskLevel; message: string; ts: number; resolved: boolean; }

function toLevel(score: number): RiskLevel {
  if (score < 25) return "low";
  if (score < 50) return "medium";
  if (score < 75) return "high";
  return "critical";
}

const riskScores = new Map<string, RiskScore>();
const riskAlerts: RiskAlert[] = [];

// Seed default subsystem risk scores
const SUBSYSTEMS = ["l1-consensus", "l2-rollup", "l3-app", "bridge", "treasury", "governance", "oracle"];
for (const subsystem of SUBSYSTEMS) {
  riskScores.set(subsystem, { subsystem, score: 10, level: "low", factors: [], updatedAt: Date.now() });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-risk", ts: Date.now() });
});

app.get("/scores", (_req, res) => {
  res.json({ scores: [...riskScores.values()], ts: Date.now() });
});

app.get("/scores/:subsystem", (req, res) => {
  const score = riskScores.get(req.params.subsystem);
  if (!score) { res.status(404).json({ error: "subsystem not found" }); return; }
  res.json({ score });
});

app.post("/assess", (req, res) => {
  const { subsystem, factors } = req.body as { subsystem?: string; factors?: string[] };
  if (!subsystem) { res.status(400).json({ error: "subsystem is required" }); return; }
  // Simple scoring: each factor adds 10 points up to 100
  const allFactors = factors ?? [];
  const score = Math.min(allFactors.length * 10, 100);
  const level = toLevel(score);
  const rec: RiskScore = { subsystem, score, level, factors: allFactors, updatedAt: Date.now() };
  riskScores.set(subsystem, rec);
  // Create an alert if high/critical
  if (level === "high" || level === "critical") {
    const alert: RiskAlert = {
      id: `risk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      subsystem, level,
      message: `${subsystem} risk elevated to ${level}: ${allFactors.join(", ")}`,
      ts: Date.now(), resolved: false,
    };
    riskAlerts.unshift(alert);
    log.warn("risk.alert", { subsystem, level, score });
  }
  res.json({ score: rec });
});

app.get("/alerts", (req, res) => {
  const unresolved = req.query.resolved === "true"
    ? riskAlerts
    : riskAlerts.filter(a => !a.resolved);
  res.json({ alerts: unresolved, total: unresolved.length });
});

app.post("/alerts/:id/resolve", (req, res) => {
  const alert = riskAlerts.find(a => a.id === req.params.id);
  if (!alert) { res.status(404).json({ error: "alert not found" }); return; }
  alert.resolved = true;
  res.json({ alert });
});


app.listen(PORT, () => log.info(`gsa-risk listening :${PORT}`));
export default app;
