import { v4 as uuidv4 } from "uuid";

export type StrategyType   = "market-making" | "arbitrage" | "liquidity-balancing" | "trend-following";
export type StrategyStatus = "running" | "paused" | "stopped" | "backtesting";

export interface TradingStrategy {
  id: string;
  name: string;
  type: StrategyType;
  chain: "ghostl2" | "ghostchain";
  status: StrategyStatus;
  pnlUSD: number;
  pnlPct: number;
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  capitalAllocatedUSD: number;
  openPositions: number;
  lastExecuted: number;
  createdAt: number;
}

export interface TradeRecord {
  id: string;
  strategyId: string;
  pair: string;
  side: "buy" | "sell";
  amountUSD: number;
  pnlUSD: number;
  timestamp: number;
}

function strat(
  name: string, type: StrategyType, chain: "ghostl2" | "ghostchain",
  status: StrategyStatus, pnl: number, pnlPct: number,
  trades: number, wins: number, capital: number, openPos: number, ageDays: number
): TradingStrategy {
  return {
    id: uuidv4(), name, type, chain, status,
    pnlUSD: pnl, pnlPct,
    totalTrades: trades, winningTrades: wins,
    winRate: +((wins / trades) * 100).toFixed(1),
    capitalAllocatedUSD: capital,
    openPositions: openPos,
    lastExecuted: Date.now() - Math.floor(Math.random() * 300_000),
    createdAt: Date.now() - 86_400_000 * ageDays,
  };
}

const strategies: TradingStrategy[] = [
  strat("Ghost Market Maker #1",    "market-making",       "ghostl2",    "running",    84_200, 14.2,  12_840, 9_243, 600_000, 14, 120),
  strat("Ghost Market Maker #2",    "market-making",       "ghostl2",    "running",    61_100, 10.8,   9_210, 6_541, 560_000,  9,  90),
  strat("Cross-Chain Arbitrage",    "arbitrage",           "ghostchain", "running",    42_700, 18.9,   4_382, 3_224, 225_000,  3,  60),
  strat("L2 Arbitrage Bot",         "arbitrage",           "ghostl2",    "running",    38_500, 16.4,   6_114, 4_388, 235_000,  5,  55),
  strat("Liquidity Balancer Alpha", "liquidity-balancing", "ghostl2",    "running",    29_800,  8.7,   2_940, 2_046, 345_000,  2,  45),
  strat("Trend Follower v1",        "trend-following",     "ghostl2",    "paused",     18_200, 12.1,   1_820, 1_137, 150_000,  0,  30),
  strat("Trend Follower v2",        "trend-following",     "ghostchain", "backtesting", 0,      0.0,     240,   142,       0,  0,   7),
];

const tradeLog: TradeRecord[] = [];

const PAIRS = ["GST/USDC", "GST/ETH", "GST/BTC", "USDC/ETH", "GST/GHOST"];

function jitter(base: number, pct = 0.05): number {
  return base * (1 + (Math.random() - 0.5) * pct * 2);
}

export function getStrategies(opts?: { status?: StrategyStatus; type?: StrategyType }): TradingStrategy[] {
  return strategies.filter((s) =>
    (!opts?.status || s.status === opts.status) &&
    (!opts?.type   || s.type   === opts.type)
  );
}

export function getStrategy(id: string): TradingStrategy | undefined {
  return strategies.find((s) => s.id === id);
}

export function getStrategyStats() {
  const running = strategies.filter((s) => s.status === "running");
  return {
    totalStrategies:      strategies.length,
    runningStrategies:    running.length,
    totalPnlUSD:          strategies.reduce((s, str) => s + str.pnlUSD, 0),
    totalCapitalUSD:      strategies.reduce((s, str) => s + str.capitalAllocatedUSD, 0),
    totalTrades:          strategies.reduce((s, str) => s + str.totalTrades, 0),
    avgWinRate:           running.reduce((s, str) => s + str.winRate, 0) / (running.length || 1),
    openPositions:        strategies.reduce((s, str) => s + str.openPositions, 0),
    totalTradesRecorded:  tradeLog.length,
  };
}

export async function runTradingStrategy(strategyId?: string): Promise<{ strategy: string; status: string; tradesExecuted: number; pnlUSD: number }> {
  const target = strategyId
    ? strategies.find((s) => s.id === strategyId)
    : strategies.filter((s) => s.status === "running").sort((a, b) => b.capitalAllocatedUSD - a.capitalAllocatedUSD)[0];

  if (!target) return { strategy: "none", status: "idle", tradesExecuted: 0, pnlUSD: 0 };

  const tradesNow = Math.floor(Math.random() * 8) + 1;
  const pnlNow    = +(Math.random() * 500 - 50).toFixed(2);
  target.totalTrades   += tradesNow;
  target.pnlUSD        += pnlNow;
  target.pnlPct         = +((target.pnlUSD / target.capitalAllocatedUSD) * 100).toFixed(2);
  target.lastExecuted   = Date.now();

  for (let i = 0; i < Math.min(tradesNow, 3); i++) {
    const pair     = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    const tradePnl = +(Math.random() * 200 - 30).toFixed(2);
    tradeLog.push({
      id: uuidv4(), strategyId: target.id, pair,
      side: Math.random() > 0.5 ? "buy" : "sell",
      amountUSD: +(Math.random() * 5000 + 500).toFixed(2),
      pnlUSD: tradePnl, timestamp: Date.now(),
    });
    if (tradePnl > 0) target.winningTrades++;
  }
  target.winRate = +((target.winningTrades / target.totalTrades) * 100).toFixed(1);

  return { strategy: target.name, status: target.status, tradesExecuted: tradesNow, pnlUSD: pnlNow };
}

export function setStrategyStatus(id: string, status: StrategyStatus): { success: boolean } {
  const s = strategies.find((x) => x.id === id);
  if (!s) return { success: false };
  s.status = status;
  return { success: true };
}

export function getTradeLog(limit = 100): TradeRecord[] {
  return tradeLog.slice(-limit);
}

export function tickTrading(): void {
  for (const s of strategies) {
    if (s.status !== "running") continue;
    const microPnl = +(Math.random() * 20 - 2).toFixed(2);
    s.pnlUSD     += microPnl;
    s.pnlPct      = +((s.pnlUSD / s.capitalAllocatedUSD) * 100).toFixed(2);
    s.openPositions = Math.max(0, s.openPositions + (Math.random() > 0.5 ? 1 : -1));
    s.lastExecuted  = Date.now();
  }
}
