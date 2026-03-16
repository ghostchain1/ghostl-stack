'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Badge } from '@ghostchain/ui';
import { z } from 'zod';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { useSession } from '../../../src/modules/identity-access/session';
import { normalizeRole, roleOrder } from '../../../src/modules/identity-access/access-policy';
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
  autonomyPreventedResponseSchema,
  autonomyDecisionSchema,
  autonomyPreventedSchema,
  aiCoreStatusSchema,
  aiCorePredictionsResponseSchema,
  aiCoreDecisionsResponseSchema,
  aiCoreActionsResponseSchema,
  aiCoreGovernanceResponseSchema,
  aiCoreFingerprintsResponseSchema,
  aiCoreSuppressionRulesResponseSchema,
  aiCorePredictionSchema,
  aiCoreDecisionSchema,
  aiCoreActionSchema,
  aiCoreGovernanceSchema,
  aiCoreFingerprintSchema,
  aiCoreSuppressionRuleSchema,
  gasMetricsResponseSchema,
  slashingEventsResponseSchema,
  postGasAdminJson
} from '../../../src/lib/gas-engine-client';
import { CopyButton } from '../../../src/components/CopyButton';

const formatAddress = (value?: string) => {
  if (!value) return '';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

type Chain = z.infer<typeof chainSchema>;
type Policy = z.infer<typeof policySchema>;
type Deployment = z.infer<typeof deploymentSchema>;
type AutonomyStatus = z.infer<typeof autonomyStatusSchema>;
type AutonomyDecision = z.infer<typeof autonomyDecisionSchema>;
type AutonomyPrevented = z.infer<typeof autonomyPreventedSchema>;
type AiCoreStatus = z.infer<typeof aiCoreStatusSchema>;
type AiCorePrediction = z.infer<typeof aiCorePredictionSchema>;
type AiCoreDecision = z.infer<typeof aiCoreDecisionSchema>;
type AiCoreAction = z.infer<typeof aiCoreActionSchema>;
type AiCoreGovernance = z.infer<typeof aiCoreGovernanceSchema>;
type AiCoreFingerprint = z.infer<typeof aiCoreFingerprintSchema>;
type AiCoreSuppressionRule = z.infer<typeof aiCoreSuppressionRuleSchema>;
type GasMetrics = z.infer<typeof gasMetricsResponseSchema>;
type SlashingEvents = z.infer<typeof slashingEventsResponseSchema>;

type MetricsSummary = {
  deployments: { chain_key: string; status: string; count: string }[];
  attempts: { chain_key: string; count: string }[];
  outOfGas: { chain_key: string; count: string }[];
  avgGasUsed: { chain_key: string; avg: string | null }[];
  avgEstimate: { chain_key: string; avg: string | null }[];
};

const countFor = (rows: { chain_key: string; count: string }[], chainKey: string) =>
  Number(rows.find((row) => row.chain_key === chainKey)?.count || 0);

const formatGwei = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'n/a';
  return `${(numeric / 1_000_000_000).toFixed(2)} gwei`;
};

