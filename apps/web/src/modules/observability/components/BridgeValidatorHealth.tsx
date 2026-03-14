'use client';

import { useEffect, useState } from 'react';
import { resolveApiBase } from '../../../lib/runtime';
import { apiRequest, type ApiError } from '../../../lib/api';
import { DataFetchErrorCard } from '../../../components/DataFetchErrorCard';

type Incident = {
  source: string;
  message?: string;
  severity?: string;
  time?: string;
  createdAt?: string;
};

const API_BASE = resolveApiBase();

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
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    setLoading(true);
    apiRequest<{ incidents?: Incident[] }>('/observability/incidents', { baseUrl: API_BASE })
      .then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setError(null);
        setIncidents(res.data.incidents || []);
      })
      .catch((err) => {
        setError({
          message: err instanceof Error ? err.message : 'incidents_fetch_failed',
          endpoint: `${API_BASE}/observability/incidents`,
          method: 'GET'
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const bridgeInc = incidents.filter((i) => i.source === 'bridge');
  const validatorInc = incidents.filter((i) => i.source !== 'bridge');
  const totals = {
    bridgeCrit: bridgeInc.filter((i) => (i.severity || '').toLowerCase().includes('crit')).length,
    bridgeWarn: bridgeInc.filter((i) => (i.severity || '').toLowerCase().includes('warn')).length,
    valCrit: validatorInc.filter((i) => (i.severity || '').toLowerCase().includes('crit')).length,
    valWarn: validatorInc.filter((i) => (i.severity || '').toLowerCase().includes('warn')).length
  };

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Bridge & Validator Health</div>
      {error && <DataFetchErrorCard title="Bridge/validator incidents" error={error} />}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <span className="pill">Bridge warn {totals.bridgeWarn}</span>
        <span className="pill warn">Bridge crit {totals.bridgeCrit}</span>
        <span className="pill">Validator warn {totals.valWarn}</span>
        <span className="pill warn">Validator crit {totals.valCrit}</span>
      </div>
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
