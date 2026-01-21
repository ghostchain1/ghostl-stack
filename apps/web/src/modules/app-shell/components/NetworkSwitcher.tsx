'use client';

import { useNetwork } from '../services/NetworkContextService';
import { formatApiError } from '../../../lib/api';

export function NetworkSwitcher() {
  const { networks, current, setNetwork, error } = useNetwork();

  return (
    <div className="stack" style={{ gap: 4 }}>
      <select className="select" value={current?.id || ''} onChange={(e) => setNetwork(e.target.value)}>
        {networks.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label} · {n.env}
          </option>
        ))}
      </select>
      {error && (
        <div className="muted" style={{ maxWidth: 240 }}>
          {(() => {
            const info = formatApiError(error);
            return `${info.method} ${info.endpoint} | ${info.status} | ${info.hint}`;
          })()}
        </div>
      )}
    </div>
  );
}
