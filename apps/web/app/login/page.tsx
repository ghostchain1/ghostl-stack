'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resolveApiBase } from '../../src/lib/runtime';
import { jsonWithCsrf } from '../../src/lib/csrf';

const API_URL = resolveApiBase();

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
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: jsonWithCsrf(),
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      setStatus('Success. Reloading...');
      window.location.href = returnTo;
      return;
    }
    const err = await res.json().catch(() => ({}));
    setStatus(`Failed: ${err.error || res.status}`);
  };

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (me?.id) router.replace(returnTo);
      })
      .catch(() => undefined);
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
