/**
 * AGE-Gov — Ghost Autonomous Governance Engine
 * Port 9978 | TypeScript/Express | Node 20
 *
 * Exposes REST endpoints for:
 *   • Proposal management    GET/POST /proposals
 *   • Policy simulation      POST/GET  /simulate/:proposalId
 *   • Voting intelligence    GET/POST  /voting/:proposalId
 *   • Execution engine       POST/GET  /execute
 *   • DAO registry           GET/POST  /daos
 *   • Health + summary       GET /health  GET /summary
 *
 * Cron jobs run every 5 / 15 / 20 minutes + 2 hours.
 */

import express, { Request, Response } from "express";
import * as cron from "node-cron";
import dotenv from "dotenv";
import logger from "./utils/logger";

import {
  generateProposal,
  seedProposals,
  updateProposalStatus,
  getProposals,
  getProposalById,
  getProposalStats,
  ProposalCategory,
} from "./proposals/proposalGenerator";

import {
  simulatePolicy,
  getSimulation,
  getAllSimulations,
  getSimulationStats,
} from "./simulation/policySimulator";

import {
  predictVote,
  recordVotingResult,
  getPrediction,
  getAllPredictions,
  getVotingStats,
} from "./voting/votingAnalyzer";

import {
  executeProposal,
  getExecutionLog,
  getExecutionRecord,
  getExecutionsByProposal,
  getExecutionStats,
} from "./execution/governanceExecutor";

import {
  registerDAO,
  seedRegistry,
  getAllDAOs,
  getDAO,
  getRegistryStats,
} from "./registry/daoRegistry";

dotenv.config();

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const PORT    = parseInt(process.env["AGE_PORT"]    ?? "9978", 10);
const VERSION = "1.0.0";
const START   = Date.now();

async function warmUp(): Promise<void> {
  logger.info("[AGE-Gov] Seeding proposals and DAO registry …");
  seedProposals();
  seedRegistry();

  // Simulate + predict all seeded proposals
  const proposals = getProposals({});
  for (const p of proposals) {
    if (!getSimulation(p.id)) {
      try { simulatePolicy(p, 90); } catch { /* ignore */ }
    }
    if (!getPrediction(p.id)) {
      try { predictVote(p); } catch { /* ignore */ }
    }
  }

  logger.info(`[AGE-Gov] Warm-up complete — ${proposals.length} proposals, ${getAllDAOs().length} DAOs`);
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status:   "healthy",
    service:  "AGE-Gov",
    version:  VERSION,
    uptime:   Math.floor((Date.now() - START) / 1000),
    port:     PORT,
    timestamp: Date.now(),
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

app.get("/summary", (_req: Request, res: Response) => {
  const propStats  = getProposalStats();
  const simStats   = getSimulationStats();
  const voteStats  = getVotingStats();
  const execStats  = getExecutionStats();
  const regStats   = getRegistryStats();

  res.json({
    service:   "AGE-Gov",
    version:   VERSION,
    uptime:    Math.floor((Date.now() - START) / 1000),
    proposals: propStats,
    simulation: simStats,
    voting:    voteStats,
    execution: execStats,
    registry:  regStats,
  });
});

// ── Proposals ─────────────────────────────────────────────────────────────────

app.get("/proposals", (req: Request, res: Response) => {
  const { category, status, dao, limit } = req.query as Record<string, string>;
  let results = getProposals({
    category: category as ProposalCategory | undefined,
    status:   status as any,
    limit:    limit ? parseInt(limit, 10) : undefined,
  });
  if (dao) results = results.filter((p) => p.targetDAO === dao);
  res.json({ proposals: results, total: results.length });
});

app.get("/proposals/stats", (_req: Request, res: Response) => {
  res.json(getProposalStats());
});

app.get("/proposals/:id", (req: Request, res: Response) => {
  const p = getProposalById(req.params["id"]!);
  if (!p) { res.status(404).json({ error: "Proposal not found" }); return; }
  res.json(p);
});

app.post("/proposals/generate", (req: Request, res: Response) => {
  const { topic, category, dao } = req.body as { topic?: string; category?: ProposalCategory; dao?: string };
  if (!topic) { res.status(400).json({ error: "topic is required" }); return; }

  const proposal = generateProposal(topic, { category, targetDAO: dao });
  // Auto-simulate the new proposal
  const sim = simulatePolicy(proposal, 90);
  predictVote(proposal);

  res.status(201).json({ proposal, simulation: sim });
});

app.patch("/proposals/:id/status", (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  if (!status) { res.status(400).json({ error: "status is required" }); return; }

  const ok = updateProposalStatus(req.params["id"]!, status as any);
  if (!ok) { res.status(404).json({ error: "Proposal not found" }); return; }
  res.json({ success: true, id: req.params["id"], newStatus: status });
});

// ── Simulation ────────────────────────────────────────────────────────────────

app.post("/simulate/:proposalId", (req: Request, res: Response) => {
  const proposal = getProposalById(req.params["proposalId"]!);
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }
  const horizon = parseInt((req.body as any)?.horizonDays ?? "90", 10);
  const result  = simulatePolicy(proposal, horizon);
  res.json(result);
});

app.get("/simulate/stats", (_req: Request, res: Response) => {
  res.json(getSimulationStats());
});

app.get("/simulate/:proposalId", (req: Request, res: Response) => {
  const sim = getSimulation(req.params["proposalId"]!);
  if (!sim) { res.status(404).json({ error: "Simulation not found" }); return; }
  res.json(sim);
});

