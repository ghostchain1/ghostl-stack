import type { Metadata } from 'next';
import { Card } from '@ghostl/ui';
import { localRoute } from '../../../src/lib/local-route';

export const metadata: Metadata = {
  title: 'Profile — GhostChain User',
};

type ApiProfile = {
  address: string; alias: string; tier: string; since: string;
  kycStatus: string; network: string;
  staking: { delegatedTo: string; stakedGST: string; pendingYield: string };
  sessions: { device: string; last: string; current: boolean }[];
  keys: { label: string; type: string; added: string; active: boolean }[];
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

const FALLBACK: ApiProfile = {
  address:   '0x1F3a4b8c9D2e5F6a7B3c4D5e6F7a8B9c0D1E2F3a',
  alias:     'ghost-user-1',
  tier:      'Standard',
  since:     '2025-10-14T00:00:00Z',
  kycStatus: 'Verified',
  network:   'mainnet',
  staking: { delegatedTo: '0xB841…E2D3 (GhostValidator-07)', stakedGST: '12400', pendingYield: '0.00042' },
  sessions: [
    { device: 'Chrome / Linux',  last: '2026-03-01T14:30:00Z', current: true  },
    { device: 'Firefox / macOS', last: '2026-02-28T09:15:00Z', current: false },
  ],
  keys: [
    { label: 'Default signing key',       type: 'secp256k1', added: 'Oct 14, 2025', active: true },
    { label: 'Hardware wallet (Ledger)',   type: 'secp256k1', added: 'Jan 3, 2026',  active: true },
  ],
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="spread" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '10px 0' }}>
      <span className="muted" style={{ fontSize: '0.78rem' }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem', wordBreak: 'break-all', textAlign: 'right', maxWidth: '65%' }}>{value}</span>
    </div>
  );
}

export default async function ProfilePage() {
  const api = await localRoute<ApiProfile>('/api/profile') ?? FALLBACK;
  const stakedDisplay  = Number(api.staking.stakedGST).toLocaleString() + ' GST';
  const yieldDisplay   = api.staking.pendingYield + ' GST';
  const sinceDisplay   = fmtDate(api.since);
  const network        = api.network.charAt(0).toUpperCase() + api.network.slice(1);
  const fmtSession     = (iso: string) => iso.replace('T', ' ').slice(0, 16) + ' UTC';
  return (
    <div className="content">
      {/* Page header */}
      <div className="spread" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0 }}>My Profile</h1>
          <p className="muted" style={{ marginTop: 4 }}>Manage your identity, sessions, and signing keys</p>
        </div>
        <button className="chip" style={{ cursor: 'pointer' }}>Edit alias</button>
      </div>

      <div className="card-grid">
        {/* Identity card */}
        <Card>
          <div className="spread" style={{ marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Identity</span>
            <span className="badge">
              {api.kycStatus === 'Verified' ? '✓ KYC Verified' : 'KYC Pending'}
            </span>
          </div>
          <InfoRow label="Alias"       value={api.alias}   />
          <InfoRow label="Address"     value={api.address} />
          <InfoRow label="Network"     value={network} />
          <InfoRow label="Tier"        value={api.tier}    />
          <InfoRow label="Member since" value={sinceDisplay}  />
        </Card>

        {/* Staking card */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 16 }}>Staking</div>
          <InfoRow label="Staked GST"     value={stakedDisplay}    />
          <InfoRow label="Pending yield"  value={yieldDisplay}  />
          <InfoRow label="Delegated to"   value={api.staking.delegatedTo}   />
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="chip" style={{ cursor: 'pointer' }}>Claim yield</button>
            <button className="chip" style={{ cursor: 'pointer' }}>Re-delegate</button>
          </div>
        </Card>

        {/* Sessions card */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 16 }}>Active Sessions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {api.sessions.map((s, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.device}
                    {s.current && <span className="badge" style={{ fontSize: '0.6rem' }}>Current</span>}
                  </div>
                  <div className="muted" style={{ fontSize: '0.7rem', marginTop: 2 }}>{fmtSession(s.last)}</div>
                </div>
                {!s.current && (
                  <button className="chip" style={{ cursor: 'pointer', fontSize: '0.7rem', color: 'var(--color-error, #FF3B3B)' }}>Revoke</button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Keys card */}
        <Card>
          <div className="spread" style={{ marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Signing Keys</span>
            <button className="chip" style={{ cursor: 'pointer', fontSize: '0.72rem' }}>+ Add key</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {api.keys.map((k, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 14px' }}>
                <div className="spread">
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{k.label}</span>
                  <span className={k.active ? 'badge' : 'chip'} style={{ fontSize: '0.6rem' }}>
                    {k.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: '0.68rem', marginTop: 2 }}>
                  {k.type} · Added {k.added}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
