import Link from 'next/link';

export default function UserNotFound() {
  return (
    <div className="content" style={{ textAlign: 'center', paddingTop: 80, paddingBottom: 80 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '3.5rem', fontWeight: 800, color: 'rgba(0,194,255,0.18)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 16 }}>404</div>
      <h2 style={{ margin: '0 0 10px', fontWeight: 700 }}>Page not found</h2>
      <p className="muted" style={{ marginBottom: 32, maxWidth: 360, marginInline: 'auto' }}>
        This page doesn&apos;t exist in your user portal. Navigate using the menu.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/dashboard" className="chip" style={{ textDecoration: 'none', padding: '8px 20px', background: 'rgba(0,194,255,0.1)', border: '1px solid rgba(0,194,255,0.25)', color: '#00C2FF', borderRadius: 8, cursor: 'pointer' }}>
          ← Dashboard
        </Link>
        <Link href="/wallet" className="chip" style={{ textDecoration: 'none', cursor: 'pointer' }}>Wallet</Link>
        <Link href="/alerts" className="chip" style={{ textDecoration: 'none', cursor: 'pointer' }}>Alerts</Link>
      </div>
    </div>
  );
}
