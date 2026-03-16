'use client';

import { useEffect, useState } from 'react';
import { Card, Badge } from '@ghostchain/ui';
import { ChainOverviewSchema, type ChainOverview } from '@ghostchain/contract-schemas';
import type { Alert } from '@ghostchain/types/observability';
import { resolveApiBase } from '../../../src/lib/runtime';
import { apiRequest, type ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';

const API_URL = resolveApiBase();

const SOVEREIGNTY_CRITICAL_ALERTS = new Set([
  'GhostSovereigntyViolationSignal',
  'GhostLayerUnhealthy',
  'GhostConsensusTelemetryDown'
]);

const SOVEREIGNTY_WARNING_ALERTS = new Set([
  'GhostCascadingFinalityLag',
  'GhostSettlementAgeHigh',
  'GhostBridgeFinalizeStalled'
]);

type Incident = {
  source?: string;
  message?: string;
  severity?: string;
  time?: string;
  createdAt?: string;
};

type GateCheck = { label: string; ok: boolean };
type GateTone = 'default' | 'warning' | 'critical';

type Overview = {
  chain: string;
  head?: number;
  finalized?: number;
  lag?: number;
  relayer?: { finalized?: number; errors?: number };
  guard?: { alerts?: number; deposits?: number; activeAlerts?: Record<string, unknown>[] };
  alertPosture?: { firing: number; critical: number; warning: number };
  sovereigntyPosture?: { firing: number; critical: number; warning: number; topSignals: string[] };
  incidentPosture?: { total: number; critical: number; warning: number; recent: Incident[] };
  bridgePosture?: { pending?: number; signaturesMissing?: number };
  gate?: { checks: GateCheck[]; failedChecks: number; tone: GateTone };
};

export default function StackPage() {
  const [chain, setChain] = useState<'l2' | 'l3'>('l2');
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const fallback: Overview = { chain };

  const deriveLag = (entry?: ChainOverview['chains'][number]) => {
    if (!entry) return undefined;
    if (typeof entry.finalityLag === 'number') return entry.finalityLag;
    const health = entry.telemetry?.health;
    if (!health) return undefined;
    const lag = health.chain.head - health.chain.finalized;
    return Number.isFinite(lag) ? lag : undefined;
  };

  const incidentTone = (severity?: string): GateTone => {
    const s = (severity || '').toLowerCase();
    if (s.includes('crit') || s.includes('error')) return 'critical';
    if (s.includes('warn')) return 'warning';
    return 'default';
  };

  const load = async (target: 'l2' | 'l3') => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, alertsRes, incidentsRes, bridgeRes] = await Promise.all([
        apiRequest<ChainOverview>('/chain', {
          baseUrl: API_URL,
          init: { cache: 'no-cache' },
          schema: ChainOverviewSchema
        }),
        apiRequest<Alert[]>('/observability/alerts', {
          baseUrl: API_URL,
          init: { cache: 'no-cache' }
        }),
        apiRequest<{ incidents?: Incident[] }>('/observability/incidents', {
          baseUrl: API_URL,
          init: { cache: 'no-cache' }
        }),
        apiRequest<{ summary?: { pending?: number; finalized?: number; signaturesMissing?: number } }>('/api/bridge', {
          baseUrl: API_URL,
          init: { cache: 'no-cache' }
        })
      ]);

      if (!overviewRes.ok) {
        setError(overviewRes.error);
        setData(null);
        return;
      }

      const snapshot = overviewRes.data.chains.find((entry) => entry.id === target);
      if (!snapshot) {
        setError({
          message: 'chain_missing',
          endpoint: `${API_URL}/chain`,
          method: 'GET',
          hint: 'Ghost-api /chain did not return this chain.'
        });
        setData(fallback);
        return;
      }

      let partialError: ApiError | null = null;
      if (!snapshot.telemetry?.health) {
        partialError = {
          message: 'telemetry_unavailable',
          endpoint: `${API_URL}/chain`,
          method: 'GET',
          hint: 'Telemetry is only available when the chain telemetry service is running.'
        };
      } else if (!alertsRes.ok) {
        partialError = alertsRes.error;
      } else if (!incidentsRes.ok) {
        partialError = incidentsRes.error;
      } else if (!bridgeRes.ok) {
        partialError = bridgeRes.error;
      }
      setError(partialError);

      const health = snapshot.telemetry?.health;
      const lag = deriveLag(snapshot);

      const alerts = alertsRes.ok ? alertsRes.data : [];
      const firingAlerts = alerts.filter((alert) => alert.state === 'firing');
      const firingCritical = firingAlerts.filter((alert) => alert.severity === 'critical').length;
      const firingWarning = firingAlerts.filter((alert) => alert.severity === 'warning').length;
      const sovereigntyAlerts = firingAlerts.filter((alert) => {
        if (SOVEREIGNTY_CRITICAL_ALERTS.has(alert.id) || SOVEREIGNTY_WARNING_ALERTS.has(alert.id)) return true;
        const text = `${alert.id} ${alert.message || ''}`.toLowerCase();
        return (
          text.includes('sovereignty') ||
          text.includes('cascading') ||
          text.includes('finality') ||
          text.includes('settlement') ||
          text.includes('bridge')
        );
      });
      const sovereigntyCritical = sovereigntyAlerts.filter(
        (alert) => alert.severity === 'critical' || SOVEREIGNTY_CRITICAL_ALERTS.has(alert.id)
      ).length;
      const sovereigntyWarning = sovereigntyAlerts.filter(
        (alert) => alert.severity === 'warning' || SOVEREIGNTY_WARNING_ALERTS.has(alert.id)
      ).length;

      const incidents = incidentsRes.ok ? incidentsRes.data.incidents || [] : [];
      const incidentCritical = incidents.filter((incident) => incidentTone(incident.severity) === 'critical').length;
      const incidentWarning = incidents.filter((incident) => incidentTone(incident.severity) === 'warning').length;
      const recentIncidents = incidents
        .slice()
        .sort((a, b) => (b.time || b.createdAt || '').localeCompare(a.time || a.createdAt || ''))
        .slice(0, 3);

      const bridgeSummary = bridgeRes.ok ? bridgeRes.data.summary : undefined;
      const signaturesMissing = bridgeSummary?.signaturesMissing ?? 0;

      const chainById = overviewRes.data.chains.reduce<Partial<Record<'l1' | 'l2' | 'l3', ChainOverview['chains'][number]>>>(
        (acc, chainEntry) => {
          const id = chainEntry.id as 'l1' | 'l2' | 'l3';
          if (id === 'l1' || id === 'l2' || id === 'l3') acc[id] = chainEntry;
          return acc;
        },
        {}
      );
      const l1Lag = deriveLag(chainById.l1);
      const l2Lag = deriveLag(chainById.l2);
      const l3Lag = deriveLag(chainById.l3);
      const hasCascadeTelemetry = typeof l1Lag === 'number' && typeof l2Lag === 'number' && typeof l3Lag === 'number';
      const gateChecks: GateCheck[] = [
        { label: 'L1/L2/L3 telemetry present', ok: hasCascadeTelemetry },
        { label: 'No critical sovereignty alerts', ok: sovereigntyCritical === 0 },
        { label: 'Bridge signatures complete', ok: signaturesMissing === 0 },
        { label: 'No critical incidents', ok: incidentCritical === 0 }
      ];
      const failedChecks = gateChecks.filter((check) => !check.ok).length;
      const gateTone: GateTone = failedChecks >= 2 ? 'critical' : failedChecks === 1 ? 'warning' : 'default';

      setData({
        chain: target,
        head: health?.chain.head,
        finalized: health?.chain.finalized,
        lag: Number.isFinite(lag) ? lag : undefined,
        relayer: { finalized: health?.relayer.finalized, errors: health?.relayer.errors },
        guard: { alerts: health?.guard.alerts, deposits: health?.guard.deposits, activeAlerts: [] },
        alertPosture: { firing: firingAlerts.length, critical: firingCritical, warning: firingWarning },
        sovereigntyPosture: {
          firing: sovereigntyAlerts.length,
          critical: sovereigntyCritical,
          warning: sovereigntyWarning,
          topSignals: Array.from(new Set(sovereigntyAlerts.map((alert) => alert.id))).slice(0, 3)
        },
        incidentPosture: { total: incidents.length, critical: incidentCritical, warning: incidentWarning, recent: recentIncidents },
        bridgePosture: { pending: bridgeSummary?.pending, signaturesMissing: bridgeSummary?.signaturesMissing },
        gate: { checks: gateChecks, failedChecks, tone: gateTone }
      });
    } catch {
      setError({
        message: 'stack_fetch_failed',
        endpoint: `${API_URL}/chain`,
        method: 'GET'
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(chain);
  }, [chain]);

  return (
    <div className="content">
      <div className="inline-form" style={{ marginBottom: 12, gap: 12 }}>
        <span className="muted">Chain</span>
        <select className="select" value={chain} onChange={(e) => setChain(e.target.value as 'l2' | 'l3')}>
          <option value="l2">L2</option>
          <option value="l3">L3</option>
        </select>
        {loading && <span className="muted">Loading...</span>}
      </div>
      <div className="card-grid">
        {error && <DataFetchErrorCard title="Stack overview" error={error} />}
        <Card title={`Head / Finalized (${chain})`} subtitle="op-gate">
          <div className="stack">
            <div className="spread">
              <span className="muted">Head</span>
              <span>{data?.head ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Finalized</span>
              <span>{data?.finalized ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Lag</span>
              <Badge tone={typeof data?.lag === 'number' && data.lag > 5 ? 'warning' : 'default'}>
                {data?.lag ?? 'n/a'}
              </Badge>
            </div>
          </div>
        </Card>
        <Card title="Relayer" subtitle="health + totals">
          <div className="stack">
            <div className="spread">
              <span className="muted">Finalized batches</span>
              <span>{data?.relayer?.finalized ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Errors</span>
              <Badge tone={data?.relayer?.errors ? 'critical' : 'default'}>{data?.relayer?.errors ?? 'n/a'}</Badge>
            </div>
            <div className="muted">Health: {data?.relayer ? 'ok' : 'n/a'}</div>
          </div>
        </Card>
        <Card title="Guard" subtitle="alerts/deposits">
          <div className="stack">
            <div className="spread">
              <span className="muted">Deposits seen</span>
              <span>{data?.guard?.deposits ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Alerts total</span>
              <Badge tone={data?.guard?.alerts ? 'critical' : 'default'}>{data?.guard?.alerts ?? 'n/a'}</Badge>
            </div>
            <div className="stack">
              <span className="muted">Active alerts</span>
              {(data?.guard?.activeAlerts || []).slice(0, 3).map((a: Record<string, unknown>, idx) => {
                const reasons = Array.isArray(a.reasons) ? (a.reasons as string[]).join(', ') : undefined;
                const label = reasons || (a.tx as string | undefined) || (a.from as string | undefined) || 'alert';
                return (
                  <div key={idx} className="muted" style={{ fontSize: '0.85rem' }}>
                    {label}
                  </div>
                );
              })}
              {(data?.guard?.activeAlerts?.length || 0) === 0 && <span className="muted">None</span>}
            </div>
          </div>
        </Card>
        <Card title="Sovereignty Gate" subtitle="Parity with dashboard">
          <div className="stack">
            <div className="spread">
              <span className="muted">Current posture</span>
              <Badge tone={data?.gate?.tone || 'default'}>
                {data?.gate ? (data.gate.failedChecks === 0 ? 'PASS' : data.gate.failedChecks === 1 ? 'WARN' : 'FAIL') : 'n/a'}
              </Badge>
            </div>
            {(data?.gate?.checks || []).map((check) => (
              <div key={check.label} className="spread">
                <span className="muted">{check.label}</span>
                <Badge tone={check.ok ? 'default' : 'warning'}>{check.ok ? 'ok' : 'attention'}</Badge>
              </div>
            ))}
            {!(data?.gate?.checks || []).length && <span className="muted">No gate data.</span>}
          </div>
        </Card>
        <Card title="Sovereignty Signals" subtitle="Firing alert posture">
          <div className="stack">
            <div className="spread">
              <span className="muted">Firing sovereignty alerts</span>
              <Badge
                tone={
                  (data?.sovereigntyPosture?.critical || 0) > 0
                    ? 'critical'
                    : (data?.sovereigntyPosture?.warning || 0) > 0
                      ? 'warning'
                      : 'default'
                }
              >
                {data?.sovereigntyPosture?.firing ?? 'n/a'}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Critical</span>
              <Badge tone={(data?.sovereigntyPosture?.critical || 0) > 0 ? 'critical' : 'default'}>
                {data?.sovereigntyPosture?.critical ?? 'n/a'}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Warning</span>
              <Badge tone={(data?.sovereigntyPosture?.warning || 0) > 0 ? 'warning' : 'default'}>
                {data?.sovereigntyPosture?.warning ?? 'n/a'}
              </Badge>
            </div>
            <div className="muted">
              Top signals: {(data?.sovereigntyPosture?.topSignals || []).length ? data?.sovereigntyPosture?.topSignals.join(', ') : 'none'}
            </div>
          </div>
        </Card>
        <Card title="Incident Posture" subtitle="Bridge + validator feed">
          <div className="stack">
            <div className="spread">
              <span className="muted">Total</span>
              <Badge
                tone={
                  (data?.incidentPosture?.critical || 0) > 0
                    ? 'critical'
                    : (data?.incidentPosture?.warning || 0) > 0
                      ? 'warning'
                      : 'default'
                }
              >
                {data?.incidentPosture?.total ?? 'n/a'}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Critical</span>
              <Badge tone={(data?.incidentPosture?.critical || 0) > 0 ? 'critical' : 'default'}>
                {data?.incidentPosture?.critical ?? 'n/a'}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Warning</span>
              <Badge tone={(data?.incidentPosture?.warning || 0) > 0 ? 'warning' : 'default'}>
                {data?.incidentPosture?.warning ?? 'n/a'}
              </Badge>
            </div>
            {(data?.incidentPosture?.recent || []).slice(0, 2).map((incident, idx) => (
              <div key={`${incident.source || 'incident'}-${incident.time || incident.createdAt || idx}`} className="spread">
                <span className="muted">{incident.message || 'incident'}</span>
                <Badge tone={incidentTone(incident.severity)}>{incident.severity || 'info'}</Badge>
              </div>
            ))}
            {!(data?.incidentPosture?.recent || []).length && <span className="muted">No recent incidents.</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
