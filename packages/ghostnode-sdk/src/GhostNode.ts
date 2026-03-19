// GhostNode SDK — Unified Node Facade

import { GhostValidator } from './validator/GhostValidator.js';
import { GhostSequencer } from './sequencer/GhostSequencer.js';
import { GhostSync } from './sync/GhostSync.js';
import { GhostStaking } from './staking/GhostStaking.js';
import { GhostPeer } from './peer/GhostPeer.js';
import type { GhostNodeConfig, GhostChainLayer } from './types.js';

/**
 * GhostNode — unified facade for managing a single GhostChain node.
 *
 * @example
 * ```ts
 * import { GhostNode } from '@ghostchain/ghostnode-sdk';
 *
 * // L1 Validator
 * const node = new GhostNode({ rpc: 'http://localhost:18545', layer: 'L1' });
 * await node.sync.waitUntilSynced();
 * console.log(await node.validator.syncStatus());
 *
 * // L2 Sequencer
 * const l2 = new GhostNode({ rpc: 'http://localhost:7260', layer: 'L2' });
 * const status = await l2.sequencer.status();
 * ```
 */
export class GhostNode {
  readonly config: GhostNodeConfig;
  readonly sync: GhostSync;
  readonly staking: GhostStaking;
  readonly peer: GhostPeer;
  readonly validator: GhostValidator;
  readonly sequencer: GhostSequencer | null;

  /** Canonical RPC endpoints per layer */
  static readonly RPC = {
    L1: 'http://localhost:18545',
    L2: 'http://localhost:7260',
    L3: 'http://localhost:7270',
  } as const;

  /** Canonical chain IDs */
  static readonly CHAIN_IDS = { L1: 14000101, L2: 901, L3: 903 } as const;

  constructor(config: GhostNodeConfig) {
    this.config = config;
    this.sync = new GhostSync(config);
    this.staking = new GhostStaking(config);
    this.peer = new GhostPeer(config);
    this.validator = new GhostValidator(config);
    this.sequencer = config.layer !== 'L1' ? new GhostSequencer(config) : null;
  }

  /** Convenience factory for a given layer */
  static forLayer(layer: GhostChainLayer, authToken?: string): GhostNode {
    return new GhostNode({ rpc: GhostNode.RPC[layer], layer, authToken });
  }

  /** Quick health check */
  async isAlive(): Promise<boolean> {
    return this.validator.isAlive();
  }

  /** Node information */
  async info() {
    return this.validator.info();
  }

  /** Sync status */
  async status() {
    if (this.config.layer !== 'L1' && this.sequencer) {
      return this.sequencer.status();
    }
    return this.validator.status();
  }
}
