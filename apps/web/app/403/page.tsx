import Link from 'next/link';
import { GhostWordmark } from '@/components/brand/GhostMark';

/**
 * GhostStack — 403 Access Denied
 * Shown when a user's role does not permit access to a route.
 */
export default function ForbiddenPage() {
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
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(201, 162, 39, 0.08), transparent 50%)',
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
        <GhostWordmark size={36} glowColor="#C9A227" showTagline={false} />

        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '4rem',
              fontWeight: 900,
              letterSpacing: '0.08em',
              color: '#C9A227',
              textShadow: '0 0 30px rgba(201, 162, 39, 0.45)',
              lineHeight: 1,
              marginBottom: 8,
            }}
          >
            403
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
            Access Denied
          </h1>
        </div>

        <div
          style={{
            background: 'rgba(201, 162, 39, 0.08)',
            border: '1px solid rgba(201, 162, 39, 0.30)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 20px',
            maxWidth: 380,
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.88rem',
              color: '#C9A227',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Your current role does not have permission to access this resource.
            Contact an administrator to request elevated access.
          </p>
        </div>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 20px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(120deg, rgba(201, 162, 39, 0.20), rgba(201, 162, 39, 0.10))',
            border: '1px solid rgba(201, 162, 39, 0.40)',
            color: '#C9A227',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          Return to Command Hub
        </Link>
      </div>
    </div>
  );
}

