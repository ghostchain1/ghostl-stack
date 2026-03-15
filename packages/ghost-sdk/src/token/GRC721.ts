/**
 * GRC721 — Ghost NFT Standard replacing ERC721.
 */
import { GhostContract } from "../core/GhostContract";
import { GhostProvider } from "../core/GhostProvider";

export const GRC721_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function getApproved(uint256) view returns (address)",
  "function approve(address,uint256) returns (void)",
  "function setApprovalForAll(address,bool) returns (void)",
  "function transferFrom(address,address,uint256) returns (void)",
  "function safeTransferFrom(address,address,uint256) returns (void)",
];

export class GRC721 extends GhostContract {
  constructor(address: string, provider: GhostProvider) {
    super(address, GRC721_ABI, provider);
  }

  async name():     Promise<string> { return this.call("name", []) as Promise<string>; }
  async symbol():   Promise<string> { return this.call("symbol", []) as Promise<string>; }
  async ownerOf(tokenId: string):   Promise<string> { return this.call("ownerOf", [tokenId]) as Promise<string>; }
  async balanceOf(owner: string):   Promise<string> { return this.call("balanceOf", [owner]) as Promise<string>; }
  async tokenURI(tokenId: string):  Promise<string> { return this.call("tokenURI", [tokenId]) as Promise<string>; }
}
