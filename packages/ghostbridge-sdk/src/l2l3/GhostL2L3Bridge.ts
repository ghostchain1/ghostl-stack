// GhostBridge SDK — L2 ↔ L3 Bridge

import { GHOST_BRIDGE_ADDRESSES } from '../types.js';
import type { BridgeConfig, BridgeTransferParams, BridgeTransferReceipt } from '../types.js';

/**
 * GhostL2L3Bridge — deposits (L2→L3) and withdrawals (L3→L2).
 * Canonical bridge address: 0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2
 *
 * Routing law:
 *   - L3 → L2 (this bridge) → L1 via GhostL1L2Bridge
 *   - L3 must NEVER communicate with L1 directly.
 */
export class GhostL2L3Bridge {
  private readonly config: BridgeConfig;

  static readonly L2L3_BRIDGE = GHOST_BRIDGE_ADDRESSES.L2L3Bridge;
  static readonly L2_ROLLUP   = GHOST_BRIDGE_ADDRESSES.L2RollupForL3;

  constructor(config: BridgeConfig) {
    if (!config.l3Rpc) throw new Error('GhostL2L3Bridge requires l3Rpc in config');
    this.config = config;
  }

  /** Deposit GST from L2 → L3 */
  async depositToL3(params: Omit<BridgeTransferParams, 'direction'>): Promise<BridgeTransferReceipt> {
    const receipt = await this._rpc<BridgeTransferReceipt>(this.config.l2Rpc, 'ghost_bridge_depositToL3', {
      from: params.from,
      to: params.to,
      amount: params.amount.toString(),
      bridgeAddress: GhostL2L3Bridge.L2L3_BRIDGE,
      data: params.data ?? '0x',
    });
    return { ...receipt, direction: 'L2→L3', amount: params.amount };
  }

  /** Initiate withdrawal from L3 → L2 */
  async withdrawToL2(params: Omit<BridgeTransferParams, 'direction'>): Promise<BridgeTransferReceipt> {
    const receipt = await this._rpc<BridgeTransferReceipt>(this.config.l3Rpc!, 'ghost_bridge_withdrawToL2', {
      from: params.from,
      to: params.to,
      amount: params.amount.toString(),
      data: params.data ?? '0x',
    });
    return { ...receipt, direction: 'L3→L2', amount: params.amount };
  }

  /** Finalize a proven L3→L2 withdrawal on L2 */
  async finalizeWithdrawal(withdrawalTxHash: string): Promise<string> {
    const result = await this._rpc<{ finalizationTxHash: string }>(this.config.l2Rpc, 'ghost_bridge_finalizeL3Withdrawal', {
      withdrawalTxHash,
      bridgeAddress: GhostL2L3Bridge.L2L3_BRIDGE,
    });
    return result.finalizationTxHash;
  }

  /** Get status of any L2↔L3 bridge transfer */
  async status(txHash: string): Promise<BridgeTransferReceipt> {
    return this._rpc<BridgeTransferReceipt>(this.config.l2Rpc, 'ghost_bridge_status', { txHash });
  }

  /** Get finality oracle state (sanity-checks before bridging) */
  async finalityOracleState(): Promise<{ finalized: boolean; l2BlockNumber: bigint; l3BlockNumber: bigint }> {
    const result = await this._rpc<{ finalized: boolean; l2BlockNumber: string; l3BlockNumber: string }>(
      this.config.l2Rpc,
      'ghost_finalityOracleState',
      { oracle: GHOST_BRIDGE_ADDRESSES.FinalityOracleL2 }
    );
    return {
      finalized: result.finalized,
      l2BlockNumber: BigInt(result.l2BlockNumber),
      l3BlockNumber: BigInt(result.l3BlockNumber),
    };
  }

  private async _rpc<T>(rpc: string, method: string, params: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [params] }),
    });

    if (!res.ok) throw new Error(`GhostL2L3Bridge RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostL2L3Bridge [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
