'use client';

import { useEffect, useState } from 'react';

type Incident = {
  source: string;
  message?: string;
  severity?: string;
  time?: string;
  createdAt?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const badge = (sev?: string) => {
  if (!sev) return 'badge muted';
  const s = sev.toLowerCase();
  if (s.includes('crit') || s.includes('error')) return 'badge bad';
  if (s.includes('warn')) return 'badge warn';
  return 'badge ok';
};

export function BridgeValidatorHealth() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/observability/incidents`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setIncidents(j.incidents || []))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const bridgeInc = incidents.filter((i) => i.source === 'bridge');
  const validatorInc = incidents.filter((i) => i.source !== 'bridge');

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Bridge & Validator Health</div>
      {loading && <div className="muted">Loading...</div>}
      <div className="stack" style={{ gap: 8 }}>
        <div>
          <div className="muted" style={{ marginBottom: 4 }}>
            Bridge incidents
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {bridgeInc.map((i, idx) => (
              <div key={idx} className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div>{i.message || 'incident'}</div>
                  <div className="muted">{i.time || i.createdAt || 'unknown'}</div>
                </div>
                <div className={badge(i.severity)}>{i.severity || 'info'}</div>
              </div>
            ))}
            {!bridgeInc.length && <div className="muted">No bridge incidents</div>}
          </div>
        </div>
        <div>
          <div className="muted" style={{ marginBottom: 4 }}>
            Validator/finality alerts
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {validatorInc.map((i, idx) => (
              <div key={idx} className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div>{i.message || 'alert'}</div>
                  <div className="muted">{i.source}</div>
                  <div className="muted">{i.time || i.createdAt || 'unknown'}</div>
                </div>
                <div className={badge(i.severity)}>{i.severity || 'info'}</div>
              </div>
            ))}
            {!validatorInc.length && <div className="muted">No validator/finality alerts</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
