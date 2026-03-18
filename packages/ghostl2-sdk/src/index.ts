// GhostL2 SDK — GhostChain Layer 2
// OP-Stack based rollup anchored to GhostChain L1
// Chain ID: 901 | RPC: http://localhost:29547

import type { BridgeTransferReceipt } from '@ghostchain/ghostbridge-sdk';

/** GhostL2 canonical constants */
export const GHOST_L2 = {
  CHAIN_ID: 901,
  RPC: 'http://localhost:29547',
  L1_ROLLUP: '0xad32D5C2Da9f4159C4cc98686C005852b3905355',
  FINALITY_ORACLE: '0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A',
} as const;

export interface GhostL2Config {
  rpc?: string;
  l1Rpc?: string;
  authToken?: string;
}

export interface GhostL2Status {
  chainId: number;
  blockNumber: bigint;
  safeBlockNumber: bigint;
  finalizedBlockNumber: bigint;
  sequencerRunning: boolean;
  batcherAddress: string;
  l1ConfirmationBlocks: number;
}

export interface GhostL2FeeInfo {
  baseFee: bigint;       // GST wei
  l1DataFee: bigint;     // L1 calldata cost in GST
  priorityFee: bigint;
  totalEstimate: bigint;
}

/**
 * GhostL2 — primary interface for the GhostChain L2 rollup.
 *
 * @example
 * ```ts
 * import { GhostL2 } from '@ghostchain/ghostl2-sdk';
 *
 * const l2 = new GhostL2();
 * const status = await l2.status();
 * const fees = await l2.estimateFees({ data: '0x' });
 *
 * // Deposit from L1 to L2
 * await l2.deposit({ from, to, amount: 10n * 10n**18n });
 *
 * // Bridge up to L3
 * await l2.bridgeToL3({ from, to, amount: 5n * 10n**18n });
 * ```
 */
export class GhostL2 {
  private readonly rpc: string;
  private readonly l1Rpc: string;
  private readonly authToken?: string;

  constructor(config: GhostL2Config = {}) {
    this.rpc = config.rpc ?? GHOST_L2.RPC;
    this.l1Rpc = config.l1Rpc ?? 'http://localhost:18545';
    this.authToken = config.authToken;
  }

  /** Full L2 rollup status */
  async status(): Promise<GhostL2Status> {
    const [chainId, blockHex, syncStatus] = await Promise.all([
      this._rpc<string>('ghost_chainId'),
      this._rpc<string>('ghost_blockNumber'),
      this._rpc<{ currentBlock: string; highestBlock: string } | false>('ghost_syncing'),
    ]);

    const opStatus = await this._rpc<{
      safe_l2: { number: number };
      finalized_l2: { number: number };
      sequencer_addr: string;
    }>('optimism_syncStatus').catch(() => null);

    return {
      chainId: parseInt(chainId, 16),
      blockNumber: BigInt(blockHex),
      safeBlockNumber: BigInt(opStatus?.safe_l2.number ?? 0),
      finalizedBlockNumber: BigInt(opStatus?.finalized_l2.number ?? 0),
      sequencerRunning: syncStatus === false,
      batcherAddress: opStatus?.sequencer_addr ?? '',
      l1ConfirmationBlocks: 1,
    };
  }

  /** Estimate gas fees for an L2 transaction */
  async estimateFees(tx: { from?: string; to?: string; data?: string; value?: string }): Promise<GhostL2FeeInfo> {
    const [baseFeeHex, l1FeeHex] = await Promise.all([
      this._rpc<string>('ghost_gasPrice'),
      this._rpc<string>('ghost_l1GasPrice').catch(() => '0x0'),
    ]);

    const baseFee = BigInt(baseFeeHex);
    const l1DataFee = BigInt(l1FeeHex);
    const priorityFee = baseFee / 10n;

    return {
      baseFee,
      l1DataFee,
      priorityFee,
      totalEstimate: baseFee + l1DataFee + priorityFee,
    };
  }

  /** Deposit GST from L1 to L2 (lock-and-mint via OP Portal) */
  async deposit(params: {
    from: string;
    to: string;
    amount: bigint;
    data?: string;
  }): Promise<BridgeTransferReceipt> {
    return this._rpc<BridgeTransferReceipt>('ghost_bridge_deposit', {
      from: params.from,
      to: params.to,
      amount: params.amount.toString(),
      portalAddress: GHOST_L2.L1_ROLLUP,
      data: params.data ?? '0x',
    });
  }

  /** Initiate withdrawal from L2 back to L1 */
  async withdraw(params: {
    from: string;
    to: string;
    amount: bigint;
    data?: string;
  }): Promise<BridgeTransferReceipt> {
    return this._rpc<BridgeTransferReceipt>('ghost_bridge_initiateWithdrawal', {
      from: params.from,
      to: params.to,
      amount: params.amount.toString(),
      data: params.data ?? '0x',
    });
  }

  /** Bridge GST up to L3 (L2→L3 via GhostL2L3Bridge) */
  async bridgeToL3(params: {
    from: string;
    to: string;
    amount: bigint;
    data?: string;
  }): Promise<BridgeTransferReceipt> {
    return this._rpc<BridgeTransferReceipt>('ghost_bridge_depositToL3', {
      from: params.from,
      to: params.to,
      amount: params.amount.toString(),
      bridgeAddress: '0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2',
      data: params.data ?? '0x',
    });
  }

  /** Get GST balance for an address on L2 */
  async getBalance(address: string): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_getBalance', [address, 'latest']);
    return BigInt(hex);
  }

  /** Get current block number */
  async blockNumber(): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_blockNumber');
    return BigInt(hex);
  }

  /** Get rollup config */
  async rollupConfig(): Promise<Record<string, unknown>> {
    return this._rpc('optimism_rollupConfig');
  }

  /** Get output root at a given L2 block */
  async outputAtBlock(blockNumber: bigint): Promise<{ outputRoot: string; l1Timestamp: number }> {
    return this._rpc('optimism_outputAtBlock', [`0x${blockNumber.toString(16)}`]);
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

    if (!res.ok) throw new Error(`GhostL2 RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostL2 [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}

// Re-export constants for callers
export { GHOST_BRIDGE_ADDRESSES } from '@ghostchain/ghostbridge-sdk';
