'use client';

import { useMemo, useState } from 'react';

type User = { id: string; email: string; role: string; status: 'active' | 'pending'; wallet?: string; factors?: string[] };
type Wallet = {
  id: string;
  label: string;
  owner?: string;
  chain: 'L1' | 'L2' | 'L3';
  address: string;
  balance: string;
  risk: 'ok' | 'watch';
};

const seedUsers: User[] = [
  { id: 'u-01', email: 'ops@ghostl.io', role: 'Operator', status: 'active', wallet: 'Guardian', factors: ['Passkey', 'Hardware'] },
  { id: 'u-02', email: 'treasury@ghostl.io', role: 'Treasury Admin', status: 'active', wallet: 'Multisig', factors: ['Hardware'] },
  { id: 'u-03', email: 'ai@ghostl.io', role: 'Security', status: 'pending', wallet: 'AI Monitor', factors: ['TOTP'] }
];

const seedWallets: Wallet[] = [
  { id: 'w-01', label: 'Guardian', owner: 'ops@ghostl.io', chain: 'L1', address: '0x74b1...2b3a', balance: '124 ETH', risk: 'ok' },
  { id: 'w-02', label: 'Multisig', owner: 'treasury@ghostl.io', chain: 'L2', address: '0x9c42...ff10', balance: '2.1M USDC', risk: 'ok' },
  { id: 'w-03', label: 'AI Monitor', owner: 'ai@ghostl.io', chain: 'L3', address: '0x18aa...d100', balance: '12,420 GLX', risk: 'watch' }
];

