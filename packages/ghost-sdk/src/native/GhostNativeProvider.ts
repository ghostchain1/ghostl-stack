import type {
  GhostAddress,
  GhostBlockTag,
  GhostCallRequest,
  GhostFeeSuggestion,
  GhostLogFilter,
  GhostProviderOptions,
  GhostTxReceipt,
  GhostTxRequest,
  Hex,
  GhostChainId,
} from "./types.js";
import { GhostJsonRpc } from "./GhostJsonRpc.js";
import { bigIntToHex, hexToBigInt } from "./hex.js";
import { GhostTxError, GhostValidationError } from "../errors/GhostErrors.js";
import { normalizeAddress } from "./address.js";
import { GhostNativeGasEngine } from "./GhostNativeGasEngine.js";

/**
 * GhostNativeProvider — high-level GhostChain provider with zero ghost-sdk dependency.
 *
 * ```ts
 * const provider = new GhostNativeProvider({ rpcUrl: "http://localhost:18545" });
 * const bal = await provider.getBalance("0xABC...");
 * ```
 */
export class GhostNativeProvider {
  public readonly rpc: GhostJsonRpc;
  public readonly gas: GhostNativeGasEngine;

  constructor(opts: GhostProviderOptions) {
    this.rpc = new GhostJsonRpc(opts.rpcUrl, {
      timeoutMs: opts.timeoutMs,
      headers: opts.headers,
    });
    this.gas = new GhostNativeGasEngine(this);
  }

  async getChainId(): Promise<GhostChainId> {
    const idHex = await this.rpc.request<Hex>("eth_chainId", []);
    return Number(hexToBigInt(idHex));
  }

  async getBlockNumber(): Promise<bigint> {
    return hexToBigInt(await this.rpc.request<Hex>("eth_blockNumber", []));
  }

  async getBalance(address: GhostAddress, tag: GhostBlockTag = "latest"): Promise<bigint> {
    return hexToBigInt(await this.rpc.request<Hex>("eth_getBalance", [normalizeAddress(address), tag]));
  }

  async getTransactionCount(address: GhostAddress, tag: GhostBlockTag = "latest"): Promise<number> {
    const n = await this.rpc.request<Hex>("eth_getTransactionCount", [normalizeAddress(address), tag]);
    return Number(hexToBigInt(n));
  }

  async call(req: GhostCallRequest, tag: GhostBlockTag = "latest"): Promise<Hex> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: Record<string, any> = { to: normalizeAddress(req.to), data: req.data };
    if (req.from) params.from = normalizeAddress(req.from);
    if (req.value !== undefined) params.value = bigIntToHex(req.value);
    return this.rpc.request<Hex>("eth_call", [params, tag]);
  }

  async estimateGas(tx: GhostTxRequest): Promise<bigint> {
    return hexToBigInt(await this.rpc.request<Hex>("eth_estimateGas", [this._txToRpc(tx)]));
  }

  async getFeeSuggestion(): Promise<GhostFeeSuggestion> {
    return this.gas.suggestFees();
  }

  async sendRawTransaction(rawTx: Hex): Promise<Hex> {
    return this.rpc.request<Hex>("eth_sendRawTransaction", [rawTx]);
  }

  async getTransactionReceipt(hash: Hex): Promise<GhostTxReceipt | null> {
    return this.rpc.request<GhostTxReceipt | null>("eth_getTransactionReceipt", [hash]);
  }

  async waitForReceipt(hash: Hex, confirmations = 1, pollMs = 1000): Promise<GhostTxReceipt> {
    const start = Date.now();
    for (;;) {
      const r = await this.getTransactionReceipt(hash);
      if (r?.blockNumber) {
        if (confirmations <= 1) return r;
        const tip = await this.getBlockNumber();
        if (tip - hexToBigInt(r.blockNumber) + 1n >= BigInt(confirmations)) return r;
      }
      if (Date.now() - start > 180_000) throw new GhostTxError("Timeout waiting for receipt");
      await new Promise((res) => setTimeout(res, pollMs));
    }
  }

  async getLogs(filter: GhostLogFilter): Promise<unknown[]> {
    return this.rpc.request<unknown[]>("eth_getLogs", [filter]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _txToRpc(tx: GhostTxRequest): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: Record<string, any> = {};
    if (tx.from) p.from = normalizeAddress(tx.from);
    if (tx.to) p.to = normalizeAddress(tx.to);
    if (tx.data) p.data = tx.data;
    if (tx.value !== undefined) p.value = bigIntToHex(tx.value);
    if (tx.nonce !== undefined) p.nonce = bigIntToHex(BigInt(tx.nonce));
    if (tx.gasLimit !== undefined) p.gas = bigIntToHex(tx.gasLimit);
    if (tx.maxFeePerGas !== undefined) p.maxFeePerGas = bigIntToHex(tx.maxFeePerGas);
    if (tx.maxPriorityFeePerGas !== undefined) p.maxPriorityFeePerGas = bigIntToHex(tx.maxPriorityFeePerGas);
    if (tx.gasPrice !== undefined && tx.maxFeePerGas === undefined) p.gasPrice = bigIntToHex(tx.gasPrice);
    if (tx.accessList) p.accessList = tx.accessList;
    return p;
  }

  assertTxReady(tx: GhostTxRequest): void {
    if (!tx.to && !tx.data) throw new GhostValidationError("Tx must include to or data");
  }
}
