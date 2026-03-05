/**
 * GhostRPC — Ghost-native JSON-RPC namespace
 *
 * Exposes a `ghost_*` method surface over a standard EVM node.
 * Underneath, methods are dispatched to the underlying `eth_*` RPC calls
 * so any EVM-compatible node (Anvil, Geth, OP-Geth) works as a backend.
 *
 * Usage:
 *   const rpc = new GhostRPC("http://localhost:18545");
 *   const balance = await rpc.ghost_getBalance("0xABCD...", "latest");
 *   const hash    = await rpc.ghost_sendRawTransaction("0x02...");
 */

import { GhostJsonRpc } from "./GhostJsonRpc";
import {
  GhostNetworkRegistry,
  ChainLayer,
  type GhostNetwork,
} from "../registry/GhostNetworkRegistry";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostRpcBlock {
  ghostHash: string;        // ≡ eth blockHash
  ghostNumber: string;      // ≡ eth blockNumber (hex)
  ghostTimestamp: string;   // ≡ eth timestamp (hex)
  ghostParentHash: string;
  miner: string;
  gasLimit: string;
  gasUsed: string;
  transactions: string[] | GhostRpcTransaction[];
  extraData: string;
}

export interface GhostRpcTransaction {
  ghostHash: string;        // ≡ eth transactionHash
  ghostBlockHash: string;
  ghostBlockNumber: string;
  ghostIndex: string;       // ≡ eth transactionIndex
  from: string;
  to: string | null;
  value: string;
  gas: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce: string;
  input: string;
  chainId: string;
}

export interface GhostRpcReceipt {
  ghostHash: string;
  ghostBlockHash: string;
  ghostBlockNumber: string;
  ghostIndex: string;
  from: string;
  to: string | null;
  status: string;           // "0x1" success | "0x0" revert
  gasUsed: string;
  cumulativeGasUsed: string;
  contractAddress: string | null;
  logs: GhostRpcLog[];
  logsBloom: string;
}

export interface GhostRpcLog {
  address: string;
  topics: string[];
  data: string;
  ghostBlockNumber: string;
  ghostTxHash: string;
  ghostTxIndex: string;
  ghostBlockHash: string;
  ghostLogIndex: string;
  removed: boolean;
}

