/**
 * GhostERC1155 — typed ERC-1155 multi-token client for GhostChain.
 *
 * Pure HttpProvider implementation — zero ethers dependency.
 */

import type { GhostAddress, Hex } from "../native/types.js";
import type { HttpProvider } from "../providers/HttpProvider.js";
import { encodeCall, functionSelector } from "../native/abi.js";
import { decodeUint256, decodeString, decodeBool, decodeReturnData } from "../abi/GhostAbi.js";
import { assertAddress } from "../native/address.js";
import { add0x, strip0x } from "../native/hex.js";
import { hexToBytes, bytesToHex } from "../native/bytes.js";
import { keccak256Raw } from "../hash/GhostHash.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostERC1155TransferSingleEvent {
  operator: GhostAddress;
  from: GhostAddress;
  to: GhostAddress;
  id: bigint;
  value: bigint;
  transactionHash: Hex;
  blockNumber: bigint;
}

export interface GhostERC1155TransferBatchEvent {
  operator: GhostAddress;
  from: GhostAddress;
  to: GhostAddress;
  ids: bigint[];
  values: bigint[];
  transactionHash: Hex;
  blockNumber: bigint;
}

// ── GhostERC1155 ──────────────────────────────────────────────────────────────

/**
 * GhostERC1155 — a typed, non-ethers ERC-1155 client.
 *
 * ```ts
 * const multi = new GhostERC1155(provider, contractAddress);
 * const bal   = await multi.balanceOf(account, tokenId);
 * const uri   = await multi.uri(tokenId);
 * ```
 */
export class GhostERC1155 {
  constructor(
    private readonly provider: HttpProvider,
    public readonly address: GhostAddress,
  ) {
    assertAddress(address, "ERC-1155 address");
  }

  private async ethCall(data: Hex, blockTag = "latest"): Promise<Hex> {
    return this.provider.call({ to: this.address, data }, blockTag as "latest");
  }

  // ── ERC-1155 reads ─────────────────────────────────────────────────────────

  /** ERC-1155: balanceOf(address,uint256) → uint256. */
  async balanceOf(account: GhostAddress, id: bigint): Promise<bigint> {
    assertAddress(account, "account");
    const data = encodeCall("balanceOf(address,uint256)", ["address", "uint256"], [account, id]);
    return decodeUint256(await this.ethCall(data));
  }

  /** ERC-1155: uri(uint256) → string. */
  async uri(id: bigint): Promise<string> {
    const data = encodeCall("uri(uint256)", ["uint256"], [id]);
    return decodeString(await this.ethCall(data));
  }

  /** ERC-1155: isApprovedForAll(address,address) → bool. */
  async isApprovedForAll(owner: GhostAddress, operator: GhostAddress): Promise<boolean> {
    assertAddress(owner, "owner");
    assertAddress(operator, "operator");
    const data = encodeCall("isApprovedForAll(address,address)", ["address", "address"], [owner, operator]);
    return decodeBool(await this.ethCall(data));
  }

  /** ERC-165: supportsInterface(bytes4) → bool. */
  async supportsInterface(interfaceId: Hex): Promise<boolean> {
    const sel = functionSelector("supportsInterface(bytes4)");
    // Encode bytes4 as selector + padded argument
    const arg = strip0x(interfaceId).padStart(64, "0");
    const hexConcat = add0x(strip0x(sel) + arg);
    return decodeBool(await this.ethCall(hexConcat));
  }

  // ── Write calldata builders ────────────────────────────────────────────────

  /** Build calldata for safeTransferFrom(address,address,uint256,uint256,bytes). */
  encodeSafeTransferFrom(
    from: GhostAddress,
    to: GhostAddress,
    id: bigint,
    amount: bigint,
  ): Hex {
    // Encode without the bytes parameter (empty bytes = 0x)
    // Full encoding would be complex; we use static portion only
    const sel = strip0x(functionSelector("safeTransferFrom(address,address,uint256,uint256,bytes)"));
    const fromPad = strip0x(from).toLowerCase().padStart(64, "0");
    const toPad = strip0x(to).toLowerCase().padStart(64, "0");
    const idPad = id.toString(16).padStart(64, "0");
    const amtPad = amount.toString(16).padStart(64, "0");
    // bytes offset = 160 (5 * 32), length = 0, no data
    const offset = "00000000000000000000000000000000000000000000000000000000000000a0";
    const len0 = "0000000000000000000000000000000000000000000000000000000000000000";
    return add0x(sel + fromPad + toPad + idPad + amtPad + offset + len0);
  }

  /** Build calldata for setApprovalForAll(address,bool). */
  encodeSetApprovalForAll(operator: GhostAddress, approved: boolean): Hex {
    return encodeCall("setApprovalForAll(address,bool)", ["address", "bool"], [operator, approved]);
  }

  // ── Logs ───────────────────────────────────────────────────────────────────

  /** Fetch TransferSingle events in a block range. */
  async getTransferSingleEvents(
    fromBlock: string | bigint = "earliest",
    toBlock: string | bigint = "latest",
  ): Promise<GhostERC1155TransferSingleEvent[]> {
    const TOPIC = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
    const logs = await this.provider.getLogs({
      address: this.address,
      topics: [TOPIC as Hex],
      fromBlock: typeof fromBlock === "bigint" ? add0x(fromBlock.toString(16)) : fromBlock as "latest",
      toBlock: typeof toBlock === "bigint" ? add0x(toBlock.toString(16)) : toBlock as "latest",
    });

    return logs.map((log) => {
      const [id, value] = decodeReturnData(log.data, ["uint256", "uint256"]) as [bigint, bigint];
      return {
        operator: (`0x${log.topics[1]!.slice(-40)}`) as GhostAddress,
        from: (`0x${log.topics[2]!.slice(-40)}`) as GhostAddress,
        to: (`0x${log.topics[3]!.slice(-40)}`) as GhostAddress,
        id,
        value,
        transactionHash: log.transactionHash,
        blockNumber: BigInt(log.blockNumber),
      };
    });
  }
}
