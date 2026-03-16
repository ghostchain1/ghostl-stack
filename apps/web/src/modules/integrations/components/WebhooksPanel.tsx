'use client';

import type { Webhook } from '@ghostchain/types/integrations';

export function WebhooksPanel({ hooks }: { hooks: Webhook[] }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Webhooks</div>
      <div className="stack" style={{ gap: 6 }}>
        {hooks.map((h) => (
          <div key={h.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{h.targetUrl}</div>
              <div className="muted">{h.eventTypes.join(', ')}</div>
            </div>
            <div className="badge secondary">{h.secretRef ? 'secret ref' : 'no secret'}</div>
          </div>
        ))}
        {!hooks.length && <div className="muted">No webhooks.</div>}
      </div>
    </div>
  );
}
