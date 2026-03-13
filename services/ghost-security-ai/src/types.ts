/**
 * Shared types for the Ghost Sovereign Security AI (SSA).
 *
 * Design principles:
 *   - All mitigations are advisory proposals — humans ratify, AI detects
 *   - No autonomous execution of defensive actions
 *   - IP/address fields are always sanitized before use
 */

// ── Threat classification ─────────────────────────────────────────────────────

export type ThreatLevel    = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type ThreatCategory = 'contract' | 'validator' | 'rpc' | 'treasury' | 'network';

/** A detected security event, before any mitigation decision. */
export interface ThreatEvent {
  id:          string;
  ts:          number;
  category:    ThreatCategory;
  level:       ThreatLevel;
  title:       string;
  description: string;
  /** Sanitized source identifier — address, IP, validator moniker, etc. */
  source?:     string;
  metadata?:   Record<string, unknown>;
}

// ── Contract security ─────────────────────────────────────────────────────────

export interface ContractSnapshot {
  address:         string;
  codeHash:        string;
  transactionCount: number;
  balanceGst:      number;
  ts:              number;
}

export interface ContractAnomaly {
  address:   string;
  type:      'code_change' | 'balance_drain' | 'tx_spike' | 'unexpected_deployment';
  detail:    string;
}

// ── Validator security ────────────────────────────────────────────────────────

export interface ValidatorSigningInfo {
  address:            string;
  missedBlocksCounter: number;
  jailed:              boolean;
  startHeight:         number;
  indexOffset:         number;
}

export interface ValidatorThreat {
  address:  string;
  moniker:  string;
  type:     'jailed' | 'missed_blocks' | 'double_sign_suspected' | 'offline';
  severity: ThreatLevel;
}

// ── RPC / network ─────────────────────────────────────────────────────────────

export interface RpcSample {
  ts:                number;
  callsPerWindow:    number;
  blockProductionMs: number;
}

/** Point-in-time network snapshot collected by the Network IDS per scan cycle */
export interface NetworkSnapshot {
  ts:      number;
  l1Block: number;
  l2Block: number;
  l3Block: number;
  l1Peers: number;
  l2Peers: number;
  l3Peers: number;
}

export interface NetworkHealthSnapshot {
  ts:            number;
  l1Peers:       number;
  l2Peers:       number;
  l3Peers:       number;
  l1Block:       number;
  l2Block:       number;
  l3Block:       number;
  l1BlockTimeDelta: number; // ms since last block
  l2BlockTimeDelta: number;
  l3BlockTimeDelta: number;
}

// ── Treasury security ─────────────────────────────────────────────────────────

export interface TreasuryAlert {
  type:            'sudden_drain' | 'unauthorized_tx' | 'large_withdrawal' | 'low_balance';
  balanceGst:      number;
  previousGst:     number;
  changeGst:       number;
  changePct:       number;
}

// ── Security proposals (always advisory) ──────────────────────────────────────

export type MitigationType =
  | 'pause_contract'
  | 'isolate_validator'
  | 'block_rpc_source'
  | 'freeze_treasury'
  | 'emergency_governance'
  | 'increase_rpc_rate_limit'
  | 'alert_only';

export interface SecurityProposal {
  id:             string;
  ts:             number;
  source:         'ghost-security-ai';
  threatEventId:  string;
  mitigation:     MitigationType;
  level:          ThreatLevel;
  description:    string;
  advisory:       true;          // ALWAYS true — never remove
  metadata?:      Record<string, unknown>;
}

// ── Overall security state ────────────────────────────────────────────────────

export type ComponentStatus = 'secure' | 'warning' | 'alert' | 'unknown';

export interface SsaStatus {
  running:            boolean;
  dryRun:             boolean;
  totalCycles:        number;
  errors:             number;
  proposals:          number;
  lastCycleMs:        number | null;
  uptime:             number;
  overallThreatLevel: ThreatLevel;
  components: {
    contracts:  ComponentStatus;
    validators: ComponentStatus;
    rpc:        ComponentStatus;
    treasury:   ComponentStatus;
    network:    ComponentStatus;
  };
  recentThreats:   ThreatEvent[];
  recentProposals: SecurityProposal[];
}
