// GhostDeFi SDK — Main Entry

export * from './types.js';
export * from './swap/GhostSwap.js';
export * from './pool/GhostPool.js';
export * from './farm/GhostFarm.js';
export * from './stable/GhostStable.js';

import { GhostSwap } from './swap/GhostSwap.js';
import { GhostPool } from './pool/GhostPool.js';
import { GhostFarm } from './farm/GhostFarm.js';
import { GhostStable } from './stable/GhostStable.js';
import type { GhostDeFiConfig } from './types.js';

/**
 * GhostDeFi — unified DeFi facade for GhostChain.
 * All swaps, pools, farms, and stable-pools go through GhostXchange
 * (GhostChain's native DEX — not Uniswap or any external protocol).
 *
 * @example
 * ```ts
 * import { GhostDeFi } from '@ghostchain/ghostdefi-sdk';
 *
 * const defi = new GhostDeFi({
 *   rpc: 'http://localhost:29547',            // GhostL2
 *   routerAddress: '0x...',
 *   factoryAddress: '0x...',
 *   wgstAddress: '0x...',
 * });
 *
 * const quote = await defi.swap.quote(1n * 10n**18n, [gstAddr, usdcAddr]);
 * await defi.swap.swap(quote.amountIn, quote.amountOutMin, quote.path, myAddress);
 *
 * await defi.pool.addLiquidity({ token0: gstAddr, token1: usdcAddr, ... });
 * await defi.farm.deposit(0, lpAmount);
 * ```
 */
export class GhostDeFi {
  readonly swap: GhostSwap;
  readonly pool: GhostPool;
  readonly farm: GhostFarm;
  readonly stable: GhostStable;

  constructor(config: GhostDeFiConfig, masterChefAddress?: string) {
    this.swap   = new GhostSwap(config);
    this.pool   = new GhostPool(config);
    this.farm   = new GhostFarm(config, masterChefAddress ?? '0x0000000000000000000000000000000000000000');
    this.stable = new GhostStable(config);
  }
}
