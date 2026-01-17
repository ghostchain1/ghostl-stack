'use client';

import { useEffect, useState } from 'react';
import { resolveApiBase } from '../../../lib/runtime';

type SecurityStatus = {
  vaultHealthy?: boolean;
  vaultUrl?: string;
  hardwareWalletRequired?: boolean;
  hsmHealthy?: boolean;
};

const API_BASE = resolveApiBase();

export function SecurityControls() {
  const [status, setStatus] = useState<SecurityStatus>({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/security/controls`, { credentials: 'include' });
      const json = await res.json();
      setStatus(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Key security</div>
      {loading && <div className="muted">Loading…</div>}
      <div className="stack" style={{ gap: 6 }}>
        <div className={`pill ${status.vaultHealthy ? 'ok' : 'warn'}`}>Vault/HSM health: {status.vaultHealthy ? 'ok' : 'unknown'}</div>
        <div className={`pill ${status.hsmHealthy ? 'ok' : 'warn'}`}>HSM link: {status.hsmHealthy ? 'ok' : 'unknown'}</div>
        <div className={`pill ${status.hardwareWalletRequired ? 'warn' : 'muted'}`}>
          Hardware wallet required: {status.hardwareWalletRequired ? 'yes' : 'no'}
        </div>
        {status.vaultUrl && (
          <a href={status.vaultUrl} target="_blank" rel="noreferrer" className="button secondary">
            Open vault
          </a>
        )}
        <button onClick={load} style={{ width: '100%' }}>
          Refresh
        </button>
      </div>
    </div>
  );
}
