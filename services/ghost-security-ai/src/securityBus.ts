/**
 * Security proposal + threat event tracking.
 *
 * All security proposals are advisory: true — only humans (via signing relay)
 * can execute defensive actions. The SSA is a detection + proposal engine only.
 *
 * Threat events are also forwarded to GhostBrain Core so the AI Swarm can
 * factor them into broader operational decisions.
 */

import { request as httpRequest }  from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { ThreatEvent, SecurityProposal, ThreatLevel } from './types.js';

const RELAY_URL         = process.env.SIGNING_RELAY_URL  ?? 'http://localhost:7910';
const GHOSTBRAIN_URL    = process.env.GHOSTBRAIN_CORE_URL ?? 'http://localhost:7900';
const DRY_RUN           = process.env.SSA_DRY_RUN === '1';
const RING_CAP          = 200;
const TIMEOUT_MS        = 5000;

// ── In-memory rings ───────────────────────────────────────────────────────────

const _threats:   ThreatEvent[]     = [];
const _proposals: SecurityProposal[] = [];
let   _totalProposals = 0;

export function getRecentThreats(n = 20):   ThreatEvent[]      { return _threats.slice(-n).reverse();   }
export function getRecentProposals(n = 20): SecurityProposal[]  { return _proposals.slice(-n).reverse(); }
export function getTotalProposalCount(): number { return _totalProposals; }

// ── Threat registry ───────────────────────────────────────────────────────────

export function recordThreat(evt: ThreatEvent): void {
  _threats.push(evt);
  if (_threats.length > RING_CAP) _threats.shift();
  console.warn(`[SSA:threat] [${evt.level.toUpperCase()}] ${evt.category}: ${evt.title}`);
}

/** Highest threat level among recent events (last 10 minutes) */
export function currentThreatLevel(): ThreatLevel {
  const cutoff = Date.now() - 600_000;
  const levels: ThreatLevel[] = ['critical', 'high', 'medium', 'low', 'none'];
  const recent = _threats.filter((t) => t.ts > cutoff);
  for (const l of levels) {
    if (recent.some((t) => t.level === l)) return l;
  }
  return 'none';
}

// ── HTTP fire-and-forget ──────────────────────────────────────────────────────

function postJson(url: string, body: unknown): Promise<void> {
  return new Promise((resolve) => {
    const raw    = JSON.stringify(body);
    let parsed: URL;
    try { parsed = new URL(url); } catch { resolve(); return; }

    const isHttps = parsed.protocol === 'https:';
    const reqFn   = isHttps ? httpsRequest : httpRequest;

    const req = reqFn(
      {
        hostname: parsed.hostname,
        port:     Number(parsed.port) || (isHttps ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) },
        timeout:  TIMEOUT_MS,
      },
      (res) => { res.resume(); res.on('end', resolve); res.on('error', () => resolve()); }
    );
    req.on('error',   () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(raw);
    req.end();
  });
}

// ── Proposal submission ───────────────────────────────────────────────────────

export async function submitProposal(proposal: SecurityProposal): Promise<void> {
  _proposals.push(proposal);
  if (_proposals.length > RING_CAP) _proposals.shift();
  _totalProposals++;

  if (DRY_RUN) {
    console.log(`[SSA:proposal:dry-run] ${proposal.mitigation} — ${proposal.description}`);
    return;
  }

  await postJson(`${RELAY_URL}/proposals`, proposal);
  console.log(`[SSA:proposal] submitted ${proposal.mitigation} (id=${proposal.id})`);
}

// ── GhostBrain notification ───────────────────────────────────────────────────

export async function notifyGhostBrain(evt: ThreatEvent): Promise<void> {
  if (DRY_RUN) return;
  await postJson(`${GHOSTBRAIN_URL}/security/alert`, {
    source:    'ghost-security-ai',
    ts:        evt.ts,
    level:     evt.level,
    category:  evt.category,
    title:     evt.title,
    eventId:   evt.id,
  });
}
