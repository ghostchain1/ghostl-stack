import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4112;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory trade store ─────────────────────────────────────────────────────
interface TradeRecord {
  id: string;
  fromNation: string;
  toNation: string;
  assetSymbol: string;
  amountGST: number;
  status: "pending" | "settled" | "failed";
  txHash?: string;
  recordedAt: number;
  settledAt?: number;
}

const trades = new Map<string, TradeRecord>();

// ─── Health ───────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gse-trade", ts: Date.now() });
});

app.post("/trade/record", (req, res) => {
  const { fromNation, toNation, assetSymbol, amountGST, txHash } = req.body as Partial<TradeRecord>;
  if (!fromNation || !toNation || !assetSymbol || amountGST === undefined) {
    res.status(400).json({ error: "fromNation, toNation, assetSymbol and amountGST are required" });
    return;
  }
  const id = `trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const trade: TradeRecord = { id, fromNation, toNation, assetSymbol, amountGST, status: "pending", txHash, recordedAt: Date.now() };
  trades.set(id, trade);
  log.info("trade.recorded", { id, fromNation, toNation, assetSymbol, amountGST });
  res.status(201).json({ trade });
});

app.post("/trade/settle", (req, res) => {
  const { id, txHash } = req.body as { id?: string; txHash?: string };
  if (!id) { res.status(400).json({ error: "id is required" }); return; }
  const trade = trades.get(id);
  if (!trade) { res.status(404).json({ error: "trade not found" }); return; }
  if (trade.status !== "pending") {
    res.status(409).json({ error: `trade is already ${trade.status}` }); return;
  }
  trade.status = "settled";
  trade.settledAt = Date.now();
  if (txHash) trade.txHash = txHash;
  log.info("trade.settled", { id });
  res.json({ trade });
});

app.get("/trade/history", (req, res) => {
  const nation = req.query.nation as string | undefined;
  let list = [...trades.values()];
  if (nation) list = list.filter(t => t.fromNation === nation || t.toNation === nation);
  list.sort((a, b) => b.recordedAt - a.recordedAt);
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json({ records: list.slice(0, limit), total: list.length });
});


app.listen(PORT, () => log.info(`gse-trade listening :${PORT}`));
export default app;
