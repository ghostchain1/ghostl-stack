export type SupportedChain = 'l2' | 'l3';

export type TokenConfig = {
  chain: SupportedChain;
  address?: string;
  symbol: string;
  decimals: number;
  type: 'native' | 'erc20';
};

const envTokens: TokenConfig[] = [
  ...(process.env.NEXT_PUBLIC_L2_ERC20
    ? [
        {
          chain: 'l2' as const,
          address: process.env.NEXT_PUBLIC_L2_ERC20,
          symbol: process.env.NEXT_PUBLIC_L2_ERC20_SYMBOL || 'L2T',
          decimals: Number(process.env.NEXT_PUBLIC_L2_ERC20_DECIMALS || 18),
          type: 'erc20' as const
        }
      ]
    : []),
  ...(process.env.NEXT_PUBLIC_L3_ERC20
    ? [
        {
          chain: 'l3' as const,
          address: process.env.NEXT_PUBLIC_L3_ERC20,
          symbol: process.env.NEXT_PUBLIC_L3_ERC20_SYMBOL || 'L3T',
          decimals: Number(process.env.NEXT_PUBLIC_L3_ERC20_DECIMALS || 18),
          type: 'erc20' as const
        }
      ]
    : [])
];

export const defaultTokens: TokenConfig[] = [
  { chain: 'l2', symbol: 'ETH', decimals: 18, type: 'native' },
  { chain: 'l3', symbol: 'ETH', decimals: 18, type: 'native' },
  // Demo ERC20s; override via env to match your router.
  { chain: 'l2', symbol: 'GHO', address: '0x4200000000000000000000000000000000000006', decimals: 18, type: 'erc20' },
  { chain: 'l2', symbol: 'USDC', address: '0x4200000000000000000000000000000000000008', decimals: 6, type: 'erc20' },
  { chain: 'l3', symbol: 'GHO', address: '0x4200000000000000000000000000000000000007', decimals: 18, type: 'erc20' },
  { chain: 'l3', symbol: 'USDC', address: '0x4200000000000000000000000000000000000009', decimals: 6, type: 'erc20' },
  ...envTokens
];

export const tokensForChain = (chain: SupportedChain) => defaultTokens.filter((t) => t.chain === chain);
