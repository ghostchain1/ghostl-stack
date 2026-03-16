// GhostDeFi SDK — Stablecoin / Stable Pool

import type { GhostDeFiConfig } from '../types.js';

export interface GhostStablePoolInfo {
  address: string;
  tokens: string[];
  amplification: bigint;
  totalLiquidity: bigint;
  feePercent: number;
}

/**
 * GhostStable — stable-swap pools for pegged assets (e.g. USDC/USDT/gUSD on L3).
 * Uses a Curve-style invariant for minimal slippage between like-priced assets.
 */
export class GhostStable {
  private readonly config: GhostDeFiConfig;

  constructor(config: GhostDeFiConfig) {
    this.config = config;
  }

  /** Get stable pool info */
  async getPool(poolAddress: string): Promise<GhostStablePoolInfo> {
    return this._rpc<GhostStablePoolInfo>('ghost_stable_getPool', [poolAddress]);
  }

  /** Get quote for a stable swap */
  async getSwapQuote(poolAddress: string, tokenIn: number, tokenOut: number, amountIn: bigint): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_stable_getSwapQuote', [poolAddress, tokenIn, tokenOut, amountIn.toString()]);
    return BigInt(hex);
  }

  /** Execute a stable swap */
  async swap(params: {
    poolAddress: string;
    tokenInIndex: number;
    tokenOutIndex: number;
    amountIn: bigint;
    amountOutMin: bigint;
    recipient: string;
    deadlineSecs?: number;
  }): Promise<string> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSecs ?? 1200));
    return this._rpc<string>('ghost_stable_swap', [{
      ...params,
      amountIn: params.amountIn.toString(),
      amountOutMin: params.amountOutMin.toString(),
      deadline: deadline.toString(),
    }]);
  }

  /** Add liquidity to stable pool */
  async addLiquidity(params: {
    poolAddress: string;
    amounts: bigint[];
    minMintAmount: bigint;
    recipient: string;
  }): Promise<string> {
    return this._rpc<string>('ghost_stable_addLiquidity', [{
      ...params,
      amounts: params.amounts.map(a => a.toString()),
      minMintAmount: params.minMintAmount.toString(),
    }]);
  }

  /** Remove liquidity from stable pool */
  async removeLiquidity(params: {
    poolAddress: string;
    shares: bigint;
    minAmounts: bigint[];
  }): Promise<string> {
    return this._rpc<string>('ghost_stable_removeLiquidity', [{
      ...params,
      shares: params.shares.toString(),
      minAmounts: params.minAmounts.map(a => a.toString()),
    }]);
  }

  private async _rpc<T>(method: string, params: unknown[]): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostStable RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostStable [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
