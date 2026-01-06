import { AISecurityCenter } from '../../src/modules/ai/components/AISecurityCenter';
import { WalletBehaviorProfiles } from '../../src/modules/ai/components/WalletBehaviorProfiles';
import { SybilDetectionPanel } from '../../src/modules/ai/components/SybilDetectionPanel';
import { ForecastingPanel } from '../../src/modules/ai/components/ForecastingPanel';
import type { Anomaly, Forecast } from '@ghostl/types/ai';
import { apiFetch } from '../../src/lib/api';

type RawAi = {
  id?: string;
  risk?: number | string;
  action?: string;
};

async function loadAI() {
  const data = await apiFetch<{ networks?: RawAi[]; ok?: boolean }>('/api/ai', { fallback: { networks: [] } });
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
  return { anomalies, forecasts };
}

export default async function AIPage() {
  const { anomalies, forecasts } = await loadAI();
  const profiles = anomalies.map((a) => ({ address: a.entity, label: a.reasons[0], score: a.score }));
  return (
    <div className="content">
      <div className="card-grid">
        <AISecurityCenter anomalies={anomalies} />
        <WalletBehaviorProfiles profiles={profiles} />
        <SybilDetectionPanel signals={profiles.map((p) => ({ entity: p.address, score: p.score, label: p.label }))} />
        <ForecastingPanel forecasts={forecasts} />
      </div>
    </div>
  );
}
