/**
 * GRC20 — Ghost Token Standard replacing ERC20.
 * TypeScript interface for GRC20 on-chain interactions.
 */
import { GhostContract } from "../core/GhostContract";
import { GhostProvider } from "../core/GhostProvider";

export const GRC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
  "function transferFrom(address,address,uint256) returns (bool)",
];

export class GRC20 extends GhostContract {
  constructor(address: string, provider: GhostProvider) {
    super(address, GRC20_ABI, provider);
  }

  async name():         Promise<string>  { return this.call("name", []) as Promise<string>; }
  async symbol():       Promise<string>  { return this.call("symbol", []) as Promise<string>; }
  async decimals():     Promise<number>  { return this.call("decimals", []) as Promise<number>; }
  async totalSupply():  Promise<string>  { return this.call("totalSupply", []) as Promise<string>; }
  async balanceOf(address: string): Promise<string> {
    return this.call("balanceOf", [address]) as Promise<string>;
  }
  async allowance(owner: string, spender: string): Promise<string> {
    return this.call("allowance", [owner, spender]) as Promise<string>;
  }
  async transfer(to: string, amount: string, from: string): Promise<boolean> {
    return this.send("transfer", [to, amount], from) as Promise<boolean>;
  }
  async approve(spender: string, amount: string, from: string): Promise<boolean> {
    return this.send("approve", [spender, amount], from) as Promise<boolean>;
  }
}
