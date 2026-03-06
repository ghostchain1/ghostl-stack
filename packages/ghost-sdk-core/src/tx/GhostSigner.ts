// ─────────────────────────────────────────────────────────────────────────────
// GhostSigner – High-level sign-and-send for GhostChain L1 / L2 / L3
//
// Combines: GhostWallet + GhostProvider + GhostNonceManager + GhostGasEngine
// into a single ergonomic interface, one per chain layer.
// ─────────────────────────────────────────────────────────────────────────────

import { GhostWallet } from "../wallet/GhostWallet";
import { GhostProvider } from "../provider/GhostProvider";
import { GhostTransaction, makeL1Transaction, makeL2Transaction, makeL3Transaction } from "./GhostTransaction";
import { GhostNonceManager } from "../nonce/GhostNonceManager";
import { GhostGasEngine } from "../gas/GhostGasEngine";
import { GhostChains } from "../chains/ghostChains";
import type { GhostTransactionReceipt } from "../types";

/** Fields the caller provides – signer fills in nonce, gas, chainId. */
export interface SendParams {
  to?: string;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  /** Override nonce (auto-managed if omitted). */
  nonce?: number;
  /** EIP-2930 access list (optional). */
  accessList?: GhostTransaction["accessList"];
}

export type Layer = "L1" | "L2" | "L3";

const FACTORY: Record<Layer, (f: Partial<GhostTransaction>) => GhostTransaction> = {
  L1: makeL1Transaction,
  L2: makeL2Transaction,
  L3: makeL3Transaction
};

export class GhostSigner {
  readonly wallet: GhostWallet;
  readonly provider: GhostProvider;
  readonly layer: Layer;
  private nonces: GhostNonceManager;
  private gas: GhostGasEngine;

  constructor(wallet: GhostWallet, layer: Layer, rpcOverride?: string) {
    this.wallet = wallet;
    this.layer = layer;
    this.provider = new GhostProvider(rpcOverride ?? GhostChains[layer].rpc);
    this.nonces = new GhostNonceManager(this.provider);
    this.gas = new GhostGasEngine(this.provider);
  }

  // ─── Core: sign ──────────────────────────────────────────────────────────

  /**
   * Build, fill, and sign an EIP-1559 transaction.
   * Returns the 0x-prefixed raw transaction hex.
   */
  async sign(params: SendParams): Promise<string> {
    const [nonce, feeData] = await Promise.all([
      params.nonce !== undefined
        ? Promise.resolve(params.nonce)
        : this.nonces.next(this.wallet.address),
      this.gas.getFeeData()
    ]);

    const tx = FACTORY[this.layer]({
      to: params.to,
      value: params.value ?? 0n,
      data: params.data ?? "0x",
      nonce,
      gasLimit: params.gasLimit ?? 21_000n,
      maxFeePerGas: params.maxFeePerGas ?? feeData.maxFeePerGas,
      maxPriorityFeePerGas: params.maxPriorityFeePerGas ?? feeData.maxPriorityFeePerGas,
      accessList: params.accessList ?? [],
      from: this.wallet.address
    });

    return this.wallet.signTransaction(tx);
  }

  // ─── Core: send ──────────────────────────────────────────────────────────

  /**
   * Sign and broadcast. Returns the transaction hash.
   */
  async send(params: SendParams): Promise<string> {
    const raw = await this.sign(params);
    return this.provider.sendRawTransaction(raw);
  }

  /**
   * Sign, broadcast, and wait for first confirmation.
   * Returns the TransactionReceipt.
   */
  async sendAndWait(params: SendParams, timeoutMs = 120_000): Promise<GhostTransactionReceipt> {
    const hash = await this.send(params);
    return this._waitForReceipt(hash, timeoutMs);
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  /** Current on-chain balance of the signer address. */
  balance(): Promise<bigint> {
    return this.provider.getBalance(this.wallet.address);
  }

  /** GST transfer shorthand. */
  sendEther(to: string, value: bigint): Promise<string> {
    return this.send({ to, value });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async _waitForReceipt(hash: string, timeoutMs: number): Promise<GhostTransactionReceipt> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const receipt = await this.provider.getTransactionReceipt(hash).catch(() => null);
      if (receipt) return receipt;
      await new Promise((r) => setTimeout(r, 1_500));
    }
    throw new Error(`Transaction ${hash} not confirmed within ${timeoutMs}ms`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience factory: one signer per layer from a single private key
// ─────────────────────────────────────────────────────────────────────────────

export interface GhostSignerSet {
  L1: GhostSigner;
  L2: GhostSigner;
  L3: GhostSigner;
}

export function createSigners(privateKey: string, rpcOverrides?: Partial<Record<Layer, string>>): GhostSignerSet {
  const wallet = new GhostWallet(privateKey);
  return {
    L1: new GhostSigner(wallet, "L1", rpcOverrides?.L1),
    L2: new GhostSigner(wallet, "L2", rpcOverrides?.L2),
    L3: new GhostSigner(wallet, "L3", rpcOverrides?.L3)
  };
}
