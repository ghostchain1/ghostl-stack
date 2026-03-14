import Link from 'next/link';
import { Badge, Card } from '@ghostl/ui';
import { ChainOverviewSchema, type ChainOverview } from '@ghostl/contract-schemas';
import type { Alert } from '@ghostl/types/observability';
import type { Proposal } from '@ghostl/types/governance';
import type { ApiError } from '../../../src/lib/api';
import { DataFetchErrorCard } from '../../../src/components/DataFetchErrorCard';
import { serverApiRequest } from '../../../src/lib/server-api';

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

type ContractsApiResponse = {
  networks?: Array<{ id?: string; name?: string; address?: string }>;
  contracts?: Array<{ id?: string; name?: string; address?: string }>;
};

type TestsSummaryResponse = {
  summary?: { status?: string; updatedAt?: string; mode?: string } | null;
};

type ContractsReadinessResponse = {
  l1FinalityOracleAddress?: string | null;
  aiPolicyHash?: string | null;
  aiPolicyHashAccepted?: boolean | null;
  policyHashSource?: string | null;
  detail?: string;
};

type ReadinessStatus = 'pass' | 'fail' | 'unknown';
type ReadinessCheck = { label: string; status: ReadinessStatus; detail: string };

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

const ORACLE_CONTRACT_NAMES = ['L1FinalityOracle', 'L2FinalityOracle', 'L3FinalityOracle'] as const;

const formatLag = (value?: number) => (typeof value === 'number' ? value.toString() : 'n/a');
const formatBlock = (value?: number) => (typeof value === 'number' ? value.toLocaleString('en-US') : 'n/a');
const lagTone = (value?: number): 'default' | 'success' | 'warning' | 'critical' => {
  if (typeof value !== 'number') return 'default';
  if (value > 12) return 'critical';
  if (value > 5) return 'warning';
  return 'success';
};
const readinessTone = (status: ReadinessStatus): 'success' | 'warning' | 'critical' => {
  if (status === 'pass') return 'success';
  if (status === 'fail') return 'critical';
  return 'warning';
};
const incidentTone = (severity?: string): 'default' | 'warning' | 'critical' => {
  const s = (severity || '').toLowerCase();
  if (s.includes('crit') || s.includes('error')) return 'critical';
  if (s.includes('warn')) return 'warning';
  return 'default';
};
const isCriticalIncident = (severity?: string) => incidentTone(severity) === 'critical';
const isWarningIncident = (severity?: string) => incidentTone(severity) === 'warning';
const isAddressLike = (value?: string) => Boolean(value && /^0x[0-9a-fA-F]{40}$/.test(value));
const isBytes32Like = (value?: string | null) => Boolean(value && /^0x[0-9a-fA-F]{64}$/.test(value));
const shortHash = (value?: string | null) => (value ? `${value.slice(0, 10)}...${value.slice(-8)}` : 'n/a');

