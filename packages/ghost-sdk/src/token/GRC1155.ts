/**
 * GRC1155 — Ghost Multi-Token Standard replacing ERC1155.
 */
import { GhostContract } from "../core/GhostContract";
import { GhostProvider } from "../core/GhostProvider";

export const GRC1155_ABI = [
  "function balanceOf(address,uint256) view returns (uint256)",
  "function balanceOfBatch(address[],uint256[]) view returns (uint256[])",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function setApprovalForAll(address,bool) returns (void)",
  "function safeTransferFrom(address,address,uint256,uint256,bytes) returns (void)",
  "function safeBatchTransferFrom(address,address,uint256[],uint256[],bytes) returns (void)",
  "function uri(uint256) view returns (string)",
];

export class GRC1155 extends GhostContract {
  constructor(address: string, provider: GhostProvider) {
    super(address, GRC1155_ABI, provider);
  }

  async balanceOf(account: string, tokenId: string): Promise<string> {
    return this.call("balanceOf", [account, tokenId]) as Promise<string>;
  }
  async uri(tokenId: string): Promise<string> {
    return this.call("uri", [tokenId]) as Promise<string>;
  }
}
