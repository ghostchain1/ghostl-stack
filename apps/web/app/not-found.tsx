import Link from 'next/link';
import { GhostWordmark } from '@/components/brand/GhostMark';

/**
 * GhostStack — 404 Not Found
 * Branded sovereign error page.
 */
export default function NotFound() {
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
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(122, 92, 255, 0.10), transparent 55%)',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <GhostWordmark size={36} showTagline={false} />

        {/* 404 display */}
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '5rem',
              fontWeight: 900,
              letterSpacing: '0.08em',
              background: 'linear-gradient(135deg, #7A5CFF, #00C2FF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: 1,
              marginBottom: 8,
            }}
          >
            404
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              margin: 0,
            }}
          >
            Route Not Found
          </h1>
        </div>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            color: 'var(--muted)',
            maxWidth: 360,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          The requested path does not exist in the GhostStack routing table.
          Verify the URL or return to the command hub.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(120deg, #7A5CFF, #5a3cdf)',
              color: '#E8EDF5',
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textDecoration: 'none',
              textTransform: 'uppercase',
              boxShadow: '0 0 24px rgba(122, 92, 255, 0.35)',
            }}
          >
            Command Hub
          </Link>
          <Link
            href="/chain"
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
            Chain Status
          </Link>
        </div>

        {/* Layer routing label */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          {[
            { label: 'L3', color: '#00C2FF' },
            { label: '→', color: 'var(--muted)', noTag: true },
            { label: 'L2', color: '#7A5CFF' },
            { label: '→', color: 'var(--muted)', noTag: true },
            { label: 'L1', color: '#C9A227' },
          ].map((item, i) =>
            item.noTag ? (
              <span key={i} style={{ color: item.color, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                {item.label}
              </span>
            ) : (
              <span
                key={i}
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: `1px solid ${item.color}44`,
                  background: `${item.color}14`,
                  color: item.color,
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                }}
              >
                {item.label}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
