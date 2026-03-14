/**
 * Slashing Monitor
 *
 * Tracks missed block counters from the Cosmos slashing module.
 * Alerts when a validator's missed_blocks_counter increases rapidly
 * (sustained liveness failure → slashing risk).
 *
 * Threshold: SSA_SLASH_MISSED_BLOCKS_THRESHOLD (default: 100 missed per scan window)
 */

import { recordThreat, notifyGhostBrain } from '../securityBus.js';
import type { ThreatEvent } from '../types.js';

const COSMOS_LCD        = process.env.COSMOS_LCD_URL                   ?? 'http://localhost:1317';
const SLASH_THRESHOLD   = Number(process.env.SSA_SLASH_MISSED_BLOCKS   ?? 100);

interface SigningInfo {
  address: string;
  start_height: string;
  index_offset: string;
  jailed_until: string;
  tombstoned: boolean;
  missed_blocks_counter: string;
}

interface LCDResponse {
  info?: { address: string; validator_signing_info?: SigningInfo }[];
}

async function lcdGet(path: string): Promise<unknown> {
  const nodeHttp  = await import('node:http');
  const nodeHttps = await import('node:https');
  return new Promise((resolve, reject) => {
    const url = new URL(path, COSMOS_LCD);
    const mod = url.protocol === 'https:' ? nodeHttps : nodeHttp;
    const req = (mod as typeof nodeHttp).request(url, { method: 'GET' }, (res) => {
      let raw = '';
      res.on('data', (c: Buffer) => { raw += c.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('LCD JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Tracks previous missed-block counts so we can detect per-cycle increases
const _prevMissed = new Map<string, number>();

export async function checkSlashing(): Promise<void> {
  try {
    const data = (await lcdGet(
      '/cosmos/slashing/v1beta1/signing_infos?pagination.limit=200'
    )) as LCDResponse;

    const infos = data?.info ?? [];

    for (const item of infos) {
      const si = item.validator_signing_info;
      if (!si) continue;

      const addr    = item.address;
      const current = parseInt(si.missed_blocks_counter ?? '0', 10);
      const prev    = _prevMissed.get(addr) ?? current;
      const delta   = current - prev;

      _prevMissed.set(addr, current);

      if (delta > 0 && delta >= SLASH_THRESHOLD) {
        const level: ThreatEvent['level'] = delta >= SLASH_THRESHOLD * 3 ? 'critical' : 'high';
        const evt: ThreatEvent = {
          id:          `ssa-slash-${addr}-${Date.now()}`,
          ts:          Date.now(),
          category:    'validator',
          level,
          title:       `Validator missed ${delta} blocks: ${addr.slice(0, 16)}…`,
          description: `Validator ${addr} missed ${delta} blocks in the last scan window ` +
                       `(total: ${current}). Slashing threshold may be imminent.`,
          source:      addr,
          metadata:    { addr, delta, totalMissed: current, threshold: SLASH_THRESHOLD },
        };
        recordThreat(evt);
        await notifyGhostBrain(evt);
      }
    }

    console.log(`[SSA:slashing] ${infos.length} signing infos checked`);
  } catch (err) {
    console.error('[SSA:slashing] Poll failed:', (err as Error).message);
  }
}
