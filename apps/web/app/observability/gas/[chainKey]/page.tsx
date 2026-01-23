'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Badge } from '@ghostl/ui';
import { z } from 'zod';
import { DataFetchErrorCard } from '../../../../src/components/DataFetchErrorCard';
import { useSession } from '../../../../src/modules/identity-access/session';
import { normalizeRole, roleOrder } from '../../../../src/modules/identity-access/access-policy';
import {
  fetchGasJson,
  chainsResponseSchema,
  policiesResponseSchema,
  deploymentsResponseSchema,
  metricsSummarySchema,
  chainSchema,
  policySchema,
  deploymentSchema,
  autonomyStatusSchema,
  autonomyDecisionsResponseSchema,
  autonomyForecastsResponseSchema,
  autonomyPolicyDriftResponseSchema,
  autonomyPreventedResponseSchema,
  autonomyDecisionSchema,
  autonomyForecastSchema,
  autonomyPolicyDriftSchema,
  autonomyPreventedSchema,
  aiCorePredictionsResponseSchema,
  aiCoreDecisionsResponseSchema,
  aiCoreActionsResponseSchema,
  aiCoreFingerprintsResponseSchema,
  aiCorePredictionSchema,
  aiCoreDecisionSchema,
  aiCoreActionSchema,
  aiCoreFingerprintSchema,
  postGasAdminJson
} from '../../../../src/lib/gas-engine-client';

type Chain = z.infer<typeof chainSchema>;
type Policy = z.infer<typeof policySchema>;
type Deployment = z.infer<typeof deploymentSchema>;
type AutonomyStatus = z.infer<typeof autonomyStatusSchema>;
type AutonomyDecision = z.infer<typeof autonomyDecisionSchema>;
type AutonomyForecast = z.infer<typeof autonomyForecastSchema>;
type AutonomyDrift = z.infer<typeof autonomyPolicyDriftSchema>;
type AutonomyPrevented = z.infer<typeof autonomyPreventedSchema>;
type AiCorePrediction = z.infer<typeof aiCorePredictionSchema>;
type AiCoreDecision = z.infer<typeof aiCoreDecisionSchema>;
type AiCoreAction = z.infer<typeof aiCoreActionSchema>;
type AiCoreFingerprint = z.infer<typeof aiCoreFingerprintSchema>;

type MetricsSummary = {
  deployments: { chain_key: string; status: string; count: string }[];
  attempts: { chain_key: string; count: string }[];
  outOfGas: { chain_key: string; count: string }[];
  avgGasUsed: { chain_key: string; avg: string | null }[];
  avgEstimate: { chain_key: string; avg: string | null }[];
};

