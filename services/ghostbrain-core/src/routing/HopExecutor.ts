/**
 * HopExecutor — L3 → L2 → L1 routing enforcer
 *
 * Executes a transaction on the designated layer, then schedules/executes
 * the required OP Stack canonical messenger hops upward.
 *
 * The messenger calls are structured as production-safe stubs: wire your
 * real OP Stack messenger ABI + addresses via `HopExecutorConfig`.
 */

import { Contract, type Wallet } from "ghost";
import type { GhostJsonRpcProvider } from "@ghost/ai-sdk";
import type { RoutedTxPlan, TxRequest } from "@ghost/ai-sdk";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MessengerRef {
  address: string;
  /** Minimal ABI for the send-message function. */
  abi:     string[];
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
   * @param params.signer    - Wallet connected to the `plan.executeOn` provider
   * @param params.providers - One provider per layer for post-hop verification
   */
  async executeWithHops(params: {
    plan:      RoutedTxPlan;
    tx:        TxRequest;
    signer:    Wallet;
    providers: { L1: GhostJsonRpcProvider; L2: GhostJsonRpcProvider; L3: GhostJsonRpcProvider };
    /** Optional per-hop gas limit override (key = "L3-L2" | "L2-L1"). */
    hopGasLimits?: Partial<Record<"L3-L2" | "L2-L1", bigint>>;
  }): Promise<HopResult> {
    const { plan, tx, signer, hopGasLimits } = params;

    // ── 1. Execute on the designated layer ───────────────────────────────────
    const sent = await signer.sendTransaction({
      to:                  tx.to,
      data:                tx.data               ?? "0x",
      value:               tx.value              ?? 0n,
      gasLimit:            tx.gasLimit,
      maxFeePerGas:        tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      nonce:               tx.nonce,
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

    return { executeTxHash: sent.hash, hopTxHashes };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async sendHop(params: {
    from:     string;
    to:       string;
    tx:       TxRequest;
    signer:   Wallet;
    gasLimit: bigint;
  }): Promise<string> {
    const { from, to, tx, signer, gasLimit } = params;

    if (from === "L3" && to === "L2" && this.cfg.L3ToL2Messenger) {
      return this.callMessenger({
        ref:      this.cfg.L3ToL2Messenger,
        signer,
        target:   tx.to,
        message:  tx.data ?? "0x",
        gasLimit,
      });
    }

    if (from === "L2" && to === "L1" && this.cfg.L2ToL1Messenger) {
      return this.callMessenger({
        ref:      this.cfg.L2ToL1Messenger,
        signer,
        target:   tx.to,
        message:  tx.data ?? "0x",
        gasLimit,
      });
    }

    // Messenger not yet configured — return a clearly labelled placeholder
    return `0x_PLACEHOLDER_${from}_TO_${to}_NOT_WIRED`;
  }

  /**
   * Call the OP Stack canonical messenger's `sendMessage(target, message, gasLimit)`.
   *
   * ABI fragment expected (at minimum):
   *   "function sendMessage(address target, bytes calldata message, uint32 gasLimit)"
   */
  private async callMessenger(params: {
    ref:      MessengerRef;
    signer:   Wallet;
    target:   string;
    message:  string;
    gasLimit: bigint;
  }): Promise<string> {
    const { ref, signer, target, message, gasLimit } = params;

    const messenger = new Contract(ref.address, ref.abi, signer);

    // Type-safe dynamic call — OP Stack canonical messenger signature
    const tx = await (messenger["sendMessage"] as (
      target:   string,
      message:  string,
      gasLimit: bigint
    ) => Promise<{ hash: string }>)(target, message, gasLimit);

    return tx.hash;
  }
}

// ── Environment-variable factory ──────────────────────────────────────────────

/**
 * Minimal OP Stack CrossDomainMessenger ABI fragment required for sendMessage.
 * Compatible with OP Stack v1.4+ (Bedrock and later).
 */
const OP_MESSENGER_ABI = [
  "function sendMessage(address _target, bytes calldata _message, uint32 _minGasLimit)",
] as const;

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
    ...(l3ToL2Addr ? { L3ToL2Messenger: { address: l3ToL2Addr, abi: [...OP_MESSENGER_ABI] } } : {}),
    ...(l2ToL1Addr ? { L2ToL1Messenger: { address: l2ToL1Addr, abi: [...OP_MESSENGER_ABI] } } : {}),
  });
}
