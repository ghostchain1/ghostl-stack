// GhostL3 SDK — GhostChain Application Execution Layer
// Legacy rollup telemetry remains available through the explicit Ghost compat RPC surface.
// Chain ID: 903 | RPC: http://localhost:7270
//
// ROUTING LAW: L3 → L2 → L1 only. L3 NEVER communicates with L1 directly.

import type { BridgeTransferReceipt } from '@ghostchain/ghostbridge-sdk';

const GHOST_L3_COMPAT_RPC = {
  syncStatus: 'ghost_compat_syncStatus',
  rollupConfig: 'ghost_compat_rollupConfig',
} as const;

/** GhostL3 canonical constants */
export const GHOST_L3 = {
  CHAIN_ID: 903,
  RPC: 'http://localhost:7270',
  L2_ROLLUP: '0x130A46b6E41DB6E1e18fb9c759F223c459190e90',
  FINALITY_ORACLE: '0x87F850cbC2cFfac086F20d0d7307E12d06fA2127',
  L2L3_BRIDGE: '0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2',
} as const;

export interface GhostL3Config {
  rpc?: string;
  l2Rpc?: string;
  authToken?: string;
}

export interface GhostL3Status {
  chainId: number;
  blockNumber: bigint;
  safeBlockNumber: bigint;
  finalizedBlockNumber: bigint;
  l2AnchorBlock: bigint;
}

export interface GhostL3TransactionRequest {
  from: string;
  to: string;
  value?: bigint;       // GST in wei
  data?: string;        // hex-encoded calldata
  gasLimit?: bigint;
  nonce?: number;
}

export interface GhostL3Receipt {
  txHash: string;
  blockNumber: bigint;
  status: 0 | 1;       // 0=failure, 1=success
  gasUsed: bigint;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}

/**
 * GhostL3 — primary interface for the GhostChain L3 application execution layer.
 *
 * All external settlement from L3 flows to L2, then L1.
 * Never bridge L3 → L1 directly — use GhostL2 SDK for the L2→L1 hop.
 *
 * @example
 * ```ts
 * import { GhostL3 } from '@ghostchain/ghostl3-sdk';
 *
 * const l3 = new GhostL3();
 *
 * // Send a transaction on L3
 * const receipt = await l3.sendTransaction({ from, to, value: 1n * 10n**18n });
 *
 * // Withdraw back to L2
 * await l3.withdrawToL2({ from, to, amount: 1n * 10n**18n });
 * ```
 */
export class GhostL3 {
  private readonly rpc: string;
  private readonly l2Rpc: string;
  private readonly authToken?: string;

  constructor(config: GhostL3Config = {}) {
    this.rpc = config.rpc ?? GHOST_L3.RPC;
    this.l2Rpc = config.l2Rpc ?? 'http://localhost:7260';
    this.authToken = config.authToken;
  }

  /** Full L3 status */
  async status(): Promise<GhostL3Status> {
    const [chainId, blockHex] = await Promise.all([
      this._rpc<string>('ghost_chainId'),
      this._rpc<string>('ghost_blockNumber'),
    ]);

    const compatStatus = await this._rpc<{
      safe_l2: { number: number };
      finalized_l2: { number: number };
      current_l1: { number: number };
    }>(GHOST_L3_COMPAT_RPC.syncStatus).catch(() => null);

    return {
      chainId: parseInt(chainId, 16),
      blockNumber: BigInt(blockHex),
      safeBlockNumber: BigInt(compatStatus?.safe_l2.number ?? 0),
      finalizedBlockNumber: BigInt(compatStatus?.finalized_l2.number ?? 0),
      l2AnchorBlock: BigInt(compatStatus?.current_l1.number ?? 0),
    };
  }

  /** Get GST balance on L3 */
  async getBalance(address: string): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_getBalance', [address, 'latest']);
    return BigInt(hex);
  }

  /** Get transaction count (nonce) */
  async getTransactionCount(address: string): Promise<number> {
    const hex = await this._rpc<string>('ghost_getTransactionCount', [address, 'latest']);
    return parseInt(hex, 16);
  }

  /** Get current block number */
  async blockNumber(): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_blockNumber');
    return BigInt(hex);
  }

  /** Estimate gas for a transaction */
  async estimateGas(tx: GhostL3TransactionRequest): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_estimateGas', [{
      from: tx.from,
      to: tx.to,
      value: tx.value ? `0x${tx.value.toString(16)}` : '0x0',
      data: tx.data ?? '0x',
    }]);
    return BigInt(hex);
  }

  /** Send a signed raw transaction */
  async sendRawTransaction(signedTx: string): Promise<string> {
    return this._rpc<string>('ghost_sendRawTransaction', [signedTx]);
  }

  /** Get transaction receipt */
  async getReceipt(txHash: string): Promise<GhostL3Receipt | null> {
    const raw = await this._rpc<{
      transactionHash: string;
      blockNumber: string;
      status: string;
      gasUsed: string;
      logs: Array<{ address: string; topics: string[]; data: string }>;
    } | null>('ghost_getTransactionReceipt', [txHash]);

    if (!raw) return null;
    return {
      txHash: raw.transactionHash,
      blockNumber: BigInt(raw.blockNumber),
      status: parseInt(raw.status, 16) as 0 | 1,
      gasUsed: BigInt(raw.gasUsed),
      logs: raw.logs,
    };
  }

  /**
   * Initiate withdrawal from L3 → L2.
   * Note: to move funds to L1, follow up with GhostL2 SDK withdraw().
   * ROUTING LAW: L3 → L2 → L1. Never direct L3 → L1.
   */
  async withdrawToL2(params: {
    from: string;
    to: string;
    amount: bigint;
    data?: string;
  }): Promise<BridgeTransferReceipt> {
    return this._rpc<BridgeTransferReceipt>('ghost_bridge_withdrawToL2', {
      from: params.from,
      to: params.to,
      amount: params.amount.toString(),
      bridgeAddress: GHOST_L3.L2L3_BRIDGE,
      data: params.data ?? '0x',
    });
  }

  /** Call (read-only) a contract on L3 */
  async call(tx: { to: string; data: string; from?: string }): Promise<string> {
    return this._rpc<string>('ghost_call', [{ ...tx, from: tx.from ?? '0x0000000000000000000000000000000000000000' }, 'latest']);
  }

  /** Get rollup config through the explicit rollup-compat boundary. */
  async rollupConfig(): Promise<Record<string, unknown>> {
    return this._rpc(GHOST_L3_COMPAT_RPC.rollupConfig);
  }

  private async _rpc<T>(method: string, params: unknown[] | Record<string, unknown> = []): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    const p = Array.isArray(params) ? params : [params];
    const res = await fetch(this.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: p }),
    });

    if (!res.ok) throw new Error(`GhostL3 RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostL3 [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