export default function GasChainPage() {
  const params = useParams();
  const chainKey = typeof params.chainKey === 'string' ? params.chainKey : params.chainKey?.[0];
  const { user } = useSession();
  const isAdmin = roleOrder[normalizeRole(user?.role)] >= roleOrder.ADMIN;
  const [chain, setChain] = useState<Chain | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [autonomyStatus, setAutonomyStatus] = useState<AutonomyStatus | null>(null);
  const [decisions, setDecisions] = useState<AutonomyDecision[]>([]);
  const [forecasts, setForecasts] = useState<AutonomyForecast[]>([]);
  const [drift, setDrift] = useState<AutonomyDrift[]>([]);
  const [prevented, setPrevented] = useState<AutonomyPrevented[]>([]);
  const [aiPredictions, setAiPredictions] = useState<AiCorePrediction[]>([]);
  const [aiDecisions, setAiDecisions] = useState<AiCoreDecision[]>([]);
  const [aiActions, setAiActions] = useState<AiCoreAction[]>([]);
  const [aiFingerprints, setAiFingerprints] = useState<AiCoreFingerprint[]>([]);
  const [errors, setErrors] = useState<Array<{ title: string; error: string }>>([]);
  const [adminError, setAdminError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!chainKey) return;
    const nextErrors: Array<{ title: string; error: string }> = [];

    const chainsRes = await fetchGasJson('/v1/chains', chainsResponseSchema);
    if (!chainsRes.data) nextErrors.push({ title: 'Chains', error: chainsRes.error || 'failed' });
    else setChain(chainsRes.data.chains.find((entry) => entry.key === chainKey) || null);

    const policiesRes = await fetchGasJson('/v1/policies', policiesResponseSchema);
    if (!policiesRes.data) nextErrors.push({ title: 'Policies', error: policiesRes.error || 'failed' });
    else setPolicy(policiesRes.data.policies.find((entry) => entry.chainKey === chainKey) || null);

    const metricsRes = await fetchGasJson('/v1/metrics/summary', metricsSummarySchema);
    if (!metricsRes.data) nextErrors.push({ title: 'Metrics summary', error: metricsRes.error || 'failed' });
    else setMetrics(metricsRes.data as MetricsSummary);

    const deploymentsRes = await fetchGasJson(`/v1/deployments?limit=12&chainKey=${chainKey}`, deploymentsResponseSchema);
    if (!deploymentsRes.data) nextErrors.push({ title: 'Deployments', error: deploymentsRes.error || 'failed' });
    else setDeployments(deploymentsRes.data.deployments);

    const statusRes = await fetchGasJson('/v1/autonomy/status', autonomyStatusSchema);
    if (!statusRes.data) nextErrors.push({ title: 'Autonomy status', error: statusRes.error || 'failed' });
    else setAutonomyStatus(statusRes.data);

    const decisionsRes = await fetchGasJson(
      `/v1/autonomy/decisions?chainKey=${chainKey}&limit=10`,
      autonomyDecisionsResponseSchema
    );
    if (!decisionsRes.data) nextErrors.push({ title: 'Autonomy decisions', error: decisionsRes.error || 'failed' });
    else setDecisions(decisionsRes.data.decisions);

    const forecastsRes = await fetchGasJson(
      `/v1/autonomy/risk-forecasts?chainKey=${chainKey}&limit=5`,
      autonomyForecastsResponseSchema
    );
    if (!forecastsRes.data) nextErrors.push({ title: 'Risk forecast', error: forecastsRes.error || 'failed' });
    else setForecasts(forecastsRes.data.forecasts);

    const driftRes = await fetchGasJson(
      `/v1/autonomy/policy-drift?chainKey=${chainKey}&limit=5`,
      autonomyPolicyDriftResponseSchema
    );
    if (!driftRes.data) nextErrors.push({ title: 'Policy drift', error: driftRes.error || 'failed' });
    else setDrift(driftRes.data.drift);

    const preventedRes = await fetchGasJson(
      `/v1/autonomy/prevented-failures?chainKey=${chainKey}&limit=5`,
      autonomyPreventedResponseSchema
    );
    if (!preventedRes.data) nextErrors.push({ title: 'Prevented failures', error: preventedRes.error || 'failed' });
    else setPrevented(preventedRes.data.prevented);

    const aiPredictionsRes = await fetchGasJson(
      `/v1/ai-core/predictions?chainKey=${chainKey}&limit=6`,
      aiCorePredictionsResponseSchema
    );
    if (!aiPredictionsRes.data) nextErrors.push({ title: 'AI predictions', error: aiPredictionsRes.error || 'failed' });
    else setAiPredictions(aiPredictionsRes.data.predictions);

    const aiDecisionsRes = await fetchGasJson(
      `/v1/ai-core/decisions?chainKey=${chainKey}&limit=6`,
      aiCoreDecisionsResponseSchema
    );
    if (!aiDecisionsRes.data) nextErrors.push({ title: 'AI decisions', error: aiDecisionsRes.error || 'failed' });
    else setAiDecisions(aiDecisionsRes.data.decisions);

    const aiActionsRes = await fetchGasJson(
      `/v1/ai-core/actions?chainKey=${chainKey}&limit=6`,
      aiCoreActionsResponseSchema
    );
    if (!aiActionsRes.data) nextErrors.push({ title: 'AI actions', error: aiActionsRes.error || 'failed' });
    else setAiActions(aiActionsRes.data.actions);

    const aiFingerprintRes = await fetchGasJson(
      `/v1/ai-core/fingerprints?chainKey=${chainKey}&limit=6`,
      aiCoreFingerprintsResponseSchema
    );
    if (!aiFingerprintRes.data)
      nextErrors.push({ title: 'AI fingerprints', error: aiFingerprintRes.error || 'failed' });
    else setAiFingerprints(aiFingerprintRes.data.fingerprints);

    setErrors(nextErrors);
  }, [chainKey]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await load();
    };
    refresh().catch(() => undefined);
    const interval = setInterval(() => {
      refresh().catch(() => undefined);
    }, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [load]);

  const approveDecision = async (decisionId: string) => {
    if (!decisionId) return;
    setAdminError(null);
    const res = await postGasAdminJson(
      `/api/gas-engine/autonomy/decisions/${decisionId}/approve`,
      {},
      z.object({ status: z.string().optional() }).passthrough()
    );
    if (!res.data) {
      setAdminError(res.error || 'approval_failed');
      return;
    }
    await load();
  };

  const replayDecision = async (decisionId: string) => {
    if (!decisionId) return;
    setAdminError(null);
    const res = await postGasAdminJson(
      `/api/gas-engine/autonomy/decisions/${decisionId}/replay`,
      {},
      z.object({ status: z.string().optional() }).passthrough()
    );
    if (!res.data) {
      setAdminError(res.error || 'replay_failed');
      return;
    }
    await load();
  };

  const summary = useMemo(() => {
    if (!metrics || !chainKey) return { success: 0, failed: 0, outOfGas: 0 };
    const success = metrics.deployments
      .filter((row) => row.chain_key === chainKey && row.status === 'success')
      .reduce((acc, row) => acc + Number(row.count), 0);
    const failed = metrics.deployments
      .filter((row) => row.chain_key === chainKey && row.status !== 'success')
      .reduce((acc, row) => acc + Number(row.count), 0);
    const outOfGas = metrics.outOfGas
      .filter((row) => row.chain_key === chainKey)
      .reduce((acc, row) => acc + Number(row.count), 0);
    return { success, failed, outOfGas };
  }, [metrics, chainKey]);

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={{ message: entry.error }} />
        ))}
        <Card title={chain ? `${chain.name} gas policy` : 'Chain policy'} subtitle={chain ? `Gas ${chain.gasTokenSymbol}` : 'Loading'}>
          <div className="stack">
            <div className="spread">
              <span className="muted">Chain</span>
              <span>{chain?.name || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Type</span>
              <span>{chain?.type || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Chain ID</span>
              <span>{chain?.chainId || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Multiplier</span>
              <span>{policy?.baseMultiplier ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Max gas limit</span>
              <span>{policy?.maxGasLimit ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Safety margin</span>
              <span>{policy?.safetyMarginPercent ?? 'n/a'}%</span>
            </div>
            <div className="spread">
              <Badge tone={summary.failed > 0 ? 'warning' : 'success'}>
                {summary.failed > 0 ? 'Retry pressure' : 'Stable'}
              </Badge>
              <Link className="button secondary" href="/observability/gas">
                Back to overview
              </Link>
            </div>
          </div>
        </Card>
        <Card title="Autonomy status" subtitle="Chain-level autonomy posture">
          <div className="stack">
            <div className="spread">
              <span className="muted">Enabled</span>
              <Badge tone={autonomyStatus?.effective.enabled ? 'success' : 'warning'}>
                {autonomyStatus?.effective.enabled ? 'Enabled' : 'Paused'}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Mode</span>
              <span>{autonomyStatus?.effective.mode || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Risk cap</span>
              <span>{autonomyStatus?.effective.maxRisk ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Policy lock</span>
              <Badge tone={autonomyStatus?.effective.policyLock ? 'warning' : 'success'}>
                {autonomyStatus?.effective.policyLock ? 'Locked' : 'Mutable'}
              </Badge>
            </div>
            {adminError && <div className="muted">Admin action failed: {adminError}</div>}
          </div>
        </Card>
        <Card title="Chain AI forecast" subtitle="AI Core predictive signal">
          <div className="stack">
            {aiPredictions.length === 0 && <div className="muted">No AI forecast data yet.</div>}
            {aiPredictions[0] && (
              <>
                <div className="spread">
                  <span className="muted">Risk score</span>
                  <span>{aiPredictions[0].riskScore.toFixed(2)}</span>
                </div>
                <div className="spread">
                  <span className="muted">Confidence</span>
                  <span>{aiPredictions[0].confidence.toFixed(2)}</span>
                </div>
                <div className="spread">
                  <span className="muted">Subsystem</span>
                  <span>{aiPredictions[0].affectedSubsystem}</span>
                </div>
                <div className="spread">
                  <span className="muted">Recommended</span>
                  <span>{aiPredictions[0].recommendedAction}</span>
                </div>
              </>
            )}
          </div>
        </Card>
        <Card title="Chain AI decisions" subtitle="AI Core decisions for this chain">
          <div className="table">
            <div className="table-row table-header">
              <span>Action</span>
              <span>Status</span>
              <span>Risk</span>
              <span>Mode</span>
              <span>When</span>
            </div>
            {aiDecisions.length === 0 && <div className="muted">No AI decisions recorded yet.</div>}
            {aiDecisions.map((decision) => (
              <div key={decision.id} className="table-row">
                <span>{decision.action}</span>
                <span>{decision.status}</span>
                <span>{decision.riskScore.toFixed(2)}</span>
                <span>{decision.mode}</span>
                <span>{new Date(decision.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Safety interventions" subtitle="AI actions and failure fingerprints">
          <div className="table">
            <div className="table-row table-header">
              <span>Action</span>
              <span>Status</span>
              <span>When</span>
            </div>
            {aiActions.length === 0 && <div className="muted">No AI actions recorded.</div>}
            {aiActions.map((action) => (
              <div key={action.id} className="table-row">
                <span>{action.actionType}</span>
                <span>{action.status}</span>
                <span>{new Date(action.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="table">
            <div className="table-row table-header">
              <span>Fingerprint</span>
              <span>Classification</span>
              <span>Occurrences</span>
            </div>
            {aiFingerprints.length === 0 && <div className="muted">No fingerprints recorded.</div>}
            {aiFingerprints.map((fp) => (
              <div key={fp.fingerprint} className="table-row">
                <span className="mono">{fp.fingerprint.slice(0, 10)}…</span>
                <span>{fp.classification}</span>
                <span>{fp.occurrences}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Deployment health" subtitle="Retry outcomes">
          <div className="stack">
            <div className="spread">
              <span className="muted">Successful</span>
              <span>{summary.success}</span>
            </div>
            <div className="spread">
              <span className="muted">Failed</span>
              <span>{summary.failed}</span>
            </div>
            <div className="spread">
              <span className="muted">Out of gas</span>
              <span>{summary.outOfGas}</span>
            </div>
          </div>
        </Card>
        <Card title="Autonomy risk forecast" subtitle="Latest predictive run">
          <div className="stack">
            {forecasts.length === 0 && <div className="muted">No forecast data available.</div>}
            {forecasts[0] && (
              <>
                <div className="spread">
                  <span className="muted">Risk score</span>
                  <span>{forecasts[0].riskScore.toFixed(2)}</span>
                </div>
                <div className="spread">
                  <span className="muted">Failure probability</span>
                  <span>{forecasts[0].predictedFailureProbability.toFixed(2)}</span>
                </div>
                <div className="spread">
                  <span className="muted">Confidence</span>
                  <span>{forecasts[0].confidence.toFixed(2)}</span>
                </div>
                <div className="spread">
                  <span className="muted">Signals</span>
                  <span>{forecasts[0].failureTypes.join(', ') || 'n/a'}</span>
                </div>
              </>
            )}
          </div>
        </Card>
        <Card title="Policy drift" subtitle="Adaptive policy updates">
          <div className="table">
            <div className="table-row table-header">
              <span>Base</span>
              <span>Margin</span>
              <span>Retry step</span>
              <span>Reason</span>
            </div>
            {drift.length === 0 && <div className="muted">No drift events recorded.</div>}
            {drift.map((entry) => (
              <div key={entry.id} className="table-row">
                <span>{entry.baseMultiplier.toFixed(2)}</span>
                <span>{entry.safetyMarginPercent.toFixed(1)}%</span>
                <span>{entry.retryMultiplierStep.toFixed(2)}</span>
                <span>{entry.reason || 'n/a'}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Autonomy decision timeline" subtitle="Autonomy decisions for this chain">
          <div className="table">
            <div className="table-row table-header">
              <span>Action</span>
              <span>Status</span>
              <span>Risk</span>
              <span>Reasons</span>
              <span>When</span>
              <span>Actions</span>
            </div>
            {decisions.length === 0 && <div className="muted">No decisions recorded yet.</div>}
            {decisions.map((decision) => (
              <div key={decision.id} className="table-row">
                <span>{decision.action}</span>
                <span>{decision.status}</span>
                <span>{decision.riskScore.toFixed(2)}</span>
                <span>
                  {Array.isArray(decision.rationale?.reasons) ? decision.rationale.reasons.join(', ') : 'n/a'}
                </span>
                <span>{new Date(decision.createdAt).toLocaleString()}</span>
                <span>
                  {isAdmin && decision.action === 'needs_approval' && decision.status === 'pending' && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => approveDecision(decision.id)}
                    >
                      Approve
                    </button>
                  )}
                  {isAdmin && decision.status === 'executed' && (
                    <button type="button" className="button secondary" onClick={() => replayDecision(decision.id)}>
                      Replay
                    </button>
                  )}
                  {!isAdmin && <span className="muted">View only</span>}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Prevented failures" subtitle="Blocked or deferred executions">
          <div className="table">
            <div className="table-row table-header">
              <span>Type</span>
              <span>Action</span>
              <span>Risk</span>
              <span>When</span>
            </div>
            {prevented.length === 0 && <div className="muted">No prevented failures recorded.</div>}
            {prevented.map((entry) => (
              <div key={entry.id} className="table-row">
                <span>{entry.failureType}</span>
                <span>{entry.action}</span>
                <span>{entry.riskScore.toFixed(2)}</span>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recent deployments" subtitle="Retry runs for this chain">
          <div className="table">
            <div className="table-row table-header">
              <span>ID</span>
              <span>Status</span>
              <span>Updated</span>
            </div>
            {deployments.length === 0 && <div className="muted">No deployments recorded yet.</div>}
            {deployments.map((deployment) => (
              <Link
                key={deployment.id}
                href={`/observability/gas/deployments/${deployment.id}`}
                className="table-row"
              >
                <span className="mono">{deployment.id.slice(0, 8)}…</span>
                <span>{deployment.status}</span>
                <span>{new Date(deployment.updated_at).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
