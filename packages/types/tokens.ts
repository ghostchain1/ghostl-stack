export type TokenType = 'erc20' | 'erc721' | 'erc1155';

export interface TokenRecord {
  id: string;
  walletId?: string;
  chainId: string;
  address: string;
  type: TokenType;
  symbol: string;
  name: string;
  decimals?: number;
  logoUri?: string;
  verified?: boolean;
  createdAt: string;
}
