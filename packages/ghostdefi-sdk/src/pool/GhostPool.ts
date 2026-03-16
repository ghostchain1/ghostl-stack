// GhostDeFi SDK — Liquidity Pool

import type { GhostDeFiConfig, GhostPoolInfo } from '../types.js';

/**
 * GhostPool — AMM liquidity pool management on GhostXchange.
 */
export class GhostPool {
  private readonly config: GhostDeFiConfig;

  constructor(config: GhostDeFiConfig) {
    this.config = config;
  }

  /** Get pool info for a token pair */
  async getPool(token0: string, token1: string): Promise<GhostPoolInfo> {
    return this._rpc<GhostPoolInfo>('ghost_defi_getPool', [token0, token1, this.config.factoryAddress]);
  }

  /** Get all pools created by this factory */
  async getAllPools(limit = 100, offset = 0): Promise<GhostPoolInfo[]> {
    return this._rpc<GhostPoolInfo[]>('ghost_defi_getAllPools', [this.config.factoryAddress, limit, offset]);
  }

  /**
   * Add liquidity to a pool.
   * Returns: shares minted, actual amounts deposited.
   */
  async addLiquidity(params: {
    token0: string;
    token1: string;
    amount0Desired: bigint;
    amount1Desired: bigint;
    amount0Min: bigint;
    amount1Min: bigint;
    to: string;
    deadlineSecs?: number;
  }): Promise<{ sharesMinted: bigint; amount0: bigint; amount1: bigint; txHash: string }> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSecs ?? 1200));
    return this._rpc('ghost_defi_addLiquidity', [{
      ...params,
      amount0Desired: params.amount0Desired.toString(),
      amount1Desired: params.amount1Desired.toString(),
      amount0Min: params.amount0Min.toString(),
      amount1Min: params.amount1Min.toString(),
      deadline: deadline.toString(),
      routerAddress: this.config.routerAddress,
    }]);
  }

  /**
   * Remove liquidity from a pool.
   */
  async removeLiquidity(params: {
    token0: string;
    token1: string;
    shares: bigint;
    amount0Min: bigint;
    amount1Min: bigint;
    to: string;
    deadlineSecs?: number;
  }): Promise<{ amount0: bigint; amount1: bigint; txHash: string }> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSecs ?? 1200));
    return this._rpc('ghost_defi_removeLiquidity', [{
      ...params,
      shares: params.shares.toString(),
      amount0Min: params.amount0Min.toString(),
      amount1Min: params.amount1Min.toString(),
      deadline: deadline.toString(),
      routerAddress: this.config.routerAddress,
    }]);
  }

  /** Get LP token balance for an address */
  async getLPBalance(poolAddress: string, owner: string): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_defi_lpBalance', [poolAddress, owner]);
    return BigInt(hex);
  }

  /** Get share price (amount of token0 and token1 per LP token) */
  async getSharePrice(poolAddress: string): Promise<{ token0PerShare: bigint; token1PerShare: bigint }> {
    return this._rpc('ghost_defi_sharePrice', [poolAddress]);
  }

  private async _rpc<T>(method: string, params: unknown[]): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostPool RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostPool [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
