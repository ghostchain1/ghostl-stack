// GhostDeFi SDK — Shared Types

export interface GhostToken {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
}

export interface GhostDeFiConfig {
  rpc: string;                 // target chain RPC
  routerAddress: string;       // GhostXchange router
  factoryAddress: string;      // GhostXchange factory
  wgstAddress: string;         // Wrapped GST address
  authToken?: string;
}

export interface GhostSwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  amountOutMin: bigint;   // with slippage applied
  priceImpact: number;    // percentage 0–100
  path: string[];
  gasEstimate: bigint;
}

export interface GhostPoolInfo {
  address: string;
  token0: GhostToken;
  token1: GhostToken;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  fee: number;            // bps e.g. 30 = 0.3%
}

export interface GhostFarmInfo {
  id: number;
  lpToken: string;
  rewardToken: string;
  rewardsPerBlock: bigint;
  totalStaked: bigint;
  allocPoint: number;
}

/** GST = 1e18 */
export const GST_UNIT = 10n ** 18n;

/** Default slippage tolerance: 0.5% */
export const DEFAULT_SLIPPAGE_BPS = 50n;

/** Apply basis-points slippage to an amount */
export function applySlippage(amount: bigint, slippageBps = DEFAULT_SLIPPAGE_BPS): bigint {
  return (amount * (10_000n - slippageBps)) / 10_000n;
}
