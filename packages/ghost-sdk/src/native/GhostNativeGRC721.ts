import type { GhostAddress, Hex } from "./types.js";
import { GhostNativeContract } from "./GhostNativeContract.js";
import { decodeUint256, decodeAddress } from "./abi.js";
import type { GhostNativeProvider } from "./GhostNativeProvider.js";
import type { GhostNativeWallet } from "./GhostNativeWallet.js";

/** Ghost-native GRC-721 NFT helper — zero ethers dependency. */
export class GhostNativeGRC721 {
  private readonly c: GhostNativeContract;

  constructor(address: GhostAddress, provider: GhostNativeProvider, signer?: GhostNativeWallet) {
    this.c = new GhostNativeContract(address, { provider, signer });
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async ownerOf(tokenId: bigint): Promise<GhostAddress> {
    const raw = await this.c.call("ownerOf(uint256)", ["uint256"], [tokenId]);
    return decodeAddress(raw);
  }

  async balanceOf(owner: GhostAddress): Promise<bigint> {
    const raw = await this.c.call("balanceOf(address)", ["address"], [owner]);
    return decodeUint256(raw);
  }

  async getApproved(tokenId: bigint): Promise<GhostAddress> {
    const raw = await this.c.call("getApproved(uint256)", ["uint256"], [tokenId]);
    return decodeAddress(raw);
  }

  async isApprovedForAll(owner: GhostAddress, operator: GhostAddress): Promise<boolean> {
    const raw = await this.c.call(
      "isApprovedForAll(address,address)",
      ["address", "address"],
      [owner, operator],
    );
    return decodeUint256(raw) !== 0n;
  }

  async tokenURI(tokenId: bigint): Promise<string> {
    const raw = await this.c.call("tokenURI(uint256)", ["uint256"], [tokenId]);
    // ABI-decode dynamic string: skip offset (32 bytes) + length (32 bytes), then read UTF-8
    const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
    const lenHex = hex.slice(64, 128);
    const len = parseInt(lenHex, 16);
    const strHex = hex.slice(128, 128 + len * 2);
    return Buffer.from(strHex, "hex").toString("utf8");
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async approve(to: GhostAddress, tokenId: bigint): Promise<Hex> {
    return this.c.send("approve(address,uint256)", ["address", "uint256"], [to, tokenId]);
  }

  async setApprovalForAll(operator: GhostAddress, approved: boolean): Promise<Hex> {
    return this.c.send("setApprovalForAll(address,bool)", ["address", "bool"], [operator, approved]);
  }

  async transferFrom(from: GhostAddress, to: GhostAddress, tokenId: bigint): Promise<Hex> {
    return this.c.send(
      "transferFrom(address,address,uint256)",
      ["address", "address", "uint256"],
      [from, to, tokenId],
    );
  }

  async safeTransferFrom(from: GhostAddress, to: GhostAddress, tokenId: bigint): Promise<Hex> {
    return this.c.send(
      "safeTransferFrom(address,address,uint256)",
      ["address", "address", "uint256"],
      [from, to, tokenId],
    );
  }

  // ── GhostChain-branded aliases ────────────────────────────────────────────

  /** Ghost-branded transferFrom alias. */
  async ghostTransferFrom(from: GhostAddress, to: GhostAddress, tokenId: bigint): Promise<Hex> {
    return this.c.send(
      "ghostTransferFrom(address,address,uint256)",
      ["address", "address", "uint256"],
      [from, to, tokenId],
    );
  }

  /** Ghost-branded safeTransferFrom alias. */
  async ghostSafeTransferFrom(from: GhostAddress, to: GhostAddress, tokenId: bigint): Promise<Hex> {
    return this.c.send(
      "ghostSafeTransferFrom(address,address,uint256)",
      ["address", "address", "uint256"],
      [from, to, tokenId],
    );
  }

  // ── Mint / Burn ───────────────────────────────────────────────────────────

  /** Mint `tokenId` to `to`. Caller must have minter role on-chain. */
  async mint(to: GhostAddress, tokenId: bigint): Promise<Hex> {
    return this.c.send("mint(address,uint256)", ["address", "uint256"], [to, tokenId]);
  }

  /** Burn `tokenId`. Caller must own or be approved. */
  async burn(tokenId: bigint): Promise<Hex> {
    return this.c.send("burn(uint256)", ["uint256"], [tokenId]);
  }
}
