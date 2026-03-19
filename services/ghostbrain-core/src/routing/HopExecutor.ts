/**
 * HopExecutor — L3 → L2 → L1 routing enforcer
 *
 * Executes a same-layer transaction directly, or submits a source-layer
 * nested relay envelope for cross-layer plans that must traverse
 * L3 → L2 → L1.
 *
 * Uses @ghostchain/ghost-sdk-core exclusively (no ethers dependency).
 */

import {
  GhostSigner,
  GhostProvider,
  GhostAbiCoder,
  type GhostABIFragment,
} from "@ghostchain/ghost-sdk-core";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Describes which layer a transaction should execute on and the hop path required. */
export interface RoutedTxPlan {
  /** The layer to execute the transaction on: "L1" | "L2" | "L3". */
  executeOn: "L1" | "L2" | "L3";
  /** Ordered list of layers the cross-chain message must traverse (e.g. ["L3", "L2", "L1"]). */
  path: Array<"L1" | "L2" | "L3">;
  /** Whether cross-layer relay hops are required after execution. */
  requiresMessaging: boolean;
}

/** Raw transaction request parameters. */
export interface TxRequest {
  to: string;
  data?: string;
  value?: bigint;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

export interface RelayGatewayRef {
  address: string;
  /** Parsed ABI fragments for the relay gateway contract. */
  abi: GhostABIFragment[];
}

/** Backward-compatible alias for older call sites. */
export type MessengerRef = RelayGatewayRef;

export interface HopExecutorConfig {
  /** Ghost relay gateway for L3 → L2 hops. */
  L3ToL2Gateway?: RelayGatewayRef;
  /** Ghost relay gateway for L2 → L1 hops. */
  L2ToL1Gateway?: RelayGatewayRef;
  /** Deprecated compatibility alias. */
  L3ToL2Messenger?: MessengerRef;
  /** Deprecated compatibility alias. */
  L2ToL1Messenger?: MessengerRef;
  /**
   * Default gas limit passed to the relay gateway's sendMessage call.
   * Can be overridden per-hop in executeWithHops().
   */
  defaultRelayGasLimit?: bigint;
  /**
   * Deprecated compatibility alias.
   * Can be overridden per-hop in executeWithHops().
   */
  defaultMessengerGasLimit?: bigint;
}

export interface HopResult {
  /** Hash of the source-layer transaction actually submitted. */
  executeTxHash: string;
  /**
   * Additional relay tx hashes directly submitted by the executor.
   * Nested relay envelopes submit a single source-layer tx, so downstream hop
   * hashes are not locally available at submission time.
   */
  hopTxHashes: string[];
}

// ── HopExecutor ───────────────────────────────────────────────────────────────

interface NormalizedHopExecutorConfig {
  L3ToL2Gateway?: RelayGatewayRef;
  L2ToL1Gateway?: RelayGatewayRef;
  defaultRelayGasLimit: bigint;
}

export class HopExecutor {
  private readonly cfg: NormalizedHopExecutorConfig;

  constructor(cfg: HopExecutorConfig = {}) {
    this.cfg = {
      defaultRelayGasLimit: cfg.defaultRelayGasLimit ?? cfg.defaultMessengerGasLimit ?? 200_000n,
      L3ToL2Gateway: cfg.L3ToL2Gateway ?? cfg.L3ToL2Messenger,
      L2ToL1Gateway: cfg.L2ToL1Gateway ?? cfg.L2ToL1Messenger,
    };
  }

