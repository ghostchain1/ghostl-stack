import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4111;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory tax store ───────────────────────────────────────────────────────
interface TaxPolicy { nation: string; ratePercent: number; brackets: { min: number; max: number; rate: number }[]; updatedAt: number; }
interface TaxPayment { id: string; nation: string; payer: string; amountGST: number; period: string; txHash?: string; recordedAt: number; }

const taxPolicies = new Map<string, TaxPolicy>([
  ["ghostchain", { nation: "ghostchain", ratePercent: 3, brackets: [{ min: 0, max: 1_000_000, rate: 0.03 }], updatedAt: Date.now() }],
]);
const taxPayments: TaxPayment[] = [];
const treasury = new Map<string, number>([["ghostchain", 0]]);

// ─── Health ───────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gse-tax", ts: Date.now() });
});

app.get("/tax/policy/:nation", (req, res) => {
  const policy = taxPolicies.get(req.params.nation);
  if (!policy) { res.status(404).json({ error: "no tax policy for nation" }); return; }
  res.json({ policy });
});

app.post("/tax/collect", (req, res) => {
  const { nation, payer, amountGST, period, txHash } = req.body as Partial<TaxPayment>;
  if (!nation || !payer || amountGST === undefined || !period) {
    res.status(400).json({ error: "nation, payer, amountGST and period are required" });
    return;
  }
  const payment: TaxPayment = {
    id: `tax-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nation, payer, amountGST, period, txHash, recordedAt: Date.now(),
  };
  taxPayments.push(payment);
  treasury.set(nation, (treasury.get(nation) ?? 0) + amountGST);
  log.info("tax.collected", { nation, payer, amountGST, period });
  res.status(201).json({ payment, treasuryBalance: treasury.get(nation) });
});

app.get("/tax/treasury/:nation", (req, res) => {
  if (!treasury.has(req.params.nation)) {
    res.status(404).json({ error: "nation not found" });
    return;
  }
  const balance = treasury.get(req.params.nation) ?? 0;
  const payments = taxPayments.filter(p => p.nation === req.params.nation);
  res.json({ nation: req.params.nation, balanceGST: balance, paymentsCount: payments.length });
});


app.listen(PORT, () => log.info(`gse-tax listening :${PORT}`));
export default app;
