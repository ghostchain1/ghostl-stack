'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resolveApiBase } from '../../src/lib/runtime';
import { jsonWithCsrf } from '../../src/lib/csrf';
import { apiRequest, formatApiError } from '../../src/lib/api';

const API_URL = resolveApiBase();
const debugAuth = process.env.NEXT_PUBLIC_AUTH_DEBUG === 'true';

const redactEmail = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const [user, domain] = trimmed.split('@');
  if (!domain) return `${trimmed.slice(0, 2)}***`;
  const userPrefix = user ? `${user.slice(0, 2)}***` : '***';
  return `${userPrefix}@${domain}`;
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="content">
          <div className="card" style={{ maxWidth: 460 }}>
            <div className="muted">Loading login…</div>
          </div>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}

function LoginClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const returnTo = useMemo(() => searchParams?.get('returnTo') || '/', [searchParams]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  const loginPassword = async () => {
    setStatus('Signing in...');
    try {
      if (debugAuth) {
        console.debug('[auth] login:start', { api: API_URL, returnTo, email: redactEmail(email) });
      }
      const res = await apiRequest('/api/auth/login', {
        baseUrl: API_URL,
        init: {
          method: 'POST',
          headers: jsonWithCsrf(),
          body: JSON.stringify({ email, password })
        }
      });
      if (res.ok) {
        setStatus('Success. Reloading...');
        window.location.href = returnTo;
        return;
      }
      const info = formatApiError(res.error);
      console.error('[auth] login:failed', { status: info.status, error: info.message, endpoint: info.endpoint });
      setStatus(`Failed: ${info.method} ${info.endpoint} · ${info.status} · ${info.hint}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      console.error('[auth] login:network-error', { message });
      setStatus(`Failed: ${message}`);
    }
  };

  useEffect(() => {
    if (debugAuth) {
      console.debug('[auth] session:check', { api: API_URL, returnTo });
    }
    apiRequest('/api/auth/me', { baseUrl: API_URL })
      .then((res) => {
        if (res.ok && (res.data as { id?: string })?.id) router.replace(returnTo);
        if (!res.ok) {
          const info = formatApiError(res.error);
          setStatus(`Failed: ${info.method} ${info.endpoint} · ${info.status} · ${info.hint}`);
        }
        if (debugAuth) {
          console.debug('[auth] session:response', { ok: res.ok });
        }
      })
      .catch((err) => {
        if (debugAuth) {
          console.debug('[auth] session:error', { message: err instanceof Error ? err.message : 'request_failed' });
        }
      });
  }, [returnTo, router]);

  return (
    <div className="content">
      <div className="card" style={{ maxWidth: 520 }}>
        <h3>GhostWallet Access</h3>
        <div className="stack">
          <label className="stack">
            <span className="muted">Email or username</span>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ops@ghostchain.dev" />
          </label>
          <label className="stack">
            <span className="muted">Password</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
          <div className="inline-form" style={{ gap: 8 }}>
            <button className="button" type="button" onClick={loginPassword}>
              Sign in
            </button>
          </div>
          <p className="muted">GhostWallet is fully native. Private keys stay server-side.</p>
          {status && <span className="muted">{status}</span>}
        </div>
      </div>
    </div>
  );
}