  /**
   * Execute a routed transaction + all required cross-layer relay hops.
   *
   * @param params.plan      - Routing plan from LayerRouter / GhostBrain
   * @param params.tx        - Raw transaction request (to, data, value, etc.)
   * @param params.signer    - GhostSigner connected to the `plan.executeOn` layer
   * @param params.providers - One GhostProvider per layer for post-hop verification
   */
  async executeWithHops(params: {
    plan:      RoutedTxPlan;
    tx:        TxRequest;
    signer:    GhostSigner;
    providers: { L1: GhostProvider; L2: GhostProvider; L3: GhostProvider };
    /** Optional per-hop gas limit override (key = "L3-L2" | "L2-L1"). */
    hopGasLimits?: Partial<Record<"L3-L2" | "L2-L1", bigint>>;
  }): Promise<HopResult> {
    const { plan, tx, signer, hopGasLimits } = params;

    if (!plan.requiresMessaging) {
      const executeTxHash = await signer.send({
        to:                   tx.to,
        data:                 tx.data               ?? "0x",
        value:                tx.value              ?? 0n,
        gasLimit:             tx.gasLimit,
        maxFeePerGas:         tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        nonce:                tx.nonce,
      });

      return { executeTxHash, hopTxHashes: [] };
    }

    const relaySubmission = this.buildRelaySubmission(plan, tx, hopGasLimits);
    const executeTxHash = await signer.send({
      to:                   relaySubmission.to,
      data:                 relaySubmission.data,
      value:                0n,
      gasLimit:             tx.gasLimit ?? relaySubmission.gasLimit,
      maxFeePerGas:         tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      nonce:                tx.nonce,
    });

    return { executeTxHash, hopTxHashes: [] };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildRelaySubmission(
    plan: RoutedTxPlan,
    tx: TxRequest,
    hopGasLimits?: Partial<Record<"L3-L2" | "L2-L1", bigint>>,
  ): { to: string; data: string; gasLimit: bigint } {
    const value = tx.value ?? 0n;
    if (value !== 0n) {
      throw new Error("HopExecutor: cross-layer relay envelopes do not support nonzero value");
    }

    let currentTarget = normalizeAddress(tx.to, "tx.to");
    let currentMessage = normalizeHexBytes(tx.data ?? "0x", "tx.data");
    let outermostGasLimit = this.cfg.defaultRelayGasLimit;

    for (let i = plan.path.length - 2; i >= 0; i--) {
      const from = plan.path[i]!;
      const to = plan.path[i + 1]!;
      const key = `${from}-${to}` as "L3-L2" | "L2-L1";
      const hopGasLimit = hopGasLimits?.[key] ?? this.cfg.defaultRelayGasLimit;
      const gateway = this.getGatewayRef(from, to);

      currentMessage = encodeRelaySendMessageCall(currentTarget, currentMessage, hopGasLimit, gateway.abi);
      currentTarget = normalizeAddress(gateway.address, `${from}->${to} gateway`);
      outermostGasLimit = hopGasLimit;
    }

    return {
      to: currentTarget,
      data: currentMessage,
      gasLimit: tx.gasLimit ?? outermostGasLimit,
    };
  }

  private getGatewayRef(from: string, to: string): RelayGatewayRef {
    if (from === "L3" && to === "L2" && this.cfg.L3ToL2Gateway) {
      return this.cfg.L3ToL2Gateway;
    }

    if (from === "L2" && to === "L1" && this.cfg.L2ToL1Gateway) {
      return this.cfg.L2ToL1Gateway;
    }

    const envHint = from === "L3"
      ? "L3_TO_L2_GATEWAY_ADDRESS"
      : "L2_TO_L1_GATEWAY_ADDRESS";
    throw new Error(`HopExecutor: missing relay gateway for ${from} -> ${to}; set ${envHint}`);
  }
}

// ── Environment-variable factory ──────────────────────────────────────────────

/**
 * Minimal Ghost relay gateway ABI.
 * Matches `contracts/src/common/IXDomainMessenger.sol`.
 */
const GHOST_RELAY_GATEWAY_ABI: GhostABIFragment[] = [
  {
    type: "function",
    name: "sendMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_target",      type: "address" },
      { name: "_message",     type: "bytes"   },
      { name: "_minGasLimit", type: "uint32"  },
    ],
    outputs: [],
  },
];

const WORD_HEX_LENGTH = 64;
const MAX_UINT32 = 0xffff_ffffn;
const SEND_MESSAGE_SELECTOR = new GhostAbiCoder()
  .encodeFunctionSelector(GHOST_RELAY_GATEWAY_ABI[0]!);

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function normalizeAddress(value: string, label: string): string {
  const normalized = strip0x(value).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`HopExecutor: ${label} must be a 20-byte hex address`);
  }
  return `0x${normalized}`;
}

function normalizeHexBytes(value: string, label: string): string {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error(`HopExecutor: ${label} must be 0x-prefixed even-length hex data`);
  }
  return value.toLowerCase();
}

