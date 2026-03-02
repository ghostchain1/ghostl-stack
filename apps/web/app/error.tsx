'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { GhostWordmark } from '@/components/brand/GhostMark';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * GhostStack — Global Error Boundary
 * Client component required by Next.js app router.
 */
export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Surface to observability layer if available
    if (typeof window !== 'undefined' && (window as Window & { __GHOST_LOGGER__?: { error: (e: unknown) => void } }).__GHOST_LOGGER__) {
      (window as Window & { __GHOST_LOGGER__?: { error: (e: unknown) => void } }).__GHOST_LOGGER__!.error(error);
    }
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '48px 24px',
        textAlign: 'center',
        gap: 24,
      }}
    >
      {/* Security-themed ambient glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(255, 59, 59, 0.08), transparent 55%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <GhostWordmark size={36} glowColor="#FF3B3B" showTagline={false} />

        {/* Error display */}
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '3.5rem',
              fontWeight: 900,
              letterSpacing: '0.08em',
              color: '#FF3B3B',
              textShadow: '0 0 30px rgba(255, 59, 59, 0.45)',
              lineHeight: 1,
              marginBottom: 8,
            }}
          >
            ERROR
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.9rem',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              margin: 0,
            }}
          >
            System Fault Detected
          </h1>
        </div>

        {/* Error message */}
        <div
          style={{
            background: 'rgba(255, 59, 59, 0.08)',
            border: '1px solid rgba(255, 59, 59, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 20px',
            maxWidth: 420,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            color: '#FF3B3B',
            wordBreak: 'break-word',
          }}
        >
          {error.message || 'An unexpected error occurred in the GhostStack runtime.'}
          {error.digest && (
            <div style={{ marginTop: 8, opacity: 0.65, fontSize: '0.72rem' }}>
              Digest: {error.digest}
            </div>
          )}
        </div>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.88rem',
            color: 'var(--muted)',
            maxWidth: 360,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          The runtime has isolated this fault. Retry the operation or return to a stable route.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 59, 59, 0.15)',
              border: '1px solid rgba(255, 59, 59, 0.40)',
              color: '#FF3B3B',
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 0 16px rgba(255, 59, 59, 0.20)',
            }}
          >
            Retry
          </button>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textDecoration: 'none',
            }}
          >
            Command Hub
          </Link>
        </div>
      </div>
    </div>
  );
}
