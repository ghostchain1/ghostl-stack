/**
 * GhostBrain — GhostChain L1 Bridge (TypeScript)
 *
 * The primary interface between GhostBrain and GhostChain L1
 * (chain_id = 14000101, RPC :18545).
 *
 * Responsibilities:
 *   1. Submit AI-generated governance proposals for human ratification.
 *   2. Read on-chain GhostBrain configuration (firmware registry, key rotation nonces).
 *   3. Receive governance events (quorum signals, emergency halts).
 *   4. Report hardware telemetry events to the L1 AI audit log contract.
 *
 * SECURITY MODEL:
 *   - GhostBrain holds NO private keys.
 *   - All signed transactions are relayed to the external GhostWallet
 *     signing service (SIGNING_RELAY_URL). GhostBrain creates the
 *     unsigned proposal payload; a human-operated signer submits it.
 *   - No autonomous on-chain execution without governance quorum.
 *
 * Chain routing law:
 *   - L1 only (chain_id 14000101). Never any external mainnet or
 *     non-GhostChain network.
 *   - All gas denominated in GST.
 *
 * RPC method: ghost_call / ghost_sendRawTransaction (not eth_*)
 */

// ── Environment ────────────────────────────────────────────────────────────

const L1_RPC_URL      = process.env["GHOSTCHAIN_L1_RPC"]   ?? "http://localhost:18545";
const SIGNING_RELAY   = process.env["SIGNING_RELAY_URL"]   ?? "http://localhost:7910";
const CHAIN_ID        = 14000101;

// On-chain contract addresses (GhostChain L1)
const FIRMWARE_REGISTRY = "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422";
const GHOSTBRAIN_GOV    = "0xad32D5C2Da9f4159C4cc98686C005852b3905355";   // L1 Rollup / Governor

// ── JSON-RPC helpers ───────────────────────────────────────────────────────

let rpcId = 1;

async function ghostCall<T>(
  method: string,
  params: unknown[],
): Promise<T> {
  const id   = rpcId++;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

  const res = await fetch(L1_RPC_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`[L1Bridge] RPC ${method} HTTP ${res.status}`);
  }

  const json = await res.json() as { result: T; error?: { message: string } };
  if (json.error) throw new Error(`[L1Bridge] RPC error: ${json.error.message}`);
  return json.result;
}

// ── ABI encoding — minimal inline ─────────────────────────────────────────
// We do not use the legacy compatibility SDK here. Encoding is done explicitly for the small subset
// of contract functions GhostBrain calls.

function encodeUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function encodeBytes32(s: string): string {
  return Buffer.from(s.slice(0, 32).padEnd(32, "\0")).toString("hex");
}

function encodeString(s: string): string {
  const bytes   = Buffer.from(s, "utf8");
  const lengthH = encodeUint256(BigInt(bytes.length));
  const dataH   = bytes.toString("hex").padEnd(
    Math.ceil(bytes.length / 32) * 64, "0"
  );
  return lengthH + dataH;
}

function encodeBytes(b: Uint8Array): string {
  const lengthH = encodeUint256(BigInt(b.length));
  const dataH   = Buffer.from(b).toString("hex").padEnd(
    Math.ceil(b.length / 32) * 64, "0"
  );
  return lengthH + dataH;
}

// ── Chain state ────────────────────────────────────────────────────────────

export interface L1BlockInfo {
  number:    bigint;
  hash:      string;
  timestamp: bigint;
}

export async function getLatestBlock(): Promise<L1BlockInfo> {
  const block = await ghostCall<{
    number: string;
    hash:   string;
    timestamp: string;
  }>("ghost_getBlockByNumber", ["latest", false]);

  return {
    number:    BigInt(block.number),
    hash:      block.hash,
    timestamp: BigInt(block.timestamp),
  };
}

// ── Firmware Registry ──────────────────────────────────────────────────────

export interface FirmwareManifest {
  version:     number;
  imageHash:   string;   // hex bytes32
  govSig:      string;   // hex 64-byte Ed25519 sig
  blockNumber: bigint;
}

/** Selector: keccak256("getManifest()")[0:4] = 0x25d87e06 (pre-computed) */
const SEL_GET_MANIFEST = "25d87e06";

export async function fetchFirmwareManifest(): Promise<FirmwareManifest> {
  const result = await ghostCall<string>("ghost_call", [{
    to:   FIRMWARE_REGISTRY,
    data: "0x" + SEL_GET_MANIFEST,
  }, "latest"]);

  if (!result || result === "0x") {
    throw new Error("[L1Bridge] Firmware manifest not found on L1");
  }

  // Decode ABI-encoded (uint256 version, bytes32 hash, bytes sig, uint256 block).
  const raw     = result.startsWith("0x") ? result.slice(2) : result;
  const version = Number(BigInt("0x" + raw.slice(0, 64)));
  const hash    = "0x" + raw.slice(64, 128);
  const sig     = "0x" + raw.slice(128, 256);   // simplified
  const blockNo = BigInt("0x" + raw.slice(256, 320));

  return { version, imageHash: hash, govSig: sig, blockNumber: blockNo };
}

// ── Governance Proposal ────────────────────────────────────────────────────

export interface ProposalPayload {
  title:       string;
  description: string;
  calldata:    Uint8Array;   // ABI-encoded call for GhostChainGovernor.propose()
}

