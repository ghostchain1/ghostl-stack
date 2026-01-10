import { AISecurityCenter } from '../../src/modules/ai/components/AISecurityCenter';
import { WalletBehaviorProfiles } from '../../src/modules/ai/components/WalletBehaviorProfiles';
import { SybilDetectionPanel } from '../../src/modules/ai/components/SybilDetectionPanel';
import { ForecastingPanel } from '../../src/modules/ai/components/ForecastingPanel';
import type { Anomaly, Forecast, SybilSignal, ContractRisk } from '@ghostl/types/ai';
import { apiFetch } from '../../src/lib/api';

type RawAi = {
  id?: string;
  risk?: number | string;
  action?: string;
};

async function loadAI() {
  const data = await apiFetch<{ networks?: RawAi[]; sybil?: SybilSignal[]; contractRisk?: ContractRisk[] }>('/api/ai', {
    fallback: { networks: [] }
  });
  const anomalies: Anomaly[] = (data.networks || []).map((n) => {
    const score = typeof n.risk === 'string' ? Number(n.risk) || 0 : Number(n.risk || 0);
    return {
      id: n.id || 'ai',
      entity: n.id || 'network',
      score,
      reasons: [n.action || ''],
      time: new Date().toISOString()
    };
  });
  const forecasts: Forecast[] = [
    { metric: 'gas', horizon: '15m', value: 0, confidence: 0.5 },
    { metric: 'downtime', horizon: '1h', value: 0, confidence: 0.5 }
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
              <div key={c.address} className={`pill ${c.risk > 0.5 ? 'warn' : 'ok'}`}>
                {c.address} · risk {(c.risk * 100).toFixed(0)}%
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
