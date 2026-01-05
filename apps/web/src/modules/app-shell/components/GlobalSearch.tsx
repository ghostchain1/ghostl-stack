'use client';

import { useState } from 'react';
import { useNetwork } from '../services/NetworkContextService';

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const { current } = useNetwork();
  const placeholder = current ? `Search on ${current.label}: tx / hash / address / contract` : 'Search tx / hash / address / contract';

  return (
    <div className="inline-form" style={{ flex: 1 }}>
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );
}
