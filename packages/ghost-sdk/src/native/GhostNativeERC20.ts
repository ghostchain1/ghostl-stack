import type { GhostAddress, Hex } from "./types.js";
import { GhostNativeContract } from "./GhostNativeContract.js";
import { decodeUint256 } from "./abi.js";
import type { GhostNativeProvider } from "./GhostNativeProvider.js";
import type { GhostNativeWallet } from "./GhostNativeWallet.js";

/** Ghost-native ERC-20 helper — zero ethers dependency. */
export class GhostNativeERC20 {
  private readonly c: GhostNativeContract;

  constructor(address: GhostAddress, provider: GhostNativeProvider, signer?: GhostNativeWallet) {
    this.c = new GhostNativeContract(address, { provider, signer });
  }

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
}
