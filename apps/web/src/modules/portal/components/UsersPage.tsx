'use client';

import { useEffect, useState } from 'react';

type UserEntry = {
  id: string;
  username: string;
  email?: string;
  walletAddress?: string;
  realm: 'users' | 'employees' | 'admins';
  role: 'READONLY' | 'OPERATOR' | 'ADMIN' | 'OWNER';
  status: 'active' | 'suspended' | 'pending';
  lastLogin?: string;
};

type UsersData = { users: UserEntry[]; total: number };

const CARD: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px',
};

const ROLE_COLORS: Record<string, string> = {
  READONLY: '#6b7280',
  OPERATOR: '#3b82f6',
  ADMIN: '#f59e0b',
  OWNER: '#ef4444',
};

const REALM_LABELS: Record<string, string> = {
  users: 'Users',
  employees: 'Employee',
  admins: 'Admin',
};

function truncateAddr(addr: string | undefined) {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function UsersPage() {
  const [data, setData] = useState<UsersData | null>(null);
  const [filterRealm, setFilterRealm] = useState<'all' | 'users' | 'employees' | 'admins'>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/portal/users', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as UsersData;
        if (!cancelled) { setData(json); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Auth service unreachable');
      }
    }
    void poll();
    const id = setInterval(() => { void poll(); }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const entries = (data?.users ?? []).filter((u) => filterRealm === 'all' || u.realm === filterRealm);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Users &amp; Wallet Mapping</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            SSO realms, RBAC roles, GhostWallet address bindings
          </p>
        </div>
        {data && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {data.total} total accounts
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...CARD, color: 'var(--danger)', fontSize: 13 }}>
          Auth service offline — {error}. Port 3100 / Keycloak not reachable.
        </div>
      )}

      {/* Realm tabs */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['all', 'users', 'employees', 'admins'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setFilterRealm(r)}
            style={{
              fontSize: 12, padding: '5px 14px', borderRadius: 99, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: filterRealm === r ? 'var(--accent)' : 'transparent',
              color: filterRealm === r ? '#fff' : 'var(--muted)',
            }}
          >
            {r === 'all' ? 'All Realms' : REALM_LABELS[r]}
          </button>
        ))}
      </div>

      {!error && entries.length === 0 && (
        <div style={{ ...CARD, color: 'var(--muted)', fontSize: 13 }}>
          {data ? 'No users in this realm.' : 'Loading users…'}
        </div>
      )}

      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Username', 'Realm', 'Role', 'Wallet', 'Status', 'Last Login'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', opacity: u.status === 'suspended' ? 0.5 : 1 }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                  {u.username}
                  {u.email && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{u.email}</div>}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>{REALM_LABELS[u.realm] ?? u.realm}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                    background: `${ROLE_COLORS[u.role] ?? '#666'}22`, color: ROLE_COLORS[u.role] ?? '#666',
                  }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                  {truncateAddr(u.walletAddress)}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                    background: u.status === 'active' ? 'rgba(34,197,94,0.1)' : u.status === 'pending' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                    color: u.status === 'active' ? '#22c55e' : u.status === 'pending' ? '#f59e0b' : '#ef4444',
                  }}>
                    {u.status}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 11 }}>{u.lastLogin ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
