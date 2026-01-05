'use client';

import { useNetwork } from '../services/NetworkContextService';

export function NetworkSwitcher() {
  const { networks, current, setNetwork } = useNetwork();

  return (
    <select className="select" value={current?.id || ''} onChange={(e) => setNetwork(e.target.value)}>
      {networks.map((n) => (
        <option key={n.id} value={n.id}>
          {n.label} · {n.env}
        </option>
      ))}
    </select>
  );
}
