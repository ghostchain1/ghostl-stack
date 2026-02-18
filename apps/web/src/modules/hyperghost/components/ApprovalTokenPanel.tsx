'use client';

import { useEffect, useState } from 'react';
import { getHgopApprovalToken, setHgopApprovalToken } from '../token';

export function ApprovalTokenPanel() {
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setToken(getHgopApprovalToken() || '');
  }, []);

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Approval Token (Optional)</div>
      <div className="muted" style={{ marginBottom: 8 }}>
        Required for mutating HGOP actions on testnet/mainnet. Stored locally in your browser.
      </div>
      <div className="inline-form" style={{ gap: 8 }}>
        <input
          className="input"
          value={token}
          placeholder="x-hgop-approval-token"
          onChange={(e) => setToken(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          className="button"
          type="button"
          onClick={() => {
            setHgopApprovalToken(token);
            setSaved(new Date().toISOString());
          }}
        >
          Save
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setToken('');
            setHgopApprovalToken('');
            setSaved(new Date().toISOString());
          }}
        >
          Clear
        </button>
      </div>
      {saved && <div className="muted" style={{ marginTop: 8 }}>Updated: {saved}</div>}
    </div>
  );
}