export default async function DashboardPage() {
  const [overviewRes, bridgeRes, alertsRes, incidentsRes, contractsRes, testsSummaryRes, governanceRes, contractsReadinessRes] =
    await Promise.all([
      serverApiRequest<ChainOverview>('/chain', {
        init: { cache: 'no-store' },
        schema: ChainOverviewSchema
      }),
      serverApiRequest<BridgeSummary>('/api/bridge', { init: { cache: 'no-store' } }),
      serverApiRequest<Alert[]>('/observability/alerts', { init: { cache: 'no-store' } }),
      serverApiRequest<IncidentSummary>('/observability/incidents', { init: { cache: 'no-store' } }),
      serverApiRequest<ContractsApiResponse>('/api/contracts', { init: { cache: 'no-store' } }),
      serverApiRequest<TestsSummaryResponse>('/api/contracts/tests/summary', { init: { cache: 'no-store' } }),
      serverApiRequest<Proposal[]>('/governance/proposals', { init: { cache: 'no-store' } }),
      serverApiRequest<ContractsReadinessResponse>('/api/contracts/readiness', { init: { cache: 'no-store' } })
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

  const contractsList = contractsRes.ok
    ? [...(contractsRes.data.networks || []), ...(contractsRes.data.contracts || [])]
    : [];
  const findContract = (name: (typeof ORACLE_CONTRACT_NAMES)[number]) =>
    contractsList.find((entry) => {
      const label = `${entry.name || ''} ${entry.id || ''}`.toLowerCase();
      return label.includes(name.toLowerCase()) && isAddressLike(entry.address);
    });
  const missingOracles = ORACLE_CONTRACT_NAMES.filter((name) => !findContract(name));
  const oracleCheck: ReadinessCheck = !contractsRes.ok
    ? { label: 'L1/L2/L3 finality oracles deployed', status: 'unknown', detail: 'contracts registry unavailable' }
    : missingOracles.length > 0
      ? { label: 'L1/L2/L3 finality oracles deployed', status: 'fail', detail: `missing: ${missingOracles.join(', ')}` }
      : { label: 'L1/L2/L3 finality oracles deployed', status: 'pass', detail: 'all oracle contracts registered' };

  const testsSummary = testsSummaryRes.ok ? testsSummaryRes.data.summary : null;
  const testsCheck: ReadinessCheck = !testsSummaryRes.ok
    ? { label: 'Cascading finality validation tests', status: 'unknown', detail: 'tests summary endpoint unavailable' }
    : !testsSummary
      ? { label: 'Cascading finality validation tests', status: 'unknown', detail: 'no summary published' }
      : String(testsSummary.status || '').toLowerCase() === 'ok'
        ? {
            label: 'Cascading finality validation tests',
            status: 'pass',
            detail: `${testsSummary.mode || 'foundry'} summary ok`
          }
        : {
            label: 'Cascading finality validation tests',
            status: 'fail',
            detail: `summary status=${testsSummary.status || 'unknown'}`
          };

  const governanceCheck: ReadinessCheck = !governanceRes.ok
    ? { label: 'Governance vote approved', status: 'unknown', detail: 'governance proposals unavailable' }
    : governanceRes.data.length === 0
      ? { label: 'Governance vote approved', status: 'unknown', detail: 'no proposals returned' }
      : governanceRes.data.some((proposal) => {
            const status = String(proposal.status || '').toLowerCase();
            return status === 'passed' || status === 'executed';
          })
        ? { label: 'Governance vote approved', status: 'pass', detail: 'proposal marked passed/executed' }
        : { label: 'Governance vote approved', status: 'fail', detail: 'no passed/executed proposal detected' };

  const policyCommitCheck: ReadinessCheck = !contractsReadinessRes.ok
    ? { label: 'AI policy hash committed on L1 oracle', status: 'unknown', detail: 'policy readiness endpoint unavailable' }
    : !isAddressLike(contractsReadinessRes.data.l1FinalityOracleAddress || undefined)
      ? {
          label: 'AI policy hash committed on L1 oracle',
          status: 'unknown',
          detail: contractsReadinessRes.data.detail || 'L1 finality oracle address missing/invalid'
        }
      : !isBytes32Like(contractsReadinessRes.data.aiPolicyHash)
        ? {
            label: 'AI policy hash committed on L1 oracle',
            status: 'unknown',
            detail: contractsReadinessRes.data.detail || 'AI policy hash not configured'
          }
        : contractsReadinessRes.data.aiPolicyHashAccepted === true
          ? {
              label: 'AI policy hash committed on L1 oracle',
              status: 'pass',
              detail: `${shortHash(contractsReadinessRes.data.aiPolicyHash)} accepted (${contractsReadinessRes.data.policyHashSource || 'config'})`
            }
          : contractsReadinessRes.data.aiPolicyHashAccepted === false
            ? {
                label: 'AI policy hash committed on L1 oracle',
                status: 'fail',
                detail: `${shortHash(contractsReadinessRes.data.aiPolicyHash)} not accepted on oracle`
              }
            : {
                label: 'AI policy hash committed on L1 oracle',
                status: 'unknown',
                detail: contractsReadinessRes.data.detail || 'policy hash acceptance check unavailable'
              };
  const readinessChecks: ReadinessCheck[] = [oracleCheck, policyCommitCheck, governanceCheck, testsCheck];
  const readinessFailed = readinessChecks.filter((check) => check.status === 'fail').length;
  const readinessUnknown = readinessChecks.filter((check) => check.status === 'unknown').length;
  const readinessStatus: ReadinessStatus = readinessFailed > 0 ? 'fail' : readinessUnknown > 0 ? 'unknown' : 'pass';
  const readinessLabel = readinessStatus === 'pass' ? 'READY' : readinessStatus === 'fail' ? 'BLOCKED' : 'PENDING';

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
            <div className="kpi-card">
              <div className="kpi-label">Go-Live Readiness</div>
              <div className="kpi-value">
                <Badge tone={readinessTone(readinessStatus)}>{readinessLabel}</Badge>
              </div>
              <div className="kpi-foot">
                {readinessFailed} failed / {readinessUnknown} unknown checks
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

        <Card title="Go-Live Readiness" subtitle="Gate-aligned snapshot">
          <div className="stack">
            <div className="spread">
              <span className="muted">Current status</span>
              <Badge tone={readinessTone(readinessStatus)}>{readinessLabel}</Badge>
            </div>
            {readinessChecks.map((check) => (
              <div key={check.label} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <span className="muted">{check.label}</span>
                  <Badge tone={readinessTone(check.status)}>
                    {check.status === 'pass' ? 'pass' : check.status === 'fail' ? 'fail' : 'unknown'}
                  </Badge>
                </div>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  {check.detail}
                </div>
              </div>
            ))}
            {testsSummary?.updatedAt && (
              <div className="muted" style={{ marginTop: 8 }}>
                Last test summary update: {testsSummary.updatedAt}
              </div>
            )}
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <Link className="button secondary" href="/contracts">
                Open contracts
              </Link>
              <Link className="button secondary" href="/governance">
                Open governance
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
