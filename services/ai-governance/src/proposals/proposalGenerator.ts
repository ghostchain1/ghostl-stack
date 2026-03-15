/**
 * proposalGenerator.ts — AI-assisted governance proposal generation
 *
 * Generates structured governance proposals from ecosystem signals.
 * Proposals are seeded from predefined topics and enriched with
 * live ecosystem data when available.  All proposals reference a
 * target DAO and carry a full lifecycle status.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProposalCategory =
  | "treasury"
  | "tokenomics"
  | "liquidity"
  | "infrastructure"
  | "grants"
  | "validator"
  | "security"
  | "expansion"
  | "parameter";

export type ProposalStatus =
  | "draft"
  | "pending-simulation"
  | "simulated"
  | "submitted"
  | "voting"
  | "approved"
  | "rejected"
  | "executed"
  | "cancelled";

export interface GovernanceProposal {
  id:           string;
  title:        string;
  description:  string;
  category:     ProposalCategory;
  targetDAO:    string;
  status:       ProposalStatus;
  timestamp:    number;
  submittedAt:  number | null;
  executedAt:   number | null;

  /** Quantified parameters describing the policy change */
  parameters:   Record<string, unknown>;

  /** Author: "ai-generated" by default; can be "operator" for manual proposals */
  author:       string;

  /** On-chain proposal ID if submitted */
  onChainId:    string | null;

  /** Tags for filtering */
  tags:         string[];

  /** AI confidence that this proposal will pass (0-1) */
  aiConfidence: number;

  /** Estimated ecosystem impact description */
  estimatedImpact: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const MAX_PROPOSALS = 500;
const proposals: GovernanceProposal[] = [];

// ── Template library ──────────────────────────────────────────────────────────

interface ProposalTemplate {
  title:           string;
  description:     string;
  category:        ProposalCategory;
  targetDAO:       string;
  parameters:      Record<string, unknown>;
  tags:            string[];
  estimatedImpact: string;
  aiConfidence:    number;
}