export interface GhostFeeData {
  ghostGasPrice: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface GhostChainInfo {
  name: string;
  layer: ChainLayer;
  chainId: number;
  rpcUrl: string;
  token: string;
  explorer: string;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function mapBlock(raw: Record<string, unknown>): GhostRpcBlock {
  return {
    ghostHash:       raw["hash"]       as string,
    ghostNumber:     raw["number"]     as string,
    ghostTimestamp:  raw["timestamp"]  as string,
    ghostParentHash: raw["parentHash"] as string,
    miner:           raw["miner"]      as string,
    gasLimit:        raw["gasLimit"]   as string,
    gasUsed:         raw["gasUsed"]    as string,
    transactions:    raw["transactions"] as string[],
    extraData:       raw["extraData"]  as string,
  };
}

function mapReceipt(raw: Record<string, unknown>): GhostRpcReceipt {
  return {
    ghostHash:        raw["transactionHash"]  as string,
    ghostBlockHash:   raw["blockHash"]        as string,
    ghostBlockNumber: raw["blockNumber"]      as string,
    ghostIndex:       raw["transactionIndex"] as string,
    from:             raw["from"]             as string,
    to:               raw["to"]              as string | null,
    status:           raw["status"]           as string,
    gasUsed:          raw["gasUsed"]          as string,
    cumulativeGasUsed: raw["cumulativeGasUsed"] as string,
    contractAddress:  raw["contractAddress"]  as string | null,
    logs:             ((raw["logs"] ?? []) as Record<string, unknown>[]).map(mapLog),
    logsBloom:        raw["logsBloom"]        as string,
  };
}

function mapLog(raw: Record<string, unknown>): GhostRpcLog {
  return {
    address:          raw["address"]          as string,
    topics:           raw["topics"]           as string[],
    data:             raw["data"]             as string,
    ghostBlockNumber: raw["blockNumber"]      as string,
    ghostTxHash:      raw["transactionHash"]  as string,
    ghostTxIndex:     raw["transactionIndex"] as string,
    ghostBlockHash:   raw["blockHash"]        as string,
    ghostLogIndex:    raw["logIndex"]         as string,
    removed:          raw["removed"]          as boolean,
  };
}

// ── GhostRPC ─────────────────────────────────────────────────────────────────

/**
 * Ghost-native JSON-RPC client.
 *
 * All public methods use `ghost_*` naming; internally they call the EVM
 * JSON-RPC `eth_*` methods supported by any OP-Stack or Geth node.
 */
export class GhostRPC {
  private rpc: GhostJsonRpc;

  constructor(rpcUrl: string, options: { timeoutMs?: number } = {}) {
    this.rpc = new GhostJsonRpc(rpcUrl, options);
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static forL1(opts?: { timeoutMs?: number }): GhostRPC {
    return new GhostRPC(GhostNetworkRegistry.get(ChainLayer.L1).rpcUrl, opts);
  }

  static forL2(opts?: { timeoutMs?: number }): GhostRPC {
    return new GhostRPC(GhostNetworkRegistry.get(ChainLayer.L2).rpcUrl, opts);
  }

  static forL3(opts?: { timeoutMs?: number }): GhostRPC {
    return new GhostRPC(GhostNetworkRegistry.get(ChainLayer.L3).rpcUrl, opts);
  }

  static forNetwork(net: GhostNetwork, opts?: { timeoutMs?: number }): GhostRPC {
    return new GhostRPC(net.rpcUrl, opts);
  }

  // ── Chain info ────────────────────────────────────────────────────────────

  /** ghost_chainId → eth_chainId */
  async ghost_chainId(): Promise<number> {
    const hex = await this.rpc.request<string>("eth_chainId");
    return Number(hex);
  }

  /** ghost_chainInfo → combined chain metadata */
  async ghost_chainInfo(layer: ChainLayer = ChainLayer.L1): Promise<GhostChainInfo> {
    const net = GhostNetworkRegistry.get(layer);
    const chainId = await this.ghost_chainId();
    return {
      name:     net.name,
      layer:    net.layer,
      chainId,
      rpcUrl:   net.rpcUrl,
      token:    net.nativeCurrency.symbol,
      explorer: net.blockExplorerUrl ?? "",
    };
  }

  // ── Block queries ─────────────────────────────────────────────────────────

  /** ghost_blockNumber → eth_blockNumber */
  async ghost_blockNumber(): Promise<number> {
    const hex = await this.rpc.request<string>("eth_blockNumber");
    return Number(hex);
  }

  /** ghost_getBlockByNumber → eth_getBlockByNumber */
  async ghost_getBlockByNumber(
    blockTag: string | number = "latest",
    fullTx = false
  ): Promise<GhostRpcBlock | null> {
    const tag = typeof blockTag === "number"
      ? "0x" + blockTag.toString(16)
      : blockTag;
    const raw = await this.rpc.request<Record<string, unknown> | null>(
      "eth_getBlockByNumber", [tag, fullTx]
    );
    return raw ? mapBlock(raw) : null;
  }

  /** ghost_getBlockByHash → eth_getBlockByHash */
  async ghost_getBlockByHash(
    hashHex: string,
    fullTx = false
  ): Promise<GhostRpcBlock | null> {
    const raw = await this.rpc.request<Record<string, unknown> | null>(
      "eth_getBlockByHash", [hashHex, fullTx]
    );
    return raw ? mapBlock(raw) : null;
  }

  // ── Account queries ──────────────────────────────────────────────────────

  /** ghost_getBalance → eth_getBalance — returns bigint GhostWei */
  async ghost_getBalance(address: string, blockTag = "latest"): Promise<bigint> {
    const hex = await this.rpc.request<string>("eth_getBalance", [address, blockTag]);
    return BigInt(hex);
  }

  /** ghost_getNonce → eth_getTransactionCount */
  async ghost_getNonce(address: string, blockTag = "latest"): Promise<number> {
    const hex = await this.rpc.request<string>("eth_getTransactionCount", [address, blockTag]);
    return Number(hex);
  }

  /** ghost_getCode → eth_getCode */
  async ghost_getCode(address: string, blockTag = "latest"): Promise<string> {
    return this.rpc.request<string>("eth_getCode", [address, blockTag]);
  }

  /** ghost_getStorageAt → eth_getStorageAt */
  async ghost_getStorageAt(address: string, slot: string, blockTag = "latest"): Promise<string> {
    return this.rpc.request<string>("eth_getStorageAt", [address, slot, blockTag]);
  }

  // ── Transaction queries ──────────────────────────────────────────────────

  /** ghost_getTransaction → eth_getTransactionByHash */
  async ghost_getTransaction(txHash: string): Promise<GhostRpcTransaction | null> {
    const raw = await this.rpc.request<Record<string, unknown> | null>(
      "eth_getTransactionByHash", [txHash]
    );
    if (!raw) return null;
    return {
      ghostHash:        raw["hash"]             as string,
      ghostBlockHash:   raw["blockHash"]        as string,
      ghostBlockNumber: raw["blockNumber"]      as string,
      ghostIndex:       raw["transactionIndex"] as string,
      from:             raw["from"]             as string,
      to:               raw["to"]              as string | null,
      value:            raw["value"]            as string,
      gas:              raw["gas"]              as string,
      maxFeePerGas:     raw["maxFeePerGas"]     as string | undefined,
      maxPriorityFeePerGas: raw["maxPriorityFeePerGas"] as string | undefined,
      nonce:            raw["nonce"]            as string,
      input:            raw["input"]            as string,
      chainId:          raw["chainId"]          as string,
    };
  }

  /** ghost_getTransactionReceipt → eth_getTransactionReceipt */
  async ghost_getTransactionReceipt(txHash: string): Promise<GhostRpcReceipt | null> {
    const raw = await this.rpc.request<Record<string, unknown> | null>(
      "eth_getTransactionReceipt", [txHash]
    );
    return raw ? mapReceipt(raw) : null;
  }

  // ── Send / call ──────────────────────────────────────────────────────────

  /** ghost_sendRawTransaction → eth_sendRawTransaction */
  async ghost_sendRawTransaction(signedTxHex: string): Promise<string> {
    return this.rpc.request<string>("eth_sendRawTransaction", [signedTxHex]);
  }

  /** ghost_call → eth_call */
  async ghost_call(
    tx: { to?: string; from?: string; data?: string; value?: string },
    blockTag = "latest"
  ): Promise<string> {
    return this.rpc.request<string>("eth_call", [tx, blockTag]);
  }

  /** ghost_estimateGas → eth_estimateGas */
  async ghost_estimateGas(
    tx: { to?: string; from?: string; data?: string; value?: string }
  ): Promise<bigint> {
    const hex = await this.rpc.request<string>("eth_estimateGas", [tx]);
    return BigInt(hex);
  }

  // ── Fee data ──────────────────────────────────────────────────────────────

  /** ghost_getGasPrice → eth_gasPrice */
  async ghost_getGasPrice(): Promise<bigint> {
    const hex = await this.rpc.request<string>("eth_gasPrice");
    return BigInt(hex);
  }

  /** ghost_getFeeData → eth_feeHistory / eth_maxPriorityFeePerGas */
  async ghost_getFeeData(): Promise<GhostFeeData> {
    const [gasPriceHex, prioHex] = await Promise.all([
      this.rpc.request<string>("eth_gasPrice"),
      this.rpc.request<string>("eth_maxPriorityFeePerGas").catch(() => "0x0"),
    ]);
    const gasPrice = BigInt(gasPriceHex);
    const prio     = BigInt(prioHex);
    return {
      ghostGasPrice:        gasPrice,
      maxFeePerGas:         gasPrice + prio,
      maxPriorityFeePerGas: prio,
    };
  }

  // ── Log queries ──────────────────────────────────────────────────────────

  /** ghost_getLogs → eth_getLogs */
  async ghost_getLogs(filter: {
    fromBlock?: string | number;
    toBlock?:   string | number;
    address?:   string | string[];
    topics?:    (string | string[] | null)[];
  }): Promise<GhostRpcLog[]> {
    const rpcFilter: Record<string, unknown> = {};
    if (filter.fromBlock !== undefined)
      rpcFilter["fromBlock"] = typeof filter.fromBlock === "number"
        ? "0x" + filter.fromBlock.toString(16) : filter.fromBlock;
    if (filter.toBlock !== undefined)
      rpcFilter["toBlock"] = typeof filter.toBlock === "number"
        ? "0x" + filter.toBlock.toString(16) : filter.toBlock;
    if (filter.address !== undefined) rpcFilter["address"] = filter.address;
    if (filter.topics  !== undefined) rpcFilter["topics"]  = filter.topics;

    const raws = await this.rpc.request<Record<string, unknown>[]>("eth_getLogs", [rpcFilter]);
    return (raws.map(mapLog) as GhostRpcLog[]);
  }

  // ── Raw escape hatch ─────────────────────────────────────────────────────

  /**
   * ghost_raw — call any underlying JSON-RPC method by its EVM name.
   * Use this only when no `ghost_*` method covers your use case.
   */
  async ghost_raw<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    return this.rpc.request<T>(method, params);
  }
}
