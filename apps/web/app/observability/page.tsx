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
import { apiFetch } from '../../src/lib/api';

type PromVector = { metric: Record<string, string>; value?: [number, string] };
type Dashboard = { id: string; name: string; url: string };

const PROM_URL = process.env.NEXT_PUBLIC_PROMETHEUS_URL || 'http://localhost:9090';

export default function ObservabilityPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [metrics, setMetrics] = useState<{ name: string; url: string }[]>([]);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [routes, setRoutes] = useState<
    { target: string; channel: 'slack' | 'discord' | 'webhook' | 'email'; active: boolean }[]
  >([]);
  const [incidents, setIncidents] = useState<{ source: string; message?: string; severity?: string; time?: string; createdAt?: string }[]>([]);

  useEffect(() => {
    apiFetch<Alert[]>('/observability/alerts', { fallback: [] }).then((a) => setAlerts(a));
    apiFetch<LogEvent[]>('/observability/logs', { fallback: [] }).then((l) => setLogs(l));
    apiFetch<PromVector[]>('/observability/metrics?q=up', { fallback: [] }).then((res) => {
      if (!Array.isArray(res)) return;
      const targets = res.map((entry) => ({
        name: entry.metric.job || entry.metric.instance || 'target',
        url: PROM_URL
      }));
      setMetrics(targets.length ? targets : [{ name: 'Prometheus', url: PROM_URL }]);
    });
    apiFetch<Dashboard[]>('/observability/dashboards', { fallback: [] }).then((res) => setDashboards(res));
    apiFetch<{ id: string; type: string; target: string }[]>('/observability/channels', { fallback: [] }).then(
      (channels) => {
        const mapped = (channels || []).map((c) => ({
          target: c.target,
          channel: (c.type as 'slack' | 'discord' | 'webhook' | 'email') || 'webhook',
          active: true
        }));
        setRoutes(mapped);
      }
    );
    apiFetch<{ incidents: any[] }>('/observability/incidents', { fallback: { incidents: [] } }).then((res) => {
      setIncidents(res.incidents || []);
    });
  }, []);

  return (
    <div className="content">
      <div className="card-grid">
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
