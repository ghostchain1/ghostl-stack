'use client';

import { useState, useEffect, useCallback } from 'react';

type UserProfile = {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  kycStatus: 'verified' | 'pending' | 'unverified';
  walletAddress?: string;
  mfaEnabled: boolean;
  notifications: { email: boolean; browser: boolean; sms: boolean };
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'account' | 'security' | 'notifications'>('account');
  const [form, setForm] = useState({ username: '', email: '', walletAddress: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/profile', { cache: 'no-store' });
      if (res.ok) {
        const p = await res.json() as UserProfile;
        setProfile(p);
        setForm({ username: p.username, email: p.email, walletAddress: p.walletAddress ?? '' });
      }
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await load();
    } catch {/* ignore */}
    finally { setSaving(false); }
  }

  const kycColor = { verified: 'var(--success)', pending: 'var(--warning)', unverified: 'var(--danger)' };
  const kycStatus = profile?.kycStatus ?? 'unverified';

  return (
    <div className="portal-page">
      <div className="portal-header">
        <h1 className="portal-title">My Profile</h1>
        <p className="portal-subtitle">Manage your account, security settings, and notification preferences</p>
      </div>

      {/* KYC status banner */}
      <div className="card" style={{
        background: kycStatus === 'verified' ? 'rgba(114,242,167,0.06)' : kycStatus === 'pending' ? 'rgba(242,193,78,0.06)' : 'rgba(255,107,107,0.06)',
        borderColor: `${kycColor[kycStatus]}30`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: kycColor[kycStatus] }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              KYC Status: <span style={{ color: kycColor[kycStatus], textTransform: 'capitalize' }}>{kycStatus}</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 3 }}>
              {kycStatus === 'verified' ? 'Identity verified — full platform access enabled' :
               kycStatus === 'pending' ? 'Verification in review — some features may be limited' :
               'Identity not verified — submit documents to unlock full access'}
            </div>
          </div>
          {kycStatus !== 'verified' && (
            <button className="button" style={{ marginLeft: 'auto', padding: '7px 14px', fontSize: '0.82rem' }}>
              Start KYC
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="portal-tabs">
        {(['account', 'security', 'notifications'] as const).map(t => (
          <button key={t} className={`portal-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Account */}
      {tab === 'account' && (
        <div className="portal-section">
          {loading ? (
            <div className="card" style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Loading profile…</div>
          ) : (
            <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0 }}>
                {[
                  { label: 'Username', key: 'username' as const, type: 'text' },
                  { label: 'Email Address', key: 'email' as const, type: 'email' },
                  { label: 'Wallet Address', key: 'walletAddress' as const, type: 'text' },
                ].map(({ label, key, type }) => (
                  <div key={key} className="info-row" style={{ padding: '14px 16px', gap: 16 }}>
                    <div style={{ flex: '0 0 160px', color: 'var(--muted)', fontSize: '0.88rem' }}>{label}</div>
                    <input
                      type={type}
                      className="input"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ flex: 1, maxWidth: 400 }}
                    />
                  </div>
                ))}
                <div className="info-row" style={{ padding: '14px 16px' }}>
                  <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Role</div>
                  <span className="badge">{profile?.role ?? '—'}</span>
                </div>
                <div className="info-row" style={{ padding: '14px 16px' }}>
                  <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Member since</div>
                  <span style={{ fontSize: '0.88rem' }}>{profile?.createdAt ?? '—'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button type="submit" className="button" disabled={saving} style={{ padding: '10px 22px' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                {saved && <span style={{ color: 'var(--success)', alignSelf: 'center', fontSize: '0.88rem' }}>✓ Saved</span>}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Security */}
      {tab === 'security' && (
        <div className="portal-section">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0 }}>
            {[
              {
                label: 'Password', value: '••••••••', action: 'Change Password',
                desc: 'Last changed 30 days ago'
              },
              {
                label: 'Two-Factor Auth', value: profile?.mfaEnabled ? '✓ Enabled' : 'Disabled',
                action: profile?.mfaEnabled ? 'Manage MFA' : 'Enable MFA',
                desc: profile?.mfaEnabled ? 'Authenticator app configured' : 'Add an extra layer of protection',
                valueColor: profile?.mfaEnabled ? 'var(--success)' : 'var(--danger)',
              },
              {
                label: 'API Keys', value: '2 active', action: 'Manage Keys',
                desc: 'Read-only + full-access keys'
              },
              {
                label: 'Active Sessions', value: '1 session', action: 'View Sessions',
                desc: 'Sessions on trusted devices'
              },
            ].map(({ label, value, action, desc, valueColor }) => (
              <div key={label} className="info-row" style={{ padding: '14px 16px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{label}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 2 }}>{desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '0.88rem', color: valueColor ?? 'var(--text)' }}>{value}</span>
                  <button className="button secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>{action}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notifications */}
      {tab === 'notifications' && (
        <div className="portal-section">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0 }}>
            {[
              { label: 'Email Notifications', key: 'email', value: profile?.notifications?.email },
              { label: 'Browser Push Notifications', key: 'browser', value: profile?.notifications?.browser },
              { label: 'SMS Alerts', key: 'sms', value: profile?.notifications?.sms },
            ].map(({ label, key: k, value }) => (
              <div key={k} className="info-row" style={{ padding: '14px 16px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{label}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked={value ?? false} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>{value ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
            ))}
          </div>
          <button className="button" style={{ alignSelf: 'flex-start', padding: '10px 22px' }}>
            Save Notification Preferences
          </button>
        </div>
      )}
    </div>
  );
}
