'use client';

import { useState } from 'react';

const networks = [
  { id: '31337', label: 'GhostL1 (local)' },
  { id: '7192', label: 'GhostL2 (local)' },
  { id: '7393', label: 'GhostL3 (local)' }
];

export function NetworkSwitcher() {
  const [selected, setSelected] = useState(networks[1].id);
  return (
    <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
      {networks.map((n) => (
        <option key={n.id} value={n.id}>
          {n.label}
        </option>
      ))}
    </select>
  );
}
