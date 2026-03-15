/**
 * GIE-X — Ghost Interchain Expansion Engine
 * Port 9979 | TypeScript/Express | Node 20
 *
 * Autonomously expands GhostStack across the multichain ecosystem:
 *   • Chain discovery & scoring     GET /chains
 *   • Bridge deployment             POST/GET /bridges
 *   • Cross-chain liquidity         POST/GET /liquidity
 *   • Wrapped assets (wGST)         POST/GET /assets
 *   • Cross-chain messaging         POST/GET /messages
 *   • Multichain analytics          GET /analytics
 *   • Health + summary              GET /health  GET /summary
 *
 * Cron jobs run every 10 min (discovery), 5 min (tick), 60 min (analytics).
 */

import express, { Request, Response } from "express";
import * as cron from "node-cron";
import dotenv from "dotenv";
import logger from "./utils/logger";

import {
  seedChains,
  discoverChains,
  runDiscoveryCycle,
  getChainById,
  getAllChains,
  updateChainField,
  getDiscoveryStats,
  type ExpandStatus,
  type ChainType,
} from "./discovery/chainDiscovery";

import {
  seedBridges,
  deployBridge,
  getBridges,
  getBridgeById,
  getBridgeByDest,
  updateBridgeStatus,
  tickBridgeVolumes,
  getBridgeStats,
  type BridgeMode,
  type BridgeStatus,
} from "./bridges/bridgeDeployment";

import {
  seedPools,
  expandLiquidity,
  getPools,
  getPoolById,
  tickPoolMetrics,
  getPoolStats,
  type PoolProtocol,
} from "./liquidity/liquidityExpansion";

import {
  seedWrappedAssets,
  createWrappedToken,
  getWrappedAssets,
  getWrappedAssetById,
  getWrappedAssetByChain,
  tickAssetMetrics,
  getWrappedStats,
  type WrappedStandard,
} from "./assets/wrappedAssets";

import {
  seedMessages,
  sendMessage,
  getMessages,
  getMessageById,
  tickMessaging,
  getMessagingStats,
  type MessageType,
  type MessageStatus,
} from "./messaging/crossChainMessaging";

import {
  takeSnapshot,
  getLatestSnapshot,
  getSnapshotHistory,
  getChainPerformances,
  analyzeMultichain,
} from "./analytics/multichainAnalytics";

dotenv.config();

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const PORT    = parseInt(process.env["GIEX_PORT"] ?? "9979", 10);
const VERSION = "1.0.0";
const START   = Date.now();

