'use client';

import { useState } from 'react';

export function GlobalSearch() {
  const [query, setQuery] = useState('');

  return (
    <div className="inline-form" style={{ flex: 1 }}>
      <input
        className="input"
        placeholder="Search tx / hash / address / contract"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );
}