app.get("/simulate", (_req: Request, res: Response) => {
  res.json({ simulations: getAllSimulations(), total: getAllSimulations().length });
});

// ── Voting ────────────────────────────────────────────────────────────────────

app.get("/voting/stats", (_req: Request, res: Response) => {
  res.json(getVotingStats());
});

app.get("/voting/:proposalId/predict", (req: Request, res: Response) => {
  const proposal = getProposalById(req.params["proposalId"]!);
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }
  const prediction = predictVote(proposal);
  res.json(prediction);
});

app.post("/voting/:proposalId/result", (req: Request, res: Response) => {
  const { yes, no, abstain } = req.body as { yes: number; no: number; abstain: number };
  if (yes === undefined || no === undefined || abstain === undefined) {
    res.status(400).json({ error: "yes, no, abstain counts required" }); return;
  }
  const result = recordVotingResult(req.params["proposalId"]!, yes, no, abstain);
  if (!result) { res.status(404).json({ error: "Proposal not found" }); return; }
  res.json(result);
});

app.get("/voting", (_req: Request, res: Response) => {
  res.json({ predictions: getAllPredictions(), total: getAllPredictions().length });
});

// ── Execution ─────────────────────────────────────────────────────────────────

app.post("/execute/:proposalId", async (req: Request, res: Response) => {
  const proposal = getProposalById(req.params["proposalId"]!);
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }
  const record = await executeProposal(proposal);
  res.json(record);
});

app.get("/execute/stats", (_req: Request, res: Response) => {
  res.json(getExecutionStats());
});

app.get("/execute/log", (req: Request, res: Response) => {
  const limit = parseInt((req.query["limit"] as string) ?? "20", 10);
  res.json({ log: getExecutionLog(limit), total: getExecutionLog(1000).length });
});

app.get("/execute/:id", (req: Request, res: Response) => {
  const record = getExecutionRecord(req.params["id"]!);
  if (!record) {
    const byProposal = getExecutionsByProposal(req.params["id"]!);
    if (byProposal.length > 0) { res.json({ records: byProposal }); return; }
    res.status(404).json({ error: "Execution record not found" }); return;
  }
  res.json(record);
});

// ── DAO Registry ──────────────────────────────────────────────────────────────

app.get("/daos", (_req: Request, res: Response) => {
  res.json({ daos: getAllDAOs(), total: getAllDAOs().length });
});

app.get("/daos/stats", (_req: Request, res: Response) => {
  res.json(getRegistryStats());
});

app.get("/daos/:id", (req: Request, res: Response) => {
  const dao = getDAO(req.params["id"]!);
  if (!dao) { res.status(404).json({ error: "DAO not found" }); return; }
  res.json(dao);
});

app.post("/daos/register", (req: Request, res: Response) => {
  const { name, description, ...opts } = req.body as any;
  if (!name || !description) { res.status(400).json({ error: "name and description required" }); return; }
  const dao = registerDAO(name, description, opts);
  res.status(201).json(dao);
});

// ── Cron jobs ─────────────────────────────────────────────────────────────────

// Every 5 min: generate a new proposal on a rotating topic
cron.schedule("*/5 * * * *", () => {
  const TOPICS = [
    "Reduce GhostL2 bridge fee by 0.05%",
    "Allocate 2% treasury to community grants",
    "Increase validator rewards by 1%",
    "Deploy GhostL3 to new region",
    "Expand liquidity mining incentives",
    "Add new ERC-20 token to bridge whitelist",
    "Conduct security audit of core contracts",
    "Enable cross-chain messaging v2",
  ];
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)]!;
  const proposal = generateProposal(topic);
  try { simulatePolicy(proposal, 90); predictVote(proposal); } catch { /* ignore */ }
  logger.info(`[AGE-Gov][Cron/5m] Auto-generated proposal: "${topic}"`);
});

// Every 15 min: simulate any draft proposals
cron.schedule("*/15 * * * *", () => {
  const drafts = getProposals({ status: "draft" });
  for (const p of drafts) {
    if (!getSimulation(p.id)) try { simulatePolicy(p, 90); } catch { /* ignore */ }
  }
  logger.info(`[AGE-Gov][Cron/15m] Simulated ${drafts.length} draft proposals`);
});

// Every 20 min: predict votes for simulated proposals
cron.schedule("*/20 * * * *", () => {
  const simulated = getProposals({ status: "simulated" });
  let count = 0;
  for (const p of simulated) {
    if (!getPrediction(p.id)) { predictVote(p); count++; }
  }
  logger.info(`[AGE-Gov][Cron/20m] Predicted votes for ${count} proposals`);
});

// Every 2 hours: execute approved proposals
cron.schedule("0 */2 * * *", async () => {
  const approved = getProposals({ status: "approved" });
  for (const p of approved) {
    await executeProposal(p).catch(() => {});
  }
  logger.info(`[AGE-Gov][Cron/2h] Executed ${approved.length} approved proposals`);
});

// ── Start ─────────────────────────────────────────────────────────────────────

warmUp().then(() => {
  app.listen(PORT, () => {
    logger.info(`[AGE-Gov] Listening on port ${PORT}`);
    logger.info(`[AGE-Gov] v${VERSION} ready — AI-assisted on-chain governance`);
  });
}).catch((err) => {
  logger.error("[AGE-Gov] Warm-up failed", { err });
  process.exit(1);
});
