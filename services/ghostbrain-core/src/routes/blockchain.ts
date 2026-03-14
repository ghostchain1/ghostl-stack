/**
 * GhostBrain Core — Blockchain Intelligence Routes
 *
 * Exposes blockchain AI, validator monitor, deployment optimizer,
 * contract memory, RPC monitor, hypervisor AI, and memory graph
 * as REST endpoints.
 *
 * Prefix: /api/v1/brain/blockchain
 *         /api/v1/brain/validators
 *         /api/v1/brain/rpc
 *         /api/v1/brain/hypervisor
 *         /api/v1/brain/graph
 */

import type { FastifyInstance } from "fastify";
import {
  getBlockchainAIStats,
  getChainStatus,
  getChainHealth,
  classifyTransaction,
} from "../blockchain/ghostchain_ai.js";
import type { ChainLayer } from "../blockchain/ghostchain_ai.js";
import {
  getContractMemoryStats,
  listContracts,
  getHighRiskContracts,
  recallSimilarContracts,
  registerContract,
  resolveSelector,
} from "../blockchain/contract_memory.js";
import type { DeployedContract } from "../blockchain/contract_memory.js";
import {
  evaluateDeploymentWindow,
  recommendDeployLayer,
  getDeploymentOptimizerStats,
} from "../blockchain/deployment_optimizer.js";
import {
  getValidatorMonitorStats,
  getValidators,
  getJailedValidators,
  getLowSigningValidators,
} from "../validators/validator_monitor.js";
import {
  getValidatorGuardianStats,
  getGuardianProposals,
  getPendingProposals,
} from "../validators/validator_guardian.js";
import {
  getRpcMonitorStats,
  getRpcStatus,
  getOfflineNodes,
} from "../rpc_monitor.js";
import {
  getHypervisorAIStats,
  getHypervisorAdvisories,
} from "../hypervisor_ai.js";
import {
  getMemoryGraphStats,
  findCausalChains,
  getBestAction,
  recordCausalChain,
} from "../blockchain/memory_graph.js";

