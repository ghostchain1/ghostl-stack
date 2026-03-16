// GhostBridge SDK — Relay (message passing & event watching)

import type { BridgeConfig, BridgeTransferReceipt } from '../types.js';

export interface RelayMessage {
  id: string;
  direction: string;
  sender: string;
  target: string;
  value: string;
  data: string;
  gasLimit: string;
  status: 'queued' | 'relayed' | 'failed';
  timestamp: number;
}

/**
 * GhostRelay — watches and relays cross-chain messages.
 * Real-time bridge message monitoring and manual relay triggering.
 */
export class GhostRelay {
  private readonly config: BridgeConfig;

  constructor(config: BridgeConfig) {
    this.config = config;
  }

  /** Get pending relay messages (not yet relayed to destination) */
  async getPendingMessages(direction: 'L1→L2' | 'L2→L1' | 'L2→L3' | 'L3→L2'): Promise<RelayMessage[]> {
    return this._rpc<RelayMessage[]>('ghost_relay_pendingMessages', { direction });
  }

  /** Manually trigger relay of a specific message */
  async relay(messageId: string): Promise<BridgeTransferReceipt> {
    return this._rpc<BridgeTransferReceipt>('ghost_relay_relay', { messageId });
  }

  /** Track a bridge transfer until it reaches 'finalized' state */
  async track(txHash: string, pollIntervalMs = 5000, timeoutMs = 300_000): Promise<BridgeTransferReceipt> {
    const deadline = Date.now() + timeoutMs;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const receipt = await this._rpc<BridgeTransferReceipt>('ghost_bridge_status', { txHash });
          if (receipt.status === 'finalized') return resolve(receipt);
          if (receipt.status === 'failed') return reject(new Error(`GhostRelay: transfer ${txHash} failed`));
          if (Date.now() >= deadline) return reject(new Error('GhostRelay: timeout tracking transfer'));
          setTimeout(poll, pollIntervalMs);
        } catch (err) {
          reject(err);
        }
      };
      void poll();
    });
  }

  private async _rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    // Relay uses the L1 node as primary oracle
    const res = await fetch(this.config.l1Rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [params] }),
    });

    if (!res.ok) throw new Error(`GhostRelay RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostRelay [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
