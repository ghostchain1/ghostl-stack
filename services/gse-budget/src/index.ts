import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4113;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory budget store ─────────────────────────────────────────────────────
interface BudgetAllocation {
  id: string;
  nation: string;
  category: string;
  totalGST: number;
  spentGST: number;
  period: string;
  createdAt: number;
}
interface Disbursement { id: string; budgetId: string; amountGST: number; recipient: string; purpose: string; ts: number; }

const budgets = new Map<string, BudgetAllocation>();
const disbursements: Disbursement[] = [];

// ─── Health ───────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gse-budget", ts: Date.now() });
});

app.get("/budget", (req, res) => {
  const nation = req.query.nation as string | undefined;
  let list = [...budgets.values()];
  if (nation) list = list.filter(b => b.nation === nation);
  res.json({ budgets: list, total: list.length });
});

app.post("/budget/create", (req, res) => {
  const { nation, category, totalGST, period } = req.body as Partial<BudgetAllocation>;
  if (!nation || !category || totalGST === undefined || !period) {
    res.status(400).json({ error: "nation, category, totalGST and period are required" });
    return;
  }
  const id = `budget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const allocation: BudgetAllocation = { id, nation, category, totalGST, spentGST: 0, period, createdAt: Date.now() };
  budgets.set(id, allocation);
  log.info("budget.created", { id, nation, category, totalGST });
  res.status(201).json({ budget: allocation });
});

app.post("/budget/spend", (req, res) => {
  const { budgetId, amountGST, recipient, purpose } = req.body as {
    budgetId?: string; amountGST?: number; recipient?: string; purpose?: string;
  };
  if (!budgetId || amountGST === undefined || !recipient || !purpose) {
    res.status(400).json({ error: "budgetId, amountGST, recipient and purpose are required" });
    return;
  }
  const budget = budgets.get(budgetId);
  if (!budget) { res.status(404).json({ error: "budget not found" }); return; }
  if (budget.spentGST + amountGST > budget.totalGST) {
    res.status(409).json({ error: "insufficient budget remaining", remaining: budget.totalGST - budget.spentGST });
    return;
  }
  const d: Disbursement = {
    id: `disb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    budgetId, amountGST, recipient, purpose, ts: Date.now(),
  };
  disbursements.push(d);
  budget.spentGST += amountGST;
  log.info("budget.disbursed", { budgetId, amountGST, recipient });
  res.status(201).json({ disbursement: d, budget });
});


app.listen(PORT, () => log.info(`gse-budget listening :${PORT}`));
export default app;
