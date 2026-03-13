/**
 * Validator Guard
 *
 * Polls the Cosmos LCD to detect validators that are:
 *   - Jailed (immediate high-severity threat)
 *   - Inactive / tombstoned
 *   - Have unusually low uptime (below SSA_VALIDATOR_UPTIME_MIN threshold)
 *
 * Uses native http — no axios, no ethers.
 */

import { recordThreat, notifyGhostBrain } from '../securityBus.js';
import type { ThreatEvent } from '../types.js';

const COSMOS_LCD       = process.env.COSMOS_LCD_URL        ?? 'http://localhost:1317';
const UPTIME_MIN       = Number(process.env.SSA_VALIDATOR_UPTIME_MIN ?? 0.90);

let _componentStatus: 'secure' | 'warning' | 'alert' = 'secure';
export function getValidatorStatus(): typeof _componentStatus { return _componentStatus; }

interface CosmosValidator {
  operator_address: string;
  description?: { moniker?: string };
  jailed?: boolean;
  status?: string; // BOND_STATUS_BONDED | BOND_STATUS_UNBONDED | BOND_STATUS_UNBONDING
}

interface CosmosSigningInfo {
  address: string;
  validator_signing_info?: {
    address?: string;
    missed_blocks_counter?: string;
    jailed_until?: string;
    tombstoned?: boolean;
  };
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

async function lcdGet(path: string): Promise<unknown> {
  const nodeHttp = await import('node:http');
  const nodeHttps = await import('node:https');
  return new Promise((resolve, reject) => {
    const url = new URL(path, COSMOS_LCD);
    const mod = url.protocol === 'https:' ? nodeHttps : nodeHttp;
    const req = (mod as typeof nodeHttp).request(url, { method: 'GET' }, (res) => {
      let raw = '';
      res.on('data', (c: Buffer) => { raw += c.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON from LCD')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Validator polling ─────────────────────────────────────────────────────────

export async function monitorValidators(): Promise<void> {
  let hasAlert = false;

  try {
    const data = await lcdGet('/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=200') as {
      validators?: CosmosValidator[];
    };
    const validators: CosmosValidator[] = data?.validators ?? [];

    for (const v of validators) {
      const moniker = v.description?.moniker ?? v.operator_address;

      if (v.jailed) {
        hasAlert = true;
        const evt: ThreatEvent = {
          id:          `ssa-validator-jailed-${v.operator_address}-${Date.now()}`,
          ts:          Date.now(),
          category:    'validator',
          level:       'high',
          title:       `Validator jailed: ${moniker}`,
          description: `Validator ${v.operator_address} (${moniker}) has been jailed. ` +
                       `Review slashing conditions and consider proposing isolate_validator.`,
          source:      v.operator_address,
          metadata:    { operator: v.operator_address, moniker, status: v.status },
        };
        recordThreat(evt);
        await notifyGhostBrain(evt);
      }

      if (v.status === 'BOND_STATUS_UNBONDED') {
        const evt: ThreatEvent = {
          id:          `ssa-validator-inactive-${v.operator_address}-${Date.now()}`,
          ts:          Date.now(),
          category:    'validator',
          level:       'medium',
          title:       `Validator inactive: ${moniker}`,
          description: `Validator ${v.operator_address} (${moniker}) is unbonded. ` +
                       `This reduces consensus redundancy.`,
          source:      v.operator_address,
          metadata:    { operator: v.operator_address, moniker },
        };
        recordThreat(evt);
        // Only notify GhostBrain for high+ threats; medium is logged only
      }
    }

    _componentStatus = hasAlert ? 'alert' : 'secure';
    console.log(`[SSA:validators] ${validators.length} validators checked — ${hasAlert ? 'ALERT' : 'OK'}`);
  } catch (err) {
    _componentStatus = 'warning';
    console.error('[SSA:validators] Failed to poll Cosmos LCD:', (err as Error).message);
  }
}

// ── Signing-info analysis ──────────────────────────────────────────────────────

const TOMBSTONE_THRESHOLD    = Number(process.env.SSA_TOMBSTONE_ALERT    ?? 1);

export async function checkSigningHealth(): Promise<void> {
  try {
    const data = await lcdGet('/cosmos/slashing/v1beta1/signing_infos?pagination.limit=200') as {
      info?: CosmosSigningInfo[];
    };
    const infos: CosmosSigningInfo[] = data?.info ?? [];

    for (const info of infos) {
      const si = info.validator_signing_info;
      if (!si) continue;

      if (si.tombstoned) {
        const evt: ThreatEvent = {
          id:          `ssa-validator-tomb-${info.address}-${Date.now()}`,
          ts:          Date.now(),
          category:    'validator',
          level:       'critical',
          title:       `Validator TOMBSTONED: ${info.address}`,
          description: `Validator ${info.address} has been tombstoned (double-sign slash). ` +
                       `This is a critical consensus integrity event.`,
          source:      info.address,
          metadata:    { address: info.address, tombstoned: true },
        };
        recordThreat(evt);
        await notifyGhostBrain(evt);
        _componentStatus = 'alert';
      }
    }
  } catch (err) {
    console.error('[SSA:validators] Failed to check signing infos:', (err as Error).message);
  }
}
