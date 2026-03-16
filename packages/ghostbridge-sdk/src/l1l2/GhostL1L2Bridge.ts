// GhostBridge SDK — L1 ↔ L2 Bridge

import { GHOST_BRIDGE_ADDRESSES } from '../types.js';
import type { BridgeConfig, BridgeTransferParams, BridgeTransferReceipt } from '../types.js';

/**
 * GhostL1L2Bridge — deposits (L1→L2) and withdrawals (L2→L1).
 * Uses the canonical L1 OP Portal at:
 *   L1 Rollup: 0xad32D5C2Da9f4159C4cc98686C005852b3905355
 *
 * Routing law: L2 only settles to L1. L3 uses GhostL2L3Bridge.
 */
export class GhostL1L2Bridge {
  private readonly config: BridgeConfig;

  static readonly L1_ROLLUP = GHOST_BRIDGE_ADDRESSES.L1RollupForL2;

  constructor(config: BridgeConfig) {
    this.config = config;
  }

  /**
   * Deposit GST from L1 → L2.
   * Sends a transaction calling the L1 OP Portal depositTransaction().
   */
  async deposit(params: Omit<BridgeTransferParams, 'direction'>): Promise<BridgeTransferReceipt> {
    const receipt = await this._bridgeRpc<BridgeTransferReceipt>(this.config.l1Rpc, 'ghost_bridge_deposit', {
      from: params.from,
      to: params.to,
      amount: params.amount.toString(),
      portalAddress: GhostL1L2Bridge.L1_ROLLUP,
      data: params.data ?? '0x',
    });
    return { ...receipt, direction: 'L1→L2', amount: params.amount };
  }

  /**
   * Initiate a withdrawal from L2 → L1.
   * Requires L2 transaction + L1 finalization after challenge window.
   */
  async initiateWithdrawal(params: Omit<BridgeTransferParams, 'direction'>): Promise<BridgeTransferReceipt> {
    const receipt = await this._bridgeRpc<BridgeTransferReceipt>(this.config.l2Rpc, 'ghost_bridge_initiateWithdrawal', {
      from: params.from,
      to: params.to,
      amount: params.amount.toString(),
      data: params.data ?? '0x',
    });
    return { ...receipt, direction: 'L2→L1', amount: params.amount };
  }

  /**
   * Prove a withdrawal message on L1 after it appears in a finalized output root.
   */
  async proveWithdrawal(withdrawalTxHash: string, l2OutputIndex: bigint): Promise<string> {
    const result = await this._bridgeRpc<{ proofTxHash: string }>(this.config.l1Rpc, 'ghost_bridge_proveWithdrawal', {
      withdrawalTxHash,
      l2OutputIndex: l2OutputIndex.toString(),
      portalAddress: GhostL1L2Bridge.L1_ROLLUP,
    });
    return result.proofTxHash;
  }

  /**
   * Finalize (claim) a proved withdrawal on L1 after the challenge window.
   */
  async finalizeWithdrawal(withdrawalTxHash: string): Promise<string> {
    const result = await this._bridgeRpc<{ finalizationTxHash: string }>(this.config.l1Rpc, 'ghost_bridge_finalizeWithdrawal', {
      withdrawalTxHash,
      portalAddress: GhostL1L2Bridge.L1_ROLLUP,
    });
    return result.finalizationTxHash;
  }

  /** Get status of a bridge transfer by its originating tx hash */
  async status(txHash: string): Promise<BridgeTransferReceipt> {
    return this._bridgeRpc<BridgeTransferReceipt>(this.config.l1Rpc, 'ghost_bridge_status', { txHash });
  }

  private async _bridgeRpc<T>(rpc: string, method: string, params: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [params] }),
    });

    if (!res.ok) throw new Error(`GhostL1L2Bridge RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostL1L2Bridge [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
