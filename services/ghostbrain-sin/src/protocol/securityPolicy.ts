// SIN — Security Policy Engine
// Evaluates the network's security posture across four threat domains:
//   • validator-collusion   — concentration and offline patterns
//   • governance-attack     — low participation / quorum manipulation risk
//   • bridge-exploit        — bridge TVL concentration and message queue depth
//   • token-concentration   — GST holder concentration (whale risk)
// DETECT-AND-PROPOSE only; policy updates require human ratification.

import { randomUUID }  from 'crypto';
import { API_BASE }    from '../config/sinConfig.js';
import { SIN_RULES }   from '../config/sinRules.js';
import type { SecurityPolicyResult } from '../types.js';

interface ValidatorSummary {
  totalValidators?:   number;
  offlineValidators?: number;
  onlinePct?:         number;
  topRegionPct?:      number;
}

interface GovernanceSummary {
  participationPct?:  number;
  proposalCount?:     number;
  avgTurnoutPct?:     number;
}

interface BridgeSummary {
  pendingMessages?:   number;
  escrowGst?:         string;     // wei string
  totalTvlGst?:       string;
}

interface TokenomicsSummary {
  top10HoldersPct?:   number;
  top50HoldersPct?:   number;
}

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

export async function evaluateSecurityPolicies(): Promise<SecurityPolicyResult[]> {
  const evaluatedAt = Date.now();
  const results: SecurityPolicyResult[] = [];

  const [validators, gov, bridge, tokenomics] = await Promise.all([
    safeFetch<ValidatorSummary>(`${API_BASE}/api/validators/summary`),
    safeFetch<GovernanceSummary>(`${API_BASE}/api/governance/stats`),
    safeFetch<BridgeSummary>(`${API_BASE}/api/bridge/status`),
    safeFetch<TokenomicsSummary>(`${API_BASE}/api/econ/tokenomics`),
  ]);

  // ── Validator collusion / concentration ──────────────────────────────────
  if (validators) {
    const total = validators.totalValidators ?? 0;
    const offline = validators.offlineValidators ?? 0;
    const offlinePct = total > 0 ? (offline / total) * 100 : 0;
    const regionPct  = validators.topRegionPct ?? 0;

    let severity: SecurityPolicyResult['severity'] = 'low';
    let description: string;
    let policyUpdate: string;

    if (offlinePct >= SIN_RULES.criticalValidatorOfflinePct) {
      severity = 'critical';
      description = `${offlinePct.toFixed(1)}% of validators offline — consensus at risk`;
      policyUpdate = 'Activate emergency validator recruitment; route traffic to online clusters; escalate to governance immediately';
    } else if (offlinePct >= SIN_RULES.highValidatorOfflinePct) {
      severity = 'high';
      description = `${offlinePct.toFixed(1)}% of validators offline — above high-severity threshold (${SIN_RULES.highValidatorOfflinePct}%)`;
      policyUpdate = 'Draft validator on-call proposal; increase monitoring cadence to 60 s; notify regional AI controllers';
    } else if (regionPct > SIN_RULES.maxRegionalConcentrationPct) {
      severity = 'medium';
      description = `Single region controls ${regionPct.toFixed(1)}% of validator stake — exceeds ${SIN_RULES.maxRegionalConcentrationPct}% concentration limit`;
      policyUpdate = 'Draft geographic rebalancing proposal; incentivise validators in under-represented regions';
    } else {
      severity = 'low';
      description = `Validator distribution within policy bounds (${offlinePct.toFixed(1)}% offline, ${regionPct.toFixed(1)}% top region)`;
      policyUpdate = 'No immediate action required; continue routine monitoring';
    }

    results.push({ id: randomUUID(), domain: 'validator-collusion', severity, description, policyUpdate, evaluatedAt });
  }

  // ── Governance attack surface ─────────────────────────────────────────────
  if (gov) {
    const turnout = gov.avgTurnoutPct ?? gov.participationPct ?? 100;
    let severity: SecurityPolicyResult['severity'];
    let description: string;
    let policyUpdate: string;

    if (turnout < 30) {
      severity = 'high';
      description = `Governance turnout at ${turnout.toFixed(1)}% — low participation enables minority capture`;
      policyUpdate = 'Propose delegated voting mechanism; increase validator participation incentives by 5% APR boost';
    } else if (turnout < 51) {
      severity = 'medium';
      description = `Governance turnout at ${turnout.toFixed(1)}% — below 51% safe-participation threshold`;
      policyUpdate = 'Notify validators of pending proposals; review quorum requirements in GhostConstitution';
    } else {
      severity = 'low';
      description = `Governance participation healthy at ${turnout.toFixed(1)}%`;
      policyUpdate = 'Maintain current participation incentives';
    }

    results.push({ id: randomUUID(), domain: 'governance-attack', severity, description, policyUpdate, evaluatedAt });
  }

  // ── Bridge exploit surface ────────────────────────────────────────────────
  if (bridge) {
    const pending = bridge.pendingMessages ?? 0;
    let severity: SecurityPolicyResult['severity'];
    let description: string;
    let policyUpdate: string;

    if (pending > 10_000) {
      severity = 'critical';
      description = `Bridge message queue depth ${pending.toLocaleString()} — potential congestion attack`;
      policyUpdate = 'Trip CircuitBreaker.pause(); notify signing relay; drain queue with priority ordering';
    } else if (pending > 2_000) {
      severity = 'high';
      description = `Bridge queue depth ${pending.toLocaleString()} — elevated above normal (2 000)`;
      policyUpdate = 'Increase sequencer throughput; monitor for sustained growth; pre-stage circuit-breaker trigger';
    } else {
      severity = 'low';
      description = `Bridge queue depth ${pending} within normal operating range`;
      policyUpdate = 'No changes required';
    }

    results.push({ id: randomUUID(), domain: 'bridge-exploit', severity, description, policyUpdate, evaluatedAt });
  }

  // ── Token concentration ───────────────────────────────────────────────────
  if (tokenomics) {
    const top10 = tokenomics.top10HoldersPct ?? 0;
    let severity: SecurityPolicyResult['severity'];
    let description: string;
    let policyUpdate: string;

    if (top10 > 60) {
      severity = 'high';
      description = `Top-10 addresses hold ${top10.toFixed(1)}% of GST supply — extreme concentration`;
      policyUpdate = 'Draft progressive burn incentive proposal; review treasury distribution to ecosystem grants to reduce concentration';
    } else if (top10 > 40) {
      severity = 'medium';
      description = `Top-10 addresses hold ${top10.toFixed(1)}% of GST supply — elevated concentration`;
      policyUpdate = 'Increase validator staking rewards to encourage broader distribution; review GST unlock schedules';
    } else {
      severity = 'low';
      description = `GST distribution healthy — top 10 hold ${top10.toFixed(1)}%`;
      policyUpdate = 'Continue monitoring; no policy change needed';
    }

    results.push({ id: randomUUID(), domain: 'token-concentration', severity, description, policyUpdate, evaluatedAt });
  }

  return results;
}
