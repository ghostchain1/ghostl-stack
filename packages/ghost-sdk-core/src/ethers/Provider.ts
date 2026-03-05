// ─────────────────────────────────────────────────────────────────────────────
// Provider (abstract) + JsonRpcProvider – ethers v6-compatible
// Wraps GhostProvider and surfaces the ethers API naming conventions.
// ─────────────────────────────────────────────────────────────────────────────

import { GhostProvider } from "../provider/GhostProvider";
import { GhostChains }   from "../chains/ghostChains";
import type { TransactionReceipt, TransactionRequest, Log } from "./types";
import type { GhostBlock, GhostTransactionReceipt } from "../types";

// ─── Abstract Provider ───────────────────────────────────────────────────────

export abstract class Provider {
  abstract getNetwork(): Promise<{ name: string; chainId: bigint }>;
  abstract getBlockNumber(): Promise<number>;
  abstract getBalance(address: string, tag?: string): Promise<bigint>;
  abstract getTransactionCount(address: string, tag?: string): Promise<number>;
  abstract getCode(address: string, tag?: string): Promise<string>;
  abstract getBlock(blockTag: string | number): Promise<GhostBlock | null>;
  abstract getTransaction(hash: string): Promise<Record<string, unknown> | null>;
  abstract getTransactionReceipt(hash: string): Promise<TransactionReceipt | null>;
  abstract call(tx: TransactionRequest): Promise<string>;
  abstract estimateGas(tx: TransactionRequest): Promise<bigint>;
  abstract getFeeData(): Promise<{
    gasPrice: bigint | null;
    maxFeePerGas: bigint | null;
    maxPriorityFeePerGas: bigint | null;
  }>;
  abstract getLogs(filter: {
    fromBlock?: string | number;
    toBlock?: string | number;
    address?: string | string[];
    topics?: (string | string[] | null)[];
  }): Promise<Log[]>;
  abstract sendRawTransaction(signedTx: string): Promise<string>;
  abstract waitForTransaction(
    hash: string,
    confirms?: number,
    timeoutMs?: number
  ): Promise<TransactionReceipt>;
  abstract resolveName(name: string): Promise<string | null>;
}

// ─── JsonRpcProvider ─────────────────────────────────────────────────────────

export class JsonRpcProvider extends Provider {
  protected _ghost: GhostProvider;
  protected _url: string;
  private _chainId: number | null = null;

  constructor(url: string) {
    super();
    this._url = url;
    this._ghost = new GhostProvider(url);
  }

  /** Create a provider already connected to a named GhostChain layer. */
  static forLayer(layer: "L1" | "L2" | "L3", rpcOverride?: string): JsonRpcProvider {
    return new JsonRpcProvider(rpcOverride ?? GhostChains[layer].rpc);
  }

  static forL1(rpcOverride?: string): JsonRpcProvider {
    return JsonRpcProvider.forLayer("L1", rpcOverride);
  }

  static forL2(rpcOverride?: string): JsonRpcProvider {
    return JsonRpcProvider.forLayer("L2", rpcOverride);
  }

  static forL3(rpcOverride?: string): JsonRpcProvider {
    return JsonRpcProvider.forLayer("L3", rpcOverride);
  }

  // ─── Network ────────────────────────────────────────────────────────────

  async getNetwork(): Promise<{ name: string; chainId: bigint }> {
    if (this._chainId === null) {
      this._chainId = await this._ghost.getChainId();
    }
    const chain = Object.values(GhostChains).find((c) => c.chainId === this._chainId);
    return {
      name: chain?.name ?? "unknown",
      chainId: BigInt(this._chainId)
    };
  }

  // ─── Block / tx ──────────────────────────────────────────────────────────

  async getBlockNumber(): Promise<number> {
    return this._ghost.getBlockNumber();
  }

  async getBalance(address: string, tag = "latest"): Promise<bigint> {
    return this._ghost.getBalance(address, tag);
  }

  async getTransactionCount(address: string, tag = "latest"): Promise<number> {
    return this._ghost.getTransactionCount(address, tag);
  }

  async getCode(address: string, tag = "latest"): Promise<string> {
    return this._ghost.getCode(address, tag);
  }

