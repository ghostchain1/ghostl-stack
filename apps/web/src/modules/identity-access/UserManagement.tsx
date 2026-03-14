'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import { resolveApiBase } from '../../lib/runtime';
import { jsonWithCsrf } from '../../lib/csrf';
import { apiRequest, type ApiError, formatApiError } from '../../lib/api';
import { DataFetchErrorCard } from '../../components/DataFetchErrorCard';
import type { Role } from './access-policy';

const API_URL = resolveApiBase();
const LOCAL_STATUS_TIMEOUT = 2500;

type User = {
  id: string;
  email?: string;
  username?: string;
  wallets?: string[];
  role: Role;
};

const availableRoles: Role[] = ['READONLY', 'OPERATOR', 'ADMIN'];

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<string>('');
  const [newUser, setNewUser] = useState<{ email: string; username: string; wallets: string; role: Role }>({
    email: '',
    username: '',
    wallets: '',
    role: 'READONLY'
  });
  const [walletInputs, setWalletInputs] = useState<Record<string, string>>({});
  const [usernameInputs, setUsernameInputs] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<ApiError | null>(null);

  const summary = useMemo(() => {
    const walletTotal = users.reduce((acc, u) => acc + (u.wallets?.length || 0), 0);
    const roleSet = new Set<string>();
    users.forEach((u) => roleSet.add(u.role));
    return { users: users.length, wallets: walletTotal, roles: roleSet.size };
  }, [users]);

  const flashStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), LOCAL_STATUS_TIMEOUT);
  };

  const load = async () => {
    setStatus('Loading users...');
    setLoadError(null);
    try {
      const uRes = await apiRequest<User[]>('/users', { baseUrl: API_URL });
      if (!uRes.ok) {
        setLoadError(uRes.error);
        setStatus(formatApiError(uRes.error).hint);
        return;
      }
      setUsers(uRes.data);
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
      const res = await apiRequest('/users', {
        baseUrl: API_URL,
        init: {
          method: 'POST',
          headers: jsonWithCsrf(),
          body: JSON.stringify({
            email: newUser.email,
            username: newUser.username ? newUser.username.trim() : undefined,
            wallets: newUser.wallets ? newUser.wallets.split(',').map((w) => w.trim()) : [],
            role: newUser.role
          })
        }
      });
      if (!res.ok) {
        const info = formatApiError(res.error);
        setStatus(`${info.method} ${info.endpoint} · ${info.status} · ${info.hint}`);
        return;
      }
      await load();
      setNewUser({ email: '', username: '', wallets: '', role: 'READONLY' });
      flashStatus('User created');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setStatus(msg);
    }
  };

  const updateUser = async (id: string, update: Partial<User>) => {
    setStatus('Updating user...');
    try {
      const res = await apiRequest(`/users/${id}`, {
        baseUrl: API_URL,
        init: { method: 'PATCH', headers: jsonWithCsrf(), body: JSON.stringify(update) }
      });
      if (!res.ok) {
        const info = formatApiError(res.error);
        setStatus(`${info.method} ${info.endpoint} · ${info.status} · ${info.hint}`);
        return;
      }
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
        {loadError && <DataFetchErrorCard title="Users list" error={loadError} />}
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
        <Card title="Roles" subtitle="Unique roles">
          <div className="stack">
            <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.roles}</div>
            <span className="muted">coverage</span>
          </div>
        </Card>
      </div>

      <Card title="Create user" subtitle="Email + role">
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
              placeholder="username (optional)"
              value={newUser.username}
              onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))}
            />
            <input
              className="input"
              placeholder="wallets (comma separated 0x...)"
              value={newUser.wallets}
              onChange={(e) => setNewUser((u) => ({ ...u, wallets: e.target.value }))}
            />
          </div>
          <select
            className="select"
            value={newUser.role}
            onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value as Role }))}
          >
            {availableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <Button onClick={createUser}>Create</Button>
          {status && <span className="muted">{status}</span>}
        </div>
      </Card>

      <div className="card-grid">
        {users.map((u) => (
        <Card key={u.id} title={u.username || u.email || u.id} subtitle={u.id}>
            <div className="stack" style={{ gap: 8 }}>
              <div className="stack">
                <span className="muted">Role</span>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Badge>{u.role}</Badge>
                  <select
                    className="select"
                    value={u.role}
                    onChange={(e) => updateUser(u.id, { role: e.target.value as Role })}
                  >
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="stack">
                <span className="muted">Username</span>
                <div className="inline-form" style={{ gap: 6 }}>
                  <input
                    className="input"
                    placeholder="username"
                    value={usernameInputs[u.id] ?? u.username ?? ''}
                    onChange={(e) => setUsernameInputs((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const next = (usernameInputs[u.id] ?? u.username ?? '').trim();
                      updateUser(u.id, { username: next || undefined });
                    }}
                  >
                    Save
                  </Button>
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

            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
