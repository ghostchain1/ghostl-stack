export type NftStandard = 'erc721';

export interface NftContract {
  id: string;
  address: string;
  chainId: string;
  standard: NftStandard;
  name?: string;
  symbol?: string;
  metadataUri?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NftToken {
  id: string;
  contractId: string;
  contractAddress: string;
  chainId: string;
  tokenId: string;
  owner: string;
  uri?: string;
  metadata?: Record<string, unknown>;
  mintedAt: string;
  updatedAt: string;
  burnedAt?: string;
  lastTx?: string;
}
