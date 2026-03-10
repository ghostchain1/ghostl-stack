// validatorAnalyzer — reads real validator load distribution from the
// GhostBrain validators/health endpoint and detects imbalance.
// Never uses Math.random(); all values come from live data.
import type { AnalysisResult } from '../types.js';
import { RULES } from '../config/evolutionRules.js';

interface ValidatorHealth {
  id: string;
  loadPct?: number;
  votingPowerPct?: number;
  missedBlocksPct?: number;
  jailed?: boolean;
}

interface ValidatorsHealthPayload {
  validators?: ValidatorHealth[];
}

async function fetchValidators(): Promise<ValidatorHealth[]> {
  const resp = await fetch(`${RULES.ghostbrainUrl}/validators/health`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!resp.ok) throw new Error(`ghostbrain /validators/health ${resp.status}`);
  const data = await resp.json() as ValidatorsHealthPayload | ValidatorHealth[];
  // API may return { validators: [...] } or a bare array
  return Array.isArray(data) ? data : (data.validators ?? []);
}

export async function analyzeValidators(): Promise<AnalysisResult> {
  const now = new Date().toISOString();

  let validators: ValidatorHealth[];
  try {
    validators = await fetchValidators();
  } catch (err) {
    return { improvementDetected: false, source: 'validator', detail: `validator health unavailable: ${(err as Error).message}`, ts: now };
  }

  if (validators.length < 2) {
    return { improvementDetected: false, source: 'validator', detail: 'insufficient validator data for balance analysis', ts: now };
  }

  const loads = validators
    .map(v => v.loadPct ?? v.votingPowerPct)
    .filter((x): x is number => x !== undefined);

  if (loads.length < 2) {
    return { improvementDetected: false, source: 'validator', detail: 'validator load metrics not available', ts: now };
  }

  const max = Math.max(...loads);
  const min = Math.min(...loads);
  const delta = max - min;

  if (delta > RULES.validatorBalanceThresholdPct) {
    return {
      improvementDetected: true,
      type: 'validator_rebalancing',
      source: 'validator',
      value: delta,
      detail: `Validator load imbalance of ${delta.toFixed(1)}% (max ${max.toFixed(1)}% / min ${min.toFixed(1)}%) — rebalancing may improve throughput`,
      ts: now,
    };
  }

  return {
    improvementDetected: false,
    source: 'validator',
    detail: `Validator load balanced — max delta ${delta.toFixed(1)}%`,
    ts: now,
  };
}
