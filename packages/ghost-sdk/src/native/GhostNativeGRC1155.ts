import type { GhostAddress, Hex } from "./types.js";
import { GhostNativeContract } from "./GhostNativeContract.js";
import { decodeUint256 } from "./abi.js";
import type { GhostNativeProvider } from "./GhostNativeProvider.js";
import type { GhostNativeWallet } from "./GhostNativeWallet.js";

/** Ghost-native GRC-1155 multi-token helper — zero ethers dependency. */
export class GhostNativeGRC1155 {
  private readonly c: GhostNativeContract;

  constructor(address: GhostAddress, provider: GhostNativeProvider, signer?: GhostNativeWallet) {
    this.c = new GhostNativeContract(address, { provider, signer });
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async balanceOf(account: GhostAddress, id: bigint): Promise<bigint> {
    // GRC1155 stores balanceOf[id][account] — public mapping exposed as balanceOf(uint256,address) ordering
    // Actual Solidity mapping: balanceOf[id][account], but IGRC1155 standard uses (account,id) param order.
    const raw = await this.c.call(
      "balanceOf(uint256,address)",
      ["uint256", "address"],
      [id, account],
    );
    return decodeUint256(raw);
  }

  async isApprovedForAll(account: GhostAddress, operator: GhostAddress): Promise<boolean> {
    const raw = await this.c.call(
      "isApprovedForAll(address,address)",
      ["address", "address"],
      [account, operator],
    );
    return decodeUint256(raw) !== 0n;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async setApprovalForAll(operator: GhostAddress, approved: boolean): Promise<Hex> {
    return this.c.send("setApprovalForAll(address,bool)", ["address", "bool"], [operator, approved]);
  }

  async safeTransferFrom(
    from: GhostAddress,
    to: GhostAddress,
    id: bigint,
    amount: bigint,
    data: Hex,
  ): Promise<Hex> {
    return this.c.send(
      "safeTransferFrom(address,address,uint256,uint256,bytes)",
      ["address", "address", "uint256", "uint256", "bytes"],
      [from, to, id, amount, data],
    );
  }

  // ── Mint / Burn ───────────────────────────────────────────────────────────

  /** Mint `amount` of token `id` to `to`. Caller must have minter role on-chain. */
  async mint(to: GhostAddress, id: bigint, amount: bigint, data: Hex = "0x"): Promise<Hex> {
    return this.c.send(
      "mint(address,uint256,uint256,bytes)",
      ["address", "uint256", "uint256", "bytes"],
      [to, id, amount, data],
    );
  }

  /** Burn `amount` of token `id` from `from`. */
  async burn(from: GhostAddress, id: bigint, amount: bigint): Promise<Hex> {
    return this.c.send(
      "burn(address,uint256,uint256)",
      ["address", "uint256", "uint256"],
      [from, id, amount],
    );
  }

  /** Batch-burn tokens from `from`. */
  async burnBatch(from: GhostAddress, ids: bigint[], amounts: bigint[]): Promise<Hex> {
    return this.c.send(
      "burnBatch(address,uint256[],uint256[])",
      ["address", "uint256[]", "uint256[]"],
      [from, ids, amounts],
    );
  }
}
