/**
 * Proposal submission — posts advisory proposals to the signing relay.
 *
 * When AEE_DRY_RUN=1 the proposal is logged but NOT sent to the relay.
 * All proposals carry advisory:true and are never autonomously executed.
 */

import { request as httpRequest }  from 'node:http';
import { request as httpsRequest } from 'node:https';
import { type EconomicProposal }   from './types.js';

const RELAY_URL  = process.env.SIGNING_RELAY_URL ?? 'http://localhost:7910';
const DRY_RUN    = process.env.AEE_DRY_RUN === '1';
const TIMEOUT_MS = 5000;

// In-memory ring buffer — last 200 proposals (exposed via /proposals/recent)
const _ring: EconomicProposal[] = [];
const RING_CAP = 200;

export function getRecentProposals(n = 20): EconomicProposal[] {
  return _ring.slice(-n).reverse();
}

export function getTotalProposalCount(): number {
  return _totalSent;
}

let _totalSent = 0;

export async function submitProposal(proposal: EconomicProposal): Promise<void> {
  _ring.push(proposal);
  if (_ring.length > RING_CAP) _ring.shift();
  _totalSent++;

  if (DRY_RUN) {
    console.log(`[AEE:proposal:dry-run] ${proposal.target}/${proposal.action} — ${proposal.reason}`);
    return;
  }

  const body = JSON.stringify(proposal);
  const url  = `${RELAY_URL}/proposals`;

  await new Promise<void>((resolve, reject) => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { reject(new Error(`Invalid relay URL: ${url}`)); return; }

    const isHttps = parsed.protocol === 'https:';
    const reqFn   = isHttps ? httpsRequest : httpRequest;

    const req = reqFn(
      {
        hostname: parsed.hostname,
        port:     Number(parsed.port) || (isHttps ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        // Drain the response to free the socket
        res.resume();
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            console.warn(`[AEE:proposal] relay returned ${res.statusCode} for ${proposal.id}`);
          }
          resolve();
        });
        res.on('error', reject);
      }
    );

    req.on('error',   (e) => { console.error('[AEE:proposal] relay error:', e.message); resolve(); });
    req.on('timeout', () => { req.destroy(); console.warn('[AEE:proposal] relay timeout'); resolve(); });
    req.write(body);
    req.end();
  });

  console.log(`[AEE:proposal] submitted ${proposal.target}/${proposal.action} (id=${proposal.id})`);
}
