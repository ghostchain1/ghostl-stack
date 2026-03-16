// GhostBridge SDK — Main Entry

export * from './types.js';
export * from './l1l2/GhostL1L2Bridge.js';
export * from './l2l3/GhostL2L3Bridge.js';
export * from './relay/GhostRelay.js';

import { GhostL1L2Bridge } from './l1l2/GhostL1L2Bridge.js';
import { GhostL2L3Bridge } from './l2l3/GhostL2L3Bridge.js';
import { GhostRelay } from './relay/GhostRelay.js';
import type { BridgeConfig } from './types.js';

/**
 * GhostBridge — unified bridge facade.
 *
 * @example
 * ```ts
 * import { GhostBridge } from '@ghostchain/ghostbridge-sdk';
 *
 * const bridge = new GhostBridge({
 *   l1Rpc: 'http://localhost:18545',
 *   l2Rpc: 'http://localhost:29545',
 *   l3Rpc: 'http://localhost:39545',
 * });
 *
 * // Deposit from L1 to L2
 * const receipt = await bridge.l1l2.deposit({ from, to, amount: 10n * 10n**18n });
 *
 * // Bridge from L2 to L3
 * await bridge.l2l3.depositToL3({ from, to, amount: 5n * 10n**18n });
 * ```
 */
export class GhostBridge {
  readonly l1l2: GhostL1L2Bridge;
  readonly l2l3: GhostL2L3Bridge;
  readonly relay: GhostRelay;

  constructor(config: BridgeConfig) {
    this.l1l2 = new GhostL1L2Bridge(config);
    this.l2l3 = new GhostL2L3Bridge(config);
    this.relay = new GhostRelay(config);
  }
}
