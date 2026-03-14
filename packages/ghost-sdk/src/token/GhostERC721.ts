/**
 * GhostERC721 — typed ERC-721 NFT client for GhostChain.
 *
 * Pure HttpProvider implementation — zero ethers dependency.
 */

import type { GhostAddress, Hex } from "../native/types.js";
import type { HttpProvider } from "../providers/HttpProvider.js";
import { encodeCall, functionSelector } from "../native/abi.js";
import { decodeUint256, decodeAddress, decodeString, decodeBool } from "../abi/GhostAbi.js";
import { assertAddress } from "../native/address.js";
import { add0x, strip0x, padHex } from "../native/hex.js";
import { bytesToHex, hexToBytes } from "../native/bytes.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GhostERC721Info {
  name: string;
  symbol: string;
  totalSupply?: bigint;
}

export interface GhostERC721TransferEvent {
  from: GhostAddress;
  to: GhostAddress;
  tokenId: bigint;
  transactionHash: Hex;
  blockNumber: bigint;
}

// ── GhostERC721 ───────────────────────────────────────────────────────────────

/**
 * GhostERC721 — a typed, non-ethers ERC-721 client.
 *
 * ```ts
 * const nft   = new GhostERC721(provider, nftAddress);
 * const owner = await nft.ownerOf(tokenId);
 * const uri   = await nft.tokenURI(tokenId);
 * ```
 */
export class GhostERC721 {
  constructor(
    private readonly provider: HttpProvider,
    public readonly address: GhostAddress,
  ) {
    assertAddress(address, "NFT address");
  }

  private async ethCall(data: Hex, blockTag = "latest"): Promise<Hex> {
    return this.provider.call({ to: this.address, data }, blockTag as "latest");
  }

  private encodeTokenId(tokenId: bigint): Hex {
    return padHex(add0x(tokenId.toString(16)), 32);
  }

  // ── ERC-721 reads ──────────────────────────────────────────────────────────

  /** ERC-721: balanceOf(address) → uint256. */
  async balanceOf(owner: GhostAddress): Promise<bigint> {
    assertAddress(owner, "owner");
    const data = encodeCall("balanceOf(address)", ["address"], [owner]);
    return decodeUint256(await this.ethCall(data));
  }

  /** ERC-721: ownerOf(uint256) → address. */
  async ownerOf(tokenId: bigint): Promise<GhostAddress> {
    const data = encodeCall("ownerOf(uint256)", ["uint256"], [tokenId]);
    return decodeAddress(await this.ethCall(data));
  }

  /** ERC-721: tokenURI(uint256) → string. */
  async tokenURI(tokenId: bigint): Promise<string> {
    const data = encodeCall("tokenURI(uint256)", ["uint256"], [tokenId]);
    return decodeString(await this.ethCall(data));
  }

  /** ERC-721: getApproved(uint256) → address. */
  async getApproved(tokenId: bigint): Promise<GhostAddress> {
    const data = encodeCall("getApproved(uint256)", ["uint256"], [tokenId]);
    return decodeAddress(await this.ethCall(data));
  }

  /** ERC-721: isApprovedForAll(address,address) → bool. */
  async isApprovedForAll(owner: GhostAddress, operator: GhostAddress): Promise<boolean> {
    assertAddress(owner, "owner");
    assertAddress(operator, "operator");
    const data = encodeCall("isApprovedForAll(address,address)", ["address", "address"], [owner, operator]);
    return decodeBool(await this.ethCall(data));
  }

  /** ERC-165: supportsInterface(bytes4) → bool. */
  async supportsInterface(interfaceId: Hex): Promise<boolean> {
    const sel = functionSelector("supportsInterface(bytes4)");
    // bytes4 encodes as left-padded 32 bytes
    const padded = padHex(interfaceId, 32);
    const hexConcat = add0x(strip0x(sel) + strip0x(padded));
    return decodeBool(await this.ethCall(hexConcat));
  }

  /** ERC-721 optional: name() → string. */
  async name(): Promise<string> {
    const sel = add0x(strip0x(functionSelector("name()")));
    return decodeString(await this.ethCall(sel));
  }

  /** ERC-721 optional: symbol() → string. */
  async symbol(): Promise<string> {
    const sel = add0x(strip0x(functionSelector("symbol()")));
    return decodeString(await this.ethCall(sel));
  }

  /** ERC-721 optional: totalSupply() → uint256. */
  async totalSupply(): Promise<bigint> {
    const sel = add0x(strip0x(functionSelector("totalSupply()")));
    return decodeUint256(await this.ethCall(sel));
  }

  /** Fetch name and symbol. */
  async getInfo(): Promise<GhostERC721Info> {
    const [name, symbol, totalSupply] = await Promise.allSettled([
      this.name(),
      this.symbol(),
      this.totalSupply(),
    ]);
    return {
      name: name.status === "fulfilled" ? name.value : "Unknown",
      symbol: symbol.status === "fulfilled" ? symbol.value : "???",
      totalSupply: totalSupply.status === "fulfilled" ? totalSupply.value : undefined,
    };
  }

  // ── Write calldata builders ────────────────────────────────────────────────

  /** Build calldata for safeTransferFrom(address,address,uint256). */
  encodeSafeTransferFrom(from: GhostAddress, to: GhostAddress, tokenId: bigint): Hex {
    return encodeCall(
      "safeTransferFrom(address,address,uint256)",
      ["address", "address", "uint256"],
      [from, to, tokenId],
    );
  }

  /** Build calldata for transferFrom(address,address,uint256). */
  encodeTransferFrom(from: GhostAddress, to: GhostAddress, tokenId: bigint): Hex {
    return encodeCall(
      "transferFrom(address,address,uint256)",
      ["address", "address", "uint256"],
      [from, to, tokenId],
    );
  }

  /** Build calldata for approve(address,uint256). */
  encodeApprove(to: GhostAddress, tokenId: bigint): Hex {
    return encodeCall("approve(address,uint256)", ["address", "uint256"], [to, tokenId]);
  }

  /** Build calldata for setApprovalForAll(address,bool). */
  encodeSetApprovalForAll(operator: GhostAddress, approved: boolean): Hex {
    return encodeCall("setApprovalForAll(address,bool)", ["address", "bool"], [operator, approved]);
  }

  // ── Logs ───────────────────────────────────────────────────────────────────

  /** Fetch Transfer events in a block range. */
  async getTransferEvents(
    fromBlock: string | bigint = "earliest",
    toBlock: string | bigint = "latest",
  ): Promise<GhostERC721TransferEvent[]> {
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const logs = await this.provider.getLogs({
      address: this.address,
      topics: [TRANSFER_TOPIC as Hex],
      fromBlock: typeof fromBlock === "bigint" ? add0x(fromBlock.toString(16)) : fromBlock as "latest",
      toBlock: typeof toBlock === "bigint" ? add0x(toBlock.toString(16)) : toBlock as "latest",
    });

    return logs.map((log) => ({
      from: (`0x${log.topics[1]!.slice(-40)}`) as GhostAddress,
      to: (`0x${log.topics[2]!.slice(-40)}`) as GhostAddress,
      tokenId: decodeUint256(log.topics[3] ?? "0x0"),
      transactionHash: log.transactionHash,
      blockNumber: BigInt(log.blockNumber),
    }));
  }
}
