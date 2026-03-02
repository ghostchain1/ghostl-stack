'use client';

import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, FormEvent } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: 'Invalid email or password.',
  signin_failed: 'Sign-in failed. Please try again.',
  account_locked: 'Account locked due to too many attempts. Try again later.',
  invalid_credentials: 'Invalid email or password.',
  Default: 'An unexpected error occurred.'
};

const resolveError = (err: string | null): string | null => {
  if (!err) return null;
  return ERROR_MESSAGES[err] ?? ERROR_MESSAGES.Default;
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') ?? undefined;
  const urlError = searchParams?.get('error') ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(resolveError(urlError));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false
      });

      if (result?.error) {
        setError(resolveError(result.error));
        setLoading(false);
        return;
      }

      // Fetch session to determine role-based redirect
      const sessionRes = await fetch('/api/auth/session');
      const session = sessionRes.ok ? await sessionRes.json() : null;
      const roles: string[] = session?.roles ?? [];

      let dest = callbackUrl ?? '/dashboard';
      if (!callbackUrl) {
        const topRole = roles[0]?.toLowerCase() ?? '';
        if (topRole === 'admin' || topRole === 'owner') dest = '/governance';
        else if (topRole === 'operator') dest = '/incidents';
        else dest = '/dashboard';
      }

      router.push(dest);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--input-bg, rgba(255,255,255,0.05))',
    color: 'var(--text)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease'
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: '0.78rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: 6,
    display: 'block'
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 80, 80, 0.1)',
            border: '1px solid rgba(255, 80, 80, 0.3)',
            color: '#FF8080',
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            lineHeight: 1.5
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label htmlFor="ghost-email" style={labelStyle}>
          Email
        </label>
        <input
          id="ghost-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@ghoststack.io"
          style={inputStyle}
          disabled={loading}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label htmlFor="ghost-password" style={labelStyle}>
          Password
        </label>
        <input
          id="ghost-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={inputStyle}
          disabled={loading}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          marginTop: 4,
          padding: '11px 0',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: loading
            ? 'rgba(122, 92, 255, 0.4)'
            : 'linear-gradient(135deg, rgba(122, 92, 255, 0.9), rgba(0, 194, 255, 0.7))',
          color: '#fff',
          fontFamily: 'var(--font-heading)',
          fontSize: '0.88rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: loading ? 'wait' : 'pointer',
          transition: 'opacity 0.15s ease',
          opacity: loading ? 0.7 : 1
        }}
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