export async function blockchainRoutes(app: FastifyInstance): Promise<void> {

  // ── Blockchain AI ─────────────────────────────────────────────────────────

  app.get("/api/v1/brain/blockchain/stats", async (_req, reply) => {
    return reply.send(getBlockchainAIStats());
  });

  app.get("/api/v1/brain/blockchain/health", async (_req, reply) => {
    return reply.send(getChainHealth());
  });

  app.get<{ Querystring: { layer?: string } }>(
    "/api/v1/brain/blockchain/status",
    async (req, reply) => {
      const layer = req.query.layer as ChainLayer | undefined;
      return reply.send({ chains: getChainStatus(layer) });
    },
  );

  /** Classify a raw transaction — POST { hash, layer, tx } */
  app.post<{
    Body: {
      hash:  string;
      layer: ChainLayer;
      tx:    { input?: string; to?: string | null; gasUsed?: number };
    };
  }>(
    "/api/v1/brain/blockchain/classify",
    async (req, reply) => {
      const { hash = "", layer = "l1", tx = {} } = req.body ?? {};
      return reply.send(classifyTransaction(hash, layer, tx));
    },
  );

  // ── Contract Memory ───────────────────────────────────────────────────────

  app.get("/api/v1/brain/contracts/stats", async (_req, reply) => {
    return reply.send(getContractMemoryStats());
  });

  app.get<{ Querystring: { layer?: string } }>(
    "/api/v1/brain/contracts",
    async (req, reply) => {
      const layer = req.query.layer as ChainLayer | undefined;
      return reply.send({ contracts: listContracts(layer) });
    },
  );

  app.get("/api/v1/brain/contracts/high-risk", async (_req, reply) => {
    return reply.send({ contracts: getHighRiskContracts() });
  });

  /** Register a contract in memory — POST DeployedContract */
  app.post<{ Body: DeployedContract }>(
    "/api/v1/brain/contracts/register",
    async (req, reply) => {
      registerContract(req.body);
      return reply.status(201).send({ ok: true });
    },
  );

  /** Recall similar contracts — POST { query, topK? } */
  app.post<{ Body: { query: string; topK?: number } }>(
    "/api/v1/brain/contracts/recall",
    async (req, reply) => {
      const { query = "", topK = 5 } = req.body ?? {};
      return reply.send({ results: recallSimilarContracts(query, topK) });
    },
  );

  /** Resolve a selector — GET /api/v1/brain/contracts/selector?sel=0x... */
  app.get<{ Querystring: { sel: string } }>(
    "/api/v1/brain/contracts/selector",
    async (req, reply) => {
      const sig = resolveSelector(req.query.sel ?? "");
      return reply.send({ selector: req.query.sel, signature: sig });
    },
  );

  // ── Deployment Optimizer ──────────────────────────────────────────────────

  app.get("/api/v1/brain/deploy/stats", async (_req, reply) => {
    return reply.send(getDeploymentOptimizerStats());
  });

  app.get("/api/v1/brain/deploy/evaluate", async (_req, reply) => {
    return reply.send(evaluateDeploymentWindow());
  });

  app.get("/api/v1/brain/deploy/recommend", async (_req, reply) => {
    return reply.send({ recommendedLayer: recommendDeployLayer() });
  });

  // ── Validator Monitor ─────────────────────────────────────────────────────

  app.get("/api/v1/brain/validators/stats", async (_req, reply) => {
    return reply.send(getValidatorMonitorStats());
  });

  app.get("/api/v1/brain/validators", async (_req, reply) => {
    return reply.send({ validators: getValidators() });
  });

  app.get("/api/v1/brain/validators/jailed", async (_req, reply) => {
    return reply.send({ validators: getJailedValidators() });
  });

  app.get<{ Querystring: { threshold?: string } }>(
    "/api/v1/brain/validators/low-signing",
    async (req, reply) => {
      const threshold = Number(req.query.threshold ?? "0.95");
      return reply.send({ validators: getLowSigningValidators(threshold) });
    },
  );

  // ── Validator Guardian ────────────────────────────────────────────────────

  app.get("/api/v1/brain/validators/guardian/stats", async (_req, reply) => {
    return reply.send(getValidatorGuardianStats());
  });

  app.get("/api/v1/brain/validators/guardian/proposals", async (_req, reply) => {
    return reply.send({ proposals: getGuardianProposals() });
  });

  app.get("/api/v1/brain/validators/guardian/pending", async (_req, reply) => {
    return reply.send({ proposals: getPendingProposals() });
  });

  // ── RPC Monitor ───────────────────────────────────────────────────────────

  app.get("/api/v1/brain/rpc/stats", async (_req, reply) => {
    return reply.send(getRpcMonitorStats());
  });

  app.get("/api/v1/brain/rpc/status", async (_req, reply) => {
    return reply.send({ nodes: getRpcStatus() });
  });

  app.get("/api/v1/brain/rpc/offline", async (_req, reply) => {
    return reply.send({ nodes: getOfflineNodes() });
  });

  // ── Hypervisor AI ─────────────────────────────────────────────────────────

  app.get("/api/v1/brain/hypervisor/stats", async (_req, reply) => {
    return reply.send(getHypervisorAIStats());
  });

  app.get("/api/v1/brain/hypervisor/advisories", async (_req, reply) => {
    return reply.send({ advisories: getHypervisorAdvisories() });
  });

  // ── Memory Graph ──────────────────────────────────────────────────────────

  app.get("/api/v1/brain/graph/stats", async (_req, reply) => {
    return reply.send(getMemoryGraphStats());
  });

  /** Find causal chains — GET /api/v1/brain/graph/chains?event=vm_crash&limit=10 */
  app.get<{ Querystring: { event?: string; limit?: string } }>(
    "/api/v1/brain/graph/chains",
    async (req, reply) => {
      const label = req.query.event ?? "";
      const limit = Number(req.query.limit ?? "10");
      return reply.send({ chains: findCausalChains(label, limit) });
    },
  );

  /** Best action for an event label — GET /api/v1/brain/graph/best-action?event=vm_crash */
  app.get<{ Querystring: { event?: string } }>(
    "/api/v1/brain/graph/best-action",
    async (req, reply) => {
      const action = getBestAction(req.query.event ?? "");
      return reply.send({ action });
    },
  );

  /** Record a causal chain — POST { event, cause?, action?, outcome?, confidence? } */
  app.post<{
    Body: Parameters<typeof recordCausalChain>[0];
  }>(
    "/api/v1/brain/graph/record",
    async (req, reply) => {
      const ids = recordCausalChain(req.body);
      return reply.status(201).send({ nodeIds: ids });
    },
  );
}