  async getBlock(blockTag: string | number): Promise<GhostBlock | null> {
    return this._ghost.getBlock(blockTag).catch(() => null);
  }

  async getTransaction(hash: string): Promise<Record<string, unknown> | null> {
    return this._ghost.rpc.request<Record<string, unknown> | null>(
      "eth_getTransactionByHash", [hash]
    ).catch(() => null);
  }

  async getTransactionReceipt(hash: string): Promise<TransactionReceipt | null> {
    const raw = await this._ghost.getTransactionReceipt(hash);
    if (!raw) return null;
    return _mapReceipt(raw);
  }

  // ─── Call / gas ──────────────────────────────────────────────────────────

  async call(tx: TransactionRequest): Promise<string> {
    return this._ghost.call({
      to: tx.to ?? "",
      data: typeof tx.data === "string" ? tx.data : "0x",
      from: tx.from,
      value: tx.value !== undefined ? "0x" + BigInt(tx.value).toString(16) : undefined
    });
  }

  async estimateGas(tx: TransactionRequest): Promise<bigint> {
    return this._ghost.estimateGas({
      to: tx.to,
      from: tx.from,
      data: typeof tx.data === "string" ? tx.data : "0x",
      value: tx.value !== undefined ? BigInt(tx.value) : undefined
    });
  }

  async getFeeData(): Promise<{
    gasPrice: bigint | null;
    maxFeePerGas: bigint | null;
    maxPriorityFeePerGas: bigint | null;
  }> {
    const gasPrice = await this._ghost.getGasPrice().catch(() => null);
    if (!gasPrice) return { gasPrice: null, maxFeePerGas: null, maxPriorityFeePerGas: null };
    return {
      gasPrice,
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: gasPrice / 10n
    };
  }

  // ─── Logs ────────────────────────────────────────────────────────────────

  async getLogs(filter: {
    fromBlock?: string | number;
    toBlock?: string | number;
    address?: string | string[];
    topics?: (string | string[] | null)[];
  }): Promise<Log[]> {
    const raw = await this._ghost.getLogs(filter) as any[];
    return raw.map(_mapLog);
  }

  // ─── Send ────────────────────────────────────────────────────────────────

  async sendRawTransaction(signedTx: string): Promise<string> {
    return this._ghost.sendRawTransaction(signedTx);
  }

  async waitForTransaction(
    hash: string,
    confirms = 1,
    timeoutMs = 120_000
  ): Promise<TransactionReceipt> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const receipt = await this.getTransactionReceipt(hash);
      if (receipt && receipt.blockNumber !== null) return receipt;
      await new Promise((r) => setTimeout(r, 1_500));
    }
    throw new Error(`Transaction ${hash} not confirmed within ${timeoutMs}ms`);
  }

  /** ENS not available on GhostChain – returns null for all names. */
  async resolveName(name: string): Promise<string | null> {
    return null;
  }

  /** Access the underlying GhostProvider for advanced use. */
  get ghost(): GhostProvider {
    return this._ghost;
  }
}

// ─── Internal mappers ────────────────────────────────────────────────────────

function _mapReceipt(raw: GhostTransactionReceipt): TransactionReceipt {
  return {
    hash:              raw.transactionHash,
    blockHash:         raw.blockHash,
    blockNumber:       raw.blockNumber,
    index:             0,
    from:              raw.from,
    to:                raw.to,
    contractAddress:   raw.contractAddress,
    gasUsed:           raw.gasUsed,
    cumulativeGasUsed: raw.gasUsed,
    effectiveGasPrice: raw.effectiveGasPrice,
    status:            raw.status,
    logs:              raw.logs.map(_mapLog),
    logsBloom:         "0x",
    type:              2
  };
}

function _mapLog(raw: any): Log {
  return {
    address:          raw.address,
    topics:           raw.topics,
    data:             raw.data,
    blockNumber:      raw.blockNumber,
    blockHash:        raw.blockHash ?? "0x",
    transactionHash:  raw.transactionHash,
    transactionIndex: raw.transactionIndex ?? 0,
    logIndex:         raw.logIndex,
    removed:          raw.removed ?? false
  };
}
