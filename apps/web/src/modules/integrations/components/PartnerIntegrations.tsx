'use client';

import type { IntegrationPartner } from '@ghostchain/types/integrations';

export function PartnerIntegrations({ partners }: { partners: IntegrationPartner[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Partners</div>
      <div className="stack" style={{ gap: 6 }}>
        {partners.map((p) => (
          <div key={p.name} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{p.name}</div>
              <div className="muted">{p.type}</div>
            </div>
            <div className={`badge ${p.status === 'connected' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad'}`}>{p.status}</div>
          </div>
        ))}
        {!partners.length && <div className="muted">No partners configured.</div>}
      </div>
    </div>
  );
}
