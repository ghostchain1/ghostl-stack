/**
 * GhostChain Autonomous Multichain Controller — Shared Type System
 *
 * Sovereignty rule (enforced by sovereignty-policy.ts):
 *   L3 → L2 → GhostChain L1 → External Chains
 *
 * L3 and L2 NEVER communicate with external chains directly.
 * All cross-chain traffic is routed through GhostChain L1.
 */

// ---------------------------------------------------------------------------
// Chain identifiers
// ---------------------------------------------------------------------------

export type ExternalChainId = "ethereum" | "polygon" | "arbitrum" | "solana" | "cosmos";
export type InternalLayerId = "L1" | "L2" | "L3";
export type LayerId        = InternalLayerId | ExternalChainId;

export const EXTERNAL_CHAIN_IDS: ReadonlySet<ExternalChainId> = new Set([
  "ethereum", "polygon", "arbitrum", "solana", "cosmos",
]);

export const INTERNAL_LAYER_IDS: ReadonlySet<InternalLayerId> = new Set([
  "L1", "L2", "L3",
]);

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/** Validates IDs used as bridge names, treaty IDs, pool IDs — prevents injection. */
export const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

export function assertSafeId(id: string, label: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(
      `Unsafe ${label}: "${id}" — must match /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/`,
    );
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/** A cross-chain message path. */
export interface CrossChainRoute {
  originLayer:  LayerId;
  intermediary?: LayerId; // Always L1 for external routes
  destination:  LayerId;
}

// ---------------------------------------------------------------------------
// Chain snapshot (from adapters)
// ---------------------------------------------------------------------------

export interface ChainSnapshot {
  chainId:       ExternalChainId;
  blockHeight:   string;   // stringified bigint
  healthy:       boolean;
  gasPriceWei?:  string;   // stringified bigint (ETH-like), or lamports for Solana
  latencyMs:     number;
  timestamp:     number;
  error?:        string;
}

// ---------------------------------------------------------------------------
// Bridge info
// ---------------------------------------------------------------------------

export interface BridgeInfo {
  id:             string;
  name:           string;
  sourceChain:    LayerId;
  destChain:      LayerId;
  health:         number;   // 0–100
  tvlGst:         string;   // GST units as string (1e18 basis)
  latencyMs:      number;
  pendingTxCount: number;
  lastSyncBlock:  string;   // stringified bigint
  reachable:      boolean;
  riskScore:      number;   // 0–100, computed by bridge-risk-analyzer
}

// ---------------------------------------------------------------------------
// Market price info
// ---------------------------------------------------------------------------

export interface MarketInfo {
  symbol:        string;           // e.g. "GST/ETH"
  internalChain: InternalLayerId;
  externalChain: ExternalChainId;
  internalPrice: number;
  externalPrice: number;
  spreadPct:     number;           // |external - internal| / internal × 100
  source:        string;
  timestamp:     number;
}

// ---------------------------------------------------------------------------
// Liquidity pool info
// ---------------------------------------------------------------------------

export interface PoolInfo {
  id:              string;
  internalChain:   InternalLayerId;
  externalChain:   ExternalChainId;
  token0:          string;
  token1:          string;
  aprInternal:     number;   // % APR on GhostXchange
  aprExternal:     number;   // % APR on external DEX
  tvlGst:          string;   // GST units as string
  rebalanceNeeded: boolean;
}

// ---------------------------------------------------------------------------
// Sovereign treaty
// ---------------------------------------------------------------------------

export interface Treaty {
  id:                    string;
  name:                  string;
  counterpartyChain:     ExternalChainId;
  maxBridgeAmountBps:    number;        // basis points of treasury (e.g. 500 = 5%)
  minBridgeIntervalSecs: number;
  activeFrom:            number;        // Unix timestamp
  activeTo?:             number;        // optional expiry
  enabled:               boolean;
}

// ---------------------------------------------------------------------------
// Bridge proof
// ---------------------------------------------------------------------------

export interface BridgeProof {
  txHash:      string;
  amount:      string;   // GST units as string
  sender:      string;
  recipient:   string;
  commitment:  string;   // sha256(txHash + amount + sender + recipient)
  sourceChain: LayerId;
  destChain:   LayerId;
  timestamp:   number;
}

// ---------------------------------------------------------------------------
// Aggregated multichain state
// ---------------------------------------------------------------------------

export interface MultichainState {
  bridges:        BridgeInfo[];
  markets:        MarketInfo[];
  pools:          PoolInfo[];
  treaties:       Treaty[];
  chainSnapshots: ChainSnapshot[];
  timestamp:      number;
}

// ---------------------------------------------------------------------------
// Actions / proposals
// ---------------------------------------------------------------------------

export type MultichainActionType =
  | "bridge_restart"
  | "bridge_pause"
  | "liquidity_rebalance"
  | "arbitrage_propose"
  | "oracle_update"
  | "treaty_update"
  | "route_proposal"
  | "validator_alert";

export type ActionRisk = "low" | "medium" | "high" | "critical";

/**
 * Every cross-chain action is a PROPOSAL.
 * requiresRatification is always true for actions that move funds or affect
 * external chains. oracle_update may be auto-executed (read-only on-chain write).
 */
export interface MultichainAction {
  id:                   string;
  type:                 MultichainActionType;
  sourceChain:          LayerId;
  destChain:            LayerId;
  description:          string;
  params:               Record<string, unknown>;
  timestamp:            number;
  risk:                 ActionRisk;
  requiresRatification: boolean;
  sovereigntyValidated: boolean;
}

// ---------------------------------------------------------------------------
// Controller lifecycle
// ---------------------------------------------------------------------------

export interface MultichainCycle {
  cycleId:   string;
  startTime: number;
  endTime?:  number;
  actions:   MultichainAction[];
  executed:  string[];   // IDs of auto-executed actions (oracle_update only)
  errors:    string[];
  status:    "running" | "completed" | "failed";
}

export interface MultichainStatus {
  running:       boolean;
  cycleCount:    number;
  lastCycle?:    MultichainCycle;
  totalActions:  number;
  autoExec:      boolean;
  dryRun:        boolean;
  uptimeSeconds: number;
}
