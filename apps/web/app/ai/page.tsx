import type { Anomaly, Forecast, SybilSignal, ContractRisk } from '@ghostl/types/ai';
import { AISecurityCenter } from '../../src/modules/ai/components/AISecurityCenter';
import { ForecastingPanel } from '../../src/modules/ai/components/ForecastingPanel';
import { SybilDetectionPanel } from '../../src/modules/ai/components/SybilDetectionPanel';
import { WalletBehaviorProfiles } from '../../src/modules/ai/components/WalletBehaviorProfiles';
import { apiFetch } from '../../src/lib/api';

async function loadAI() {
  const data = await apiFetch<{ anomalies?: Anomaly[]; forecasts?: Forecast[]; sybil?: SybilSignal[]; contractRisk?: ContractRisk[] }>('/api/ai', {
    fallback: { anomalies: [], forecasts: [], sybil: [], contractRisk: [] }
  });
  const anomalies: Anomaly[] = data.anomalies || [];
  const forecasts: Forecast[] =
    (data.forecasts || []).length > 0
      ? (data.forecasts || [])
      : [
          { metric: 'risk', horizon: '5m', value: 0, confidence: 0.5 },
          { metric: 'congestion', horizon: '5m', value: 0, confidence: 0.5 }
        ];
  const sybil = data.sybil || [];
  const contractRisk = data.contractRisk || [];
  return { anomalies, forecasts, sybil, contractRisk };
}

export default async function AIPage() {
  const { anomalies, forecasts, sybil, contractRisk } = await loadAI();
  const profiles = anomalies.map((a) => ({ address: a.entity, label: a.reasons[0], score: a.score }));
  return (
    <div className="content">
      <div className="card-grid">
        <AISecurityCenter anomalies={anomalies} />
        <WalletBehaviorProfiles profiles={profiles} />
        <SybilDetectionPanel signals={sybil.length ? sybil.map((s) => ({ entity: s.cluster, score: s.score, label: (s.tags || []).join(', ') })) : profiles.map((p) => ({ entity: p.address, score: p.score, label: p.label }))} />
        <ForecastingPanel forecasts={forecasts} />
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Contract risk</div>
          <div className="stack" style={{ gap: 4 }}>
            {(contractRisk || []).map((c) => (
              <div key={c.address} className={`pill ${(c.risk > 1 ? c.risk : c.risk * 100) > 50 ? 'warn' : 'ok'}`}>
                {c.address} · risk {(c.risk > 1 ? c.risk : c.risk * 100).toFixed(0)}%
                {c.notes?.length ? ` · ${c.notes.join('; ')}` : ''}
              </div>
            ))}
            {!contractRisk.length && <div className="muted">No contract risk signals.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
