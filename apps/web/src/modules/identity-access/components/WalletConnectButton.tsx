'use client';

import { useState } from 'react';
import { useWallet } from '../../wallet/useWallet';

export function WalletConnectButton() {
  const { connect, account, status, chainWarning } = useWallet();
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
        {account ? `Connected: ${account.slice(0, 6)}…${account.slice(-4)}` : busy ? 'Connecting…' : 'Connect wallet'}
      </button>
      {chainWarning && <div className="muted">{chainWarning}</div>}
      {status && <div className="muted">{status}</div>}
    </div>
  );
}
