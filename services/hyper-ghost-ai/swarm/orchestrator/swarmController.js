/**
 * @file swarm/orchestrator/swarmController.js
 * @description GhostStack AI Swarm — Central orchestrator.
 *
 * Responsibilities:
 *   1. Start all domain agents (side-effect imports register listeners)
 *   2. Start intelligence modules (anomaly detection, prediction engine)
 *   3. Receive `swarm:proposal` events from agents and forward them to the
 *      signing relay — NO autonomous on-chain execution
 *   4. Maintain an in-memory ring buffer of events and actions (last 500 each)
 *   5. Expose status, event-log, and action-log via exported functions
 *      (called by src/index.js HTTP routes)
 *
 * Governance model:
 *   Agents NEVER execute infrastructure operations directly.  They emit
 *   `swarm:proposal` events which the controller serialises and POSTs to
 *   SIGNING_RELAY_URL.  A human operator reviews and ratifies each proposal.
 */

import https from 'node:https';
import http  from 'node:http';
import crypto from 'node:crypto';
import { swarmBus } from '../messaging/eventBus.js';

// ── Agent registration (side-effect imports) ──────────────────────────────────
import '../agents/nocAgent.js';
import '../agents/validatorAgent.js';
import '../agents/devopsAgent.js';
import '../agents/treasuryAgent.js';
import '../agents/governanceAgent.js';
import '../agents/securityAgent.js';

// ── Intelligence module registration ─────────────────────────────────────────
import { startAnomalyDetection, getAnomalyStats } from '../intelligence/anomalyDetection.js';
import { startPredictionEngine, getPredictionStats } from '../intelligence/predictionEngine.js';

// ── Config ────────────────────────────────────────────────────────────────────
const SIGNING_RELAY_URL = process.env.SIGNING_RELAY_URL ?? 'http://localhost:7910';
const DRY_RUN           = (process.env.SWARM_DRY_RUN ?? '0') === '1';
const RING_CAPACITY     = 500;

function log(level, msg, extra = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, svc: 'swarm-controller', msg, ...extra }) + '\n'
  );
}

// ── Ring buffer helpers ───────────────────────────────────────────────────────
function makeRing(capacity) {
  const buf = [];
  return {
    push(item) { buf.push(item); if (buf.length > capacity) buf.shift(); },
    dump(n = 50) { return buf.slice(-Math.min(n, capacity)); },
    size() { return buf.length; },
  };
}

const eventRing  = makeRing(RING_CAPACITY);
const actionRing = makeRing(RING_CAPACITY);

// ── Counters ──────────────────────────────────────────────────────────────────
let _proposalsTotal  = 0;
let _proposalsFailed = 0;
let _startedAt       = null;

// ── Signing-relay submission ──────────────────────────────────────────────────
async function submitProposal(proposal) {
  _proposalsTotal++;
  const payload = JSON.stringify(proposal);

  if (DRY_RUN) {
    log('info', 'dry-run-proposal', { proposalId: proposal.proposalId, action: proposal.action });
    return;
  }

  const url        = new URL('/proposals', SIGNING_RELAY_URL);
  const transport  = url.protocol === 'https:' ? https : http;
  const options    = {
    hostname: url.hostname,
    port:     url.port || (url.protocol === 'https:' ? 443 : 80),
    path:     url.pathname,
    method:   'POST',
    headers:  {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent':     'hyper-ghost-ai-swarm/1.0',
    },
    timeout: 5000,
  };

  return new Promise((resolve) => {
    const req = transport.request(options, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        log('info', 'proposal-submitted', { proposalId: proposal.proposalId, status: res.statusCode });
      } else {
        _proposalsFailed++;
        log('warn', 'proposal-rejected', { proposalId: proposal.proposalId, status: res.statusCode });
      }
      resolve();
    });
    req.on('error', (err) => {
      _proposalsFailed++;
      log('error', 'proposal-submission-failed', { proposalId: proposal.proposalId, error: err.message });
      resolve();
    });
    req.on('timeout', () => {
      _proposalsFailed++;
      log('warn', 'proposal-timeout', { proposalId: proposal.proposalId });
      req.destroy();
      resolve();
    });
    req.write(payload);
    req.end();
  });
}

// ── Event listeners ───────────────────────────────────────────────────────────

/** Receive proposals from agents, persist, forward to relay. */
async function handleProposal(proposal) {
  const id = proposal.proposalId ?? crypto.randomUUID();
  const enriched = { ...proposal, proposalId: id, receivedAt: Date.now() };
  actionRing.push(enriched);

  log('info', 'swarm-proposal-received', { proposalId: id, action: proposal.action, agent: proposal.agent });
  await submitProposal(enriched);
  swarmBus.emit('swarm:action', enriched);
}

// ── Exported API (used by HTTP layer in src/index.js) ─────────────────────────

/** @returns {object} current swarm status snapshot */
export function getSwarmStatus() {
  return {
    ok:       true,
    started:  _startedAt,
    uptime:   _startedAt ? Date.now() - _startedAt : 0,
    dryRun:   DRY_RUN,
    agents: {
      names:  ['noc', 'validator', 'devops', 'treasury', 'governance', 'security'],
      count:  6,
    },
    intelligence: {
      anomaly:    getAnomalyStats(),
      prediction: getPredictionStats(),
    },
    proposals: {
      total:  _proposalsTotal,
      failed: _proposalsFailed,
    },
    events:  { buffered: eventRing.size() },
    actions: { buffered: actionRing.size() },
  };
}

/** @param {number} [n=50] max entries */
export function getSwarmEvents(n = 50) {
  return eventRing.dump(n);
}

/** @param {number} [n=50] max entries */
export function getSwarmActions(n = 50) {
  return actionRing.dump(n);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

/** Boot the swarm.  Safe to call once per process. */
export function startSwarm() {
  if (_startedAt !== null) {
    log('warn', 'swarm-already-started');
    return;
  }
  _startedAt = Date.now();

  // Wire up bus listeners
  swarmBus.on('swarm:proposal', (p) => handleProposal(p).catch((err) => {
    log('error', 'proposal-handler-error', { error: err.message });
  }));

  // Record generic swarm events into the ring (intelligence modules emit both the
  // specific named event AND a generic 'swarm:event' entry for the ring buffer)
  swarmBus.on('swarm:event', (entry) => {
    eventRing.push({ id: crypto.randomUUID(), ts: Date.now(), ...entry });
  });

  // Start intelligence modules
  startAnomalyDetection();
  startPredictionEngine();

  swarmBus.emit('swarm:started', { startedAt: _startedAt });
  log('info', 'swarm-started', { agents: 6, dryRun: DRY_RUN });
}
