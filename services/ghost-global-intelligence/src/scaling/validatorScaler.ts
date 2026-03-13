/**
 * @file src/scaling/validatorScaler.ts
 * Ghost Global Network Intelligence — Validator scaling decision engine.
 *
 * Monitors validator set size and load.  When load spikes or the active set
 * is under-replicated, emits a scaling PROPOSAL to the signing relay.
 * NEVER modifies consensus parameters directly.
 */

import { deployNode } from '../deployment/vmDeploy.js';
import type { TopologySnapshot, RegionCode } from '../types.js';

function log(level: string, msg: string, extra: object = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, module: 'validator-scaler', msg, ...extra }) + '\n'
  );
}

const VALIDATOR_MIN     = parseInt(process.env.GNI_VALIDATOR_MIN      ?? '4',    10);
const LOAD_THRESHOLD    = parseFloat(process.env.GNI_VALIDATOR_LOAD_THRESHOLD ?? '0.80'); // 80 % load
const COSMOS_LCD_URL    = process.env.COSMOS_LCD_URL ?? 'http://localhost:1317';

interface ValidatorSummary {
  total:      number;
  active:     number;
  jailed:     number;
  loadFactor: number; // 0-1
}

async function fetchValidatorSummary(): Promise<ValidatorSummary | null> {
  try {
    const { default: https } = await import('node:https');
    const { default: http }  = await import('node:http');
    const url     = new URL(`${COSMOS_LCD_URL}/cosmos/staking/v1beta1/validators?pagination.limit=200`);
    const mod     = url.protocol === 'https:' ? https : http;
    const data = await new Promise<string>((resolve, reject) => {
      const req = mod.get(url.toString(), { timeout: 5000, headers: { 'User-Agent': 'ghost-global-intelligence/1.0' } }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', c => { raw += c; });
        res.on('end', () => resolve(raw));
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
    });
    const parsed = JSON.parse(data) as { validators?: Array<{ jailed: boolean; status: string }> };
    const validators = parsed.validators ?? [];
    const active     = validators.filter(v => v.status === 'BOND_STATUS_BONDED' && !v.jailed).length;
    const jailed     = validators.filter(v => v.jailed).length;
    const loadFactor = active > 0 ? jailed / active : 0;
    return { total: validators.length, active, jailed, loadFactor };
  } catch {
    return null;
  }
}

export async function evaluateValidatorScaling(snapshot: TopologySnapshot): Promise<void> {
  const summary = await fetchValidatorSummary();
  if (!summary) {
    log('debug', 'validator-fetch-failed', {});
    return;
  }

  log('info', 'validator-evaluation', {
    total:      summary.total,
    active:     summary.active,
    jailed:     summary.jailed,
    loadFactor: summary.loadFactor.toFixed(2),
  });

  // Under-replicated validator set
  if (summary.active < VALIDATOR_MIN) {
    log('warn', 'validator-set-small', { active: summary.active, min: VALIDATOR_MIN });
    const deficit = VALIDATOR_MIN - summary.active;
    for (let i = 0; i < deficit; i++) {
      // Spread new validators across regions
      const region: RegionCode = (['NA', 'EU', 'AS'] as RegionCode[])[i % 3] ?? 'NA';
      await deployNode({
        chain:     'l1',
        region,
        nodeType:  'validator',
        reason:    `active validators=${summary.active} < min=${VALIDATOR_MIN}`,
        priority:  'high',
      });
    }
  }

  // High load: jailed validators impacting remaining set
  if (summary.loadFactor > LOAD_THRESHOLD && summary.jailed > 0) {
    log('warn', 'validator-high-load', { loadFactor: summary.loadFactor, jailed: summary.jailed });
    await deployNode({
      chain:    'l1',
      region:   'NA',
      nodeType: 'validator',
      reason:   `load factor ${(summary.loadFactor * 100).toFixed(0)}% exceeds threshold — ${summary.jailed} validators jailed`,
      priority: 'critical',
    });
  }
}
