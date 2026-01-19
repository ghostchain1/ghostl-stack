'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card } from '@ghostl/ui';
import { resolveApiBase } from '../../lib/runtime';
import { jsonWithCsrf } from '../../lib/csrf';

type SessionRecord = {
  id: string;
  userId: string;
  userEmail?: string;
  deviceId?: string;
  deviceLabel?: string;
  createdAt?: string;
  lastSeenAt?: string;
  expiresAt?: string;
  ip?: string;
  userAgent?: string;
};

const API_URL = resolveApiBase();

export function SessionManagement() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [status, setStatus] = useState('');

  const load = async () => {
    setStatus('Loading sessions...');
    try {
      const res = await fetch(`${API_URL}/api/admin/sessions`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Load failed ${res.status}`);
      const data = await res.json();
      const next = Array.isArray(data) ? data : (data.sessions as SessionRecord[]) || [];
      setSessions(next);
      setStatus('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sessions';
      setStatus(msg);
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const revoke = async (id: string) => {
    setStatus('Revoking session...');
    try {
      const res = await fetch(`${API_URL}/api/admin/sessions/${id}/revoke`, {
        method: 'POST',
        headers: jsonWithCsrf(),
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`Revoke failed ${res.status}`);
      await load();
      setStatus('Session revoked');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revoke failed';
      setStatus(msg);
    }
  };

  return (
    <Card title="Active sessions" subtitle="Device-bound sessions and last activity">
      <div className="stack" style={{ gap: 8 }}>
        {status && <span className="muted">{status}</span>}
        {sessions.map((session) => (
          <div key={session.id} className="card" style={{ border: '1px solid var(--border)' }}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{session.userEmail || session.userId}</div>
                <div className="muted">
                  Device {session.deviceLabel || session.deviceId || 'unknown'} - Last seen {session.lastSeenAt || 'n/a'}
                </div>
                <div className="muted">
                  Created {session.createdAt || 'n/a'} - Expires {session.expiresAt || 'n/a'}
                </div>
                {session.userAgent && <div className="muted">{session.userAgent}</div>}
              </div>
              <div className="stack" style={{ alignItems: 'flex-end' }}>
                <Badge>{session.id.slice(0, 8)}</Badge>
                <Button variant="secondary" onClick={() => revoke(session.id)}>
                  Revoke
                </Button>
              </div>
            </div>
          </div>
        ))}
        {!sessions.length && <span className="muted">No active sessions</span>}
      </div>
    </Card>
  );
}
