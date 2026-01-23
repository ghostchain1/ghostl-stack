'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Badge } from '@ghostl/ui';
import { z } from 'zod';
import { DataFetchErrorCard } from '../../../../../src/components/DataFetchErrorCard';
import { useSession } from '../../../../../src/modules/identity-access/session';
import { normalizeRole, roleOrder } from '../../../../../src/modules/identity-access/access-policy';
import {
  fetchGasJson,
  attemptsResponseSchema,
  deploymentSchema,
  attemptSchema,
  deploymentDetailSchema,
  autonomyDecisionSchema,
  postGasAdminJson
} from '../../../../../src/lib/gas-engine-client';

type Attempt = z.infer<typeof attemptSchema>;
type Decision = z.infer<typeof autonomyDecisionSchema>;

type DeploymentInfo = {
  deployment: z.infer<typeof deploymentSchema> | null;
  attempts: Attempt[];
  decision: Decision | null;
};

export default function GasDeploymentPage() {
  const params = useParams();
  const deploymentId = typeof params.id === 'string' ? params.id : params.id?.[0];
  const { user } = useSession();
  const isAdmin = roleOrder[normalizeRole(user?.role)] >= roleOrder.ADMIN;
  const [deployment, setDeployment] = useState<DeploymentInfo['deployment']>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [errors, setErrors] = useState<Array<{ title: string; error: string }>>([]);
  const [adminError, setAdminError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!deploymentId) return;
    const nextErrors: Array<{ title: string; error: string }> = [];
    const deploymentRes = await fetchGasJson(`/v1/deployments/${deploymentId}`, deploymentDetailSchema);
    if (!deploymentRes.data) {
      nextErrors.push({ title: 'Deployment', error: deploymentRes.error || 'failed' });
    } else {
      setDeployment(deploymentRes.data.deployment || null);
      setDecision(deploymentRes.data.decision || null);
    }

    const attemptsRes = await fetchGasJson(`/v1/deployments/${deploymentId}/attempts`, attemptsResponseSchema);
    if (!attemptsRes.data) nextErrors.push({ title: 'Attempts', error: attemptsRes.error || 'failed' });
    else setAttempts(attemptsRes.data.attempts);

    setErrors(nextErrors);
  }, [deploymentId]);

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

  return (
    <div className="content">
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={{ message: entry.error }} />
        ))}
        <Card title="Deployment" subtitle={deployment ? deployment.id : 'Loading'}>
          <div className="stack">
            <div className="spread">
              <span className="muted">Chain</span>
              <span>{deployment?.chain_key || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Status</span>
              <Badge tone={deployment?.status === 'success' ? 'success' : 'warning'}>
                {deployment?.status || 'unknown'}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Updated</span>
              <span>{deployment ? new Date(deployment.updated_at).toLocaleString() : 'n/a'}</span>
            </div>
            <Link className="button secondary" href="/observability/gas">
              Back to overview
            </Link>
          </div>
        </Card>
        <Card title="Autonomy decision" subtitle={decision ? decision.id : 'No decision recorded'}>
          <div className="stack">
            <div className="spread">
              <span className="muted">Action</span>
              <span>{decision?.action || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Status</span>
              <span>{decision?.status || 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Risk</span>
              <span>{decision ? decision.riskScore.toFixed(2) : 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Predicted success</span>
              <span>{decision ? decision.predictedSuccess.toFixed(2) : 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Selected gas</span>
              <span>{decision?.selectedGasLimit ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Retries</span>
              <span>{decision?.selectedMaxRetries ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Confidence</span>
              <span>{decision ? decision.confidence.toFixed(2) : 'n/a'}</span>
            </div>
            {decision?.rationale && Array.isArray(decision.rationale.reasons) && (
              <div className="muted">Reasons: {decision.rationale.reasons.join(', ')}</div>
            )}
            {adminError && <div className="muted">Admin action failed: {adminError}</div>}
            {decision && isAdmin && (
              <div className="spread">
                {decision.action === 'needs_approval' && decision.status === 'pending' && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => approveDecision(decision.id)}
                  >
                    Approve
                  </button>
                )}
                <button type="button" className="button secondary" onClick={() => replayDecision(decision.id)}>
                  Replay
                </button>
              </div>
            )}
            {!isAdmin && <div className="muted">Admin actions require ADMIN or OWNER role.</div>}
          </div>
        </Card>
        <Card title="Attempts" subtitle={`${attempts.length} attempts recorded`}>
          <div className="table">
            <div className="table-row table-header">
              <span>#</span>
              <span>Status</span>
              <span>Classification</span>
              <span>Gas used</span>
            </div>
            {attempts.length === 0 && <div className="muted">No attempts recorded yet.</div>}
            {attempts.map((attempt) => (
              <div key={attempt.id} className="table-row">
                <span>{attempt.attempt}</span>
                <span>{attempt.status}</span>
                <span>{attempt.classification || 'n/a'}</span>
                <span>{attempt.gas_used || 'n/a'}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