export default function GasOverviewPage() {
  const { user } = useSession();
  const isAdmin = roleOrder[normalizeRole(user?.role)] >= roleOrder.ADMIN;
  const [chains, setChains] = useState<Chain[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [autonomyStatus, setAutonomyStatus] = useState<AutonomyStatus | null>(null);
  const [decisions, setDecisions] = useState<AutonomyDecision[]>([]);
  const [prevented, setPrevented] = useState<AutonomyPrevented[]>([]);
  const [aiStatus, setAiStatus] = useState<AiCoreStatus | null>(null);
  const [aiPredictions, setAiPredictions] = useState<AiCorePrediction[]>([]);
  const [aiDecisions, setAiDecisions] = useState<AiCoreDecision[]>([]);
  const [aiActions, setAiActions] = useState<AiCoreAction[]>([]);
  const [aiGovernance, setAiGovernance] = useState<AiCoreGovernance[]>([]);
  const [aiFingerprints, setAiFingerprints] = useState<AiCoreFingerprint[]>([]);
  const [aiSuppression, setAiSuppression] = useState<AiCoreSuppressionRule[]>([]);
  const [gasMetricsByChain, setGasMetricsByChain] = useState<Record<string, GasMetrics>>({});
  const [slashingByChain, setSlashingByChain] = useState<Record<string, SlashingEvents>>({});
  const [errors, setErrors] = useState<Array<{ title: string; error: string }>>([]);
  const [adminError, setAdminError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const nextErrors: Array<{ title: string; error: string }> = [];

    const chainsRes = await fetchGasJson('/v1/chains', chainsResponseSchema);
    let chainList: Chain[] = [];
    if (!chainsRes.data) {
      nextErrors.push({ title: 'Chains', error: chainsRes.error || 'failed' });
    } else {
      chainList = chainsRes.data.chains;
      setChains(chainList);

      const gasMetricEntries = await Promise.all(
        chainList.map(async (chain) => {
          const res = await fetchGasJson(`/v1/gas/metrics?chain=${chain.key}&limit=30`, gasMetricsResponseSchema);
          return [chain.key, res] as const;
        })
      );

      const gasMetricMap: Record<string, GasMetrics> = {};
      for (const [key, res] of gasMetricEntries) {
        if (!res.data) {
          if (!res.error?.includes('HTTP 404')) {
            nextErrors.push({ title: `Gas metrics (${key})`, error: res.error || 'failed' });
          }
          continue;
        }
        gasMetricMap[key] = res.data as GasMetrics;
      }
      setGasMetricsByChain(gasMetricMap);

      const slashingEntries = await Promise.all(
        chainList.map(async (chain) => {
          const res = await fetchGasJson(`/v1/gas/slashing-events?chain=${chain.key}&limit=10`, slashingEventsResponseSchema);
          return [chain.key, res] as const;
        })
      );

      const slashingMap: Record<string, SlashingEvents> = {};
      for (const [key, res] of slashingEntries) {
        if (!res.data) {
          if (!res.error?.includes('HTTP 404')) {
            nextErrors.push({ title: `Slashing events (${key})`, error: res.error || 'failed' });
          }
          continue;
        }
        slashingMap[key] = res.data as SlashingEvents;
      }
      setSlashingByChain(slashingMap);
    }

    const policiesRes = await fetchGasJson('/v1/policies', policiesResponseSchema);
    if (!policiesRes.data) nextErrors.push({ title: 'Policies', error: policiesRes.error || 'failed' });
    else setPolicies(policiesRes.data.policies);

    const metricsRes = await fetchGasJson('/v1/metrics/summary', metricsSummarySchema);
    if (!metricsRes.data) nextErrors.push({ title: 'Metrics summary', error: metricsRes.error || 'failed' });
    else setMetrics(metricsRes.data as MetricsSummary);

    const deploymentsRes = await fetchGasJson('/v1/deployments?limit=8', deploymentsResponseSchema);
    if (!deploymentsRes.data) nextErrors.push({ title: 'Deployments', error: deploymentsRes.error || 'failed' });
    else setDeployments(deploymentsRes.data.deployments);

    const statusRes = await fetchGasJson('/v1/autonomy/status', autonomyStatusSchema);
    if (!statusRes.data) nextErrors.push({ title: 'Autonomy status', error: statusRes.error || 'failed' });
    else setAutonomyStatus(statusRes.data);

    const decisionsRes = await fetchGasJson('/v1/autonomy/decisions?limit=6', autonomyDecisionsResponseSchema);
    if (!decisionsRes.data) nextErrors.push({ title: 'Autonomy decisions', error: decisionsRes.error || 'failed' });
    else setDecisions(decisionsRes.data.decisions);

    const preventedRes = await fetchGasJson('/v1/autonomy/prevented-failures?limit=6', autonomyPreventedResponseSchema);
    if (!preventedRes.data) nextErrors.push({ title: 'Prevented failures', error: preventedRes.error || 'failed' });
    else setPrevented(preventedRes.data.prevented);

    const aiStatusRes = await fetchGasJson('/v1/ai-core/status', aiCoreStatusSchema);
    if (!aiStatusRes.data) nextErrors.push({ title: 'AI core status', error: aiStatusRes.error || 'failed' });
    else setAiStatus(aiStatusRes.data);

    const aiPredictionsRes = await fetchGasJson('/v1/ai-core/predictions?limit=6', aiCorePredictionsResponseSchema);
    if (!aiPredictionsRes.data) nextErrors.push({ title: 'AI risk predictions', error: aiPredictionsRes.error || 'failed' });
    else setAiPredictions(aiPredictionsRes.data.predictions);

    const aiDecisionsRes = await fetchGasJson('/v1/ai-core/decisions?limit=6', aiCoreDecisionsResponseSchema);
    if (!aiDecisionsRes.data) nextErrors.push({ title: 'AI decisions', error: aiDecisionsRes.error || 'failed' });
    else setAiDecisions(aiDecisionsRes.data.decisions);

    const aiActionsRes = await fetchGasJson('/v1/ai-core/actions?limit=6', aiCoreActionsResponseSchema);
    if (!aiActionsRes.data) nextErrors.push({ title: 'AI actions', error: aiActionsRes.error || 'failed' });
    else setAiActions(aiActionsRes.data.actions);

    const aiGovernanceRes = await fetchGasJson('/v1/ai-core/governance?limit=6', aiCoreGovernanceResponseSchema);
    if (!aiGovernanceRes.data)
      nextErrors.push({ title: 'AI governance recommendations', error: aiGovernanceRes.error || 'failed' });
    else setAiGovernance(aiGovernanceRes.data.recommendations);

    const aiFingerprintRes = await fetchGasJson('/v1/ai-core/fingerprints?limit=6', aiCoreFingerprintsResponseSchema);
    if (!aiFingerprintRes.data)
      nextErrors.push({ title: 'AI failure fingerprints', error: aiFingerprintRes.error || 'failed' });
    else setAiFingerprints(aiFingerprintRes.data.fingerprints);

    const aiSuppressionRes = await fetchGasJson(
      '/v1/ai-core/suppression-rules?limit=6',
      aiCoreSuppressionRulesResponseSchema
    );
    if (!aiSuppressionRes.data)
      nextErrors.push({ title: 'AI suppression rules', error: aiSuppressionRes.error || 'failed' });
    else setAiSuppression(aiSuppressionRes.data.rules);

    setErrors(nextErrors);
  }, []);

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

  const updateOverride = async (payload: Record<string, unknown>) => {
    setAdminError(null);
    const res = await postGasAdminJson('/api/gas-engine/autonomy/override', payload, autonomyStatusSchema);
    if (!res.data) {
      setAdminError(res.error || 'override_failed');
      return;
    }
    setAutonomyStatus(res.data);
    await load();
  };

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

  const policyMap = useMemo(() => new Map(policies.map((policy) => [policy.chainKey, policy])), [policies]);

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={{ message: entry.error }} />
        ))}
        <Card title="Chain AI Dashboard" subtitle="Ghost Chain AI Core: observe, predict, decide, act, learn">
          <div className="stack">
            <div className="muted">Chains tracked: {chains.length}</div>
            <div className="muted">Deployments tracked: {deployments.length}</div>
          </div>
        </Card>
        <Card title="Autonomy status" subtitle="Policy-governed decision loop">
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
            <div className="spread">
              <span className="muted">Max gas</span>
              <span>{autonomyStatus?.effective.maxGasLimit ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Overrides</span>
              <Badge tone={autonomyStatus?.overrides ? 'warning' : 'success'}>
                {autonomyStatus?.overrides ? 'Active' : 'Defaults'}
              </Badge>
            </div>
            {adminError && <div className="muted">Admin action failed: {adminError}</div>}
            {isAdmin ? (
              <div className="spread">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => updateOverride({ enabled: !(autonomyStatus?.effective.enabled ?? true) })}
                >
                  {autonomyStatus?.effective.enabled ? 'Pause autonomy' : 'Resume autonomy'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => updateOverride({ policyLock: !(autonomyStatus?.effective.policyLock ?? false) })}
                >
                  {autonomyStatus?.effective.policyLock ? 'Unlock policies' : 'Lock policies'}
                </button>
              </div>
            ) : (
              <div className="muted">Admin controls available to ADMIN and OWNER roles.</div>
            )}
          </div>
        </Card>
        <Card title="Chain AI status" subtitle="Observation, prediction, and control loop">
          <div className="stack">
            <div className="spread">
              <span className="muted">AI mode</span>
              <span>{aiStatus?.autonomy.effective.mode || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Latest observation</span>
              <span>{aiStatus?.latest.observation?.created_at ? new Date(aiStatus.latest.observation.created_at).toLocaleString() : 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Latest prediction</span>
              <span>{aiStatus?.latest.prediction?.created_at ? new Date(aiStatus.latest.prediction.created_at).toLocaleString() : 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Latest decision</span>
              <span>{aiStatus?.latest.decision?.created_at ? new Date(aiStatus.latest.decision.created_at).toLocaleString() : 'n/a'}</span>
            </div>
          </div>
        </Card>
        <Card title="Risk forecast" subtitle="AI predicted risk and recommended action">
          <div className="table">
            <div className="table-row table-header">
              <span>Chain</span>
              <span>Risk</span>
              <span>Confidence</span>
              <span>Subsystem</span>
              <span>Recommended</span>
              <span>Updated</span>
            </div>
            {aiPredictions.length === 0 && <div className="muted">No AI predictions yet.</div>}
            {aiPredictions.map((prediction) => (
              <div key={prediction.id} className="table-row">
                <span>{prediction.chainKey}</span>
                <span>{prediction.riskScore.toFixed(2)}</span>
                <span>{prediction.confidence.toFixed(2)}</span>
                <span>{prediction.affectedSubsystem}</span>
                <span>{prediction.recommendedAction}</span>
                <span>{new Date(prediction.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="AI decision timeline" subtitle="Chain AI Core decisions">
          <div className="table">
            <div className="table-row table-header">
              <span>Chain</span>
              <span>Action</span>
              <span>Status</span>
              <span>Risk</span>
              <span>Mode</span>
              <span>Updated</span>
            </div>
            {aiDecisions.length === 0 && <div className="muted">No AI decisions recorded yet.</div>}
            {aiDecisions.map((decision) => (
              <div key={decision.id} className="table-row">
                <span>{decision.chainKey}</span>
                <span>{decision.action}</span>
                <span>{decision.status}</span>
                <span>{decision.riskScore.toFixed(2)}</span>
                <span>{decision.mode}</span>
                <span>{new Date(decision.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Safety interventions" subtitle="AI core actions and suppression rules">
          <div className="table">
            <div className="table-row table-header">
              <span>Chain</span>
              <span>Action</span>
              <span>Status</span>
              <span>When</span>
            </div>
            {aiActions.length === 0 && <div className="muted">No AI interventions recorded.</div>}
            {aiActions.map((action) => (
              <div key={action.id} className="table-row">
                <span>{action.chainKey}</span>
                <span>{action.actionType}</span>
                <span>{action.status}</span>
                <span>{new Date(action.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="table">
            <div className="table-row table-header">
              <span>Suppression</span>
              <span>Chain</span>
              <span>Active</span>
              <span>Reason</span>
            </div>
            {aiSuppression.length === 0 && <div className="muted">No suppression rules.</div>}
            {aiSuppression.map((rule) => (
              <div key={rule.id} className="table-row">
                <span className="mono">{rule.fingerprint.slice(0, 10)}…</span>
                <span>{rule.chainKey}</span>
                <span>{rule.active ? 'Active' : 'Inactive'}</span>
                <span>{rule.reason || 'n/a'}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Governance recommendations" subtitle="Policy-aligned AI advisories">
          <div className="table">
            <div className="table-row table-header">
              <span>Chain</span>
              <span>Category</span>
              <span>Severity</span>
              <span>Status</span>
              <span>Summary</span>
            </div>
            {aiGovernance.length === 0 && <div className="muted">No governance advisories yet.</div>}
            {aiGovernance.map((rec) => (
              <div key={rec.id} className="table-row">
                <span>{rec.chainKey}</span>
                <span>{rec.category}</span>
                <span>{rec.severity}</span>
                <span>{rec.status}</span>
                <span>{rec.summary}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Learning progress" subtitle="Failure fingerprints and repetition">
          <div className="table">
            <div className="table-row table-header">
              <span>Fingerprint</span>
              <span>Chain</span>
              <span>Classification</span>
              <span>Occurrences</span>
              <span>Last seen</span>
            </div>
            {aiFingerprints.length === 0 && <div className="muted">No fingerprints recorded.</div>}
            {aiFingerprints.map((fp) => (
              <div key={fp.fingerprint} className="table-row">
                <span className="mono">{fp.fingerprint.slice(0, 10)}…</span>
                <span>{fp.chainKey}</span>
                <span>{fp.classification}</span>
                <span>{fp.occurrences}</span>
                <span>{new Date(fp.lastSeen).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Autonomy decision timeline" subtitle="Latest autonomy decisions">
          <div className="table">
            <div className="table-row table-header">
              <span>Chain</span>
              <span>Action</span>
              <span>Status</span>
              <span>Risk</span>
              <span>Reasons</span>
              <span>Updated</span>
              <span>Actions</span>
            </div>
            {decisions.length === 0 && <div className="muted">No decisions recorded yet.</div>}
            {decisions.map((decision) => (
              <div key={decision.id} className="table-row">
                <span>{decision.chainKey}</span>
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
        <Card title="Prevented failures" subtitle="Autonomy blocks and approvals">
          <div className="table">
            <div className="table-row table-header">
              <span>Chain</span>
              <span>Type</span>
              <span>Action</span>
              <span>Risk</span>
              <span>When</span>
            </div>
            {prevented.length === 0 && <div className="muted">No prevented failures logged.</div>}
            {prevented.map((entry) => (
              <div key={entry.id} className="table-row">
                <span>{entry.chainKey}</span>
                <span>{entry.failureType}</span>
                <span>{entry.action}</span>
                <span>{entry.riskScore.toFixed(2)}</span>
                <span>{new Date(entry.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
        {chains.map((chain) => {
          const policy = policyMap.get(chain.key);
          const successCount = metrics
            ? metrics.deployments
                .filter((row) => row.chain_key === chain.key && row.status === 'success')
                .reduce((acc, row) => acc + Number(row.count), 0)
            : 0;
          const failedCount = metrics
            ? metrics.deployments
                .filter((row) => row.chain_key === chain.key && row.status !== 'success')
                .reduce((acc, row) => acc + Number(row.count), 0)
            : 0;
          const attempts = metrics ? countFor(metrics.attempts, chain.key) : 0;
          const avgGasUsed = metrics?.avgGasUsed.find((row) => row.chain_key === chain.key)?.avg;
          const avgEstimate = metrics?.avgEstimate.find((row) => row.chain_key === chain.key)?.avg;
          const gasMetrics = gasMetricsByChain[chain.key];
          const slashing = slashingByChain[chain.key];
          const latestSample = gasMetrics?.samples[0];
          const recommendation = gasMetrics?.recommendation;
          const slashingCount = slashing?.events.length ?? 0;
          const volatilityPct = recommendation ? `${(recommendation.volatilityScore * 100).toFixed(1)}%` : 'n/a';
          const anomalyPct = recommendation ? `${(recommendation.anomalyScore * 100).toFixed(1)}%` : 'n/a';

          return (
            <Card
              key={chain.key}
              title={`${chain.name} (${chain.type})`}
              subtitle={`Chain ID ${chain.chainId} · Gas ${chain.gasTokenSymbol}${chain.gasTokenAddress ? ` · ${formatAddress(chain.gasTokenAddress)}` : ''}`}
            >
              <div className="stack">
              <div className="spread">
                <span className="muted">Policy multiplier</span>
                <span>{policy?.baseMultiplier ?? 'n/a'}</span>
              </div>
              <div className="spread">
                <span className="muted">Gas token address</span>
                <span className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <span className="mono" title={chain.gasTokenAddress || ''}>
                    {chain.gasTokenAddress || '0x5FbDB2315678afecb367f032d93F642f64180aa3'}
                  </span>
                  <CopyButton value={chain.gasTokenAddress || '0x5FbDB2315678afecb367f032d93F642f64180aa3'} />
                </span>
              </div>
                <div className="spread">
                  <span className="muted">Max gas limit</span>
                  <span>{policy?.maxGasLimit ?? 'n/a'}</span>
                </div>
                <div className="spread">
                  <span className="muted">Attempts</span>
                  <span>{attempts}</span>
                </div>
                <div className="spread">
                  <span className="muted">Success / Failed</span>
                  <span>
                    {successCount} / {failedCount}
                  </span>
                </div>
                <div className="spread">
                  <span className="muted">Avg gas used</span>
                  <span>{avgGasUsed ? Number(avgGasUsed).toFixed(0) : 'n/a'}</span>
                </div>
                <div className="spread">
                  <span className="muted">Avg estimate</span>
                  <span>{avgEstimate ? Number(avgEstimate).toFixed(0) : 'n/a'}</span>
                </div>
                <div className="spread">
                  <span className="muted">Current base fee</span>
                  <span>{formatGwei(latestSample?.baseFee)}</span>
                </div>
                <div className="spread">
                  <span className="muted">Recommended base</span>
                  <span>{formatGwei(recommendation?.recommendedBaseFee)}</span>
                </div>
                <div className="spread">
                  <span className="muted">Volatility / Anomaly</span>
                  <span>
                    {volatilityPct} / {anomalyPct}
                  </span>
                </div>
                <div className="spread">
                  <span className="muted">Slashing events</span>
                  <span>{slashingCount}</span>
                </div>
                <div className="spread">
                  <Badge tone={failedCount > 0 ? 'warning' : 'success'}>
                    {failedCount > 0 ? 'Needs attention' : 'Healthy'}
                  </Badge>
                  <Link className="button secondary" href={`/observability/gas/${chain.key}`}>
                    View chain
                  </Link>
                </div>
              </div>
            </Card>
          );
        })}
        <Card title="Recent deployments" subtitle="Latest retry runs">
          <div className="table">
            <div className="table-row table-header">
              <span>ID</span>
              <span>Chain</span>
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
                <span>{deployment.chain_key}</span>
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
