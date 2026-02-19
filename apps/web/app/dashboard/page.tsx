import Link from 'next/link';
import { Badge, Card } from '@ghostl/ui';
import { ChainOverviewSchema, type ChainOverview } from '@ghostl/contract-schemas';
import type { Alert } from '@ghostl/types/observability';
import type { ApiError } from '../../src/lib/api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';
import { serverApiRequest } from '../../src/lib/server-api';

type BridgeSummary = {
  summary?: {
    pending?: number;
    finalized?: number;
    signaturesMissing?: number;
  };
};

type Incident = {
  source?: string;
  message?: string;
  severity?: string;
  time?: string;
  createdAt?: string;
};

type IncidentSummary = {
  incidents?: Incident[];
};

type LayerKey = 'l1' | 'l2' | 'l3';

const layerOrder: LayerKey[] = ['l3', 'l2', 'l1'];
const layerLabel: Record<LayerKey, string> = {
  l1: 'GhostL1',
  l2: 'GhostL2',
  l3: 'GhostL3'
};

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

const formatLag = (value?: number) => (typeof value === 'number' ? value.toString() : 'n/a');
const formatBlock = (value?: number) => (typeof value === 'number' ? value.toLocaleString('en-US') : 'n/a');
const lagTone = (value?: number): 'default' | 'success' | 'warning' | 'critical' => {
  if (typeof value !== 'number') return 'default';
  if (value > 12) return 'critical';
  if (value > 5) return 'warning';
  return 'success';
};
const incidentTone = (severity?: string): 'default' | 'warning' | 'critical' => {
  const s = (severity || '').toLowerCase();
  if (s.includes('crit') || s.includes('error')) return 'critical';
  if (s.includes('warn')) return 'warning';
  return 'default';
};
const isCriticalIncident = (severity?: string) => incidentTone(severity) === 'critical';
const isWarningIncident = (severity?: string) => incidentTone(severity) === 'warning';

