/**
 * AccountAbstraction — ERC-4337 Bundler client.
 *
 * Sends UserOperations to a bundler node (e.g. Alto, Stackup, Pimlico)
 * via the eth_sendUserOperation / eth_getUserOperationReceipt RPC methods.
 */

import type { UserOperation } from "./SmartAccount.js";

export interface BundlerConfig {
  /** Bundler endpoint URL */
  bundlerUrl: string;
  /** EntryPoint contract address (must match what the bundler supports) */
  entryPoint: `0x${string}`;
  /** fetch-compatible timeout in ms (default: 30_000) */
  timeoutMs?: number;
}

export interface UserOperationReceipt {
  userOpHash: `0x${string}`;
  entryPoint: `0x${string}`;
  sender: `0x${string}`;
  nonce: bigint;
  paymaster?: `0x${string}`;
  actualGasCost: bigint;
  actualGasUsed: bigint;
  success: boolean;
  reason?: string;
  receipt: TransactionReceiptStub;
  logs: RawLog[];
}

export interface TransactionReceiptStub {
  blockHash: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  transactionIndex: number;
  status: "0x0" | "0x1";
  gasUsed: bigint;
}

export interface RawLog {
  address: `0x${string}`;
  topics: `0x${string}`[];
  data: `0x${string}`;
}

export interface SupportedEntryPoints {
  entryPoints: `0x${string}`[];
}

export interface GasEstimate {
  preVerificationGas: bigint;
  verificationGasLimit: bigint;
  callGasLimit: bigint;
}

export class AccountAbstraction {
  private readonly bundlerUrl: string;
  readonly entryPoint: `0x${string}`;
  private readonly timeoutMs: number;

  constructor(config: BundlerConfig) {
    this.bundlerUrl = config.bundlerUrl;
    this.entryPoint = config.entryPoint;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  // ── Bundler RPC methods ───────────────────────────────────────────────────

  /**
   * Send a signed UserOperation to the bundler.
   * Returns the userOpHash.
   */
  async sendUserOperation(userOp: UserOperation): Promise<`0x${string}`> {
    const result = await this._rpc<`0x${string}`>("eth_sendUserOperation", [
      this._serializeUserOp(userOp),
      this.entryPoint,
    ]);
    return result;
  }

  /**
   * Estimate gas for a UserOperation (not yet signed).
   */
  async estimateUserOperationGas(
    userOp: Omit<UserOperation, "signature"> & { signature?: `0x${string}` },
  ): Promise<GasEstimate> {
    const raw = await this._rpc<{
      preVerificationGas: string;
      verificationGasLimit: string;
      callGasLimit: string;
    }>("eth_estimateUserOperationGas", [
      this._serializeUserOp({ ...userOp, signature: userOp.signature ?? "0x" } as UserOperation),
      this.entryPoint,
    ]);

    return {
      preVerificationGas: BigInt(raw.preVerificationGas),
      verificationGasLimit: BigInt(raw.verificationGasLimit),
      callGasLimit: BigInt(raw.callGasLimit),
    };
  }

  /**
   * Poll for a UserOperation receipt (waits until the op is included).
   */
  async getUserOperationReceipt(
    userOpHash: `0x${string}`,
    opts: { pollMs?: number; timeoutMs?: number } = {},
  ): Promise<UserOperationReceipt> {
    const pollMs = opts.pollMs ?? 2_000;
    const deadline = Date.now() + (opts.timeoutMs ?? this.timeoutMs);

    while (Date.now() < deadline) {
      const receipt =
        await this._rpc<UserOperationReceipt | null>(
          "eth_getUserOperationReceipt",
          [userOpHash],
        );

      if (receipt) {
        return {
          ...receipt,
          nonce: BigInt(receipt.nonce),
          actualGasCost: BigInt(receipt.actualGasCost),
          actualGasUsed: BigInt(receipt.actualGasUsed),
          receipt: {
            ...receipt.receipt,
            blockNumber: BigInt(receipt.receipt.blockNumber),
            gasUsed: BigInt(receipt.receipt.gasUsed),
          },
        };
      }

      await this._sleep(pollMs);
    }

    throw new Error(
      `UserOperation ${userOpHash} not included within ${opts.timeoutMs ?? this.timeoutMs}ms`,
    );
  }

  /**
   * Get the UserOperation by hash (before or after inclusion).
   */
  async getUserOperationByHash(userOpHash: `0x${string}`): Promise<{
    userOperation: UserOperation;
    entryPoint: `0x${string}`;
    blockNumber?: bigint;
    blockHash?: `0x${string}`;
    transactionHash?: `0x${string}`;
  } | null> {
    return this._rpc("eth_getUserOperationByHash", [userOpHash]);
  }

  /**
   * Get supported entry points from the bundler.
   */
  async getSupportedEntryPoints(): Promise<`0x${string}`[]> {
    return this._rpc<`0x${string}`[]>("eth_supportedEntryPoints", []);
  }

  /**
   * Get chain ID from the bundler.
   */
  async getChainId(): Promise<number> {
    const result = await this._rpc<string>("eth_chainId", []);
    return Number(BigInt(result));
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _serializeUserOp(op: UserOperation): Record<string, string> {
    return {
      sender: op.sender,
      nonce: `0x${op.nonce.toString(16)}`,
      initCode: op.initCode,
      callData: op.callData,
      callGasLimit: `0x${op.callGasLimit.toString(16)}`,
      verificationGasLimit: `0x${op.verificationGasLimit.toString(16)}`,
      preVerificationGas: `0x${op.preVerificationGas.toString(16)}`,
      maxFeePerGas: `0x${op.maxFeePerGas.toString(16)}`,
      maxPriorityFeePerGas: `0x${op.maxPriorityFeePerGas.toString(16)}`,
      paymasterAndData: op.paymasterAndData,
      signature: op.signature,
    };
  }

  private async _rpc<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.bundlerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Bundler HTTP ${res.status}: ${await res.text()}`);
      }

      const json = (await res.json()) as { result?: T; error?: { message: string; code: number } };
      if (json.error) {
        throw new Error(
          `Bundler RPC error ${json.error.code}: ${json.error.message}`,
        );
      }
      return json.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
