import type { ChainConfig } from '../config.js';
import { query } from '../db/index.js';
import { recordAiEvent, recordGovernanceRecommendation } from './store.js';

const hasOpenRecommendation = async (chainKey: string, category: string) => {
  const rows = await query<{ id: string }>(
    `SELECT id FROM ai_governance_recommendations
     WHERE chain_key = $1 AND category = $2 AND status = 'open'
     ORDER BY created_at DESC LIMIT 1`,
    [chainKey, category]
  );
  return Boolean(rows[0]);
};

export const evaluateGovernance = async (
  chain: ChainConfig,
  prediction: { riskScore: number; recommendedAction: string; affectedSubsystem: string }
) => {
  const recommendations: Array<{ id: string; category: string }> = [];

  if (prediction.riskScore >= 0.7) {
    const category = 'execution-risk';
    if (!(await hasOpenRecommendation(chain.key, category))) {
      const inserted = await recordGovernanceRecommendation({
        chainKey: chain.key,
        category,
        severity: prediction.riskScore >= 0.85 ? 'high' : 'medium',
        summary: `Elevated execution risk on ${chain.name}`,
        recommendation: `Review gas policy and sequencing strategy. Recommended action: ${prediction.recommendedAction}.`
      });
      recommendations.push({ id: inserted.id, category });
      await recordAiEvent(chain.key, 'govern', 'recommendation_created', {
        recommendationId: inserted.id,
        category
      });
    }
  }

  if (prediction.affectedSubsystem === 'sequencer' && prediction.riskScore >= 0.55) {
    const category = 'sequencer-health';
    if (!(await hasOpenRecommendation(chain.key, category))) {
      const inserted = await recordGovernanceRecommendation({
        chainKey: chain.key,
        category,
        severity: 'medium',
        summary: `Sequencer pressure detected on ${chain.name}`,
        recommendation: 'Throttle batch submission or increase sequencer capacity.'
      });
      recommendations.push({ id: inserted.id, category });
      await recordAiEvent(chain.key, 'govern', 'recommendation_created', {
        recommendationId: inserted.id,
        category
      });
    }
  }

  return recommendations;
};