function warmUp(): void {
  logger.info("[GIE-X] Initialising interchain expansion engine …");
  seedChains();
  seedBridges();
  seedPools();
  seedWrappedAssets();
  seedMessages();
  // Take first analytics snapshot
  takeSnapshot();
  logger.info(`[GIE-X] Warm-up complete — chains=${getAllChains().length}, bridges=${getBridges().length}, pools=${getPools().length}`);
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status:    "healthy",
    service:   "GIE-X",
    version:   VERSION,
    uptime:    Math.floor((Date.now() - START) / 1000),
    port:      PORT,
    timestamp: Date.now(),
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

app.get("/summary", (_req: Request, res: Response) => {
  const snap = getLatestSnapshot();
  res.json({
    service:   "GIE-X",
    version:   VERSION,
    uptime:    Math.floor((Date.now() - START) / 1000),
    discovery: getDiscoveryStats(),
    bridges:   getBridgeStats(),
    liquidity: getPoolStats(),
    assets:    getWrappedStats(),
    messaging: getMessagingStats(),
    snapshot:  snap,
  });
});

// ── Chain Discovery ───────────────────────────────────────────────────────────

app.get("/chains", (req: Request, res: Response) => {
  const { status, type, minScore, limit } = req.query as Record<string, string>;
  const results = discoverChains({
    status:   status   as ExpandStatus | undefined,
    type:     type     as ChainType    | undefined,
    minScore: minScore ? parseInt(minScore, 10) : undefined,
    limit:    limit    ? parseInt(limit,    10) : undefined,
  });
  res.json({ chains: results, total: results.length });
});

app.get("/chains/stats", (_req: Request, res: Response) => {
  res.json(getDiscoveryStats());
});

app.get("/chains/scan", (_req: Request, res: Response) => {
  const result = runDiscoveryCycle();
  res.json(result);
});

app.get("/chains/:id", (req: Request, res: Response) => {
  const c = getChainById(req.params["id"]!);
  if (!c) { res.status(404).json({ error: "Chain not found" }); return; }
  res.json(c);
});

// ── Bridges ───────────────────────────────────────────────────────────────────

app.get("/bridges", (_req: Request, res: Response) => {
  const all = getBridges();
  res.json({ bridges: all, total: all.length });
});

app.get("/bridges/stats", (_req: Request, res: Response) => {
  res.json(getBridgeStats());
});

app.post("/bridges/deploy", (req: Request, res: Response) => {
  const { chain, mode, bridgeFee_bps, validatorCount, validatorThreshold } = req.body as {
    chain?: string; mode?: BridgeMode; bridgeFee_bps?: number;
    validatorCount?: number; validatorThreshold?: number;
  };
  if (!chain) { res.status(400).json({ error: "chain is required" }); return; }
  const bridge = deployBridge(chain, { mode, bridgeFee_bps, validatorCount, validatorThreshold });
  // Register on chain profile
  const c = [...getAllChains()].find((x) => x.name === chain);
  if (c) updateChainField(c.id, { bridgeDeployed: true, status: "deploying" });
  res.status(201).json(bridge);
});

app.get("/bridges/:id", (req: Request, res: Response) => {
  const b = getBridgeById(req.params["id"]!) ?? getBridgeByDest(req.params["id"]!);
  if (!b) { res.status(404).json({ error: "Bridge not found" }); return; }
  res.json(b);
});

app.patch("/bridges/:id/status", (req: Request, res: Response) => {
  const { status } = req.body as { status?: BridgeStatus };
  if (!status) { res.status(400).json({ error: "status is required" }); return; }
  const ok = updateBridgeStatus(req.params["id"]!, status);
  if (!ok) { res.status(404).json({ error: "Bridge not found" }); return; }
  res.json({ success: true, newStatus: status });
});

// ── Liquidity ─────────────────────────────────────────────────────────────────

app.get("/liquidity", (req: Request, res: Response) => {
  const chain = req.query["chain"] as string | undefined;
  const all   = getPools(chain);
  res.json({ pools: all, total: all.length });
});

app.get("/liquidity/stats", (_req: Request, res: Response) => {
  res.json(getPoolStats());
});

app.post("/liquidity/expand", (req: Request, res: Response) => {
  const { chain, pairB, protocol, initialTVL_USD, gstRewardsPerDay } = req.body as {
    chain?: string; pairB?: string; protocol?: PoolProtocol;
    initialTVL_USD?: number; gstRewardsPerDay?: number;
  };
  if (!chain) { res.status(400).json({ error: "chain is required" }); return; }
  const pool = expandLiquidity(chain, { pairB, protocol, initialTVL_USD, gstRewardsPerDay });
  const c    = [...getAllChains()].find((x) => x.name === chain);
  if (c) updateChainField(c.id, { poolsDeployed: c.poolsDeployed + 1 });
  res.status(201).json(pool);
});

app.get("/liquidity/:id", (req: Request, res: Response) => {
  const p = getPoolById(req.params["id"]!);
  if (!p) { res.status(404).json({ error: "Pool not found" }); return; }
  res.json(p);
});

// ── Wrapped Assets ────────────────────────────────────────────────────────────

app.get("/assets", (_req: Request, res: Response) => {
  const all = getWrappedAssets();
  res.json({ assets: all, total: all.length });
});

app.get("/assets/stats", (_req: Request, res: Response) => {
  res.json(getWrappedStats());
});

app.post("/assets/create", (req: Request, res: Response) => {
  const { chain, standard, decimals } = req.body as {
    chain?: string; standard?: WrappedStandard; decimals?: number;
  };
  if (!chain) { res.status(400).json({ error: "chain is required" }); return; }
  const asset = createWrappedToken(chain, { standard, decimals });
  const c     = [...getAllChains()].find((x) => x.name === chain);
  if (c) updateChainField(c.id, { wrappedAssets: c.wrappedAssets + 1 });
  res.status(201).json(asset);
});

app.get("/assets/:id", (req: Request, res: Response) => {
  const a = getWrappedAssetById(req.params["id"]!) ?? getWrappedAssetByChain(req.params["id"]!);
  if (!a) { res.status(404).json({ error: "Wrapped asset not found" }); return; }
  res.json(a);
});

// ── Messaging ─────────────────────────────────────────────────────────────────

app.get("/messages", (req: Request, res: Response) => {
  const { destination, status, type, limit } = req.query as Record<string, string>;
  const results = getMessages({
    destination,
    status: status as MessageStatus | undefined,
    type:   type   as MessageType   | undefined,
    limit:  limit  ? parseInt(limit, 10) : 50,
  });
  res.json({ messages: results, total: results.length });
});

app.get("/messages/stats", (_req: Request, res: Response) => {
  res.json(getMessagingStats());
});

app.post("/messages/send", (req: Request, res: Response) => {
  const { destination, type, payload } = req.body as {
    destination?: string; type?: MessageType; payload?: Record<string, unknown>;
  };
  if (!destination) { res.status(400).json({ error: "destination is required" }); return; }
  if (!type)        { res.status(400).json({ error: "type is required" }); return; }
  const msg = sendMessage(destination, type, payload);
  // Track relay count on chain profile
  const c = [...getAllChains()].find((x) => x.name === destination);
  if (c) updateChainField(c.id, { messagesRelayed: c.messagesRelayed + 1 });
  res.status(201).json(msg);
});

app.get("/messages/:id", (req: Request, res: Response) => {
  const m = getMessageById(req.params["id"]!);
  if (!m) { res.status(404).json({ error: "Message not found" }); return; }
  res.json(m);
});

// ── Analytics ─────────────────────────────────────────────────────────────────

app.get("/analytics", (_req: Request, res: Response) => {
  res.json(analyzeMultichain());
});

app.get("/analytics/snapshot", (_req: Request, res: Response) => {
  const snap = takeSnapshot();
  res.json(snap);
});

app.get("/analytics/history", (req: Request, res: Response) => {
  const limit = parseInt((req.query["limit"] as string) ?? "48", 10);
  res.json({ history: getSnapshotHistory(limit), total: getSnapshotHistory(1000).length });
});

app.get("/analytics/chains", (_req: Request, res: Response) => {
  res.json({ performances: getChainPerformances() });
});

// ── Cron jobs ─────────────────────────────────────────────────────────────────

// Every 5 min: tick metrics + messaging
cron.schedule("*/5 * * * *", () => {
  tickBridgeVolumes();
  tickPoolMetrics();
  tickAssetMetrics();
  tickMessaging();
  logger.info("[GIE-X][Cron/5m] Metrics tick complete");
});

// Every 10 min: run chain discovery cycle
cron.schedule("*/10 * * * *", () => {
  const { scanned, newTargets } = runDiscoveryCycle();
  logger.info(`[GIE-X][Cron/10m] Discovery — ${scanned} scanned, ${newTargets.length} new priority targets`);
});

// Every 30 min: auto-expand — deploy bridge/pool/asset to top un-bridged target
cron.schedule("*/30 * * * *", () => {
  const targets = discoverChains({ status: "target", minScore: 60, limit: 1 });
  if (targets.length === 0) return;
  const chain = targets[0]!.name;
  logger.info(`[GIE-X][Cron/30m] Auto-expanding to "${chain}" …`);
  deployBridge(chain);
  expandLiquidity(chain, { pairB: "USDC", initialTVL_USD: 100_000 });
  createWrappedToken(chain);
  sendMessage(chain, "oracle");
  updateChainField(targets[0]!.id, { status: "deploying" });
});

// Every 60 min: take analytics snapshot
cron.schedule("0 * * * *", () => {
  const snap = takeSnapshot();
  logger.info(`[GIE-X][Cron/60m] Analytics snapshot — health=${snap.interchainHealthScore}/100, reach=${snap.multiChainReach} chains`);
});

// ── Start ─────────────────────────────────────────────────────────────────────

warmUp();
app.listen(PORT, () => {
  logger.info(`[GIE-X] Listening on port ${PORT}`);
  logger.info(`[GIE-X] v${VERSION} ready — autonomous interchain expansion active`);
});
