'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import { resolveApiBase } from '../../lib/runtime';

const API_URL = resolveApiBase();
const LOCAL_STATUS_TIMEOUT = 2500;

type User = {
  id: string;
  email?: string;
  wallets?: string[];
  roles: string[];
};

type Role = {
  id: string;
  name: string;
  permissions: string[];
};

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [status, setStatus] = useState<string>('');
  const [newUser, setNewUser] = useState<{ email: string; wallets: string; roles: string }>({
    email: '',
    wallets: '',
    roles: 'viewer'
  });
  const [walletInputs, setWalletInputs] = useState<Record<string, string>>({});

  const roleMap = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const summary = useMemo(() => {
    const walletTotal = users.reduce((acc, u) => acc + (u.wallets?.length || 0), 0);
    const roleSet = new Set<string>();
    users.forEach((u) => (u.roles || []).forEach((r) => roleSet.add(r)));
    return { users: users.length, wallets: walletTotal, roles: roleSet.size };
  }, [users]);

  const flashStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), LOCAL_STATUS_TIMEOUT);
  };

  const load = async () => {
    setStatus('Loading users...');
    try {
      const [uRes, rRes] = await Promise.all([
        fetch(`${API_URL}/users`, { credentials: 'include' }),
        fetch(`${API_URL}/roles`, { credentials: 'include' })
      ]);
      if (!uRes.ok || !rRes.ok) throw new Error('auth_required');
      const uJson = (await uRes.json()) as User[];
      const rJson = (await rRes.json()) as Role[];
      setUsers(uJson);
      setRoles(rJson);
      setStatus('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load users';
      setStatus(msg);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const createUser = async () => {
    if (!newUser.email) {
      setStatus('Email required');
      return;
    }
    setStatus('Creating user...');
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: newUser.email,
          wallets: newUser.wallets ? newUser.wallets.split(',').map((w) => w.trim()) : [],
          roles: newUser.roles ? newUser.roles.split(',').map((r) => r.trim()) : ['viewer']
        })
      });
      if (!res.ok) throw new Error(`Create failed ${res.status}`);
      await load();
      setNewUser({ email: '', wallets: '', roles: 'viewer' });
      flashStatus('User created');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setStatus(msg);
    }
  };

  const updateUser = async (id: string, update: Partial<User>) => {
    setStatus('Updating user...');
    try {
      const res = await fetch(`${API_URL}/users/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(update)
      });
      if (!res.ok) throw new Error(`Update failed ${res.status}`);
      await load();
      flashStatus('User updated');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      setStatus(msg);
    }
  };

  const addWallet = (user: User, wallet: string) => {
    if (!wallet) return;
    const next = Array.from(new Set([...(user.wallets || []), wallet]));
    updateUser(user.id, { wallets: next });
  };

  const removeWallet = (user: User, wallet: string) => {
    const next = (user.wallets || []).filter((w) => w !== wallet);
    updateUser(user.id, { wallets: next });
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="card-grid">
        <Card title="Users" subtitle="Total accounts">
          <div className="stack">
            <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.users}</div>
            <span className="muted">active</span>
          </div>
        </Card>
        <Card title="Wallets" subtitle="Linked addresses">
          <div className="stack">
            <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.wallets}</div>
            <span className="muted">across users</span>
          </div>
        </Card>
        <Card title="Roles" subtitle="Unique role ids">
          <div className="stack">
            <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.roles}</div>
            <span className="muted">coverage</span>
          </div>
        </Card>
      </div>

      <Card title="Create user" subtitle="SSO or wallet-managed">
        <div className="stack" style={{ gap: 8 }}>
          <div className="inline-form" style={{ gap: 8 }}>
            <input
              className="input"
              placeholder="email"
              value={newUser.email}
              onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
            />
            <input
              className="input"
              placeholder="wallets (comma separated 0x...)"
              value={newUser.wallets}
              onChange={(e) => setNewUser((u) => ({ ...u, wallets: e.target.value }))}
            />
          </div>
          <input
            className="input"
            placeholder="roles (comma separated)"
            value={newUser.roles}
            onChange={(e) => setNewUser((u) => ({ ...u, roles: e.target.value }))}
          />
          <Button onClick={createUser}>Create</Button>
          {status && <span className="muted">{status}</span>}
        </div>
      </Card>

      <div className="card-grid">
        {users.map((u) => (
          <Card key={u.id} title={u.email || u.id} subtitle={u.id}>
            <div className="stack" style={{ gap: 8 }}>
              <div className="stack">
                <span className="muted">Roles</span>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {(u.roles || []).map((r) => (
                    <Badge key={r}>{r}</Badge>
                  ))}
                  <select
                    className="select"
                    onChange={(e) => {
                      const role = e.target.value;
                      if (!role) return;
                      const next = Array.from(new Set([...(u.roles || []), role]));
                      updateUser(u.id, { roles: next });
                    }}
                    defaultValue=""
                  >
                    <option value="">Add role…</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name || r.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="stack">
                <span className="muted">Wallets</span>
                <div className="stack" style={{ gap: 4 }}>
                  {(u.wallets || []).map((w) => (
                    <div key={w} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="mono">{w}</span>
                      <Button variant="secondary" onClick={() => removeWallet(u, w)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  <div className="inline-form" style={{ gap: 6 }}>
                    <input
                      className="input"
                      placeholder="0x wallet"
                      value={walletInputs[u.id] || ''}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const value = (e.target as HTMLInputElement).value;
                          addWallet(u, value);
                          setWalletInputs((prev) => ({ ...prev, [u.id]: '' }));
                        }
                      }}
                      onChange={(e) => setWalletInputs((prev) => ({ ...prev, [u.id]: e.target.value }))}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const value = walletInputs[u.id];
                        if (value) {
                          addWallet(u, value);
                          setWalletInputs((prev) => ({ ...prev, [u.id]: '' }));
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              <div className="stack">
                <span className="muted">Permissions (derived)</span>
                <div className="stack" style={{ gap: 2 }}>
                  {(u.roles || []).flatMap((r) => roleMap[r]?.permissions || []).map((p) => (
                    <span key={`${u.id}-${p}`} className="muted" style={{ fontSize: 12 }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
