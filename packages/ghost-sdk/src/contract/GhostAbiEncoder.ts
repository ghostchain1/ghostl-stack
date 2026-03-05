/**
 * GhostAbiEncoder
 *
 * High-level ABI encoding helpers for GhostStack transactions.
 * Wraps the low-level `native/abi.ts` with a friendlier, strongly-typed API.
 *
 * Supports:
 *   - Function call encoding (selector + params)
 *   - Typed parameter encoding without a function selector
 *   - ERC / GRC20 standard call shortcuts
 *
 * Usage:
 *   const encoder = new GhostAbiEncoder();
 *   const data = encoder.encodeCall("transfer(address,uint256)", [
 *     { type: "address", value: "0xabc..." },
 *     { type: "uint256", value: 1000n },
 *   ]);
 */

import { encodeCall, functionSelector } from "../native/abi.js";
import type { Hex, GhostAddress } from "../native/types.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AbiParamType = "address" | "uint256" | "bool" | "bytes" | "bytes32" | "string";

export interface AbiParam {
  type:  AbiParamType;
  value: unknown;
}

// ── GhostAbiEncoder ────────────────────────────────────────────────────────────

export class GhostAbiEncoder {

  /**
   * Encode a full function call (4-byte selector + ABI-encoded params).
   *
   * @param signature  - e.g. "transfer(address,uint256)"
   * @param params     - ordered list of typed parameter objects
   */
  encodeCall(signature: string, params: AbiParam[]): Hex {
    const types  = params.map((p) => p.type);
    const values = params.map((p) => p.value);
    return encodeCall(signature, types, values);
  }

  /**
   * Compute only the 4-byte function selector.
   *
   * @param signature - e.g. "balanceOf(address)"
   */
  selector(signature: string): Hex {
    return functionSelector(signature);
  }

  // ── GRC20 / ERC20 shortcuts ─────────────────────────────────────────────────

  /** `transfer(address,uint256)` calldata */
  grc20Transfer(to: GhostAddress, amount: bigint): Hex {
    return this.encodeCall("transfer(address,uint256)", [
      { type: "address", value: to },
      { type: "uint256", value: amount },
    ]);
  }

  /** `transferFrom(address,address,uint256)` calldata */
  grc20TransferFrom(from: GhostAddress, to: GhostAddress, amount: bigint): Hex {
    return this.encodeCall("transferFrom(address,address,uint256)", [
      { type: "address", value: from },
      { type: "address", value: to },
      { type: "uint256", value: amount },
    ]);
  }

  /** `approve(address,uint256)` calldata */
  grc20Approve(spender: GhostAddress, amount: bigint): Hex {
    return this.encodeCall("approve(address,uint256)", [
      { type: "address", value: spender },
      { type: "uint256", value: amount },
    ]);
  }

  /** `balanceOf(address)` calldata */
  grc20BalanceOf(account: GhostAddress): Hex {
    return this.encodeCall("balanceOf(address)", [
      { type: "address", value: account },
    ]);
  }

  /** `allowance(address,address)` calldata */
  grc20Allowance(owner: GhostAddress, spender: GhostAddress): Hex {
    return this.encodeCall("allowance(address,address)", [
      { type: "address", value: owner },
      { type: "address", value: spender },
    ]);
  }

  // ── GRC721 shortcuts ────────────────────────────────────────────────────────

  /** `ownerOf(uint256)` calldata */
  grc721OwnerOf(tokenId: bigint): Hex {
    return this.encodeCall("ownerOf(uint256)", [
      { type: "uint256", value: tokenId },
    ]);
  }

  /** `safeTransferFrom(address,address,uint256)` calldata */
  grc721SafeTransferFrom(from: GhostAddress, to: GhostAddress, tokenId: bigint): Hex {
    return this.encodeCall("safeTransferFrom(address,address,uint256)", [
      { type: "address", value: from },
      { type: "address", value: to },
      { type: "uint256", value: tokenId },
    ]);
  }
}

/** Default singleton instance */
export const ghostAbiEncoder = new GhostAbiEncoder();
