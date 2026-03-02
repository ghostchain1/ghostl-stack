import { Suspense } from 'react';
import { GhostWordmark } from '@/components/brand/GhostMark';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        position: 'relative',
      }}
    >
      {/* Ambient glows */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          background: [
            'radial-gradient(ellipse at 10% 20%, rgba(122, 92, 255, 0.12), transparent 45%)',
            'radial-gradient(ellipse at 90% 80%, rgba(201, 162, 39, 0.08), transparent 40%)',
            'radial-gradient(ellipse at 50% 100%, rgba(0, 194, 255, 0.06), transparent 35%)',
          ].join(', '),
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: 420,
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {/* Wordmark */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <GhostWordmark size={40} showTagline={false} />
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              margin: 0,
            }}
          >
            Autonomy Secured.
          </p>
        </div>

        {/* Login panel */}
        <div
          style={{
            background: 'var(--panel-strong)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: '28px 24px',
            boxShadow: 'var(--shadow-panel)',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text)',
                margin: '0 0 6px',
              }}
            >
              Sign In
            </h1>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.83rem',
                color: 'var(--muted)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Access is granted based on your account role. Enter your credentials to continue.
            </p>
          </div>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          {/* Role legend */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            {[
              { label: 'Admin', color: '#C9A227', desc: 'Governance & Chain' },
              { label: 'Operator', color: '#7A5CFF', desc: 'Bridge & Ops' },
              { label: 'User', color: '#00C2FF', desc: 'Wallet & NFTs' },
            ].map((tier) => (
              <div
                key={tier.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  flex: '1 1 auto',
                  minWidth: 100,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: tier.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    color: 'var(--muted)',
                  }}
                >
                  <strong style={{ color: tier.color, fontWeight: 700 }}>{tier.label}</strong>
                  {' — '}
                  {tier.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-body)',
            fontSize: '0.72rem',
            color: 'var(--muted)',
            letterSpacing: '0.04em',
          }}
        >
          GhostStack Sovereign Infrastructure &mdash; AI-Governed Multichain Federation
        </p>
      </div>
    </div>
  );
}
