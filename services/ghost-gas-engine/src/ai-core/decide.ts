import type { ChainConfig } from '../config.js';
import { resolveAutonomyConfig } from '../autonomy/engine.js';
import { getAutonomyOverrides } from '../autonomy/store.js';
import { recordAiEvent, recordDecision, recordAction, getPolicyConstraints } from './store.js';
import type { AiCoreAction, AiCoreDecision, AiCoreMode } from './types.js';

const normalizeMode = (mode: string): AiCoreMode => {
  if (mode === 'DRY_RUN') return 'OBSERVE_ONLY';
  if (mode === 'OBSERVE_ONLY') return 'OBSERVE_ONLY';
  if (mode === 'ADVISORY') return 'ADVISORY';
  if (mode === 'ASSISTED') return 'ASSISTED';
  if (mode === 'AUTONOMOUS_STRICT') return 'AUTONOMOUS_STRICT';
  return 'AUTONOMOUS';
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const actionFromRisk = (risk: number, recommended: AiCoreAction): AiCoreAction => {
  if (risk >= 0.85) return 'BLOCK';
  if (risk >= 0.65) return recommended === 'ALLOW' ? 'MODIFY' : recommended;
  return recommended;
};

export const decideForChain = async (input: {
  chain: ChainConfig;
  prediction: {
    id: string;
    riskScore: number;
    confidence: number;
    recommendedAction: AiCoreAction;
    affectedSubsystem: string;
    features: Record<string, unknown>;
  };
  deploymentId?: string;
  mode?: AiCoreMode;
}) => {
  const overrides = await getAutonomyOverrides();
  const settings = resolveAutonomyConfig(overrides);
  const mode = normalizeMode(input.mode ?? settings.mode);
  const constraints = await getPolicyConstraints(input.chain.key);

  const maxRisk = constraints?.maxRisk ?? settings.maxRisk;
  const allowedActions = constraints?.allowedActions;

  let action: AiCoreAction = actionFromRisk(input.prediction.riskScore, input.prediction.recommendedAction);
  let status = 'executed';
  const rationale: Record<string, unknown> = {
    riskScore: input.prediction.riskScore,
    confidence: input.prediction.confidence,
    recommendedAction: input.prediction.recommendedAction,
    affectedSubsystem: input.prediction.affectedSubsystem
  };

  if (!settings.enabled || mode === 'OBSERVE_ONLY') {
    action = 'DEFER';
    status = 'observed';
    rationale.note = 'observe_only';
  } else if (mode === 'ADVISORY') {
    action = 'ESCALATE';
    status = 'pending';
    rationale.note = 'advisory_mode';
  }

  if (input.prediction.riskScore >= maxRisk) {
    if (mode === 'ASSISTED' || mode === 'ADVISORY') {
      action = 'ESCALATE';
      status = 'pending';
      rationale.note = 'risk_threshold_exceeded';
    } else if (mode === 'AUTONOMOUS_STRICT') {
      action = 'BLOCK';
      status = 'blocked';
      rationale.note = 'strict_block';
    } else if (mode === 'AUTONOMOUS') {
      action = 'BLOCK';
      status = 'blocked';
      rationale.note = 'risk_block';
    }
  }

  if (allowedActions && !allowedActions.includes(action)) {
    action = 'ESCALATE';
    status = 'pending';
    rationale.note = 'action_outside_policy';
  }

  const decisionRecord: Omit<AiCoreDecision, 'id' | 'createdAt'> = {
    chainKey: input.chain.key,
    mode,
    action,
    status,
    riskScore: clamp(input.prediction.riskScore),
    confidence: clamp(input.prediction.confidence),
    forecastId: input.prediction.id,
    deploymentId: input.deploymentId ?? null,
    rationale
  };

  const inserted = await recordDecision(decisionRecord);
  await recordAiEvent(input.chain.key, 'decide', 'decision_made', {
    decisionId: inserted.id,
    action,
    status
  });

  await recordAction({
    decisionId: inserted.id,
    chainKey: input.chain.key,
    actionType: action,
    status,
    payload: { mode, riskScore: input.prediction.riskScore }
  });

  return { decisionId: inserted.id, action, status, mode };
};
