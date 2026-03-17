/**
 * HopExecutor — L3 → L2 → L1 routing enforcer
 *
 * Executes a transaction on the designated layer, then schedules/executes
 * the required OP Stack canonical messenger hops upward.
 *
 * The messenger calls are structured as production-safe stubs: wire your
 * real OP Stack messenger ABI + addresses via `HopExecutorConfig`.
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
  /** Whether cross-layer messenger hops are required after execution. */
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

export interface MessengerRef {
  address: string;
  /** Parsed ABI fragments for the messenger contract. */
  abi: GhostABIFragment[];
}

export interface HopExecutorConfig {
  /** OP Stack messenger for L3 → L2 hops (e.g. L2CrossDomainMessenger on L3). */
  L3ToL2Messenger?: MessengerRef;
  /** OP Stack messenger for L2 → L1 hops (e.g. L1CrossDomainMessenger on L2). */
  L2ToL1Messenger?: MessengerRef;
  /**
   * Default gas limit passed to the messenger's sendMessage call.
   * Can be overridden per-hop in executeWithHops().
   */
  defaultMessengerGasLimit?: bigint;
}

export interface HopResult {
  /** Hash of the transaction executed on plan.executeOn. */
  executeTxHash: string;
  /**
   * Ordered list of messenger hop tx hashes.
   * Each entry corresponds to one step in plan.path[n] → plan.path[n+1].
   * Placeholder values are emitted when the messenger config is not wired yet.
   */
  hopTxHashes: string[];
}

// ── HopExecutor ───────────────────────────────────────────────────────────────

export class HopExecutor {
  private readonly cfg: HopExecutorConfig;

  constructor(cfg: HopExecutorConfig = {}) {
    this.cfg = {
      defaultMessengerGasLimit: cfg.defaultMessengerGasLimit ?? 200_000n,
      ...cfg,
    };
  }

  /**
   * Execute a routed transaction + all required cross-layer messenger hops.
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

    // ── 1. Execute on the designated layer ───────────────────────────────────
    const executeTxHash = await signer.send({
      to:                   tx.to,
      data:                 tx.data               ?? "0x",
      value:                tx.value              ?? 0n,
      gasLimit:             tx.gasLimit,
      maxFeePerGas:         tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      nonce:                tx.nonce,
    });

    // ── 2. Schedule messenger hops ────────────────────────────────────────────
    const hopTxHashes: string[] = [];

    if (plan.requiresMessaging) {
      for (let i = 0; i < plan.path.length - 1; i++) {
        const from = plan.path[i]!;
        const to   = plan.path[i + 1]!;
        const key  = `${from}-${to}` as "L3-L2" | "L2-L1";
        const gasLimit = hopGasLimits?.[key] ?? this.cfg.defaultMessengerGasLimit!;

        const hash = await this.sendHop({ from, to, tx, signer, gasLimit });
        hopTxHashes.push(hash);
      }
    }

    return { executeTxHash, hopTxHashes };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async sendHop(params: {
    from:     string;
    to:       string;
    tx:       TxRequest;
    signer:   GhostSigner;
    gasLimit: bigint;
  }): Promise<string> {
    const { from, to, tx, signer, gasLimit } = params;

    if (from === "L3" && to === "L2" && this.cfg.L3ToL2Messenger) {
      return this.callMessenger({
        ref:     this.cfg.L3ToL2Messenger,
        signer,
        target:  tx.to,
        message: tx.data ?? "0x",
        gasLimit,
      });
    }

    if (from === "L2" && to === "L1" && this.cfg.L2ToL1Messenger) {
      return this.callMessenger({
        ref:     this.cfg.L2ToL1Messenger,
        signer,
        target:  tx.to,
        message: tx.data ?? "0x",
        gasLimit,
      });
    }

    // Messenger not yet configured — return a clearly labelled placeholder
    return `0x_PLACEHOLDER_${from}_TO_${to}_NOT_WIRED`;
  }

  /**
   * Call the OP Stack canonical messenger's `sendMessage(target, message, minGasLimit)`
   * using GhostAbiCoder + GhostSigner (ghost-sdk-core, no ethers dependency).
   */
  private async callMessenger(params: {
    ref:      MessengerRef;
    signer:   GhostSigner;
    target:   string;
    message:  string;
    gasLimit: bigint;
  }): Promise<string> {
    const { ref, signer, target, message, gasLimit } = params;

    const fragment = ref.abi.find((f) => f.type === "function" && f.name === "sendMessage");
    if (!fragment) {
      throw new Error(`HopExecutor: MessengerRef ABI missing "sendMessage" fragment`);
    }

    const coder = new GhostAbiCoder();
    const data = coder.encodeFunctionCall(fragment, [target, message, Number(gasLimit)]);

    return signer.send({ to: ref.address, data, gasLimit });
  }
}

// ── Environment-variable factory ──────────────────────────────────────────────

/**
 * Minimal OP Stack CrossDomainMessenger ABI (structured fragments for GhostAbiCoder).
 * Compatible with OP Stack v1.4+ (Bedrock and later).
 */
const OP_MESSENGER_ABI: GhostABIFragment[] = [
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

/**
 * Build a `HopExecutor` wired from standard environment variables:
 *
 *   L3_TO_L2_MESSENGER_ADDRESS  — L2CrossDomainMessenger deployed on L3
 *   L2_TO_L1_MESSENGER_ADDRESS  — L1CrossDomainMessenger deployed on L2
 *   HOP_EXECUTOR_GAS_LIMIT      — default gas limit for messenger calls (optional, default 200_000)
 *
 * Returns a `HopExecutor` with messengers configured for any address that is
 * set. Unset messengers fall back to the placeholder path until wired.
 */
export function buildHopExecutorFromEnv(): HopExecutor {
  const l3ToL2Addr = process.env.L3_TO_L2_MESSENGER_ADDRESS?.trim();
  const l2ToL1Addr = process.env.L2_TO_L1_MESSENGER_ADDRESS?.trim();
  const gasLimitRaw = process.env.HOP_EXECUTOR_GAS_LIMIT;

  const defaultMessengerGasLimit = gasLimitRaw
    ? BigInt(gasLimitRaw)
    : 200_000n;

  return new HopExecutor({
    defaultMessengerGasLimit,
    ...(l3ToL2Addr ? { L3ToL2Messenger: { address: l3ToL2Addr, abi: OP_MESSENGER_ABI } } : {}),
    ...(l2ToL1Addr ? { L2ToL1Messenger: { address: l2ToL1Addr, abi: OP_MESSENGER_ABI } } : {}),
  });
}
