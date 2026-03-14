'use client';

import { useFeatureFlags } from '../services/FeatureFlagsService';

const demoAlerts = [
  { id: 'alert-1', message: 'L2 proposer lagging', severity: 'warning' },
  { id: 'alert-2', message: 'Vault latency high', severity: 'critical' }
];

export function NotificationsCenter() {
  const { isEnabled } = useFeatureFlags();
  const enabled = isEnabled('observability.alerts');
  return (
    <div className="badge" title={enabled ? 'Alerts' : 'Alerts disabled by feature flag'} style={{ opacity: enabled ? 1 : 0.5 }}>
      {enabled ? `${demoAlerts.length} alerts` : 'Alerts off'}
    </div>
  );
}