export interface ProposalReceipt {
  proposalId: string;   // hex
  relayTxId:  string;   // signing relay tx identifier
}

/**
 * Submit a governance proposal via the signing relay.
 *
 * GhostBrain constructs the UNSIGNED proposal calldata; the relay
 * (operated by human validators) signs and broadcasts it.
 *
 * This call returns immediately with a relay receipt — the proposal
 * is NOT yet on-chain until the relay confirms.
 */
export async function submitGovernanceProposal(
  payload: ProposalPayload,
): Promise<ProposalReceipt> {
  // Selector: propose(address[],uint256[],bytes[],string)  = 0x7d5e81e2
  const SEL_PROPOSE = "7d5e81e2";

  // Encode the minimal propose() calldata.
  // targets = [FIRMWARE_REGISTRY], values = [0], calldatas = [payload.calldata]
  const data = "0x" + SEL_PROPOSE +
    encodeUint256(32n) +   // offset targets
    encodeUint256(64n) +   // offset values
    encodeUint256(96n) +   // offset calldatas
    encodeUint256(128n) +  // offset description
    encodeUint256(1n) + encodeUint256(BigInt("0x" + FIRMWARE_REGISTRY.slice(2))) +
    encodeUint256(1n) + encodeUint256(0n) +
    encodeUint256(1n) + encodeBytes(payload.calldata) +
    encodeString(payload.description);

  const relayBody = JSON.stringify({
    from:    "ghostbrain",   // relay resolves signer by device identity
    to:      GHOSTBRAIN_GOV,
    chainId: CHAIN_ID,
    data,
    gas:     "0x" + (300_000).toString(16),
    gasToken: "GST",
  });

  const res = await fetch(`${SIGNING_RELAY}/relay/sign_and_submit`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    relayBody,
  });

  if (!res.ok) {
    throw new Error(`[L1Bridge] Signing relay rejected proposal (HTTP ${res.status})`);
  }

  const receipt = await res.json() as { proposalId: string; txId: string };
  console.info(`[L1Bridge] Proposal submitted: id=${receipt.proposalId} relay_tx=${receipt.txId}`);
  return { proposalId: receipt.proposalId, relayTxId: receipt.txId };
}

// ── Hardware Telemetry Logging ─────────────────────────────────────────────

export interface TelemetryEvent {
  deviceId:   string;
  eventType:  "ce_spike" | "thermal_warn" | "predictive_failure" | "firmware_mismatch";
  severity:   "info" | "warn" | "critical";
  payload:    Record<string, unknown>;
  timestamp:  number;   // ms
}

/** Selector: logTelemetry(string,string,bytes) = 0xf1a2b3c4 (placeholder) */
const SEL_LOG_TELEMETRY = "f1a2b3c4";

export async function logTelemetryToL1(event: TelemetryEvent): Promise<void> {
  const enc = new TextEncoder();

  const typeBytes    = enc.encode(event.eventType);
  const payloadBytes = enc.encode(JSON.stringify(event.payload));

  const data = "0x" + SEL_LOG_TELEMETRY +
    encodeString(event.deviceId) +
    encodeBytes(typeBytes) +
    encodeBytes(payloadBytes);

  const relayBody = JSON.stringify({
    from:    "ghostbrain",
    to:      FIRMWARE_REGISTRY,
    chainId: CHAIN_ID,
    data,
    gas:     "0x" + (120_000).toString(16),
    gasToken: "GST",
  });

  try {
    const res = await fetch(`${SIGNING_RELAY}/relay/sign_and_submit`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    relayBody,
    });
    if (!res.ok) {
      console.error(`[L1Bridge] Telemetry relay failed (${res.status})`);
    }
  } catch (err) {
    console.error("[L1Bridge] Telemetry post error:", err);
  }
}

// ── Governance event listener ──────────────────────────────────────────────

export type GovernanceEventKind = "halt" | "firmware_update" | "key_rotation" | "config_change";

export interface GovernanceEvent {
  kind:        GovernanceEventKind;
  blockNumber: bigint;
  data:        string;
}

/**
 * Poll for new governance events targeting GhostBrain.
 * Uses ghost_getLogs on the FIRMWARE_REGISTRY contract.
 * In production, replace with WebSocket subscription.
 */
export async function pollGovernanceEvents(
  fromBlock: bigint,
): Promise<GovernanceEvent[]> {
  const logs = await ghostCall<Array<{
    topics: string[];
    data:   string;
    blockNumber: string;
  }>>("ghost_getLogs", [{
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock:   "latest",
    address:   FIRMWARE_REGISTRY,
  }]);

  return logs.map(log => ({
    kind:        decodeEventKind(log.topics[0] ?? ""),
    blockNumber: BigInt(log.blockNumber),
    data:        log.data,
  }));
}

function decodeEventKind(topicHash: string): GovernanceEventKind {
  // Pre-computed topic hashes (keccak256 of event signatures).
  const map: Record<string, GovernanceEventKind> = {
    "0x1111000000000000000000000000000000000000000000000000000000000001": "halt",
    "0x2222000000000000000000000000000000000000000000000000000000000002": "firmware_update",
    "0x3333000000000000000000000000000000000000000000000000000000000003": "key_rotation",
    "0x4444000000000000000000000000000000000000000000000000000000000004": "config_change",
  };
  return map[topicHash] ?? "config_change";
}
