'use client';

import { useEffect, useState } from 'react';
import { MetricsPanel } from '../../src/modules/observability/components/MetricsPanel';
import { DashboardsPanel } from '../../src/modules/observability/components/DashboardsPanel';
import { LogsViewer } from '../../src/modules/observability/components/LogsViewer';
import { AlertsPanel } from '../../src/modules/observability/components/AlertsPanel';
import { NotificationRouter } from '../../src/modules/observability/components/NotificationRouter';
import { IncidentTimeline } from '../../src/modules/observability/components/IncidentTimeline';
import { BridgeValidatorHealth } from '../../src/modules/observability/components/BridgeValidatorHealth';
import { ValidatorMetrics } from '../../src/modules/observability/components/ValidatorMetrics';
import { SecurityControls } from '../../src/modules/observability/components/SecurityControls';
import type { Alert, LogEvent } from '@ghostl/types/observability';
import { apiRequest, type ApiError } from '../../src/lib/api';
import { resolvePrometheusBase } from '../../src/lib/runtime';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';

type PromVector = { metric: Record<string, string>; value?: [number, string] };
type Dashboard = { id: string; name: string; url: string };

const PROM_URL = resolvePrometheusBase();
const PROM_PROPOSER = process.env.NEXT_PUBLIC_PROM_PROPOSER_QUERY || 'op_gate_last_proposer';
const PROM_PARTICIPATION = process.env.NEXT_PUBLIC_PROM_PARTICIPATION_QUERY || 'op_gate_participation_rate';

export default function ObservabilityPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [metrics, setMetrics] = useState<{ name: string; url: string }[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [routes, setRoutes] = useState<
    { target: string; channel: 'slack' | 'discord' | 'webhook' | 'email'; active: boolean }[]
  >([]);
  const [incidents, setIncidents] = useState<{ source: string; message?: string; severity?: string; time?: string; createdAt?: string }[]>([]);
  const [errors, setErrors] = useState<Array<{ title: string; error: ApiError }>>([]);

  useEffect(() => {
    const load = async () => {
      const nextErrors: Array<{ title: string; error: ApiError }> = [];
      const alertsRes = await apiRequest<Alert[]>('/observability/alerts');
      if (!alertsRes.ok) nextErrors.push({ title: 'Observability alerts', error: alertsRes.error });
      else setAlerts(alertsRes.data);

      const logsRes = await apiRequest<LogEvent[]>('/observability/logs');
      if (!logsRes.ok) nextErrors.push({ title: 'Log stream', error: logsRes.error });
      else setLogs(logsRes.data);

      const metricsRes = await apiRequest<PromVector[]>('/observability/metrics?q=up');
      if (!metricsRes.ok) {
        nextErrors.push({ title: 'Prometheus metrics', error: metricsRes.error });
      } else if (Array.isArray(metricsRes.data)) {
        const targets = metricsRes.data.map((entry) => ({
          name: entry.metric.job || entry.metric.instance || 'target',
          url: PROM_URL
        }));
        setMetrics(targets.length ? targets : [{ name: 'Prometheus', url: PROM_URL }]);
      }

      const dashboardsRes = await apiRequest<Dashboard[]>('/observability/dashboards');
      if (!dashboardsRes.ok) nextErrors.push({ title: 'Grafana dashboards', error: dashboardsRes.error });
      else setDashboards(dashboardsRes.data);

      const channelsRes = await apiRequest<{ id: string; type: string; target: string }[]>('/observability/channels');
      if (!channelsRes.ok) {
        nextErrors.push({ title: 'Notification routes', error: channelsRes.error });
      } else {
        const mapped = (channelsRes.data || []).map((c) => ({
          target: c.target,
          channel: (c.type as 'slack' | 'discord' | 'webhook' | 'email') || 'webhook',
          active: true
        }));
        setRoutes(mapped);
      }

      const incidentsRes = await apiRequest<{ incidents: any[] }>('/observability/incidents');
      if (!incidentsRes.ok) nextErrors.push({ title: 'Incident timeline', error: incidentsRes.error });
      else setIncidents(incidentsRes.data.incidents || []);

      setErrors(nextErrors);
    };
    load().catch(() => undefined);
  }, []);

  return (
    <div className="content">
      <div className="muted" style={{ marginBottom: 8 }}>
        Using PromQL: proposer={PROM_PROPOSER}, participation={PROM_PARTICIPATION}
      </div>
      <div className="card-grid">
        {errors.map((entry, idx) => (
          <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
        ))}
        <MetricsPanel targets={metrics} />
        <DashboardsPanel dashboards={dashboards} />
        <LogsViewer events={logs} />
        <AlertsPanel alerts={alerts} />
        <NotificationRouter routes={routes} />
        <IncidentTimeline incidents={incidents} />
        <BridgeValidatorHealth />
        <ValidatorMetrics />
        <SecurityControls />
      </div>
    </div>
  );
}
