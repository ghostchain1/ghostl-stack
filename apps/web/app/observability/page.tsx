'use client';

import { useEffect, useState } from 'react';
import { MetricsPanel } from '../../src/modules/observability/components/MetricsPanel';
import { DashboardsPanel } from '../../src/modules/observability/components/DashboardsPanel';
import { LogsViewer } from '../../src/modules/observability/components/LogsViewer';
import { AlertsPanel } from '../../src/modules/observability/components/AlertsPanel';
import { NotificationRouter } from '../../src/modules/observability/components/NotificationRouter';
import type { Alert, LogEvent } from '@ghostchain/types/observability';
import { apiFetch } from '../../src/lib/api';

export default function ObservabilityPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<LogEvent[]>([]);

  useEffect(() => {
    apiFetch<Alert[]>('/observability/alerts', { fallback: [] }).then((a) => setAlerts(a));
    apiFetch<LogEvent[]>('/observability/logs', { fallback: [] }).then((l) => setLogs(l));
  }, []);

  const metrics = [
    { name: 'Prometheus', url: 'http://localhost:9090' },
    { name: 'Grafana', url: 'http://localhost:3000' }
  ];
  const dashboards = [{ name: 'Stack', url: 'http://localhost:3000' }];
  const routes = [
    { target: 'slack://alerts', channel: 'slack', active: true },
    { target: 'https://example.com/webhook', channel: 'webhook', active: true }
  ];

  return (
    <div className="content">
      <div className="card-grid">
        <MetricsPanel targets={metrics} />
        <DashboardsPanel dashboards={dashboards} />
        <LogsViewer events={logs} />
        <AlertsPanel alerts={alerts} />
        <NotificationRouter routes={routes} />
      </div>
    </div>
  );
}
