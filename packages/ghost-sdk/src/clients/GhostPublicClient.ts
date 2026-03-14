/**
 * GhostPublicClient — read-only viem-style client for GhostChain.
 *
 * Provides a high-level, ergonomic API for reading chain state.
 * No private key required.
 *
 * Usage:
 *   const client = new GhostPublicClient({ rpcUrl: "http://localhost:18545" })
 *   const block = await client.getBlock()
 *   const balance = await client.getBalance({ address: "0x..." })
 *   const receipt = await client.waitForReceipt({ hash: "0x..." })
 */

import { HttpProvider } from "../providers/HttpProvider.js";
import type { GhostAddress, GhostBlockTag, GhostLogFilter, GhostProviderOptions, GhostTxReceipt, Hex } from "../native/types.js";

export type GhostPublicClientConfig = GhostProviderOptions & {
  chainId?: number;
};

export class GhostPublicClient {
  public readonly provider: HttpProvider;
  private _chainId?: number;

  constructor(config: GhostPublicClientConfig) {
    this.provider = new HttpProvider(config.rpcUrl, {
      timeoutMs: config.timeoutMs,
      headers: config.headers,
    });
    this._chainId = config.chainId;
  }

  // ── Chain ─────────────────────────────────────────────────────────────────

  async getChainId(): Promise<number> {
    if (this._chainId) return this._chainId;
    this._chainId = await this.provider.getChainId();
    return this._chainId;
  }

  async getBlockNumber(): Promise<bigint> {
    return this.provider.getBlockNumber();
  }

  async getBlock({ blockNumber, blockTag, includeTransactions }: {
    blockNumber?: bigint;
    blockTag?: GhostBlockTag;
    includeTransactions?: boolean;
  } = {}) {
    const tag = blockNumber !== undefined ? blockNumber : (blockTag ?? "latest");
    return this.provider.getBlock(tag, includeTransactions ?? false);
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async getBalance({ address, blockTag }: { address: GhostAddress; blockTag?: GhostBlockTag }) {
    return this.provider.getBalance(address, blockTag ?? "latest");
  }

  async getCode({ address, blockTag }: { address: GhostAddress; blockTag?: GhostBlockTag }) {
    return this.provider.getCode(address, blockTag ?? "latest");
  }

  async getStorageAt({ address, slot, blockTag }: { address: GhostAddress; slot: Hex; blockTag?: GhostBlockTag }) {
    return this.provider.getStorageAt(address, slot, blockTag ?? "latest");
  }

  async getTransactionCount({ address, blockTag }: { address: GhostAddress; blockTag?: GhostBlockTag }) {
    return this.provider.getTransactionCount(address, blockTag ?? "latest");
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async getTransaction({ hash }: { hash: Hex }) {
    return this.provider.getTransaction(hash);
  }

  async getTransactionReceipt({ hash }: { hash: Hex }): Promise<GhostTxReceipt | null> {
    return this.provider.getTransactionReceipt(hash);
  }

  async waitForTransactionReceipt({ hash, pollMs = 2000, timeout = 120_000 }: {
    hash: Hex;
    pollMs?: number;
    timeout?: number;
  }): Promise<GhostTxReceipt> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const receipt = await this.provider.getTransactionReceipt(hash);
      if (receipt) return receipt;
      await new Promise(r => setTimeout(r, pollMs));
    }
    throw new Error(`Transaction ${hash} not mined within ${timeout / 1000}s`);
  }

  // ── Call / Logs ───────────────────────────────────────────────────────────

  async call({ to, data, from, value, blockTag }: {
    to: GhostAddress;
    data?: Hex;
    from?: GhostAddress;
    value?: bigint;
    blockTag?: GhostBlockTag;
  }): Promise<Hex> {
    return this.provider.call({ to, data, from, value }, blockTag ?? "latest");
  }

  async estimateGas(params: { to?: GhostAddress; from?: GhostAddress; data?: Hex; value?: bigint }): Promise<bigint> {
    return this.provider.estimateGas(params);
  }

  async getLogs({ address, topics, fromBlock, toBlock }: GhostLogFilter) {
    return this.provider.getLogs({ address, topics, fromBlock, toBlock });
  }

  // ── Gas ───────────────────────────────────────────────────────────────────

  async getGasPrice(): Promise<bigint> {
    return this.provider.getGasPrice();
  }

  async getFeeHistory(blockCount?: number, blockTag?: GhostBlockTag, percentiles?: number[]) {
    return this.provider.getFeeHistory(blockCount, blockTag, percentiles);
  }
}