export default function HomePage() {
  const [users, setUsers] = useState<User[]>(seedUsers);
  const [wallets, setWallets] = useState<Wallet[]>(seedWallets);
  const [newUser, setNewUser] = useState<{ email: string; role: string }>({ email: '', role: 'Operator' });
  const [userWallet, setUserWallet] = useState<string>('');
  const [newWallet, setNewWallet] = useState<{ label: string; chain: Wallet['chain']; owner?: string }>({
    label: '',
    chain: 'L2',
    owner: undefined
  });

  const stats = useMemo(
    () => [
      { label: 'Finality', value: '1.9s', detail: 'L2→L1 checkpointing steady' },
      { label: 'Sequencer', value: '11.2k tps', detail: 'Burst capacity tested' },
      { label: 'Bridges', value: '312 pending', detail: 'L2↔L3 queue healthy' },
      { label: 'Validators', value: '36 active', detail: 'No slashing events' }
    ],
    []
  );

  const networkBands = [
    { name: 'L1 · Ghostchain', id: '1337', health: 'Operational', color: 'var(--success)', sync: '100%' },
    { name: 'L2 · GhostL2', id: '7192', health: 'Operational', color: 'var(--accent)', sync: '99.8%' },
    { name: 'L3 · GhostL3', id: '7393', health: 'Observing', color: 'var(--accent-2)', sync: '99.4%' }
  ];

  const addUser = () => {
    if (!newUser.email.trim()) return;
    const id = `u-${Math.random().toString(16).slice(2, 6)}`;
    setUsers((prev) => [
      ...prev,
      { id, email: newUser.email.trim(), role: newUser.role, status: 'pending', wallet: userWallet || undefined, factors: ['TOTP'] }
    ]);
    setNewUser({ email: '', role: 'Operator' });
    setUserWallet('');
  };

  const addWallet = () => {
    if (!newWallet.label.trim()) return;
    const id = `w-${Math.random().toString(16).slice(2, 6)}`;
    const address = `0x${Math.random().toString(16).slice(2).padEnd(8, '0')}...${Math.random().toString(16).slice(2, 6)}`;
    setWallets((prev) => [
      ...prev,
      {
        id,
        label: newWallet.label.trim(),
        chain: newWallet.chain,
        owner: newWallet.owner || 'unassigned',
        address,
        balance: '0',
        risk: 'ok'
      }
    ]);
    setNewWallet({ label: '', chain: 'L2', owner: undefined });
  };

  const promoteUser = (id: string) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status: 'active', factors: Array.from(new Set([...(u.factors || []), 'Hardware'])) } : u)));
  };

  const rotateWallet = (id: string) => {
    setWallets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, address: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}` } : w))
    );
  };

  return (
    <div className="content">
      <div className="card" style={{ padding: 20, position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 20% 30%, rgba(124,243,255,0.12), transparent 30%), radial-gradient(circle at 80% 20%, rgba(138,123,255,0.16), transparent 30%)',
            filter: 'blur(12px)',
            opacity: 0.8,
            zIndex: 0
          }}
          aria-hidden
        />
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 16, alignItems: 'center' }}>
          <div>
            <div className="pill" style={{ marginBottom: 12, width: 'fit-content' }}>
              <span className="pulse" />
              Live L1/L2/L3 control plane
            </div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', letterSpacing: '0.01em' }}>Blockchain Command Hub</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              Observe and act across chains, validators, bridges, users, and wallets from a single glass panel. Built for fast incident
              response and controlled upgrades.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <span className="chip">Finality monitors</span>
              <span className="chip">Wallet issuance</span>
              <span className="chip">RBAC-aware</span>
              <span className="chip">Bridge controls</span>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {stats.map((s) => (
              <div key={s.label} className="card" style={{ padding: 14, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{s.value}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {s.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="spread">
            <h3>Network fabric</h3>
            <span className="badge">Deep links</span>
          </div>
          <div className="stack">
            {networkBands.map((band) => (
              <div key={band.id} className="spread" style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="pulse" style={{ background: band.color, boxShadow: `0 0 0 0 ${band.color}` }} />
                    <strong>{band.name}</strong>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Chain ID {band.id} · Sync {band.sync}
                  </div>
                </div>
                <div className="pill">{band.health}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="spread">
            <h3>Bridge posture</h3>
            <span className="badge">L2 ↔ L3</span>
          </div>
          <div className="stack">
            <div className="spread">
              <span className="muted">Pending transfers</span>
              <strong>312</strong>
            </div>
            <div className="spread">
              <span className="muted">Signatures ready</span>
              <strong>289 / 312</strong>
            </div>
            <div className="spread">
              <span className="muted">Liquidity pools</span>
              <span className="pill">Healthy · 98% balanced</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="button secondary" type="button">
                Pause bridge
              </button>
              <button className="button" type="button">
                Push next batch
              </button>
              <button className="button secondary" type="button">
                Export signatures
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="spread">
            <h3>User access</h3>
            <span className="badge">RBAC + MFA</span>
          </div>
          <div className="stack">
            <div className="grid-3">
              <label className="stack">
                <span className="muted">Email</span>
                <input className="input" value={newUser.email} placeholder="ops@example.com" onChange={(e) => setNewUser((v) => ({ ...v, email: e.target.value }))} />
              </label>
              <label className="stack">
                <span className="muted">Role</span>
                <select className="select" value={newUser.role} onChange={(e) => setNewUser((v) => ({ ...v, role: e.target.value }))}>
                  <option>Operator</option>
                  <option>Security</option>
                  <option>Treasury Admin</option>
                  <option>Protocol Admin</option>
                  <option>Developer</option>
                </select>
              </label>
              <label className="stack">
                <span className="muted">Assign wallet (optional)</span>
                <select
                  className="select"
                  value={userWallet}
                  onChange={(e) => setUserWallet(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {wallets.map((w) => {
                    const ownerLabel = w.owner || w.label;
                    return (
                      <option key={w.id} value={ownerLabel}>
                        {w.label} — {ownerLabel}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
            <button className="button" type="button" onClick={addUser}>
              Add user + issue session
            </button>
            <div className="stack">
              {users.map((user) => (
                <div
                  key={user.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.03)'
                  }}
                >
                  <div className="spread">
                    <div>
                      <strong>{user.email}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {user.role} {user.wallet ? `· ${user.wallet}` : ''}
                      </div>
                    </div>
                    <div className="inline-form" style={{ gap: 6 }}>
                      <span className="badge" style={{ background: user.status === 'active' ? 'rgba(126, 242, 157, 0.15)' : 'rgba(255, 255, 255, 0.05)' }}>
                        {user.status === 'active' ? 'Active' : 'Pending MFA'}
                      </span>
                      {user.factors?.map((f) => (
                        <span key={f} className="chip">
                          {f}
                        </span>
                      ))}
                      {user.status !== 'active' && (
                        <button className="button secondary" type="button" onClick={() => promoteUser(user.id)}>
                          Approve + enforce HW
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="spread">
            <h3>Wallet issuance</h3>
            <span className="badge">Custody-aware</span>
          </div>
          <div className="stack">
            <div className="grid-3">
              <label className="stack">
                <span className="muted">Label</span>
                <input className="input" value={newWallet.label} onChange={(e) => setNewWallet((v) => ({ ...v, label: e.target.value }))} placeholder="Ops multisig / Guard" />
              </label>
              <label className="stack">
                <span className="muted">Chain</span>
                <select className="select" value={newWallet.chain} onChange={(e) => setNewWallet((v) => ({ ...v, chain: e.target.value as Wallet['chain'] }))}>
                  <option value="L1">L1</option>
                  <option value="L2">L2</option>
                  <option value="L3">L3</option>
                </select>
              </label>
              <label className="stack">
                <span className="muted">Owner (optional)</span>
                <input className="input" value={newWallet.owner || ''} placeholder="treasury@ghostl.io" onChange={(e) => setNewWallet((v) => ({ ...v, owner: e.target.value || undefined }))} />
              </label>
            </div>
            <button className="button" type="button" onClick={addWallet}>
              Create wallet + fund from faucet
            </button>
            <div className="stack">
              {wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className="spread"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.03)'
                  }}
                >
                  <div>
                    <strong>
                      {wallet.label} · {wallet.chain}
                    </strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {wallet.address} · {wallet.owner || 'unassigned'}
                    </div>
                  </div>
                  <div className="inline-form" style={{ gap: 8 }}>
                    <span className="chip">{wallet.balance}</span>
                    <span className="badge" style={{ background: wallet.risk === 'ok' ? 'rgba(126, 242, 157, 0.15)' : 'rgba(255, 107, 107, 0.1)' }}>
                      {wallet.risk === 'ok' ? 'Risk: low' : 'Risk: watch'}
                    </span>
                    <button className="button secondary" type="button" onClick={() => rotateWallet(wallet.id)}>
                      Rotate key
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="spread">
            <h3>Ops automations</h3>
            <span className="badge">Upgrade safe</span>
          </div>
          <div className="grid-3">
            <div className="stack">
              <div className="muted">Sequencer upgrade</div>
              <div className="value" style={{ fontWeight: 700 }}>Canary + rollback ready</div>
              <button className="button secondary" type="button">
                Start canary
              </button>
            </div>
            <div className="stack">
              <div className="muted">Bridge controls</div>
              <div className="value" style={{ fontWeight: 700 }}>Enforcement ON</div>
              <button className="button secondary" type="button">
                Toggle enforcement
              </button>
            </div>
            <div className="stack">
              <div className="muted">Alert pipeline</div>
              <div className="value" style={{ fontWeight: 700 }}>Slack + email</div>
              <button className="button secondary" type="button">
                Send test alert
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="spread">
            <h3>Compliance & audit</h3>
            <span className="badge">Export-ready</span>
          </div>
          <div className="stack">
            <div className="spread">
              <span className="muted">Policies</span>
              <span className="pill">Zero trust · 2 / 2 bridges locked</span>
            </div>
            <div className="spread">
              <span className="muted">Audit trails</span>
              <span className="pill">58 events last hour</span>
            </div>
            <div className="spread">
              <span className="muted">Reports</span>
              <span className="pill">SOC2-lite · Pending export</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="button" type="button">
                Export CSV
              </button>
              <button className="button secondary" type="button">
                Schedule weekly
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
