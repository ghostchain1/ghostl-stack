import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GhostAgentBase } from './GhostAgentBase.js';
import type { SwarmEvent } from '../types.js';

const execFileAsync = promisify(execFile);

/** Scale-up threshold (percent load). */
const SCALE_UP_THRESHOLD = 80;
/** Cooldown period between scale actions (ms). */
const COOLDOWN_MS = 120_000;

/**
 * GhostScalingAgent — launches additional RPC / compute nodes when load exceeds
 * the threshold.
 *
 * Security: the scale-nodes binary is invoked via execFile (not shell) to prevent
 * argument injection. A cooldown prevents runaway scale loops.
 */
export class GhostScalingAgent extends GhostAgentBase {
  private lastScaledAt = 0;
  private readonly cooldownMs: number;
  private readonly threshold: number;

  constructor(opts: { threshold?: number; cooldownMs?: number } = {}) {
    super('GhostScalingAgent');
    this.threshold = opts.threshold ?? SCALE_UP_THRESHOLD;
    this.cooldownMs = opts.cooldownMs ?? COOLDOWN_MS;
  }

  process(event: SwarmEvent): void {
    if (event.type !== 'load-spike' && event.type !== 'metrics') return;

    const load = Number(event.load ?? 0);
    if (load <= this.threshold) return;

    const now = Date.now();
    if (now - this.lastScaledAt < this.cooldownMs) {
      this.log('info', 'Scale-up suppressed by cooldown', { load, cooldownMs: this.cooldownMs });
      return;
    }

    this.lastScaledAt = now;
    this.log('info', 'Triggering scale-up', { load, threshold: this.threshold });

    execFileAsync('scale-nodes', [])
      .then(() => this.log('info', 'scale-nodes completed'))
      .catch(err => this.log('error', 'scale-nodes failed', { err: String(err) }));
  }
}
