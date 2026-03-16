// GhostNode SDK — Staking Interface

import type { GhostNodeConfig } from '../types.js';

export interface GhostStakeInfo {
  validator: string;
  delegator: string;
  staked: bigint;       // GST in wei (1e18)
  rewards: bigint;      // pending rewards in GST wei
  unbonding: bigint;
  shares: bigint;
}

export interface GhostDelegation {
  validator: string;
  delegator: string;
  shares: string;
  balance: string;
}

/**
 * GhostStaking — GST staking read interface for a GhostChain node.
 * Write operations (stake/unstake) go through governance-approved txns.
 */
export class GhostStaking {
  private readonly config: GhostNodeConfig;

  constructor(config: GhostNodeConfig) {
    this.config = config;
  }

  /** Get stake info for a delegator → validator pair */
  async getStake(delegator: string, validator: string): Promise<GhostStakeInfo> {
    return this._rpc<GhostStakeInfo>('ghost_getStake', [delegator, validator]);
  }

  /** Get total stake for a validator */
  async validatorTotalStake(validator: string): Promise<bigint> {
    const result = await this._rpc<string>('ghost_validatorTotalStake', [validator]);
    return BigInt(result);
  }

  /** Get all delegations for an address */
  async getDelegations(delegator: string): Promise<GhostDelegation[]> {
    return this._rpc<GhostDelegation[]>('ghost_delegations', [delegator]);
  }

  /** Get pending staking rewards */
  async pendingRewards(delegator: string): Promise<bigint> {
    const result = await this._rpc<string>('ghost_pendingRewards', [delegator]);
    return BigInt(result);
  }

  /** Get the active validator set */
  async activeValidators(): Promise<string[]> {
    return this._rpc<string[]>('ghost_activeValidators');
  }

  private async _rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostStaking RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostStaking: ${json.error.message}`);
    return json.result as T;
  }
}
