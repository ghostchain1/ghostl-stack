// AI Governance Drafter — generates structured governance proposal drafts
// from observed chain metrics, treasury state, and validator distribution.
// All drafts require human ratification through GhostChain governance.

import { randomUUID } from 'crypto';
import { API_BASE, QUORUM } from '../config/sinConfig.js';
import type { GovernanceDraft, GovernanceCategory } from '../types.js';

interface ValidatorApiEntry {
  region?: string;
  online?: boolean;
}

interface TreasuryApiEntry {
  totalGst?: string;
  utilizationPct?: number;
}

async function fetchValidators(): Promise<ValidatorApiEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/api/validators`, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) return (await res.json()) as ValidatorApiEntry[];
  } catch { /* offline */ }
  return [];
}

async function fetchTreasury(): Promise<TreasuryApiEntry | null> {
  try {
    const res = await fetch(`${API_BASE}/api/treasury/summary`, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) return (await res.json()) as TreasuryApiEntry;
  } catch { /* offline */ }
  return null;
}

function makeDraft(
  category: GovernanceCategory,
  title: string,
  summary: string,
  rationale: string,
  payload: Record<string, unknown>,
  confidence: number,
): GovernanceDraft {
  return {
    id:       randomUUID(),
    category,
    title,
    summary,
    rationale,
    payload,
    confidence: Math.round(confidence * 100) / 100,
    draftedAt: Date.now(),
    requiresHumanRatification: true,
  };
}

export async function draftGovernanceProposals(): Promise<GovernanceDraft[]> {
  const [validators, treasury] = await Promise.all([fetchValidators(), fetchTreasury()]);
  const drafts: GovernanceDraft[] = [];

  // 1. Validator distribution analysis
  const regionCounts: Record<string, number> = {};
  for (const v of validators) {
    const r = v.region ?? 'unknown';
    regionCounts[r] = (regionCounts[r] ?? 0) + (v.online !== false ? 1 : 0);
  }
  const total = Object.values(regionCounts).reduce((s, c) => s + c, 0);
  if (total > 0) {
    const maxPct = Math.max(...Object.values(regionCounts)) / total;
    if (maxPct > 0.60) {
      // One region holds >60% of validators → concentration risk
      const dominant = Object.entries(regionCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'unknown';
      drafts.push(makeDraft(
        'validator-distribution',
        'Rebalance Validator Geographic Distribution',
        `Region ${dominant} holds ${Math.round(maxPct * 100)}% of active validators — above 60% concentration threshold.`,
        'Geographic concentration creates a single-region attack surface. BFT safety requires ≥⅔ quorum globally. A balanced distribution across NA/EU/Asia reduces correlated failure risk.',
        { dominant, concentrationPct: Math.round(maxPct * 100), regionCounts },
        0.87,
      ));
    }
  }

  // 2. Treasury utilisation analysis
  if (treasury) {
    const util = treasury.utilizationPct ?? 0;
    if (util < 20) {
      drafts.push(makeDraft(
        'treasury-allocation',
        'Increase Treasury Deployment to Ecosystem Grants',
        `Treasury utilisation is at ${util}% — funds are idle. Proposal: redirect ${30 - util}% to ecosystem grant funding.`,
        'Idle treasury capital creates deflationary pressure without yield. Ecosystem grants drive developer adoption, compounding long-term protocol value.',
        { currentUtilPct: util, proposedIncreasePct: 30 - util },
        0.75,
      ));
    } else if (util > 85) {
      drafts.push(makeDraft(
        'treasury-allocation',
        'Replenish Security Reserve Fund',
        `Treasury utilisation at ${util}% — security reserve buffer is critically low.`,
        'A treasury utilisation above 85% leaves insufficient reserves for emergency protocol responses. Recommend reducing non-critical grants temporarily to rebuild the security reserve to 15% of treasury.',
        { currentUtilPct: util, targetReservePct: 15 },
        0.91,
      ));
    }
  }

  // 3. Governance quorum calibration (informational, always useful)
  drafts.push(makeDraft(
    'parameter-change',
    'Review Governance Quorum Parameters',
    'Periodic review of quorum thresholds to ensure they reflect current validator set size and decentralisation level.',
    `Current quorums: low=${QUORUM.low * 100}% / medium=${QUORUM.medium * 100}% / high=${QUORUM.high * 100}%. With ${total} active validators, these translates to ${Math.ceil(total * QUORUM.high)} validators needed for critical proposals.`,
    { validatorTotal: total, quorums: QUORUM },
    0.60,
  ));

  return drafts;
}
