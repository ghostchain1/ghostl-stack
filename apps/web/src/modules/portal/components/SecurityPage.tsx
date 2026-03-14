'use client';

import { useEffect, useState } from 'react';

type Alert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  message: string;
  timestamp: string;
  resolved?: boolean;
};

type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  resource: string;
  timestamp: string;
  result: 'success' | 'denied' | 'error';
};

type SecurityData = {
  alerts: Alert[];
  audit: AuditEntry[];
  activeSessions?: number;
  blockedIPs?: number;
  threatScore?: number;
};

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

const SEV_COLORS: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
const RESULT_COLORS: Record<string, string> = { success: '#22c55e', denied: '#ef4444', error: '#f59e0b' };

export function SecurityPage() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [activeTab, setActiveTab] = useState<'alerts' | 'audit'>('alerts');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const [nocRes, secRes] = await Promise.allSettled([
          fetch('/api/portal/noc', { cache: 'no-store' }),
          fetch('/api/portal/security', { cache: 'no-store' }),
        ]);
        const nocData = nocRes.status === 'fulfilled' && nocRes.value.ok ? await nocRes.value.json() as { alerts: Alert[] } : { alerts: [] };
        const secData = secRes.status === 'fulfilled' && secRes.value.ok ? await secRes.value.json() as SecurityData : { alerts: [], audit: [] };
        if (!cancelled) {
          setData({ ...secData, alerts: [...(nocData.alerts ?? []), ...(secData.alerts ?? [])] });
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Security service unreachable');
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const alerts = data?.alerts ?? [];
  const audit = data?.audit ?? [];
  const unresolved = alerts.filter((a) => !a.resolved);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Security &amp; Audit</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          NOC AI alerts, RBAC audit log, active sessions, threat detection
        </p>
      </div>

      {error && (
        <div style={{ ...CARD, color: 'var(--danger)', fontSize: 13 }}>Security/NOC API unreachable — {error}</div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: 'Active Alerts', value: unresolved.length, danger: unresolved.some((a) => a.severity === 'critical') },
          { label: 'Active Sessions', value: data?.activeSessions ?? '—', danger: false },
          { label: 'Blocked IPs', value: data?.blockedIPs ?? '—', danger: false },
          { label: 'Threat Score', value: data?.threatScore !== undefined ? `${data.threatScore}/100` : '—', danger: (data?.threatScore ?? 0) > 70 },
        ].map(({ label, value, danger }) => (
          <div key={label} style={{ ...CARD, padding: '14px 18px' }}>
            <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: 22, fontFamily: 'monospace', color: danger ? 'var(--danger)' : 'var(--text)' }}>
              {String(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['alerts', 'audit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              fontSize: 12, padding: '5px 14px', borderRadius: 99, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: activeTab === t ? 'var(--accent)' : 'transparent',
              color: activeTab === t ? '#fff' : 'var(--muted)',
            }}
          >
            {t === 'alerts' ? `Alerts ${unresolved.length > 0 ? `(${unresolved.length})` : ''}` : 'Audit Log'}
          </button>
        ))}
      </div>

      {activeTab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.length === 0 && (
            <div style={{ ...CARD, color: 'var(--muted)', fontSize: 13 }}>No active alerts — all systems nominal.</div>
          )}
          {alerts.map((alert) => (
            <div key={alert.id} style={{
              ...CARD, padding: '14px 18px',
              borderLeft: `3px solid ${SEV_COLORS[alert.severity] ?? '#666'}`,
              opacity: alert.resolved ? 0.5 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: `${SEV_COLORS[alert.severity]}22`, color: SEV_COLORS[alert.severity] }}>
                      {alert.severity.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{alert.source}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{alert.message}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', marginLeft: 16 }}>
                  {alert.timestamp}
                  {alert.resolved && <div style={{ color: '#22c55e' }}>Resolved</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'audit' && (
        <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          {audit.length === 0 ? (
            <div style={{ padding: '20px 22px', color: 'var(--muted)', fontSize: 13 }}>No audit entries.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Timestamp', 'Actor', 'Action', 'Resource', 'Result'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{e.timestamp}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{e.actor}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{e.action}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11 }}>{e.resource}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: `${RESULT_COLORS[e.result]}22`, color: RESULT_COLORS[e.result] }}>
                        {e.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
