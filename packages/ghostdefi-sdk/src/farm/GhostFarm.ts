// GhostDeFi SDK — Yield Farm

import type { GhostDeFiConfig, GhostFarmInfo } from '../types.js';

export interface GhostUserFarmInfo {
  farmId: number;
  staked: bigint;
  pendingRewards: bigint;
  stakedAt: number;
}

/**
 * GhostFarm — yield farming / staking rewards on GhostChain.
 * Users stake LP tokens or GST to earn GRC (GhostChain Reward token) rewards.
 */
export class GhostFarm {
  private readonly config: GhostDeFiConfig;
  private readonly masterChefAddress: string;

  constructor(config: GhostDeFiConfig, masterChefAddress: string) {
    this.config = config;
    this.masterChefAddress = masterChefAddress;
  }

  /** Get all farm pools */
  async getAllFarms(): Promise<GhostFarmInfo[]> {
    return this._rpc<GhostFarmInfo[]>('ghost_farm_getAllFarms', [this.masterChefAddress]);
  }

  /** Get a specific farm by ID */
  async getFarm(farmId: number): Promise<GhostFarmInfo> {
    return this._rpc<GhostFarmInfo>('ghost_farm_getFarm', [this.masterChefAddress, farmId]);
  }

  /** Get user's farm position */
  async getUserInfo(farmId: number, user: string): Promise<GhostUserFarmInfo> {
    return this._rpc<GhostUserFarmInfo>('ghost_farm_userInfo', [this.masterChefAddress, farmId, user]);
  }

  /** Get pending rewards for a user in a farm */
  async pendingRewards(farmId: number, user: string): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_farm_pendingRewards', [this.masterChefAddress, farmId, user]);
    return BigInt(hex);
  }

  /** Deposit (stake) LP tokens into a farm */
  async deposit(farmId: number, amount: bigint): Promise<string> {
    return this._rpc<string>('ghost_farm_deposit', [{
      masterChef: this.masterChefAddress,
      farmId,
      amount: amount.toString(),
    }]);
  }

  /** Withdraw staked LP tokens from a farm */
  async withdraw(farmId: number, amount: bigint): Promise<string> {
    return this._rpc<string>('ghost_farm_withdraw', [{
      masterChef: this.masterChefAddress,
      farmId,
      amount: amount.toString(),
    }]);
  }

  /** Harvest (claim) pending rewards without withdrawing stake */
  async harvest(farmId: number): Promise<string> {
    return this._rpc<string>('ghost_farm_harvest', [{ masterChef: this.masterChefAddress, farmId }]);
  }

  /** Emergency withdraw — forfeit rewards, get back principal */
  async emergencyWithdraw(farmId: number): Promise<string> {
    return this._rpc<string>('ghost_farm_emergencyWithdraw', [{ masterChef: this.masterChefAddress, farmId }]);
  }

  private async _rpc<T>(method: string, params: unknown[]): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostFarm RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostFarm [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
