import type { GhostAddress, Hex } from "./types.js";
import { GhostNativeContract } from "./GhostNativeContract.js";
import { decodeUint256 } from "./abi.js";
import type { GhostNativeProvider } from "./GhostNativeProvider.js";
import type { GhostNativeWallet } from "./GhostNativeWallet.js";

/** Ghost-native GRC-20 helper — zero ethers dependency. */
export class GhostNativeERC20 {
  private readonly c: GhostNativeContract;

  constructor(address: GhostAddress, provider: GhostNativeProvider, signer?: GhostNativeWallet) {
    this.c = new GhostNativeContract(address, { provider, signer });
  }

  // ── Standard GRC-20 (ERC-20 ABI compatible) ──────────────────────────────

  async balanceOf(owner: GhostAddress): Promise<bigint> {
    const raw = await this.c.call("balanceOf(address)", ["address"], [owner]);
    return decodeUint256(raw);
  }

  async totalSupply(): Promise<bigint> {
    const raw = await this.c.call("totalSupply()", [], []);
    return decodeUint256(raw);
  }

  async transfer(to: GhostAddress, amount: bigint): Promise<Hex> {
    return this.c.send("transfer(address,uint256)", ["address", "uint256"], [to, amount]);
  }

  async approve(spender: GhostAddress, amount: bigint): Promise<Hex> {
    return this.c.send("approve(address,uint256)", ["address", "uint256"], [spender, amount]);
  }

  async allowance(owner: GhostAddress, spender: GhostAddress): Promise<bigint> {
    const raw = await this.c.call("allowance(address,address)", ["address", "address"], [owner, spender]);
    return decodeUint256(raw);
  }

  // ── GhostChain-branded aliases ────────────────────────────────────────────

  /** Ghost-branded balanceOf alias. */
  async ghostBalance(account: GhostAddress): Promise<bigint> {
    const raw = await this.c.call("ghostBalance(address)", ["address"], [account]);
    return decodeUint256(raw);
  }

  /** Ghost-branded transfer alias. */
  async ghostTransfer(to: GhostAddress, amount: bigint): Promise<Hex> {
    return this.c.send("ghostTransfer(address,uint256)", ["address", "uint256"], [to, amount]);
  }

  /** Ghost-branded approve alias. */
  async ghostApprove(spender: GhostAddress, amount: bigint): Promise<Hex> {
    return this.c.send("ghostApprove(address,uint256)", ["address", "uint256"], [spender, amount]);
  }

  /** Ghost-branded allowance alias. */
  async ghostAllowance(owner: GhostAddress, spender: GhostAddress): Promise<bigint> {
    const raw = await this.c.call("ghostAllowance(address,address)", ["address", "address"], [owner, spender]);
    return decodeUint256(raw);
  }

  /** Ghost-branded transferFrom alias. */
  async ghostTransferFrom(from: GhostAddress, to: GhostAddress, amount: bigint): Promise<Hex> {
    return this.c.send(
      "ghostTransferFrom(address,address,uint256)",
      ["address", "address", "uint256"],
      [from, to, amount],
    );
  }

  // ── Mint / Burn (requires on-chain access control in the contract) ────────

  /** Mint tokens to `to`. Caller must have minter role on-chain. */
  async mint(to: GhostAddress, amount: bigint): Promise<Hex> {
    return this.c.send("mint(address,uint256)", ["address", "uint256"], [to, amount]);
  }

  /** Burn `amount` tokens from the caller's balance. */
  async burn(amount: bigint): Promise<Hex> {
    return this.c.send("burn(uint256)", ["uint256"], [amount]);
  }
}
