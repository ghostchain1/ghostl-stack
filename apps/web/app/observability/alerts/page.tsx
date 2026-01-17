'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, Button } from '@ghostl/ui';
import { useSession } from '../../../src/modules/identity-access/session';
import { resolveApiBase } from '../../../src/lib/runtime';

const API_URL = resolveApiBase();

type Alert = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  source: string;
  state: 'firing' | 'resolved';
  firedAt: string;
  message?: string;
};

type Policy = { mode?: number; threshold?: number; delaySeconds?: number };

const severityTone: Record<Alert['severity'], 'default' | 'warning' | 'critical'> = {
  info: 'default',
  warning: 'warning',
  critical: 'critical'
};

export default function AlertsPage() {
  const session = useSession();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeInput, setModeInput] = useState(0);
  const [thresholdInput, setThresholdInput] = useState<number | ''>('');
  const [delayInput, setDelayInput] = useState<number | ''>('');
  const policyModeLabel =
    policy?.mode === 0 ? 'allow' : policy?.mode === 1 ? 'delay' : policy?.mode === 2 ? 'pause' : 'unknown';
  const canWriteGuard = session.user?.permissions?.includes('guard:write') ?? false;

  const load = async () => {
    const res = await fetch(`${API_URL}/observability/alerts`);
    const data = await res.json();
    setAlerts(data);
  };

  const loadPolicy = async () => {
    try {
      const res = await fetch(`${API_URL}/observability/guard/policy`);
      if (res.ok) {
        const p = await res.json();
        setPolicy(p);
      }
    } catch {
      setPolicy(null);
    }
  };

  useEffect(() => {
    load();
    loadPolicy();
  }, []);

  const updatePolicy = async (path: 'mode' | 'threshold' | 'delay', body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/observability/guard/policy/${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(adminToken ? { 'x-admin-token': adminToken } : {})
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadPolicy();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update policy';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="content">
      <div className="card-grid">
        <Card title="Active alerts" subtitle={`${alerts.length} firing`}>
          <div className="stack">
            {alerts.length === 0 && <span className="muted">No active alerts</span>}
            {alerts.map((alert) => (
              <div key={alert.id} className="spread">
                <div>
                  <div>{alert.message || alert.id}</div>
                  <div className="muted">{alert.source}</div>
                </div>
                <Badge tone={severityTone[alert.severity]}>{alert.severity}</Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Guard policy" subtitle="Admin token required for writes">
          <div className="stack">
            <input
              className="input"
              placeholder="x-admin-token"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
            />
            <div className="stack">
              <div className="spread">
                <span className="muted">Mode</span>
                <span>{policyModeLabel}</span>
              </div>
              <div className="inline-form">
                <select
                  className="select"
                  value={modeInput}
                  onChange={(e) => setModeInput(Number(e.target.value))}
                  style={{ minWidth: 160 }}
                  disabled={!canWriteGuard}
                >
                  <option value={0}>Allow</option>
                  <option value={1}>Delay</option>
                  <option value={2}>Pause</option>
                </select>
                <Button
                  variant="secondary"
                  disabled={busy || !canWriteGuard}
                  onClick={() => updatePolicy('mode', { mode: modeInput })}
                >
                  Apply
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => loadPolicy()}>
                  Refresh
                </Button>
              </div>
            </div>
            {error && <span className="muted" style={{ color: '#f87171' }}>{error}</span>}
            <div className="stack">
              <div className="spread">
                <span className="muted">Threshold</span>
                <span>{policy?.threshold ?? 'n/a'}</span>
              </div>
              <div className="inline-form">
                <input
                  className="input"
                  type="number"
                  placeholder="Set threshold"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value ? Number(e.target.value) : '')}
                  disabled={!canWriteGuard}
                />
                <Button
                  variant="secondary"
                  disabled={busy || !canWriteGuard || thresholdInput === '' || Number.isNaN(thresholdInput as number)}
                  onClick={() => updatePolicy('threshold', { threshold: thresholdInput })}
                >
                  Apply
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => loadPolicy()}>
                  Refresh
                </Button>
              </div>
            </div>
            <div className="stack">
              <div className="spread">
                <span className="muted">Delay seconds</span>
                <span>{policy?.delaySeconds ?? 'n/a'}</span>
              </div>
              <div className="inline-form">
                <input
                  className="input"
                  type="number"
                  placeholder="Set delay"
                  value={delayInput}
                  onChange={(e) => setDelayInput(e.target.value ? Number(e.target.value) : '')}
                  disabled={!canWriteGuard}
                />
                <Button
                  variant="secondary"
                  disabled={busy || !canWriteGuard || delayInput === '' || Number.isNaN(delayInput as number)}
                  onClick={() => updatePolicy('delay', { seconds: delayInput })}
                >
                  Apply
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => loadPolicy()}>
                  Refresh
                </Button>
              </div>
            </div>
            {busy && <span className="muted">Updating policy...</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
