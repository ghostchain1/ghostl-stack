import type { Metadata } from 'next';
import { Card } from '@ghostl/ui';
import { localRoute } from '../../src/lib/local-route';
import type { GhostUser, UserRole, UserStatus } from '../api/users/route';

export const metadata: Metadata = {
  title: 'Users — GhostChain Admin',
};

type UsersResponse = { users: GhostUser[]; stats: { total: number; active: number; pendingKyc: number; suspended: number } };

const ROLE_COLOR: Record<UserRole, string>   = { user: '#00C2FF', employee: '#00F0B5', admin: '#7A5CFF', validator: '#C9A227' };
const STATUS_COLOR: Record<UserStatus, string>= { active: '#00F0B5', suspended: '#C9A227', 'pending-kyc': '#8A9BB5', banned: '#FF3B3B' };

const ROLES: UserRole[] = ['user', 'employee', 'admin', 'validator'];

export default async function UsersPage() {
  const data  = await localRoute<UsersResponse>('/api/users');
  const users = data?.users ?? [];
  const stats = [
    { label: 'Total',       value: data?.stats.total      ?? users.length,                                     color: '#7A5CFF' },
    { label: 'Active',      value: data?.stats.active     ?? users.filter(u => u.status === 'active').length,  color: '#00F0B5' },
    { label: 'Pending KYC', value: data?.stats.pendingKyc ?? users.filter(u => u.status === 'pending-kyc').length, color: '#8A9BB5' },
    { label: 'Suspended',   value: data?.stats.suspended  ?? users.filter(u => u.status === 'suspended' || u.status === 'banned').length, color: '#FF3B3B' },
  ];
  return (
    <div className="content">
      {/* Header */}
      <div className="spread" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0 }}>Users</h1>
          <p className="muted" style={{ marginTop: 4 }}>Account registry, roles, and access control</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="chip" style={{ cursor: 'pointer' }}>Export CSV</button>
          <button className="chip" style={{ cursor: 'pointer' }}>+ Invite user</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="card-grid" style={{ marginBottom: 24 }}>
        {stats.map(s => (
          <Card key={s.label} style={{ textAlign: 'center', padding: '16px 10px' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{s.value}</div>
            <div className="muted" style={{ fontSize: '0.72rem', marginTop: 6 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Role filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['All', ...ROLES.map(r => r.charAt(0).toUpperCase() + r.slice(1)), 'KYC Pending', 'Suspended'].map((f, i) => (
          <button key={f} className={`chip${i === 0 ? ' badge' : ''}`} style={{ cursor: 'pointer' }}>{f}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by address or alias…"
          style={{ width: '100%', maxWidth: 380, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#E8EDF5', fontFamily: "'Inter', system-ui, sans-serif", fontSize: '0.82rem', padding: '8px 14px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* User table */}
      <Card style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 750 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
              {['Address', 'Alias', 'Role', 'Status', 'KYC', 'Staked', 'Joined', 'Last Seen', 'Actions'].map(col => (
                <th key={col} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.58rem', letterSpacing: '0.12em', color: '#8A9BB5', fontWeight: 600, whiteSpace: 'nowrap' }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.address} style={{ borderBottom: i < users.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem', color: '#8A9BB5' }}>{u.address}</td>
                <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: '0.8rem' }}>{u.alias}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span className="badge" style={{ color: ROLE_COLOR[u.role], background: `${ROLE_COLOR[u.role]}15`, border: `1px solid ${ROLE_COLOR[u.role]}28`, fontSize: '0.6rem', textTransform: 'capitalize' }}>{u.role}</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span className="badge" style={{ color: STATUS_COLOR[u.status], background: `${STATUS_COLOR[u.status]}15`, border: `1px solid ${STATUS_COLOR[u.status]}28`, fontSize: '0.6rem', whiteSpace: 'nowrap' }}>{u.status}</span>
                </td>
                <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', color: u.kyc ? '#00F0B5' : '#4A5568' }}>{u.kyc ? '✓' : '—'}</td>
                <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem', color: '#8A9BB5', whiteSpace: 'nowrap' }}>{u.staked}</td>
                <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#4A5568', whiteSpace: 'nowrap' }}>{u.joined}</td>
                <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.62rem', color: '#4A5568', whiteSpace: 'nowrap' }}>{u.lastSeen}</td>
                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="chip" style={{ cursor: 'pointer', fontSize: '0.62rem' }}>View</button>
                    {u.role === 'user' && <button className="chip" style={{ cursor: 'pointer', fontSize: '0.62rem' }}>Edit role</button>}
                    {u.status === 'active' && <button className="chip" style={{ cursor: 'pointer', fontSize: '0.62rem', color: '#FF3B3B' }}>Suspend</button>}
                    {u.status === 'suspended' && <button className="chip" style={{ cursor: 'pointer', fontSize: '0.62rem', color: '#00F0B5' }}>Restore</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
