import { GhostJsonRpc } from "../rpc/GhostJsonRpc";
import type {
  GhostBlock,
  GhostTransactionReceipt,
  GhostTransactionRequest,
  GhostCallOverride
} from "../types";

export class GhostProvider {
  readonly rpc: GhostJsonRpc;

  constructor(url: string, options: { timeoutMs?: number } = {}) {
    this.rpc = new GhostJsonRpc(url, options);
  }

  async getBlockNumber(): Promise<number> {
    const hex = await this.rpc.request<string>("eth_blockNumber");
    return parseInt(hex, 16);
  }

  async getBalance(address: string, tag = "latest"): Promise<bigint> {
    const hex = await this.rpc.request<string>("eth_getBalance", [address, tag]);
    return BigInt(hex);
  }

  async getTransactionCount(address: string, tag = "latest"): Promise<number> {
    const hex = await this.rpc.request<string>("eth_getTransactionCount", [address, tag]);
    return parseInt(hex, 16);
  }

  async getGasPrice(): Promise<bigint> {
    const hex = await this.rpc.request<string>("eth_gasPrice");
    return BigInt(hex);
  }

  async getBlock(blockHashOrNumber: string | number | "latest"): Promise<GhostBlock> {
    const param =
      typeof blockHashOrNumber === "number"
        ? "0x" + blockHashOrNumber.toString(16)
        : blockHashOrNumber;
    return this.rpc.request<GhostBlock>("eth_getBlockByNumber", [param, false]);
  }

  async getTransactionReceipt(txHash: string): Promise<GhostTransactionReceipt | null> {
    return this.rpc.request<GhostTransactionReceipt | null>("eth_getTransactionReceipt", [txHash]);
  }

  async sendRawTransaction(tx: string): Promise<string> {
    return this.rpc.request<string>("eth_sendRawTransaction", [tx]);
  }

  async call(override: GhostCallOverride, tag = "latest"): Promise<string> {
    return this.rpc.request<string>("eth_call", [override, tag]);
  }

  async estimateGas(tx: GhostTransactionRequest): Promise<bigint> {
    const hex = await this.rpc.request<string>("eth_estimateGas", [tx]);
    return BigInt(hex);
  }

  async getChainId(): Promise<number> {
    const hex = await this.rpc.request<string>("eth_chainId");
    return parseInt(hex, 16);
  }

  async getCode(address: string, tag = "latest"): Promise<string> {
    return this.rpc.request<string>("eth_getCode", [address, tag]);
  }

  async getLogs(filter: {
    fromBlock?: string | number;
    toBlock?: string | number;
    address?: string | string[];
    topics?: (string | string[] | null)[];
  }) {
    return this.rpc.request("eth_getLogs", [filter]);
  }

  // ─── ghost_ branded namespace ────────────────────────────────────────────
  // GhostChain exposes a `ghost_*` RPC namespace (routed via ghost-rpc-proxy).
  // These methods are the canonical SDK surface; the underlying wire call uses
  // the `ghost_` prefix which the proxy translates to `eth_*` where needed.

  /** @alias ghost_getBalance */
  async ghost_getBalance(address: string, tag = "latest"): Promise<bigint> {
    try {
      const hex = await this.rpc.request<string>("ghost_getBalance", [address, tag]);
      return BigInt(hex);
    } catch {
      // Fallback: node may not have ghost_ prefix — use eth_ transparently
      return this.getBalance(address, tag);
    }
  }

  /** @alias ghost_blockNumber */
  async ghost_blockNumber(): Promise<number> {
    try {
      const hex = await this.rpc.request<string>("ghost_blockNumber");
      return parseInt(hex, 16);
    } catch {
      return this.getBlockNumber();
    }
  }

  /** @alias ghost_sendRawTransaction */
  async ghost_sendRawTransaction(tx: string): Promise<string> {
    try {
      return await this.rpc.request<string>("ghost_sendRawTransaction", [tx]);
    } catch {
      return this.sendRawTransaction(tx);
    }
  }

  /** @alias ghost_call */
  async ghost_call(override: GhostCallOverride, tag = "latest"): Promise<string> {
    try {
      return await this.rpc.request<string>("ghost_call", [override, tag]);
    } catch {
      return this.call(override, tag);
    }
  }

  /** @alias ghost_estimateGas */
  async ghost_estimateGas(tx: GhostTransactionRequest): Promise<bigint> {
    try {
      const hex = await this.rpc.request<string>("ghost_estimateGas", [tx]);
      return BigInt(hex);
    } catch {
      return this.estimateGas(tx);
    }
  }

  /** @alias ghost_chainId */
  async ghost_chainId(): Promise<number> {
    try {
      const hex = await this.rpc.request<string>("ghost_chainId");
      return parseInt(hex, 16);
    } catch {
      return this.getChainId();
    }
  }

  /** @alias ghost_getLogs */
  async ghost_getLogs(filter: {
    fromBlock?: string | number;
    toBlock?: string | number;
    address?: string | string[];
    topics?: (string | string[] | null)[];
  }) {
    try {
      return await this.rpc.request("ghost_getLogs", [filter]);
    } catch {
      return this.getLogs(filter);
    }
  }

  /**
   * ghost_getNodeInfo — GhostChain-specific: returns node identity, layer, and chain metadata.
   * Falls back to `ghost_nodeInfo` or `web3_clientVersion` if unavailable.
   */
  async ghost_getNodeInfo(): Promise<{ chainId: number; layer: string; version: string } | null> {
    try {
      return await this.rpc.request<{ chainId: number; layer: string; version: string }>("ghost_getNodeInfo");
    } catch {
      return null;
    }
  }
}
