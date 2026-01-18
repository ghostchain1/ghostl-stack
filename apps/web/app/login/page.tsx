'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resolveApiBase } from '../../src/lib/runtime';

const API_URL = resolveApiBase();
const PREFILL_SSO = process.env.NEXT_PUBLIC_SSO_JWT || '';
const LOCALSTORAGE_KEY = 'ghostl-sso-token';

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
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  const csrfHeader = () => {
    if (typeof document === 'undefined') return {};
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    return match ? { 'x-csrf-token': decodeURIComponent(match[1]) } : {};
  };

  const loginPassword = async () => {
    setStatus('Signing in...');
    const res = await fetch(`${API_URL}/auth/login/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
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

  const registerPassword = async () => {
    setStatus('Creating account...');
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      credentials: 'include',
      body: JSON.stringify({ email, password, createWallet: true })
    });
    if (res.ok) {
      setStatus('Account created. Redirecting...');
      window.location.href = returnTo;
      return;
    }
    const err = await res.json().catch(() => ({}));
    setStatus(`Failed: ${err.error || res.status}`);
  };

  const loginSso = async () => {
    setStatus('Logging in with SSO...');
    const res = await fetch(`${API_URL}/auth/login/sso`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeader() },
      credentials: 'include',
      body: JSON.stringify({ token })
    });
    if (res.ok) {
      setStatus('Success. Reloading...');
      window.location.href = returnTo;
    } else {
      const err = await res.json().catch(() => ({}));
      setStatus(`Failed: ${err.error || res.status}`);
    }
  };

  useEffect(() => {
    const existing = PREFILL_SSO || (typeof window !== 'undefined' ? localStorage.getItem(LOCALSTORAGE_KEY) : '');
    if (existing) setToken(existing);

    fetch(`${API_URL}/auth/session`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((session) => {
        if (session?.user?.id) router.replace(returnTo);
      })
      .catch(() => undefined);
  }, [returnTo, router]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALSTORAGE_KEY, token);
    }
  }, [token]);

  return (
    <div className="content">
      <div className="card" style={{ maxWidth: 520 }}>
        <h3>GhostWallet Access</h3>
        <div className="stack">
          <label className="stack">
            <span className="muted">Email</span>
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
            <button className="button secondary" type="button" onClick={registerPassword}>
              Create account
            </button>
          </div>
          <p className="muted">GhostWallet is fully native. Private keys stay server-side.</p>
          <hr />
          <label className="stack">
            <span className="muted">SSO JWT token</span>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJhbGciOi..." />
          </label>
          <button className="button secondary" type="button" onClick={loginSso}>
            Login with SSO token
          </button>
          {status && <span className="muted">{status}</span>}
        </div>
      </div>
    </div>
  );
}
