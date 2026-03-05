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
}
