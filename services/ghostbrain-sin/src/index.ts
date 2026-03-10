// GhostBrain Sovereign Intelligence Network (SIN) — service entry point
// Port 7928 | 120-second cycle
// DETECT/DRAFT only — AI may write proposals; humans must ratify via GhostChain governance.

import http from 'http';
import { randomUUID } from 'crypto';
import {
  SIN_PORT,
  CYCLE_INTERVAL_MS,
  DRY_RUN,
  SIGNING_RELAY_URL,
  MAX_PROPOSALS_PER_CYCLE,
} from './config/sinConfig.js';

import { draftGovernanceProposals }         from './governance/aiGovernanceDrafter.js';
import { analyseGstPolicy }                 from './economics/gstPolicyEngine.js';
import { adviseTreasuryAllocation }         from './treasury/treasuryInvestmentAdvisor.js';
import { proposeProtocolUpgrades }          from './protocol/protocolUpgradeAdvisor.js';
import { coordinateLearning, recentLearningEvents } from './learning/globalLearningCoordinator.js';

import type { SINSnapshot, SINProposal } from './types.js';

let latestSnapshot: SINSnapshot | null = null;

async function submitProposal(p: SINProposal): Promise<void> {
  if (DRY_RUN) {
    console.log('[sin] DRY_RUN proposal:', JSON.stringify(p, null, 2));
    return;
  }
  try {
    const res = await fetch(`${SIGNING_RELAY_URL}/proposals`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(p),
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) console.warn(`[sin] relay rejected ${p.id}: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`[sin] relay unreachable for ${p.id}:`, (err as Error).message);
  }
}

async function sinCycle(): Promise<void> {
  const cycleAt = Date.now();
  console.log(`\n[sin] ──── GhostBrain SIN cycle @ ${new Date(cycleAt).toISOString()}`);

  // Run all analysis modules concurrently
  const [govDrafts, gstPolicy, treasuryAlloc, protocolProps, learningEvents] =
    await Promise.all([
      draftGovernanceProposals(),
      analyseGstPolicy(),
      adviseTreasuryAllocation(),
      proposeProtocolUpgrades(),
      coordinateLearning(),
    ]);

  // Convert analysis outputs → relay-bound proposals
  const sinProposals: SINProposal[] = [];

  for (const draft of govDrafts) {
    sinProposals.push({
      id:          randomUUID(),
      type:        'governance-draft',
      description: `[Governance Draft] ${draft.title}`,
      payload:     { ...draft },
      urgency:     draft.confidence >= 0.85 ? 'high' : 'medium',
      createdAt:   Date.now(),
      requiresHumanRatification: true,
    });
  }

  if (gstPolicy && gstPolicy.recommendation !== 'stable') {
    sinProposals.push({
      id:          randomUUID(),
      type:        'gst-policy',
      description: `[GST Policy] ${gstPolicy.recommendation}: ${gstPolicy.rationale.slice(0, 120)}`,
      payload:     { ...gstPolicy },
      urgency:     Math.abs(gstPolicy.proposedAdjustmentPct) >= 0.5 ? 'high' : 'medium',
      createdAt:   Date.now(),
      requiresHumanRatification: true,
    });
  }

  if (treasuryAlloc) {
    const majorShifts = treasuryAlloc.allocations.filter(
      (a) => Math.abs(a.currentPct - a.proposedPct) >= 5,
    );
    if (majorShifts.length > 0) {
      sinProposals.push({
        id:          randomUUID(),
        type:        'treasury-reallocation',
        description: `[Treasury] ${majorShifts.length} allocation(s) deviate ≥5pp from target`,
        payload:     { ...treasuryAlloc },
        urgency:     majorShifts.length >= 3 ? 'high' : 'medium',
        createdAt:   Date.now(),
        requiresHumanRatification: true,
      });
    }
  }

  for (const pp of protocolProps) {
    sinProposals.push({
      id:          randomUUID(),
      type:        'protocol-upgrade',
      description: `[Protocol] ${pp.description}`,
      payload:     { ...pp },
      urgency:     pp.riskLevel === 'high' ? 'high' : pp.riskLevel === 'medium' ? 'medium' : 'low',
      createdAt:   Date.now(),
      requiresHumanRatification: true,
    });
  }

  // Cap proposals per cycle
  const capped = sinProposals
    .sort((a, b) => {
      const ord = { critical: 0, high: 1, medium: 2, low: 3 };
      return ord[a.urgency] - ord[b.urgency];
    })
    .slice(0, MAX_PROPOSALS_PER_CYCLE);

  if (capped.length) {
    console.log(`[sin] Submitting ${capped.length} proposal(s) to relay`);
    await Promise.all(capped.map(submitProposal));
  }

  console.log('[sin] Learning events this cycle:', learningEvents.length);

  latestSnapshot = {
    cycleAt,
    governanceDrafts: govDrafts,
    gstPolicy,
    treasuryAllocation: treasuryAlloc,
    protocolProposals:  protocolProps,
    learningEvents,
    totalProposals:     capped.length,
    dryRun:             DRY_RUN,
  };

  console.log(
    `[sin] cycle done — govDrafts:${govDrafts.length}  ` +
    `gstRec:${gstPolicy?.recommendation ?? 'none'}  ` +
    `treasuryShifts:${treasuryAlloc?.allocations.filter((a) => Math.abs(a.currentPct - a.proposedPct) >= 5).length ?? 0}  ` +
    `protocolProps:${protocolProps.length}  learningEvents:${learningEvents.length}`,
  );
}

// ── HTTP API ─────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'ghostbrain-sin', port: SIN_PORT }));
    return;
  }

  if (url === '/status') {
    if (!latestSnapshot) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'initializing' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...latestSnapshot,
      recentLearningEvents: recentLearningEvents(20),
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(SIN_PORT, () => {
  console.log(`[sin] GhostBrain Sovereign Intelligence Network listening on :${SIN_PORT}`);
  console.log(`[sin] DRY_RUN=${DRY_RUN}  relay=${SIGNING_RELAY_URL}  cycle=${CYCLE_INTERVAL_MS}ms`);
});

sinCycle().catch((err) => console.error('[sin] cycle error:', err));
setInterval(() => {
  sinCycle().catch((err) => console.error('[sin] cycle error:', err));
}, CYCLE_INTERVAL_MS);
