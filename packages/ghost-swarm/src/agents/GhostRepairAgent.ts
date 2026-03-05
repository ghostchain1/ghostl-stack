import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GhostAgentBase } from './GhostAgentBase.js';
import type { SwarmEvent } from '../types.js';

const execFileAsync = promisify(execFile);

/** Docker container name / id — must be [a-zA-Z0-9_.\-] only. */
const SAFE_CONTAINER = /^[a-zA-Z0-9_.\-]{1,128}$/;

/**
 * GhostRepairAgent — reacts to service-failure events by restarting the
 * affected Docker container.
 *
 * Security: the container name is validated against a strict allowlist pattern
 * before being passed to execFile (no shell expansion).
 */
export class GhostRepairAgent extends GhostAgentBase {
  constructor() {
    super('GhostRepairAgent');
  }

  process(event: SwarmEvent): void {
    if (event.type !== 'service-failure') return;

    const service = event.service as string | undefined;
    if (!service) {
      this.log('warn', 'service-failure event missing service field');
      return;
    }

    if (!SAFE_CONTAINER.test(service)) {
      this.log('error', 'Rejected unsafe service name in service-failure event', { service });
      return;
    }

    this.log('info', `Restarting container: ${service}`);
    execFileAsync('docker', ['restart', service])
      .then(() => this.log('info', `Container restarted`, { service }))
      .catch(err => this.log('error', `docker restart failed`, { service, err: String(err) }));
  }
}