const PROPOSAL_TEMPLATES: ProposalTemplate[] = [
  {
    title:           "Increase GST Token Burn Rate by 2%",
    description:     "Raise the automated token burn rate from 0.5% to 2.5% of each transaction to reduce circulating supply and strengthen token scarcity over time.",
    category:        "tokenomics",
    targetDAO:       "Ghost Treasury DAO",
    parameters:      { currentBurnRate: 0.005, proposedBurnRate: 0.025, effectiveDate: "+30d" },
    tags:            ["burn", "tokenomics", "deflation", "gst"],
    estimatedImpact: "Reduce circulating supply by ~2% over 90 days, increasing scarcity and supporting price discovery.",
    aiConfidence:    0.71,
  },
  {
    title:           "Allocate 5% Treasury to Developer Grants Programme",
    description:     "Establish a dedicated developer grants fund representing 5% of the Ghost Treasury DAO treasury, distributed quarterly to projects building on GhostChain / GhostL2 / GhostL3.",
    category:        "grants",
    targetDAO:       "Ghost Ecosystem DAO",
    parameters:      { allocationPercent: 5, disbursementCycle: "quarterly", maxGrantSize: 50_000, reviewCommittee: "3-of-5 multisig" },
    tags:            ["grants", "developers", "ecosystem", "l2", "l3"],
    estimatedImpact: "+25-40 new developer projects within 180 days, increase TVL by 10-15%.",
    aiConfidence:    0.78,
  },
  {
    title:           "Add Liquidity Mining Incentives for GhostL2 Core Pools",
    description:     "Introduce a 6-month liquidity mining programme on GhostL2 GHOST/ETH and GHOST/USDC pools with a 12% APY subsidy funded from the ecosystem reserve.",
    category:        "liquidity",
    targetDAO:       "Ghost Treasury DAO",
    parameters:      { pools: ["GHOST/ETH", "GHOST/USDC"], subsidyAPY: 0.12, durationDays: 180, maxReserveAllocation: 2_000_000 },
    tags:            ["liquidity", "l2", "defi", "mining", "incentives"],
    estimatedImpact: "+$5-8M TVL on GhostL2 within 60 days of activation.",
    aiConfidence:    0.74,
  },
  {
    title:           "Fund Ecosystem Expansion in APAC Region",
    description:     "Allocate $250K from the expansion budget to fund marketing, developer relations, and validator recruitment in the Asia-Pacific region for Q3–Q4.",
    category:        "expansion",
    targetDAO:       "Ghost Ecosystem DAO",
    parameters:      { budget: 250_000, region: "APAC", duration: "6 months", focus: ["marketing", "validators", "developer-relations"] },
    tags:            ["expansion", "apac", "marketing", "growth"],
    estimatedImpact: "+3,000-5,000 users and 8-15 new validators from APAC within 180 days.",
    aiConfidence:    0.65,
  },
  {
    title:           "Deploy New Validator Infrastructure on GhostChain",
    description:     "Fund the deployment of 5 additional enterprise-grade validator nodes to improve network resilience, reduce block time variance, and increase decentralisation.",
    category:        "infrastructure",
    targetDAO:       "Ghost Infrastructure DAO",
    parameters:      { newValidators: 5, hardwareSpec: "bare-metal 32-core/128GB", estimatedCost: 120_000, expectedUptimeTarget: 0.9995 },
    tags:            ["validator", "infrastructure", "decentralisation"],
    estimatedImpact: "Reduces single-point-of-failure risk, improves block finality by ~15%.",
    aiConfidence:    0.82,
  },
  {
    title:           "Adjust Staking Reward Rate from 8% to 10% APY",
    description:     "Increase baseline staking rewards to improve validator retention and attract new stakers, funded by a proportional reduction in the infrastructure allocation.",
    category:        "parameter",
    targetDAO:       "Ghost Governance DAO",
    parameters:      { currentAPY: 0.08, proposedAPY: 0.10, fundingSource: "infrastructure-allocation", reviewAfterDays: 90 },
    tags:            ["staking", "rewards", "validator", "tokenomics"],
    estimatedImpact: "+12-20% validator participation, stronger network security.",
    aiConfidence:    0.69,
  },
  {
    title:           "Enable Cross-Chain Bridge to Ethereum Mainnet",
    description:     "Proposal to deploy and fund the canonical GhostChain → Ethereum mainnet bridge, enabling GHOST token transfers and cross-chain DeFi integrations.",
    category:        "infrastructure",
    targetDAO:       "Ghost Infrastructure DAO",
    parameters:      { bridgeType: "optimistic", auditFirm: "TBD", budget: 180_000, launchTimeline: "90 days" },
    tags:            ["bridge", "ethereum", "interchain", "defi"],
    estimatedImpact: "Access to Ethereum DeFi liquidity, projected +$10-20M TVL within 90 days of launch.",
    aiConfidence:    0.73,
  },
  {
    title:           "Security Audit of Core Smart Contracts",
    description:     "Commission a comprehensive security audit of all core GhostChain, GhostL2, and GhostL3 smart contracts from a leading Web3 security firm.",
    category:        "security",
    targetDAO:       "Ghost Infrastructure DAO",
    parameters:      { contractCount: 24, auditScope: ["core", "bridge", "governance"], estimatedCost: 95_000, timeline: "45 days" },
    tags:            ["security", "audit", "smart-contracts", "l2", "l3"],
    estimatedImpact: "Reduces exploit risk, improves institutional confidence, required for CEX listings.",
    aiConfidence:    0.88,
  },
];

// ── Generator ─────────────────────────────────────────────────────────────────

