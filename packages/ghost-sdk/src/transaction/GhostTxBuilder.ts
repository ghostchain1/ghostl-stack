/**
 * GhostTxBuilder
 *
 * Fluent builder for GhostTxRequest objects.
 *
 * Provides a clear, chainable API for constructing transactions
 * without needing to know the exact shape of GhostTxRequest.
 *
 * Usage:
 *   const tx = new GhostTxBuilder()
 *     .to("0xabcd...")
 *     .value(1_000_000n)
 *     .data("0x")
 *     .gas(21000n)
 *     .maxFee(1000n)
 *     .priorityFee(100n)
 *     .build();
 *
 *   // Or from a contract call:
 *   const callTx = GhostTxBuilder.call(encoder.grc20Transfer(to, amount))
 *     .to(contractAddress)
 *     .build();
 */

import type { GhostTxRequest, GhostAddress, Hex, GhostFeeSuggestion } from "../native/types.js";
import type { GhostLayer } from "../networks.js";
import { GhostNetworks } from "../networks.js";

// ── GhostTxBuilder ─────────────────────────────────────────────────────────────

export class GhostTxBuilder {
  private _tx: GhostTxRequest = {};

  // ── Static factories ───────────────────────────────────────────────────────

  /** Start building a plain ETH/GST transfer. */
  static transfer(to: GhostAddress, amount: bigint): GhostTxBuilder {
    return new GhostTxBuilder().to(to).value(amount);
  }

  /** Start building a contract call. */
  static call(calldata: Hex): GhostTxBuilder {
    return new GhostTxBuilder().data(calldata);
  }

  /** Start from an existing partial tx. */
  static from(partial: GhostTxRequest): GhostTxBuilder {
    const b = new GhostTxBuilder();
    b._tx = { ...partial };
    return b;
  }

  // ── Chainable setters ──────────────────────────────────────────────────────

  from(address: GhostAddress): this   { this._tx.from    = address;  return this; }
  to(address: GhostAddress): this     { this._tx.to      = address;  return this; }
  value(wei: bigint): this            { this._tx.value   = wei;      return this; }
  data(hex: Hex): this                { this._tx.data    = hex;      return this; }
  nonce(n: number): this              { this._tx.nonce   = n;        return this; }
  gas(limit: bigint): this            { this._tx.gasLimit = limit;   return this; }
  gasLimit(limit: bigint): this       { return this.gas(limit); }

  /** Set EIP-1559 maxFeePerGas in wei. */
  maxFee(wei: bigint): this           { this._tx.maxFeePerGas = wei;          return this; }
  /** Set EIP-1559 maxPriorityFeePerGas in wei. */
  priorityFee(wei: bigint): this      { this._tx.maxPriorityFeePerGas = wei; return this; }
  /** Set legacy gasPrice (for non-EIP-1559 chains). */
  gasPrice(wei: bigint): this         { this._tx.gasPrice = wei;     return this; }

  /** Apply a GhostFeeSuggestion (from GhostGasOracle or AI optimizer). */
  fees(suggestion: GhostFeeSuggestion): this {
    this._tx.maxFeePerGas         = suggestion.maxFeePerGas;
    this._tx.maxPriorityFeePerGas = suggestion.maxPriorityFeePerGas;
    return this;
  }

  /** Set the chainId from a target layer. */
  layer(l: GhostLayer): this {
    this._tx.chainId = GhostNetworks[l].chainId as import("../native/types.js").GhostChainId;
    return this;
  }

  /** Set the chainId directly. */
  chainId(id: number): this {
    this._tx.chainId = id as import("../native/types.js").GhostChainId;
    return this;
  }

  // ── Terminal operations ────────────────────────────────────────────────────

  /** Produce the final GhostTxRequest object. */
  build(): GhostTxRequest {
    return { ...this._tx };
  }

  /** Clone this builder (for reuse / fork). */
  clone(): GhostTxBuilder {
    return GhostTxBuilder.from(this.build());
  }

  /** Return a JSON-serialisable representation (bigints as hex strings). */
  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this._tx)) {
      out[k] = typeof v === "bigint" ? `0x${v.toString(16)}` : v;
    }
    return out;
  }
}