export default async function DashboardPage() {
  const [overviewRes, bridgeRes, alertsRes, incidentsRes] = await Promise.all([
    serverApiRequest<ChainOverview>('/chain', {
      init: { cache: 'no-store' },
      schema: ChainOverviewSchema
    }),
    serverApiRequest<BridgeSummary>('/api/bridge', { init: { cache: 'no-store' } }),
    serverApiRequest<Alert[]>('/observability/alerts', { init: { cache: 'no-store' } }),
    serverApiRequest<IncidentSummary>('/observability/incidents', { init: { cache: 'no-store' } })
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!overviewRes.ok) errors.push({ title: 'Chain overview', error: overviewRes.error });
  if (!bridgeRes.ok) errors.push({ title: 'Bridge summary', error: bridgeRes.error });
  if (!alertsRes.ok) errors.push({ title: 'Alert posture', error: alertsRes.error });
  if (!incidentsRes.ok) errors.push({ title: 'Incident posture', error: incidentsRes.error });

  const chains = overviewRes.ok ? overviewRes.data.chains : [];
  const chainById = chains.reduce<Partial<Record<LayerKey, ChainOverview['chains'][number]>>>((acc, chain) => {
    const id = chain.id as LayerKey;
    if (id === 'l1' || id === 'l2' || id === 'l3') acc[id] = chain;
    return acc;
  }, {});

  const bridgeSummary = bridgeRes.ok ? bridgeRes.data.summary : undefined;
  const alerts = alertsRes.ok ? alertsRes.data : [];
  const incidents = incidentsRes.ok ? incidentsRes.data.incidents || [] : [];
  const firingAlerts = alerts.filter((alert) => alert.state === 'firing');
  const firingCritical = firingAlerts.filter((alert) => alert.severity === 'critical').length;
  const firingWarning = firingAlerts.filter((alert) => alert.severity === 'warning').length;
  const incidentCritical = incidents.filter((incident) => isCriticalIncident(incident.severity)).length;
  const incidentWarning = incidents.filter((incident) => isWarningIncident(incident.severity)).length;
  const recentIncidents = incidents
    .slice()
    .sort((a, b) => (b.time || b.createdAt || '').localeCompare(a.time || a.createdAt || ''))
    .slice(0, 3);
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
  const sovereigntySignalIds = Array.from(new Set(sovereigntyAlerts.map((alert) => alert.id))).slice(0, 3);
  const latestAlert = firingAlerts.reduce<Alert | null>((latest, current) => {
    if (!latest) return current;
    return (current.firedAt || '').localeCompare(latest.firedAt || '') > 0 ? current : latest;
  }, null);

  const l1Lag = chainById.l1?.finalityLag;
  const l2Lag = chainById.l2?.finalityLag;
  const l3Lag = chainById.l3?.finalityLag;
  const signaturesMissing = bridgeSummary?.signaturesMissing ?? 0;
  const hasCascadeTelemetry = typeof l1Lag === 'number' && typeof l2Lag === 'number' && typeof l3Lag === 'number';
  const cascadeTone: 'default' | 'success' | 'warning' | 'critical' = !hasCascadeTelemetry
    ? 'default'
    : (l1Lag ?? 0) > 12 || (l2Lag ?? 0) > 12 || (l3Lag ?? 0) > 12
      ? 'critical'
      : (l1Lag ?? 0) > 5 || (l2Lag ?? 0) > 5 || (l3Lag ?? 0) > 5
        ? 'warning'
        : 'success';
  const gateChecks = [
    { label: 'L1/L2/L3 telemetry present', ok: hasCascadeTelemetry },
    { label: 'No critical sovereignty alerts', ok: sovereigntyCritical === 0 },
    { label: 'Bridge signatures complete', ok: signaturesMissing === 0 },
    { label: 'No critical incidents', ok: incidentCritical === 0 }
  ];
  const failedChecks = gateChecks.filter((check) => !check.ok).length;
  const sovereigntyGateTone: 'default' | 'warning' | 'critical' =
    failedChecks >= 2 ? 'critical' : failedChecks === 1 ? 'warning' : 'default';

  return (
    <div className="content">
      <div className="hero card">
        <div className="hero-main">
          <span className="hero-badge">Cascading Finality</span>
          <h2 style={{ margin: '10px 0 8px', fontSize: '1.7rem' }}>GhostL3 → GhostL2 → GhostL1</h2>
          <div className="muted" style={{ maxWidth: 760 }}>
            L1 remains the sovereign finality authority. This view is telemetry-only and helps operators monitor whether
            finality lag and bridge settlement stay within policy bounds.
          </div>
          <div className="hero-actions">
            <Link className="button" href="/observability/stack">
              Open stack telemetry
            </Link>
            <Link className="button secondary" href="/bridge">
              Open bridge console
            </Link>
            <Link className="button secondary" href="/observability/alerts">
              Open alert stream
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Settlement Route</div>
              <div className="kpi-value">L3 → L2 → L1</div>
              <div className="kpi-foot">No bypass paths</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Cascade Signal</div>
              <div className="kpi-value">
                <Badge tone={cascadeTone}>{hasCascadeTelemetry ? 'Tracked' : 'Unavailable'}</Badge>
              </div>
              <div className="kpi-foot">Lag-derived health state</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Bridge Pending</div>
              <div className="kpi-value">{bridgeSummary?.pending ?? 'n/a'}</div>
              <div className="kpi-foot">Messages waiting finalize</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Bridge Finalized</div>
              <div className="kpi-value">{bridgeSummary?.finalized ?? 'n/a'}</div>
              <div className="kpi-foot">Completed settlements</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Firing Alerts</div>
              <div className="kpi-value">
                <Badge tone={firingCritical > 0 ? 'critical' : firingWarning > 0 ? 'warning' : 'default'}>
                  {firingAlerts.length}
                </Badge>
              </div>
              <div className="kpi-foot">
                {firingCritical} critical / {firingWarning} warning
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Sovereignty Signals</div>
              <div className="kpi-value">
                <Badge tone={sovereigntyCritical > 0 ? 'critical' : sovereigntyWarning > 0 ? 'warning' : 'default'}>
                  {sovereigntyAlerts.length}
                </Badge>
              </div>
              <div className="kpi-foot">
                {sovereigntyCritical} critical / {sovereigntyWarning} warning
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Incidents</div>
              <div className="kpi-value">
                <Badge tone={incidentCritical > 0 ? 'critical' : incidentWarning > 0 ? 'warning' : 'default'}>
                  {incidents.length}
                </Badge>
              </div>
              <div className="kpi-foot">
                {incidentCritical} critical / {incidentWarning} warning
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}

        {layerOrder.map((layer) => {
          const chain = chainById[layer];
          const lag = chain?.finalityLag;
          return (
            <Card key={layer} title={layerLabel[layer]} subtitle={`Layer ${layer.toUpperCase()}`}>
              <div className="stack">
                <div className="spread">
                  <span className="muted">Chain ID</span>
                  <span>{chain?.info?.chainId ?? 'n/a'}</span>
                </div>
                <div className="spread">
                  <span className="muted">Head block</span>
                  <span>{formatBlock(chain?.rpc?.blockNumber)}</span>
                </div>
                <div className="spread">
                  <span className="muted">Finality lag</span>
                  <Badge tone={lagTone(lag)}>{formatLag(lag)}</Badge>
                </div>
                <div className="spread">
                  <span className="muted">Consensus</span>
                  <span>{chain?.info?.consensus ?? 'n/a'}</span>
                </div>
              </div>
            </Card>
          );
        })}

        <Card title="Bridge Settlement" subtitle="L1 hub route">
          <div className="stack">
            <div className="spread">
              <span className="muted">Pending finalize</span>
              <Badge tone={(bridgeSummary?.pending ?? 0) > 0 ? 'warning' : 'default'}>
                {bridgeSummary?.pending ?? 'n/a'}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Finalized</span>
              <span>{bridgeSummary?.finalized ?? 'n/a'}</span>
            </div>
            <div className="spread">
              <span className="muted">Signatures missing</span>
              <Badge tone={(bridgeSummary?.signaturesMissing ?? 0) > 0 ? 'warning' : 'default'}>
                {bridgeSummary?.signaturesMissing ?? 'n/a'}
              </Badge>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              External chain traffic is routed only through GhostL1 BridgeHub.
            </div>
          </div>
        </Card>

        <Card title="Alert Posture" subtitle="Operational pressure">
          <div className="stack">
            <div className="spread">
              <span className="muted">Firing</span>
              <Badge tone={firingCritical > 0 ? 'critical' : firingWarning > 0 ? 'warning' : 'default'}>
                {firingAlerts.length}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Critical</span>
              <Badge tone={firingCritical > 0 ? 'critical' : 'default'}>{firingCritical}</Badge>
            </div>
            <div className="spread">
              <span className="muted">Warning</span>
              <Badge tone={firingWarning > 0 ? 'warning' : 'default'}>{firingWarning}</Badge>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Latest: {latestAlert?.id || latestAlert?.source || 'none'}
            </div>
          </div>
        </Card>

        <Card title="Sovereignty Signals" subtitle="Cascading finality and bridge risk">
          <div className="stack">
            <div className="spread">
              <span className="muted">Firing sovereignty alerts</span>
              <Badge tone={sovereigntyCritical > 0 ? 'critical' : sovereigntyWarning > 0 ? 'warning' : 'default'}>
                {sovereigntyAlerts.length}
              </Badge>
            </div>
            <div className="spread">
              <span className="muted">Critical</span>
              <Badge tone={sovereigntyCritical > 0 ? 'critical' : 'default'}>{sovereigntyCritical}</Badge>
            </div>
            <div className="spread">
              <span className="muted">Warning</span>
              <Badge tone={sovereigntyWarning > 0 ? 'warning' : 'default'}>{sovereigntyWarning}</Badge>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Top signals: {sovereigntySignalIds.length ? sovereigntySignalIds.join(', ') : 'none'}
            </div>
          </div>
        </Card>

        <Card title="Sovereignty Gate" subtitle="Derived operational lock state">
          <div className="stack">
            <div className="spread">
              <span className="muted">Current gate posture</span>
              <Badge tone={sovereigntyGateTone}>{failedChecks === 0 ? 'PASS' : failedChecks === 1 ? 'WARN' : 'FAIL'}</Badge>
            </div>
            {gateChecks.map((check) => (
              <div key={check.label} className="spread">
                <span className="muted">{check.label}</span>
                <Badge tone={check.ok ? 'default' : 'warning'}>{check.ok ? 'ok' : 'attention'}</Badge>
              </div>
            ))}
            <div className="muted" style={{ marginTop: 8 }}>
              This does not mutate chain state; it reflects telemetry policy health only.
            </div>
          </div>
        </Card>

        <Card title="Incident Feed" subtitle="Latest bridge and validator issues">
          <div className="stack">
            {recentIncidents.map((incident, idx) => (
              <div key={`${incident.source || 'incident'}-${incident.time || incident.createdAt || idx}`} className="spread">
                <div>
                  <div>{incident.message || 'incident'}</div>
                  <div className="muted">
                    {(incident.source || 'unknown').toUpperCase()} · {incident.time || incident.createdAt || 'n/a'}
                  </div>
                </div>
                <Badge tone={incidentTone(incident.severity)}>{incident.severity || 'info'}</Badge>
              </div>
            ))}
            {recentIncidents.length === 0 && <div className="muted">No recent incidents.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
