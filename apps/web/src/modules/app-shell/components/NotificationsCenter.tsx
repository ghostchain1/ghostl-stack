'use client';

const demoAlerts = [
  { id: 'alert-1', message: 'L2 proposer lagging', severity: 'warning' },
  { id: 'alert-2', message: 'Vault latency high', severity: 'critical' }
];

export function NotificationsCenter() {
  return (
    <div className="badge" title="Alerts stub">
      {demoAlerts.length} alerts
    </div>
  );
}
