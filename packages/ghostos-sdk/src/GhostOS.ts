// GhostOS SDK — Unified Facade

import { GhostServer } from './server/GhostServer.js';
import { GhostHypervisor } from './hypervisor/GhostHypervisor.js';
import { GhostVM } from './vm/GhostVM.js';
import { GhostContainer } from './container/GhostContainer.js';
import { GhostOSNetwork } from './network/GhostOSNetwork.js';
import { GhostStorage } from './storage/GhostStorage.js';
import { GhostOSSecurity } from './security/GhostOSSecurity.js';
import { GhostOSMonitor } from './monitor/GhostOSMonitor.js';
import type { GhostOSConfig } from './types.js';

/**
 * GhostOS — unified entry point for all GhostOS infrastructure management.
 *
 * @example
 * ```ts
 * import { GhostOS } from '@ghostchain/ghostos-sdk';
 *
 * const ghostos = new GhostOS({ controlEndpoint: 'http://gais:9100' });
 *
 * await ghostos.hypervisor.createVM({ name: 'ghost-validator-1', cpu: 8, memory: '32GB' });
 * await ghostos.container.ensure({ name: 'ghostchain-node', image: 'ghostchain/node:latest' });
 * const health = await ghostos.monitor.health();
 * ```
 */
export class GhostOS {
  readonly server: GhostServer;
  readonly hypervisor: GhostHypervisor;
  readonly vm: GhostVM;
  readonly container: GhostContainer;
  readonly network: GhostOSNetwork;
  readonly storage: GhostStorage;
  readonly security: GhostOSSecurity;
  readonly monitor: GhostOSMonitor;

  constructor(config: GhostOSConfig = {}) {
    this.server = new GhostServer(config);
    this.hypervisor = new GhostHypervisor(config);
    this.vm = new GhostVM(config);
    this.container = new GhostContainer(config);
    this.network = new GhostOSNetwork(config);
    this.storage = new GhostStorage(config);
    this.security = new GhostOSSecurity(config);
    this.monitor = new GhostOSMonitor(config);
  }
}
