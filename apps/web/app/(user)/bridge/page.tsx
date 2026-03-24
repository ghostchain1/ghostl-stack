'use client';

import { useState, useEffect, useCallback } from 'react';

type BridgeStatus = {
  pending: number;
  finalized: number;
  failedRecently: number;
  avgFinalityMs: number;
};

type Transfer = {
  id: string;
  from: { layer: string; address: string };
  to: { layer: string; address: string };
  amount: string;
  symbol: string;
  status: 'pending' | 'finalized' | 'failed';
  initiatedAt: string;
  finalizedAt?: string;
};

const LAYER_RPC: Record<string, string> = {
  L1: 'GhostChain L1 (chain_id 14000101)',
  L2: 'GhostL2 (chain_id 901)',
  L3: 'GhostL3 (chain_id 903)',
};

export default function BridgePage() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromLayer, setFromLayer] = useState('L3');
  const [toLayer, setToLayer] = useState('L2');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        fetch('/api/bridge/status', { cache: 'no-store' }),
        fetch('/api/bridge/transfers?limit=20', { cache: 'no-store' }),
      ]);
      if (sRes.ok) setStatus(await sRes.json());
      if (tRes.ok) {
        const d = await tRes.json();
        setTransfers(Array.isArray(d) ? d : (d.transfers ?? []));
      }
    } catch {/* fallback */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 12_000);
    return () => clearInterval(t);
  }, [load]);

  async function submitBridge(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    setSubmitting(true);
    setSubmitMsg('');
    try {
      const res = await fetch('/api/bridge/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromLayer, toLayer, amount, symbol: 'GST' }),
      });
      if (res.ok) {
        setSubmitMsg('Bridge request submitted! Monitoring finality…');
        setAmount('');
        setTimeout(() => { void load(); }, 2000);
      } else {
        const e = await res.json().catch(() => ({}));
        setSubmitMsg(`Error: ${(e as Record<string, string>).message ?? 'Unknown error'}`);
      }
    } catch {
      setSubmitMsg('Network error — please retry.');
    } finally {
      setSubmitting(false);
    }
  }

  const layers = ['L1', 'L2', 'L3'];

  return (
    <div className="portal-page">
      <div className="portal-header">
        <h1 className="portal-title">Bridge</h1>
        <p className="portal-subtitle">Transfer GST across GhostChain L1 → L2 → L3 routing law</p>
      </div>

      {/* Status KPIs */}
      <div className="kpi-grid">
        {[
          { label: 'Pending Transfers', value: loading ? '…' : String(status?.pending ?? '—') },
          { label: 'Finalized (24h)', value: loading ? '…' : String(status?.finalized ?? '—') },
          { label: 'Failed Recently', value: loading ? '…' : String(status?.failedRecently ?? 0) },
          { label: 'Avg Finality', value: loading ? '…' : (status?.avgFinalityMs ? `${(status.avgFinalityMs / 1000).toFixed(1)}s` : '—') },
        ].map(({ label, value }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
          </div>
        ))}
      </div>

      {/* Routing law notice */}
      <div className="card" style={{ background: 'rgba(35,214,166,0.06)', borderColor: 'rgba(35,214,166,0.25)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.1rem' }}>⬡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>Routing Law Enforced</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              All bridge traffic follows: L3 → L2 → L1. Direct L3 → L1 messages are rejected by the routing guard.
              Finality is anchored to GhostChain L1 via canonical bridge addresses.
            </div>
          </div>
        </div>
      </div>

      {/* Bridge form */}
      <div className="card">
        <h3 style={{ margin: '0 0 16px', fontSize: '1rem' }}>Initiate Bridge Transfer</h3>
        <form onSubmit={submitBridge} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="bridge-flow">
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                From Layer
              </label>
              <select
                className="select"
                value={fromLayer}
                onChange={e => setFromLayer(e.target.value)}
                style={{ marginTop: 6 }}
              >
                {layers.map(l => <option key={l} value={l}>{l} — {LAYER_RPC[l]}</option>)}
              </select>
            </div>
            <div className="bridge-arrow">→</div>
            <div>
              <label style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                To Layer
              </label>
              <select
                className="select"
                value={toLayer}
                onChange={e => setToLayer(e.target.value)}
                style={{ marginTop: 6 }}
              >
                {layers.filter(l => l !== fromLayer).map(l => (
                  <option key={l} value={l}>{l} — {LAYER_RPC[l]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Amount (GST)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              className="input"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
          {submitMsg && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, fontSize: '0.88rem',
              background: submitMsg.startsWith('Error') ? 'rgba(255,107,107,0.12)' : 'rgba(35,214,166,0.1)',
              color: submitMsg.startsWith('Error') ? 'var(--danger)' : 'var(--accent)',
              border: `1px solid ${submitMsg.startsWith('Error') ? 'rgba(255,107,107,0.3)' : 'rgba(35,214,166,0.25)'}`,
            }}>
              {submitMsg}
            </div>
          )}
          <button type="submit" className="button" disabled={submitting} style={{ alignSelf: 'flex-start', padding: '10px 22px' }}>
            {submitting ? 'Submitting…' : 'Bridge GST'}
          </button>
        </form>
      </div>

      {/* Transfer history */}
      <div className="portal-section">
        <div className="portal-section-title">Recent Transfers</div>
        {transfers.length === 0 ? (
          <div className="card" style={{ color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
            No bridge transfers found
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>ID</th><th>Route</th><th>Amount</th><th>Status</th><th>Initiated</th><th>Finalized</th></tr>
                </thead>
                <tbody>
                  {transfers.map(tx => (
                    <tr key={tx.id}>
                      <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-3)' }}>{tx.id.slice(0, 12)}…</td>
                      <td>{tx.from.layer} → {tx.to.layer}</td>
                      <td>{tx.amount} {tx.symbol}</td>
                      <td>
                        <span className={`status-tag ${tx.status === 'finalized' ? 'resolved' : tx.status === 'pending' ? 'pending' : 'open'}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{tx.initiatedAt}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{tx.finalizedAt ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
