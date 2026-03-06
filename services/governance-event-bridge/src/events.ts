/**
 * governance-event-bridge — Event Definitions
 *
 * Canonical event signatures for GhostChainGovernor (contracts/src/governance/GhostChainGovernor.sol):
 *
 *   event ProposalCreated(uint256 indexed id, address indexed proposer, address indexed target, bool constitutional, bool amendment);
 *   event VoteCast(uint256 indexed id, address indexed voter, bool support, uint256 weight);
 *   event Queued(uint256 indexed id, uint256 indexed queueId, uint256 eta, uint256 delaySeconds);
 *   event Executed(uint256 indexed id, uint256 indexed queueId);
 *
 * Topic0 hashes are computed at module-load time from the canonical ABI
 * signatures using keccak256 (from @noble/hashes/sha3).
 */

import { keccak_256 } from "@noble/hashes/sha3";

// ── Helpers ───────────────────────────────────────────────────────────────────

function topic0(sig: string): string {
  const bytes = new TextEncoder().encode(sig);
  const hash  = keccak_256(bytes);
  return "0x" + Buffer.from(hash).toString("hex");
}

/** Read a 32-byte word at `offset` from a hex data string (without 0x prefix). */
function word(data: string, offset: number): string {
  // Each word is 64 hex chars (32 bytes)
  return data.slice(offset * 64, offset * 64 + 64);
}

/** Decode a uint256 word as a bigint. */
function uint256(data: string, offset: number): bigint {
  const w = word(data, offset);
  return w ? BigInt("0x" + w) : 0n;
}

/** Decode a bool word (non-zero = true). */
function bool(data: string, offset: number): boolean {
  return uint256(data, offset) !== 0n;
}

/** Right-strip an ABI-padded address topic (topics are 32 bytes, address is 20). */
function decodeAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

/** Decode a uint256 topic (full 32 bytes = the value). */
function decodeUint256(topic: string): bigint {
  return BigInt("0x" + (topic.startsWith("0x") ? topic.slice(2) : topic));
}

// ── Topic0 constants ──────────────────────────────────────────────────────────
// Derived from the exact Solidity event signatures in GhostChainGovernor.sol

export const TOPICS = {
  ProposalCreated: topic0("ProposalCreated(uint256,address,address,bool,bool)"),
  VoteCast:        topic0("VoteCast(uint256,address,bool,uint256)"),
  Queued:          topic0("Queued(uint256,uint256,uint256,uint256)"),
  Executed:        topic0("Executed(uint256,uint256)"),
} as const;

// ── Log type ──────────────────────────────────────────────────────────────────

export interface RawLog {
  address:          string;
  topics:           string[];
  data:             string;
  blockNumber:      string;  // hex
  transactionHash:  string;
  logIndex:         string;  // hex
}

// ── Decoded event types ───────────────────────────────────────────────────────

export interface ProposalCreatedEvent {
  kind:           "ProposalCreated";
  proposalId:     bigint;
  proposer:       string;
  target:         string;
  constitutional: boolean;
  amendment:      boolean;
  blockNumber:    bigint;
  txHash:         string;
}

export interface VoteCastEvent {
  kind:        "VoteCast";
  proposalId:  bigint;
  voter:       string;
  support:     boolean;
  weight:      bigint;
  blockNumber: bigint;
  txHash:      string;
}

export interface QueuedEvent {
  kind:         "Queued";
  proposalId:   bigint;
  queueId:      bigint;
  eta:          bigint;
  delaySeconds: bigint;
  blockNumber:  bigint;
  txHash:       string;
}

export interface ExecutedEvent {
  kind:        "Executed";
  proposalId:  bigint;
  queueId:     bigint;
  blockNumber: bigint;
  txHash:      string;
}

export type GovernanceEvent = ProposalCreatedEvent | VoteCastEvent | QueuedEvent | ExecutedEvent;

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse a raw eth_getLogs log entry into a typed GovernanceEvent.
 * Returns null if the log's topic0 doesn't match any known selector.
 */
export function parseLog(log: RawLog): GovernanceEvent | null {
  const t0 = log.topics[0]?.toLowerCase();
  if (!t0) return null;

  const rawData = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  const blockNumber = BigInt(log.blockNumber);
  const txHash = log.transactionHash;

  if (t0 === TOPICS.ProposalCreated.toLowerCase()) {
    // topics: [0]=selector, [1]=id(uint256), [2]=proposer(address), [3]=target(address)
    // data:   [0]=bool constitutional, [1]=bool amendment
    const proposalId = decodeUint256(log.topics[1] ?? "0x0");
    const proposer   = decodeAddress(log.topics[2] ?? "");
    const target     = decodeAddress(log.topics[3] ?? "");
    return {
      kind: "ProposalCreated",
      proposalId,
      proposer,
      target,
      constitutional: bool(rawData, 0),
      amendment:      bool(rawData, 1),
      blockNumber,
      txHash,
    };
  }

  if (t0 === TOPICS.VoteCast.toLowerCase()) {
    // topics: [0]=selector, [1]=id(uint256), [2]=voter(address)
    // data:   [0]=bool support, [1]=uint256 weight
    const proposalId = decodeUint256(log.topics[1] ?? "0x0");
    const voter      = decodeAddress(log.topics[2] ?? "");
    return {
      kind:        "VoteCast",
      proposalId,
      voter,
      support:     bool(rawData, 0),
      weight:      uint256(rawData, 1),
      blockNumber,
      txHash,
    };
  }

  if (t0 === TOPICS.Queued.toLowerCase()) {
    // topics: [0]=selector, [1]=id(uint256), [2]=queueId(uint256)
    // data:   [0]=uint256 eta, [1]=uint256 delaySeconds
    const proposalId = decodeUint256(log.topics[1] ?? "0x0");
    const queueId    = decodeUint256(log.topics[2] ?? "0x0");
    return {
      kind:         "Queued",
      proposalId,
      queueId,
      eta:          uint256(rawData, 0),
      delaySeconds: uint256(rawData, 1),
      blockNumber,
      txHash,
    };
  }

  if (t0 === TOPICS.Executed.toLowerCase()) {
    // topics: [0]=selector, [1]=id(uint256), [2]=queueId(uint256)
    const proposalId = decodeUint256(log.topics[1] ?? "0x0");
    const queueId    = decodeUint256(log.topics[2] ?? "0x0");
    return {
      kind:        "Executed",
      proposalId,
      queueId,
      blockNumber,
      txHash,
    };
  }

  return null;
}
