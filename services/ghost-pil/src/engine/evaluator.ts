import crypto from 'crypto';
import type { DecisionInput, DecisionOutput, Jurisdiction, LegalSignal } from './types';

const riskRank: Record<Jurisdiction['riskTier'], number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  EXTREME: 4
};

const highRiskActions = new Set(['TRANSFER', 'BRIDGE', 'SWAP', 'MINT_NFT', 'GOV_ACTION', 'TREASURY_PAYOUT']);

const pickJurisdictions = (input: DecisionInput): string[] => {
  const subject = input.subject || {};
  const context = input.context || {};
  const candidates = [
    subject.residencyCountry,
    subject.walletCountry,
    subject.userCountry,
    context.ipCountry,
    context.validatorJurisdiction,
    context.operatorJurisdiction,
    context.chainJurisdiction
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return Array.from(new Set(candidates.map((code) => code.toUpperCase())));
};

const selectHighestRisk = (jurisdictions: Jurisdiction[], candidates: string[]): Jurisdiction | null => {
  const available = jurisdictions.filter((jur) => candidates.includes(jur.code));
  if (!available.length) return null;
  return available.reduce((prev, current) => (riskRank[current.riskTier] > riskRank[prev.riskTier] ? current : prev));
};

const findSanctionsSignal = (signals: LegalSignal[], jurisdictionCode: string | null) => {
  if (!jurisdictionCode) return null;
  return signals.find(
    (signal) =>
      signal.jurisdictionCode === jurisdictionCode &&
      signal.category.toUpperCase().includes('SANCTION') &&
      ['HIGH', 'EXTREME'].includes(signal.severity.toUpperCase())
  );
};

export const evaluateDecision = (
  input: DecisionInput,
  jurisdictions: Jurisdiction[],
  signals: LegalSignal[],
  policyPackId?: string | null
): DecisionOutput => {
  const candidates = pickJurisdictions(input);
  const fallback = jurisdictions.find((jur) => jur.code === 'GLOBAL') || jurisdictions[0];
  const selected = selectHighestRisk(jurisdictions, candidates) || fallback;
  const correlationId = input.requestId || crypto.randomUUID();
  const reasons: string[] = [];
  const explainabilityGraph: Record<string, unknown> = {
    candidates,
    selectedJurisdiction: selected?.code,
    signalsEvaluated: signals.filter((signal) => candidates.includes(signal.jurisdictionCode)).map((signal) => signal.id),
    rulesTriggered: [] as string[]
  };

  if (!selected) {
    return {
      decision: 'ALLOW',
      reasons: ['NO_JURISDICTION_MATCH'],
      jurisdictionApplied: 'GLOBAL',
      policyPackId: policyPackId || null,
      explainabilityGraph,
      correlationId
    };
  }

  const sanctions = findSanctionsSignal(signals, selected.code);
  if (sanctions) {
    reasons.push('SANCTIONS_BLOCK');
    (explainabilityGraph.rulesTriggered as string[]).push('SANCTIONS_BLOCK');
    return {
      decision: 'BLOCK',
      reasons,
      jurisdictionApplied: selected.code,
      policyPackId: policyPackId || null,
      explainabilityGraph,
      correlationId
    };
  }

  if (selected.riskTier === 'EXTREME' && highRiskActions.has(input.action)) {
    reasons.push('EXTREME_RISK_BLOCK');
    (explainabilityGraph.rulesTriggered as string[]).push('EXTREME_RISK_BLOCK');
    return {
      decision: 'BLOCK',
      reasons,
      jurisdictionApplied: selected.code,
      policyPackId: policyPackId || null,
      explainabilityGraph,
      correlationId
    };
  }

  if (selected.riskTier === 'HIGH' && highRiskActions.has(input.action)) {
    reasons.push('HIGH_RISK_WARN');
    (explainabilityGraph.rulesTriggered as string[]).push('HIGH_RISK_WARN');
    return {
      decision: 'WARN',
      reasons,
      jurisdictionApplied: selected.code,
      policyPackId: policyPackId || null,
      explainabilityGraph,
      correlationId
    };
  }

  reasons.push('ALLOW_DEFAULT');
  return {
    decision: 'ALLOW',
    reasons,
    jurisdictionApplied: selected.code,
    policyPackId: policyPackId || null,
    explainabilityGraph,
    correlationId
  };
};