/** Generate a single proposal from a topic string (free-form or template key) */
export function generateProposal(
  topic:   string,
  options?: {
    category?:    ProposalCategory;
    targetDAO?:   string;
    parameters?:  Record<string, unknown>;
    author?:      string;
  },
): GovernanceProposal {
  // Try to match a template
  const tpl = PROPOSAL_TEMPLATES.find(
    (t) => t.title.toLowerCase().includes(topic.toLowerCase()) ||
           t.tags.some((tag) => tag.toLowerCase() === topic.toLowerCase()),
  );

  const base = tpl ?? {
    title:           `Proposal: ${topic}`,
    description:     `AI-generated governance proposal for ecosystem improvement: ${topic}.`,
    category:        (options?.category ?? "parameter") as ProposalCategory,
    targetDAO:       options?.targetDAO ?? "Ghost Governance DAO",
    parameters:      options?.parameters ?? {},
    tags:            [topic.toLowerCase().replace(/\s+/g, "-")],
    estimatedImpact: "Impact analysis pending policy simulation.",
    aiConfidence:    0.55,
  };

  const proposal: GovernanceProposal = {
    id:             uuidv4(),
    title:          base.title,
    description:    base.description,
    category:       base.category,
    targetDAO:      options?.targetDAO ?? base.targetDAO,
    status:         "draft",
    timestamp:      Date.now(),
    submittedAt:    null,
    executedAt:     null,
    parameters:     options?.parameters ?? base.parameters,
    author:         options?.author ?? "ai-generated",
    onChainId:      null,
    tags:           base.tags,
    aiConfidence:   base.aiConfidence,
    estimatedImpact: base.estimatedImpact,
  };

  proposals.unshift(proposal);
  if (proposals.length > MAX_PROPOSALS) proposals.splice(MAX_PROPOSALS);

  logger.info(`[ProposalGenerator] Generated: "${proposal.title}" → ${proposal.id}`);
  return proposal;
}

/** Generate one proposal for each template (used to seed on startup) */
export function seedProposals(): void {
  if (proposals.length >= PROPOSAL_TEMPLATES.length) {
    logger.info("[ProposalGenerator] Already seeded — skipping");
    return;
  }
  for (const tpl of PROPOSAL_TEMPLATES) {
    const p: GovernanceProposal = {
      id:             uuidv4(),
      title:          tpl.title,
      description:    tpl.description,
      category:       tpl.category,
      targetDAO:      tpl.targetDAO,
      status:         "draft",
      timestamp:      Date.now() - Math.floor(Math.random() * 7 * 86_400_000), // spread over last 7 days
      submittedAt:    null,
      executedAt:     null,
      parameters:     tpl.parameters,
      author:         "ai-generated",
      onChainId:      null,
      tags:           tpl.tags,
      aiConfidence:   tpl.aiConfidence,
      estimatedImpact: tpl.estimatedImpact,
    };
    proposals.push(p);
  }

  // Mark two proposals as further along in lifecycle for realism
  if (proposals.length >= 2) {
    proposals[0].status = "voting";
    proposals[0].submittedAt = Date.now() - 86_400_000;
    proposals[1].status = "simulated";
  }

  logger.info(`[ProposalGenerator] Seeded ${proposals.length} proposals`);
}

// ── Status management ─────────────────────────────────────────────────────────

export function updateProposalStatus(id: string, status: ProposalStatus, extra?: Partial<GovernanceProposal>): boolean {
  const p = proposals.find((x) => x.id === id);
  if (!p) return false;
  Object.assign(p, { status, ...extra });
  if (status === "submitted" && !p.submittedAt) p.submittedAt = Date.now();
  if (status === "executed"  && !p.executedAt)  p.executedAt  = Date.now();
  return true;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getProposals(opts?: { status?: ProposalStatus; category?: ProposalCategory; limit?: number }): GovernanceProposal[] {
  let result = [...proposals];
  if (opts?.status)   result = result.filter((p) => p.status === opts.status);
  if (opts?.category) result = result.filter((p) => p.category === opts.category);
  return result.slice(0, opts?.limit ?? 50);
}

export function getProposalById(id: string): GovernanceProposal | undefined {
  return proposals.find((p) => p.id === id);
}

export function getProposalStats() {
  const byStatus: Partial<Record<ProposalStatus, number>> = {};
  const byCategory: Partial<Record<ProposalCategory, number>> = {};
  for (const p of proposals) {
    byStatus[p.status]     = (byStatus[p.status] ?? 0) + 1;
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
  }
  return {
    total:      proposals.length,
    active:     proposals.filter((p) => ["voting", "submitted", "simulated", "pending-simulation"].includes(p.status)).length,
    approved:   proposals.filter((p) => p.status === "approved").length,
    executed:   proposals.filter((p) => p.status === "executed").length,
    rejected:   proposals.filter((p) => p.status === "rejected").length,
    byStatus:   byStatus as Record<ProposalStatus, number>,
    byCategory: byCategory as Record<ProposalCategory, number>,
  };
}
