/**
 * HttpProvider — thin wrapper around GhostJsonRpc that provides a provider-like
 * interface for HTTP JSON-RPC endpoints.
 *
 * Usage:
 *   const provider = new HttpProvider("http://localhost:18545")
 *   const block    = await provider.getBlockNumber()
 */

import { GhostJsonRpc } from "../native/GhostJsonRpc.js";
import { hexToBigInt, bigIntToHex } from "../native/hex.js";
import { normalizeAddress } from "../native/address.js";
import type {
  GhostAddress,
  GhostBlockTag,
  GhostLogFilter,
  GhostProviderOptions,
  GhostTxReceipt,
  Hex,
} from "../native/types.js";

export type HttpProviderBlock = {
  number: Hex;
  hash: Hex;
  parentHash: Hex;
  timestamp: Hex;
  gasLimit: Hex;
  gasUsed: Hex;
  baseFeePerGas?: Hex;
  transactions: Array<Hex | HttpProviderTx>;
};

export type HttpProviderTx = {
  hash: Hex;
  from: GhostAddress;
  to: GhostAddress | null;
  value: Hex;
  gas: Hex;
  gasPrice?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  nonce: Hex;
  data: Hex;
  blockNumber: Hex | null;
  blockHash: Hex | null;
  transactionIndex: Hex | null;
};

export class HttpProvider {
  public readonly rpc: GhostJsonRpc;

  constructor(rpcUrl: string, opts: Omit<GhostProviderOptions, "rpcUrl"> = {}) {
    this.rpc = new GhostJsonRpc(rpcUrl, opts);
  }

  // ── Chain ─────────────────────────────────────────────────────────────────

  async getChainId(): Promise<number> {
    return Number(hexToBigInt(await this.rpc.request<Hex>("eth_chainId", [])));
  }

  async getBlockNumber(): Promise<bigint> {
    return hexToBigInt(await this.rpc.request<Hex>("eth_blockNumber", []));
  }

  async getBlock(tag: GhostBlockTag | bigint = "latest", full = false): Promise<HttpProviderBlock> {
    const param = typeof tag === "bigint" ? bigIntToHex(tag) : tag;
    return this.rpc.request<HttpProviderBlock>("eth_getBlockByNumber", [param, full]);
  }

  async getBlockByHash(hash: Hex, full = false): Promise<HttpProviderBlock> {
    return this.rpc.request<HttpProviderBlock>("eth_getBlockByHash", [hash, full]);
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async getBalance(address: GhostAddress, tag: GhostBlockTag = "latest"): Promise<bigint> {
    return hexToBigInt(
      await this.rpc.request<Hex>("eth_getBalance", [normalizeAddress(address), tag])
    );
  }

  async getTransactionCount(address: GhostAddress, tag: GhostBlockTag = "latest"): Promise<number> {
    return Number(hexToBigInt(
      await this.rpc.request<Hex>("eth_getTransactionCount", [normalizeAddress(address), tag])
    ));
  }

  async getCode(address: GhostAddress, tag: GhostBlockTag = "latest"): Promise<Hex> {
    return this.rpc.request<Hex>("eth_getCode", [normalizeAddress(address), tag]);
  }

  async getStorageAt(address: GhostAddress, slot: Hex, tag: GhostBlockTag = "latest"): Promise<Hex> {
    return this.rpc.request<Hex>("eth_getStorageAt", [normalizeAddress(address), slot, tag]);
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async getTransaction(hash: Hex): Promise<HttpProviderTx | null> {
    return this.rpc.request<HttpProviderTx | null>("eth_getTransactionByHash", [hash]);
  }

  async getTransactionReceipt(hash: Hex): Promise<GhostTxReceipt | null> {
    return this.rpc.request<GhostTxReceipt | null>("eth_getTransactionReceipt", [hash]);
  }

  async sendRawTransaction(signedTx: Hex): Promise<Hex> {
    return this.rpc.request<Hex>("eth_sendRawTransaction", [signedTx]);
  }

  // ── Call / estimate ───────────────────────────────────────────────────────

  async call(params: {
    to: GhostAddress;
    data?: Hex;
    from?: GhostAddress;
    value?: bigint;
  }, tag: GhostBlockTag = "latest"): Promise<Hex> {
    const tx: Record<string, unknown> = { to: normalizeAddress(params.to) };
    if (params.data) tx["data"] = params.data;
    if (params.from) tx["from"] = normalizeAddress(params.from);
    if (params.value !== undefined) tx["value"] = bigIntToHex(params.value);
    return this.rpc.request<Hex>("eth_call", [tx, tag]);
  }

  async estimateGas(params: {
    to?: GhostAddress;
    from?: GhostAddress;
    data?: Hex;
    value?: bigint;
  }): Promise<bigint> {
    const tx: Record<string, unknown> = {};
    if (params.to) tx["to"] = normalizeAddress(params.to);
    if (params.from) tx["from"] = normalizeAddress(params.from);
    if (params.data) tx["data"] = params.data;
    if (params.value !== undefined) tx["value"] = bigIntToHex(params.value);
    return hexToBigInt(await this.rpc.request<Hex>("eth_estimateGas", [tx]));
  }

  // ── Logs ──────────────────────────────────────────────────────────────────

  async getLogs(filter: GhostLogFilter): Promise<GhostTxReceipt["logs"]> {
    const f: Record<string, unknown> = {
      fromBlock: filter.fromBlock ?? "latest",
      toBlock: filter.toBlock ?? "latest",
    };
    if (filter.address) f["address"] = filter.address;
    if (filter.topics) f["topics"] = filter.topics;
    return this.rpc.request<GhostTxReceipt["logs"]>("eth_getLogs", [f]);
  }

  // ── Gas ───────────────────────────────────────────────────────────────────

  async getGasPrice(): Promise<bigint> {
    return hexToBigInt(await this.rpc.request<Hex>("eth_gasPrice", []));
  }

  async getFeeHistory(blockCount = 5, blockTag: GhostBlockTag = "latest", percentiles: number[] = [50]) {
    return this.rpc.request<{
      oldestBlock: Hex;
      baseFeePerGas: Hex[];
      gasUsedRatio: number[];
      reward?: Hex[][];
    }>("eth_feeHistory", [bigIntToHex(BigInt(blockCount)), blockTag, percentiles]);
  }
}
