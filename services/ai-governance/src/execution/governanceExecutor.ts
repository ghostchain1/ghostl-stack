/**
 * governanceExecutor.ts — Proposal execution engine
 *
 * Executes approved governance proposals by translating policy parameters
 * into concrete ecosystem actions.  Real on-chain execution would require
 * a signer integration; this module manages the execution lifecycle,
 * logs outcomes, and records a full audit trail.
 *
 * Execution types supported:
 *   - treasury_transfer    — allocate funds to a target address/programme
 *   - tokenomics_adjust    — modify burn rate, staking rewards, supply params
 *   - liquidity_adjust     — add/remove incentive programmes
 *   - infrastructure_deploy— record infrastructure upgrade actions
 *   - parameter_change     — update a named ecosystem parameter
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";
import type { GovernanceProposal } from "../proposals/proposalGenerator";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExecutionActionType =
  | "treasury_transfer"
  | "tokenomics_adjust"
  | "liquidity_adjust"
  | "infrastructure_deploy"
  | "parameter_change"
  | "contract_call";

export type ExecutionStatus = "queued" | "executing" | "success" | "failed" | "reverted";

export interface ExecutionAction {
  type:        ExecutionActionType;
  description: string;
  parameters:  Record<string, unknown>;
}

export interface ExecutionRecord {
  id:          string;
  proposalId:  string;
  proposalTitle: string;
  timestamp:   number;
  completedAt: number | null;
  status:      ExecutionStatus;
  actions:     ExecutionAction[];
  txHash:      string | null;    // future: on-chain tx hash
  gasUsed:     number | null;
  error:       string | null;
  auditTrail:  string[];
}

// ── Storage ───────────────────────────────────────────────────────────────────

const MAX_RECORDS = 200;
const executionLog: ExecutionRecord[] = [];

// ── Action builders (category → actions mapping) ──────────────────────────────

function buildActions(proposal: GovernanceProposal): ExecutionAction[] {
  const actions: ExecutionAction[] = [];
  const params = proposal.parameters;

  switch (proposal.category) {
    case "treasury":
      actions.push({ type: "treasury_transfer", description: `Transfer allocated funds per ${proposal.title}`, parameters: params });
      break;

    case "tokenomics":
      actions.push({
        type: "tokenomics_adjust",
        description: "Adjust tokenomics parameters on-chain",
        parameters: {
          burnRate:     params.proposedBurnRate ?? params.burnRate,
          stakingAPY:   params.proposedAPY     ?? params.stakingAPY,
          effectiveDate: params.effectiveDate,
        },
      });
      break;

    case "liquidity":
      actions.push({
        type: "liquidity_adjust",
        description: "Activate liquidity incentive programme",
        parameters: { pools: params.pools, subsidyAPY: params.subsidyAPY, durationDays: params.durationDays },
      });
      break;

    case "grants":
      actions.push({
        type: "treasury_transfer",
        description: "Initialise developer grants fund",
        parameters: { allocationPercent: params.allocationPercent, disbursementCycle: params.disbursementCycle },
      });
      break;

    case "infrastructure":
      actions.push({
        type: "infrastructure_deploy",
        description: "Record infrastructure deployment action",
        parameters: { spec: params.hardwareSpec ?? params.bridgeType, count: params.newValidators ?? 1 },
      });
      if (params.auditFirm) {
        actions.push({ type: "parameter_change", description: "Schedule security audit", parameters: { firm: params.auditFirm, timeline: params.launchTimeline } });
      }
      break;

    case "validator":
      actions.push({
        type: "parameter_change",
        description: "Update validator reward parameters",
        parameters: { newAPY: params.proposedAPY ?? params.stakingAPY, reviewAfterDays: params.reviewAfterDays },
      });
      break;

    case "security":
      actions.push({
        type: "contract_call",
        description: "Initiate smart contract security audit workflow",
        parameters: { scope: params.auditScope, contractCount: params.contractCount },
      });
      break;

    case "expansion":
      actions.push({
        type: "treasury_transfer",
        description: `Fund ${proposal.targetDAO} expansion budget`,
        parameters: { budget: params.budget, region: params.region },
      });
      break;

    default:
      actions.push({ type: "parameter_change", description: proposal.title, parameters: params });
  }

  return actions;
}

// ── Executor ──────────────────────────────────────────────────────────────────

export async function executeProposal(proposal: GovernanceProposal): Promise<ExecutionRecord> {
  if (proposal.status !== "approved") {
    logger.warn(`[Executor] Cannot execute proposal ${proposal.id} — status is "${proposal.status}" (expected "approved")`);
    const failRec: ExecutionRecord = {
      id: uuidv4(), proposalId: proposal.id, proposalTitle: proposal.title,
      timestamp: Date.now(), completedAt: Date.now(), status: "failed",
      actions: [], txHash: null, gasUsed: null,
      error: `Proposal not yet approved (current status: ${proposal.status})`,
      auditTrail: [`Execution rejected: proposal.status=${proposal.status}`],
    };
    executionLog.unshift(failRec);
    return failRec;
  }

  const record: ExecutionRecord = {
    id:           uuidv4(),
    proposalId:   proposal.id,
    proposalTitle: proposal.title,
    timestamp:    Date.now(),
    completedAt:  null,
    status:       "executing",
    actions:      buildActions(proposal),
    txHash:       null,
    gasUsed:      null,
    error:        null,
    auditTrail:   [`Execution started at ${new Date().toISOString()}`],
  };

  executionLog.unshift(record);
  if (executionLog.length > MAX_RECORDS) executionLog.splice(MAX_RECORDS);

  logger.info(`[Executor] Executing proposal "${proposal.title}" — ${record.actions.length} action(s)`);

  try {
    for (const action of record.actions) {
      record.auditTrail.push(`✓ ${action.type}: ${action.description}`);
      // Real integration point: call chain RPC, emit transaction, etc.
      await new Promise((resolve) => setTimeout(resolve, 50)); // simulate async work
    }

    // Simulate a synthetic tx hash (real: replace with chain response)
    record.txHash    = `0x${uuidv4().replace(/-/g, "")}`;
    record.gasUsed   = Math.floor(50_000 + Math.random() * 200_000);
    record.status    = "success";
    record.completedAt = Date.now();
    record.auditTrail.push(`Execution completed at ${new Date().toISOString()}`);
    record.auditTrail.push(`Simulated tx hash: ${record.txHash}`);

    logger.info(`[Executor] "${proposal.title}" executed successfully`);
  } catch (err) {
    record.status    = "failed";
    record.error     = String(err);
    record.completedAt = Date.now();
    record.auditTrail.push(`Execution failed: ${record.error}`);
    logger.error(`[Executor] Execution failed for ${proposal.id}`, { err });
  }

  return record;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getExecutionLog(limit = 50):              ExecutionRecord[] { return executionLog.slice(0, limit); }
export function getExecutionRecord(id: string):           ExecutionRecord | undefined { return executionLog.find((r) => r.id === id); }
export function getExecutionsByProposal(proposalId: string): ExecutionRecord[] { return executionLog.filter((r) => r.proposalId === proposalId); }

export function getExecutionStats() {
  return {
    total:     executionLog.length,
    success:   executionLog.filter((r) => r.status === "success").length,
    failed:    executionLog.filter((r) => r.status === "failed").length,
    executing: executionLog.filter((r) => r.status === "executing").length,
  };
}
