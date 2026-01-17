'use client';

import { useState } from 'react';
import { useWallet } from '../../wallet/useWallet';

export function GhostWalletButton() {
  const { connect, account, status } = useWallet();
  const [busy, setBusy] = useState(false);

  const handleConnect = async () => {
    setBusy(true);
    try {
      await connect();
    } catch {
      // connect handles its own status state
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      <button className="button" type="button" onClick={handleConnect} disabled={busy}>
        {account ? `Active: ${account.slice(0, 6)}…${account.slice(-4)}` : busy ? 'Loading…' : 'Select GhostWallet'}
      </button>
      {status && <div className="muted">{status}</div>}
    </div>
  );
}