function encodeUint256Word(value: bigint, label: string): string {
  if (value < 0n) {
    throw new Error(`HopExecutor: ${label} must be non-negative`);
  }
  return value.toString(16).padStart(WORD_HEX_LENGTH, "0");
}

function encodeAddressWord(value: string, label: string): string {
  return strip0x(normalizeAddress(value, label)).padStart(WORD_HEX_LENGTH, "0");
}

function encodeDynamicBytes(value: string): string {
  const normalized = strip0x(normalizeHexBytes(value, "message"));
  const padded = normalized.length === 0
    ? ""
    : normalized.padEnd(Math.ceil(normalized.length / WORD_HEX_LENGTH) * WORD_HEX_LENGTH, "0");

  return `${encodeUint256Word(BigInt(normalized.length / 2), "message length")}${padded}`;
}

function resolveSendMessageFragment(abi: GhostABIFragment[]): GhostABIFragment {
  const fragment = abi.find((f) => f.type === "function" && f.name === "sendMessage");
  if (!fragment) {
    throw new Error(`HopExecutor: relay gateway ABI missing "sendMessage" fragment`);
  }
  return fragment;
}

function encodeRelaySendMessageCall(
  target: string,
  message: string,
  minGasLimit: bigint,
  abi: GhostABIFragment[],
): string {
  resolveSendMessageFragment(abi);

  if (minGasLimit > MAX_UINT32) {
    throw new Error(`HopExecutor: relay gas limit ${minGasLimit.toString()} exceeds uint32 bounds`);
  }

  const head = [
    encodeAddressWord(target, "relay target"),
    encodeUint256Word(96n, "message offset"),
    encodeUint256Word(minGasLimit, "minGasLimit"),
  ].join("");

  return `${SEND_MESSAGE_SELECTOR}${head}${encodeDynamicBytes(message)}`;
}

/**
 * Build a `HopExecutor` wired from standard environment variables:
 *
 * Preferred names:
 *   L3_TO_L2_GATEWAY_ADDRESS    — L3 -> L2 relay gateway / XDomainMessenger
 *   L2_TO_L1_GATEWAY_ADDRESS    — L2 -> L1 relay gateway / XDomainMessenger
 *   HOP_EXECUTOR_RELAY_GAS_LIMIT — default gas limit for relay calls (optional, default 200_000)
 *
 * Backward-compatible aliases still accepted:
 *   L3_TO_L2_MESSENGER_ADDRESS
 *   L2_TO_L1_MESSENGER_ADDRESS
 *   L3_CROSS_DOMAIN_MESSENGER_ADDRESS
 *   L2_CROSS_DOMAIN_MESSENGER_ADDRESS
 *   HOP_EXECUTOR_GAS_LIMIT
 *
 * Returns a `HopExecutor` with relay gateways configured for any address that
 * is set. Cross-layer plans fail fast when a required gateway is unset.
 */
export function buildHopExecutorFromEnv(): HopExecutor {
  const l3ToL2Addr = process.env.L3_TO_L2_GATEWAY_ADDRESS?.trim()
    ?? process.env.L3_TO_L2_MESSENGER_ADDRESS?.trim()
    ?? process.env.L3_CROSS_DOMAIN_MESSENGER_ADDRESS?.trim();
  const l2ToL1Addr = process.env.L2_TO_L1_GATEWAY_ADDRESS?.trim()
    ?? process.env.L2_TO_L1_MESSENGER_ADDRESS?.trim()
    ?? process.env.L2_CROSS_DOMAIN_MESSENGER_ADDRESS?.trim();
  const gasLimitRaw = process.env.HOP_EXECUTOR_RELAY_GAS_LIMIT
    ?? process.env.HOP_EXECUTOR_GAS_LIMIT;

  const defaultRelayGasLimit = gasLimitRaw
    ? BigInt(gasLimitRaw)
    : 200_000n;

  return new HopExecutor({
    defaultRelayGasLimit,
    ...(l3ToL2Addr ? { L3ToL2Gateway: { address: l3ToL2Addr, abi: GHOST_RELAY_GATEWAY_ABI } } : {}),
    ...(l2ToL1Addr ? { L2ToL1Gateway: { address: l2ToL1Addr, abi: GHOST_RELAY_GATEWAY_ABI } } : {}),
  });
}
